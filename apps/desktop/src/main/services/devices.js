/**
 * Paired Bluetooth devices and their battery level.
 *
 * The probe is a resident PowerShell child because only PnP knows the list, and
 * a sweep is slow by design (property reads are ~1.8s each), so it runs every
 * five minutes and the module keeps the last answer in between. A device with
 * no battery property is still listed — "connected" is useful on its own.
 *
 * One sweep prints two lines, and each one is pushed as a whole snapshot:
 * "list" arrives in about a second with the names plus every native PnP level,
 * and "battery" follows after the one-at-a-time HFP read. The renderer replaces
 * its list per push, so rows and levels appear together instead of waiting for a
 * batched PowerShell property lookup. The vendor probe is merged on read, so a
 * receiver's level can still land between or after the two.
 */
const platform = require('../platform');
const path = require('node:path');
const { cachePath, readJson, scriptFile, writeJson } = require('../paths');
const deviceBattery = require('./device-battery');
const { classifyDeviceSnapshot } = require('../device-cache');
const { currentLocale, localizeDeviceName } = require('../device-names');

const RESPAWN_MS = 30000;
/** A cold child that never emits is replaced instead of leaving an empty list. */
const FIRST_OUTPUT_TIMEOUT_MS = 10000;

let child = null;
let buffer = '';
let devices = [];
let scanning = true;
let cachedAt = 0;
let firstOutputTimer = null;
/**
 * Cold start is the whole point of the two-stage push, so the first sweep is
 * printed: "the page was empty for N seconds" is answerable from the app's own
 * output instead of by timing a screenshot. Two lines per process, not per
 * sweep - a five-minute clock does not need a log line each time.
 */
let startedAt = 0;
let firstPushesLogged = 0;
/** Which half of the sweep the last line was: 'list' or 'battery'. */
let phase = 'list';
let stopped = true;
let locale = currentLocale();
const listeners = new Set();

const scriptPath = () => scriptFile('devices.ps1');
const cacheFile = () => cachePath('devices');

function loadCached() {
  const saved = readJson(cacheFile(), null);
  if (!saved || !Array.isArray(saved.devices)) return;
  devices = saved.devices;
  cachedAt = Number(saved.at) || 0;
}

function saveCached() {
  cachedAt = Date.now();
  writeJson(cacheFile(), { at: cachedAt, devices });
}

function clearFirstOutputTimer() {
  clearTimeout(firstOutputTimer);
  firstOutputTimer = null;
}

function emit() {
  const value = snapshot();
  for (const fn of listeners) fn(value);
  return value;
}

function snapshot() {
  /*
   * A receiver's level is not a PnP property, so the row arrives with battery
   * null. The vendor probe (Logitech HID++, Razer, ASUS ROG) answers by name
   * for exactly those rows; a brand it does not implement, or a device that is
   * asleep, simply has no entry and keeps the em dash. The source stays the one
   * the probe assigned ('hid-wireless' for a receiver), so the title reads the
   * same as before.
   */
  const rows = devices.map((device) => {
    const row = {
      ...device,
      /* UI-only label. `name` remains the stable identity used by pin, hide,
       * order, duplicate removal, and vendor battery lookup. */
      displayName: localizeDeviceName(device.name, locale),
    };
    if (row.battery === null) {
      const vendor = deviceBattery.get(row.name);
      if (vendor) row.battery = vendor.level;
    }
    return row;
  });
  return classifyDeviceSnapshot({
    devices: rows,
    /* Counted from the merged rows: a level the vendor probe supplied is on
     * screen, so leaving it out of the count was the one place the page said
     * "0 devices with a level" while the list showed one. */
    /* Number(null) is 0, so a null level has to be excluded before the numeric
     * test: the list phase pushes every row at null and the count has to say
     * "none yet", not "all of them". */
    withBattery: rows.filter(
      (device) => device.battery !== null && Number.isFinite(Number(device.battery)),
    ).length,
    /* When the vendor probe last finished. It advances on the five-minute
     * background clock even with the page closed, which is what makes "the
     * reading is fresh without opening the page" observable. */
    probedAt: deviceBattery.status().probedAt,
    cachedAt,
    scanning,
    /* 'list' = names and connection only, 'battery' = the levels as well. The
     * page does not draw it; it is what makes the two-stage push observable in
     * a log or a test. */
    phase,
  });
}

function handleLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.devices)) return;
  /* Every line is a complete list, not a delta: the sweep prints the fast half
   * first and the levels second, and each push replaces the page's rows. */
  phase = parsed.phase === 'battery' ? 'battery' : 'list';
  /*
   * One device can appear as several PnP nodes (an audio node and a transport
   * node share a name, and a Bluetooth keyboard and its 2.4G receiver both
   * call themselves by the same model name). Keep one row per name, preferring
   * the node that actually knows its battery — that row also carries the source
   * worth printing, since the one without a level would say "unavailable".
   * Number(null) is 0, so null must be checked before the numeric test.
   */
  const byName = new Map();
  const previousByName = new Map(devices.map((device) => [device.name, device]));
  for (const device of parsed.devices) {
    const name = String(device.name ?? '');
    if (!name) continue;
    const raw = device.battery;
    const battery = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    const entry = {
      name,
      status: String(device.status ?? ''),
      battery: Number.isFinite(battery) ? battery : null,
      /*
       * Where the level came from: 'bluetooth', 'hid-wireless' (a 2.4G
       * receiver) or 'hid'. The page prints it in the row's title, because
       * "why is this one an em dash" is answered by the source, not the level.
       */
      source: String(device.source ?? ''),
    };
    const previous = previousByName.get(name);
    if (phase === 'list' && entry.battery === null && previous && previous.battery !== null) {
      entry.battery = previous.battery;
      entry.source = previous.source || entry.source;
    }
    const existing = byName.get(name);
    if (!existing || (existing.battery === null && entry.battery !== null)) byName.set(name, entry);
  }
  devices = Array.from(byName.values());
  scanning = false;
  clearFirstOutputTimer();
  saveCached();
  const value = emit();
  if (firstPushesLogged < 2) {
    firstPushesLogged += 1;
    console.log('[devices]', phase, `rows=${value.devices.length}`, `levels=${value.withBattery}`, `+${Date.now() - startedAt}ms`, `at=${Date.now()}`);
  }
}

function start() {
  if (!stopped) return;
  stopped = false;
  startedAt = Date.now();
  firstPushesLogged = 0;
  if (!devices.length) loadCached();
  scanning = true;
  emit();
  spawnChild();
  /* The vendor probe has its own clock; repainting when it lands is what
   * turns a late answer into a number on the page. */
  deviceBattery.onChange(emit);
  deviceBattery.start();
}

function spawnChild() {
  if (stopped) return;
  try {
    child = platform.spawnPowerShell(
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (!child) {
      // Unsupported platform: leave the feature off instead of retrying.
      stopped = true;
      return;
    }
  } catch {
    child = null;
    setTimeout(spawnChild, RESPAWN_MS);
    return;
  }
  child.stdout.setEncoding('utf8');
  const current = child;
  clearFirstOutputTimer();
  firstOutputTimer = setTimeout(() => {
    firstOutputTimer = null;
    if (stopped || child !== current) return;
    console.warn('[devices] no output after ' + FIRST_OUTPUT_TIMEOUT_MS + 'ms; restarting probe');
    child = null;
    try { current.kill(); } catch {}
    buffer = '';
    scanning = true;
    emit();
    spawnChild();
  }, FIRST_OUTPUT_TIMEOUT_MS);
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handleLine(line);
    }
  });
  /* Clearing child only when this child is still current: start() replaces the
   * watcher and the old child's exit fires a tick later, which used to null the
   * new one and let the next restart spawn a duplicate. */
  const self = child;
  child.on('exit', () => {
    if (child !== self) return;
    child = null;
    clearFirstOutputTimer();
    if (!stopped) setTimeout(spawnChild, RESPAWN_MS);
  });
  child.on('error', () => {
    child = null;
    clearFirstOutputTimer();
    if (!stopped) setTimeout(spawnChild, RESPAWN_MS);
  });
}

function stop() {
  stopped = true;
  deviceBattery.stop();
  clearFirstOutputTimer();
  if (child) {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
    child = null;
  }
}

function onChange(fn) {
  listeners.add(fn);
}

/** Called once at startup with the OS locale, independent of the UI language. */
function setLocale(value) {
  locale = String(value || currentLocale());
  if (!stopped) emit();
  return locale;
}

/** The devices page came into view (or left it): probe once now, or slow down. */
function setFocused(active) {
  deviceBattery.setFocused(active);
}

function restartProbe() {
  if (stopped) return;
  const old = child;
  child = null;
  clearFirstOutputTimer();
  if (old) {
    try { old.kill(); } catch {}
  }
  buffer = '';
  scanning = true;
  emit();
  spawnChild();
}

/**
 * Explicit refresh: restart the resident list probe and ask the vendor battery
 * channel now. The old button only refreshed levels, so a stalled enumerator
 * looked permanently broken even while the button said it re-probed.
 */
function refresh() {
  restartProbe();
  return deviceBattery.probeNow().then(() => emit());
}

module.exports = { start, stop, snapshot, onChange, setFocused, setLocale, refresh };
