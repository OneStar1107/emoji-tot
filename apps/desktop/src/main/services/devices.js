/**
 * Paired Bluetooth devices and their battery level.
 *
 * The probe is a resident PowerShell child because only PnP knows the list, and
 * a sweep is slow by design (property reads are ~1.8s each), so it runs every
 * five minutes and the module keeps the last answer in between. A device with
 * no battery property is still listed — "connected" is useful on its own.
 */
const platform = require('../platform');
const path = require('node:path');
const { scriptFile } = require('../paths');

const RESPAWN_MS = 30000;

let child = null;
let buffer = '';
let devices = [];
let stopped = true;
const listeners = new Set();

const scriptPath = () => scriptFile('devices.ps1');

function emit() {
  const value = snapshot();
  for (const fn of listeners) fn(value);
}

function snapshot() {
  return {
    devices: devices.map((device) => ({ ...device })),
    withBattery: devices.filter((device) => Number.isFinite(Number(device.battery))).length,
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
  /*
   * One device can appear as several PnP nodes (an audio node and a transport
   * node share a name). Keep one row per name, preferring the node that
   * actually knows its battery. Number(null) is 0, so null must be checked
   * before the numeric test.
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
    };
    const existing = byName.get(name);
    if (!existing || (existing.battery === null && entry.battery !== null)) byName.set(name, entry);
  }
  devices = Array.from(byName.values());
  emit();
}

function start() {
  if (!stopped) return;
  stopped = false;
  spawnChild();
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

module.exports = { start, stop, snapshot, onChange };