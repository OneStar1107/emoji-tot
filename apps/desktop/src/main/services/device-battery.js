/**
 * Battery levels that Windows does not publish.
 *
 * devices.ps1 reads what PnP knows: Bluetooth publishes a level, HID collections
 * usually do not. A 2.4 GHz receiver keeps its mouse's level behind a vendor
 * protocol, so those rows stay at null and the page draws an em dash. This module
 * runs device-battery.ps1 - Logitech HID++, Razer, ASUS ROG - and hands the answer
 * back by name, which is the same PnP name the device list already uses.
 *
 * The probe is a one-shot child, not a watcher: it enumerates PnP and opens
 * three families of HID collections, and a battery percentage does not change
 * faster than that. It runs every five minutes while the page is elsewhere, and
 * every 30 seconds while the devices page is on screen - plus once the instant
 * that page opens, because a 2.4 GHz mouse only answers in a short window after
 * it wakes, so the first look at it matters more than the clock. A missing brand,
 * a sleeping device and a refused collection all end the same way - an empty
 * result, so the row keeps its em dash.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const IDLE_REFRESH_MS = 5 * 60 * 1000;
/** While the devices page is open the row is being watched: keep it fresh. */
const FOCUS_REFRESH_MS = 30 * 1000;
const PROBE_TIMEOUT_MS = 20000;

const levels = new Map();
const listeners = new Set();
let timer = null;
let child = null;
let stopped = true;
let focused = false;

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

function probe() {
  if (stopped || child) return;
  let current;
  try {
    current = platform.spawnPowerShell(
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile('device-battery.ps1')],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return;
  }
  // Unsupported platform, or no shell: leave the feature off instead of retrying.
  if (!current) {
    stopped = true;
    return;
  }
  child = current;
  let output = '';
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
    // The probe prints one short line; the cap is a guard against a script that
    // loops, not a limit anyone should reach.
    if (output.length < 65536) output += chunk;
  });
  const finish = () => {
    clearTimeout(watchdog);
    if (child === current) child = null;
    ingest(output);
  };
  current.on('exit', finish);
  current.on('error', finish);
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

function start() {
  if (!stopped) return;
  stopped = false;
  probe();
  schedule();
}

/**
 * The devices page is open (true) or not.
 *
 * Coming into view probes once immediately: the user is looking at the row, and
 * waiting up to five minutes for a level that is already on screen is the whole
 * bug. While it stays open the probe repeats every 30 seconds; closing it hands
 * the schedule back to the idle clock.
 */
function setFocused(active) {
  const next = Boolean(active);
  if (focused === next) return;
  focused = next;
  if (stopped) return;
  schedule();
  if (focused) probe();
}

/** One probe now, unless a child is already running (the in-flight lock). */
function probeNow() {
  probe();
}

function stop() {
  stopped = true;
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

function onChange(fn) {
  listeners.add(fn);
}

module.exports = { start, stop, get, onChange, setFocused, probeNow };
