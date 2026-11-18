/**
 * Message apps on the taskbar: who is running and how many unread messages.
 *
 * Windows exposes no API for the taskbar flash state, so the probe is a resident
 * PowerShell child reading window titles — the one signal these apps do
 * publish. The child prints one JSON line per poll; this module diffs it,
 * filters by the user's enabled apps and emits only when something actually
 * changed, so a quiet desktop costs nothing downstream.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { scriptFile } = require('../paths');

const POLL_MS = 1800;
const RESPAWN_MS = 6000;

let child = null;
let buffer = '';
let apps = [];
let signature = '';
let stopped = true;
const listeners = new Set();

const scriptPath = () => scriptFile('messenger.ps1');

/** Enabled apps come from prefs; a missing key means "all five". */
function enabledSet(prefs) {
  const config = prefs && typeof prefs.messenger === 'object' ? prefs.messenger : null;
  if (!config) return null;
  const on = Object.keys(config).filter((key) => config[key] !== false);
  return on.length ? new Set(on) : new Set();
}

let prefsReader = () => ({});
function setPrefsReader(fn) {
  prefsReader = fn;
}

function visible(list) {
  const allowed = enabledSet(prefsReader());
  if (!allowed) return list;
  return list.filter((app) => allowed.has(app.id));
}

function emit() {
  const value = snapshot();
  for (const fn of listeners) fn(value);
}

function snapshot() {
  return {
    apps,
    unread: apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0),
  };
}

function handleLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.apps)) return;
  const next = visible(parsed.apps).map((app) => ({
    id: app.id,
    label: app.label,
    unread: Number(app.unread) || 0,
    count: Number(app.count) || 1,
    handle: app.handle,
    title: app.title,
  }));
  const nextSignature = next
    .map((app) => [app.id, app.unread, app.count, app.title].join(':'))
    .sort()
    .join('|');
  if (nextSignature === signature) return;
  signature = nextSignature;
  apps = next;
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
    child = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
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
  child.on('exit', () => {
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
      // Already gone; nothing to clean up.
    }
    child = null;
  }
}

/** Bring one app's main window forward; the handle comes from the probe. */
function activate(handle) {
  const value = Number(handle);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    const ps = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class MsgWin {',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
      '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
      '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
      '}',
      '"@',
      '$h = [IntPtr]' + value,
      'if ([MsgWin]::IsIconic($h)) { [MsgWin]::ShowWindow($h, 9) | Out-Null }',
      '[MsgWin]::SetForegroundWindow($h) | Out-Null',
    ].join('\n');
    spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Re-evaluate the enabled set after a prefs change. */
function refresh() {
  const next = visible(apps);
  const nextSignature = next
    .map((app) => [app.id, app.unread, app.count, app.title].join(':'))
    .sort()
    .join('|');
  if (nextSignature === signature) return;
  signature = nextSignature;
  apps = next;
  emit();
}

function onChange(fn) {
  listeners.add(fn);
}

module.exports = { start, stop, snapshot, activate, refresh, onChange, setPrefsReader, POLL_MS };