/**
 * Paired Bluetooth devices and their battery level.
 *
 * The probe is a resident PowerShell child because only PnP knows the list, and
 * a sweep is slow by design (property reads are ~1.8s each), so it runs every
 * five minutes and the module keeps the last answer in between. A device with
 * no battery property is still listed — "connected" is useful on its own.
 *
 * One sweep prints two lines, and each one is pushed as a whole snapshot:
 * "list" arrives in ~1.5s with the names and connection state (battery null),
 * "battery" follows in ~2.5s more with the levels. The renderer replaces its
 * list per push, so the page draws rows as soon as it has rows instead of
 * waiting out the slow half of the sweep. The vendor probe is merged on read,
 * so a receiver's level can still land between or after the two.
 */
const platform = require('../platform');
const path = require('node:path');
const { scriptFile } = require('../paths');
const deviceBattery = require('./device-battery');

const RESPAWN_MS = 30000;

let child = null;
let buffer = '';
let devices = [];
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
const listeners = new Set();

const scriptPath = () => scriptFile('devices.ps1');

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
    const row = { ...device };
    if (row.battery === null) {
      const vendor = deviceBattery.get(row.name);
      if (vendor) row.battery = vendor.level;
    }
    return row;
  });
  return {
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
    /* 'list' = names and connection only, 'battery' = the levels as well. The
     * page does not draw it; it is what makes the two-stage push observable in
     * a log or a test. */
    phase,
  };
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
    const existing = byName.get(name);
    if (!existing || (existing.battery === null && entry.battery !== null)) byName.set(name, entry);
  }
  devices = Array.from(byName.values());
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
    if (!stopped) setTimeout(spawnChild, RESPAWN_MS);
  });
  child.on('error', () => {
    child = null;
    if (!stopped) setTimeout(spawnChild, RESPAWN_MS);
  });
}

function stop() {
  stopped = true;
  deviceBattery.stop();
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

/** The devices page came into view (or left it): probe once now, or slow down. */
function setFocused(active) {
  deviceBattery.setFocused(active);
}

/** The page's refresh button: one vendor probe now, outside both clocks. */
function refresh() {
  return deviceBattery.probeNow();
}

module.exports = { start, stop, snapshot, onChange, setFocused, refresh };