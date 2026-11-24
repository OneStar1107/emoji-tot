/**
 * Which agent applications are actually open.
 *
 * PowerShell reads process command lines only inside the child and emits three
 * booleans. Prompts, paths and credentials in those command lines never cross
 * into the renderer or onto disk.
 */
const path = require('node:path');
const platform = require('../platform');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('agent-presence.ps1');
const IDS = ['dsh', 'claude', 'codex'];

let current = null;
let child = null;
let buffer = '';
let stopping = false;
const listeners = new Set();

function parsePresence(line) {
  let value;
  try {
    value = JSON.parse(String(line ?? ''));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (!IDS.every((id) => Number.isFinite(Number(value[id])))) return null;
  return Object.fromEntries(IDS.map((id) => [id, Number(value[id]) > 0]));
}

function emit(next) {
  const same = current && IDS.every((id) => current[id] === next[id]);
  if (same) return;
  current = next;
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      // A listener must not kill the process watcher.
    }
  }
}

function start() {
  if (child || !platform.supported) return;
  stopping = false;
  buffer = '';
  child = platform.spawnPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-IntervalMs', '2000'],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
      onError: () => {
        child = null;
        current = null;
      },
    },
  );
  if (!child) return;
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = parsePresence(line.trim());
      if (parsed) emit(parsed);
    }
  });
  const self = child;
  child.once('exit', () => {
    if (child !== self) return;
    child = null;
    if (!stopping) current = null;
  });
}

function stop() {
  stopping = true;
  if (child) {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
  }
  child = null;
  current = null;
  buffer = '';
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot() {
  return current ? { ...current } : null;
}

module.exports = { start, stop, onChange, snapshot, parsePresence };
