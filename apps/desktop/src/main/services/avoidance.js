/**
 * Auto-avoid: collapse the island when a listed app covers it.
 *
 * The rules live in avoidance.ps1, a resident child that prints 1/0 every
 * 100ms — the same shape the full-screen watcher uses, because both need a real
 * window enumerator and spawning PowerShell per tick would cost more than the
 * feature is worth.
 *
 * The main process owns the two inputs the script cannot see: where the island
 * actually sits (the window is bigger than the pill and moves with the display
 * choice), and the user's list, which changes from the settings window.
 */
const platform = require('../platform');
const path = require('node:path');
const { userDir, writeJson, readJson } = require('../paths');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('avoidance.ps1');

/** The script re-reads this every tick, so a change lands without a restart. */
let configPath = '';
let proc = null;
let stopped = true;
let onState = null;
let last = null;
/** What the settings window asked for, before the island geometry is added. */
let desired = { enabled: false, browsers: true, apps: [] };
/** The island's window rectangle, refreshed by main.js whenever it moves. */
let islandRect = null;
let pendingWrite = null;
let restartTimer = null;

function configFile() {
  if (!configPath) configPath = path.join(userDir(), 'avoidance.json');
  return configPath;
}

function writeConfig() {
  writeJson(configFile(), {
    enabled: desired.enabled === true,
    browsers: desired.browsers !== false,
    apps: Array.isArray(desired.apps) ? desired.apps : [],
    island: islandRect,
  });
}

/**
 * Coalesce geometry writes.
 *
 * place() runs on every setBox, and the island animates its size: writing the
 * file on each frame would be a few dozen disk writes for one collapse.
 */
/**
 * Restart the child shortly after a change.
 *
 * The script re-reads its file every tick, but a file rewritten under it can
 * leave the resident copy on the old contents; a cold start always parses.
 * 300ms coalesces the handful of writes a single settings change produces.
 */
function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (stopped) return;
    start(onState ?? (() => {}));
  }, 300);
  restartTimer.unref?.();
}

function scheduleWrite() {
  if (pendingWrite) return;
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    writeConfig();
  }, 120);
  pendingWrite.unref?.();
}

function applyState(value) {
  const on = value === true;
  if (on === last) return;
  last = on;
  try {
    onState?.(on);
  } catch {
    // A broken handler must not stop the watcher.
  }
}

function start(handler) {
  stop();
  stopped = false;
  onState = handler;
  last = null;
  writeConfig();
  proc = platform.spawnPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Config', configFile(), '-AppPid', String(process.pid)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, EMOJITOT_AVOID_CONFIG: configFile(), EMOJITOT_APP_PID: String(process.pid) },
    },
  );
  if (!proc) {
    proc = null;
    return;
  }
  proc.stdout.setEncoding('utf8');
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const value = line.trim();
      if (value !== '1' && value !== '0') continue;
      applyState(value === '1');
    }
  });
  /*
   * Clearing proc only when this child is still the current one.
   *
   * start() stops the previous watcher and assigns the new one immediately; the
   * old child's exit then fires a tick later. Without the identity check it set
   * proc = null, so the next restart spawned a second watcher while the new one
   * was alive — measured 32 orphaned PowerShell processes under one app.
   */
  const self = proc;
  proc.on('exit', () => {
    if (proc !== self) return;
    proc = null;
    if (!stopped) setTimeout(() => start(handler), 3000);
  });
  proc.on('error', () => {
    proc = null;
    if (!stopped) setTimeout(() => start(handler), 3000);
  });
}

function stop() {
  stopped = true;
  onState = null;
  last = null;
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (proc) {
    try {
      proc.kill();
    } catch {
      // already gone
    }
    proc = null;
  }
}

/** Settings, list, or island geometry changed. */
function update(patch = {}) {
  if ('enabled' in patch) desired.enabled = patch.enabled === true;
  if ('browsers' in patch) desired.browsers = patch.browsers !== false;
  if ('apps' in patch) {
    // prefs store {path, name} for the settings grid; the script matches on the
    // executable path alone, so the objects are flattened here.
    desired.apps = (Array.isArray(patch.apps) ? patch.apps : [])
      .map((app) => (typeof app === 'string' ? app : app && typeof app.path === 'string' ? app.path : ''))
      .filter(Boolean)
      .slice(0, 200);
  }
  if ('island' in patch) {
    islandRect = patch.island ?? null;
    scheduleWrite();
    return;
  }
  writeConfig();
  scheduleRestart();
  // A list change must not wait for the next tick to matter, and the script
  // only reads the file, so writing it is the whole update.
  if (!proc && !stopped) start(onState ?? (() => {}));
}

function setIslandRect(rect) {
  if (!rect) return;
  if (islandRect && islandRect.x === rect.x && islandRect.y === rect.y && islandRect.w === rect.w && islandRect.h === rect.h) return;
  islandRect = rect;
  scheduleWrite();
}

function parseApps(text) {
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row.path === 'string' && row.path)
      .map((row) => ({
        path: row.path,
        name: typeof row.name === 'string' && row.name ? row.name : row.path,
        title: typeof row.title === 'string' ? row.title : '',
        browser: row.browser === true,
      }))
      .slice(0, 300);
  } catch {
    return [];
  }
}

/** Every app with a visible titled window right now. */
async function listApps() {
  const result = await platform.runPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ListApps'],
    { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (!result.ok) return [];
  return parseApps(result.stdout);
}

/** PNG data URLs for a set of executables, keyed by path. */
async function icons(paths) {
  const list = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p).slice(0, 120) : [];
  if (!list.length) return {};
  const result = await platform.runPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Icons', list.join('|')],
    { timeout: 30000, maxBuffer: 24 * 1024 * 1024 },
  );
  if (!result.ok) return {};
  try {
    const rows = JSON.parse(result.stdout);
    const map = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && typeof row.path === 'string' && typeof row.icon === 'string' && row.icon) map[row.path] = row.icon;
    }
    return map;
  } catch {
    return {};
  }
}

module.exports = { start, stop, update, setIslandRect, listApps, icons, statePath: configFile };
