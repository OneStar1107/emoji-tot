/**
 * Battery levels that Windows does not publish.
 *
 * devices.ps1 reads what PnP knows: Bluetooth publishes a level, HID collections
 * usually do not. A 2.4 GHz receiver keeps its mouse's level behind a vendor
 * protocol, so those rows stay at null and the page draws an em dash. This module
 * runs device-battery.ps1 - Logitech HID++, Razer, ASUS ROG and the BatteryHub
 * families - and hands the answer back by name, which is the same PnP name the
 * device list already uses.
 *
 * Three layers, because "when is the level read" is the whole feature:
 *
 *   1. The page opening (or coming back into view) probes at once, three spaced
 *      attempts. A 2.4 GHz mouse only answers in the short window after it
 *      wakes, and one attempt that lands in its sleep answers 65 zero bytes;
 *      three attempts a few seconds apart are what turn "-" into a number.
 *   2. The probe keeps its own clock in the background: every five minutes,
 *      whether or not the devices page is on screen. Closing the page does not
 *      stop the readings, so a level that changed is already current when the
 *      page opens instead of being discovered by it.
 *   3. The page's refresh button asks for one more probe now (probeNow),
 *      without waiting for either clock.
 *
 * A missing brand, a sleeping device and a refused collection all end the same
 * way - an empty result, so the row keeps its em dash.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const IDLE_REFRESH_MS = 5 * 60 * 1000;
/** While the devices page is open the row is being watched: keep it fresh. */
const FOCUS_REFRESH_MS = 30 * 1000;
/** Attempts when the page opens: the first lands, the rest catch a wake-up. */
const FOCUS_ATTEMPTS = 3;
/** Spacing between those attempts; a sleeping mouse needs a look-up window. */
const FOCUS_RETRY_MS = 3000;
const PROBE_TIMEOUT_MS = 20000;

const levels = new Map();
const listeners = new Set();
let timer = null;
let child = null;
let inFlight = null;
let burstLeft = 0;
let burstTimer = null;
let stopped = true;
let focused = false;
/** When the last probe finished, successful or not. Snapshot field for the UI. */
let probedAt = 0;

function emit() {
  for (const fn of listeners) fn();
}

/**
 * Take the probe's single JSON line. A probe that printed nothing usable leaves
 * the previous answer in place rather than blanking every row: a transient open
 * failure should not make a readable battery disappear.
 */
function ingest(text) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .pop();
  if (!line) return;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.devices)) return;
  const next = new Map();
  for (const row of parsed.devices) {
    const name = String(row.name || '');
    const level = Number(row.level);
    if (!name || !Number.isFinite(level)) continue;
    if (level < 0 || level > 100) continue;
    next.set(name.toLowerCase(), {
      level,
      charging: row.charging === true,
      source: String(row.protocol || 'hid'),
    });
  }
  levels.clear();
  for (const [key, value] of next) levels.set(key, value);
  emit();
}

/**
 * One probe. The child runs to completion (or the watchdog kills it) and the
 * promise settles when the answer has been ingested - that is what lets the
 * three open-page attempts be spaced instead of overlapping: a second spawn
 * while the first child is alive would be dropped by the lock below.
 */
function probe() {
  if (stopped) return Promise.resolve(false);
  if (inFlight) return inFlight;
  let current;
  try {
    current = platform.spawnPowerShell(
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile('device-battery.ps1')],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return Promise.resolve(false);
  }
  // Unsupported platform, or no shell: leave the feature off instead of retrying.
  if (!current) {
    stopped = true;
    return Promise.resolve(false);
  }
  child = current;
  let output = '';
  inFlight = new Promise((resolve) => {
    const watchdog = setTimeout(() => {
      try {
        current.kill();
      } catch {
        // Already gone.
      }
    }, PROBE_TIMEOUT_MS);
    watchdog.unref?.();
    current.stdout.setEncoding('utf8');
    current.stdout.on('data', (chunk) => {
      // The probe prints one short line; the cap is a guard against a script
      // that loops, not a limit anyone should reach.
      if (output.length < 65536) output += chunk;
    });
    const finish = () => {
      clearTimeout(watchdog);
      if (child === current) child = null;
      inFlight = null;
      ingest(output);
      probedAt = Date.now();
      resolve(true);
    };
    current.on('exit', finish);
    current.on('error', finish);
  });
  return inFlight;
}

/** One clock, two speeds: the focused page reads 30s, everything else 5min. */
function schedule() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (stopped) return;
  timer = setInterval(probe, focused ? FOCUS_REFRESH_MS : IDLE_REFRESH_MS);
  timer.unref?.();
}

/**
 * The three open-page attempts, one after another.
 *
 * Cancelled by stop(), by the page closing, and by a refresh (which is a single
 * probe of its own). Each attempt waits for the previous child to exit, so the
 * spacing is real time on the device, not three spawns in one tick.
 */
function stepBurst() {
  if (stopped || burstLeft <= 0) return;
  burstLeft -= 1;
  probe().then((ran) => {
    if (!ran || stopped || burstLeft <= 0) return;
    burstTimer = setTimeout(stepBurst, FOCUS_RETRY_MS);
    burstTimer.unref?.();
  });
}

function runBurst() {
  if (burstTimer) {
    clearTimeout(burstTimer);
    burstTimer = null;
  }
  burstLeft = FOCUS_ATTEMPTS;
  stepBurst();
}

function start() {
  if (!stopped) return;
  stopped = false;
  probe();
  schedule();
}

/**
 * The devices page is open (true) or not.
 *
 * Coming into view probes immediately, three times: the user is looking at the
 * row, and waiting up to five minutes for a level that is already on screen is
 * the whole bug. It stays at the 30-second rate while open; closing it hands the
 * schedule back to the idle clock, which keeps running.
 */
function setFocused(active) {
  const next = Boolean(active);
  if (focused === next) return;
  focused = next;
  if (stopped) return;
  schedule();
  if (focused) {
    runBurst();
  } else {
    burstLeft = 0;
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
  }
}

/** The page's refresh button: one probe now, without waiting for a clock. */
function probeNow() {
  burstLeft = 0;
  if (burstTimer) {
    clearTimeout(burstTimer);
    burstTimer = null;
  }
  return probe();
}

function stop() {
  stopped = true;
  burstLeft = 0;
  if (burstTimer) {
    clearTimeout(burstTimer);
    burstTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (child) {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
    child = null;
  }
}

/** The vendor reading for one device name, or null when nothing answered. */
function get(name) {
  return levels.get(String(name || '').toLowerCase()) || null;
}

/** The probe's state, for the devices snapshot and for the acceptance run. */
function status() {
  return { probedAt, focused, running: Boolean(inFlight), attempts: burstLeft };
}

function onChange(fn) {
  listeners.add(fn);
}

module.exports = { start, stop, get, onChange, setFocused, probeNow, status };
