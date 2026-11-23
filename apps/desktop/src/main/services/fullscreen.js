/**
 * Hide the island while another app is full screen — videos, slides, games.
 *
 * The check is a resident PowerShell child printing 1/0 every two seconds. Only
 * the edge is acted on: hiding twice is a no-op, and showing twice would fight
 * the user closing the island on purpose, so a manual hide wins until the next
 * full-screen edge.
 */
const platform = require('../platform');
const path = require('node:path');
const { scriptFile } = require('../paths');
const { createFullscreenGuard } = require('../fullscreen-guard');

const SCRIPT = scriptFile('fullscreen.ps1');
let proc = null;
let last = null;
let stopped = true;
let onEdge = null;

function start(handler) {
  stop();
  stopped = false;
  onEdge = handler;
  /*
   * One sample is not enough: a snipping overlay or a screenshot flash can
   * cover the desktop for one two-second tick. Two adjacent samples suppress
   * that false hide without adding another polling clock.
   */
  const confirm = createFullscreenGuard({ hideAfter: 2, showAfter: 2 });
  proc = platform.spawnPowerShell(
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-AppPid',
      String(process.pid),
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
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
      const action = confirm.push(value === '1');
      if (!action) continue;
      const full = action === 'hide';
      if (full === last) continue;
      last = full;
      try {
        onEdge?.(full);
      } catch {
        // A broken handler must not stop the watcher.
      }
    }
  });
  /* Clearing proc only when this child is still current: start() replaces the
   * watcher and the old child's exit fires a tick later, which used to null the
   * new one and let the next restart spawn a duplicate. */
  const self = proc;
  proc.on('exit', () => {
    if (proc !== self) return;
    proc = null;
    if (!stopped) setTimeout(() => start(handler), 3000);
  });
  // A watcher that cannot start used to crash the process: spawn emits
  // 'error' whether or not anyone listens, and this one did not.
  proc.on('error', () => {
    proc = null;
    if (!stopped) setTimeout(() => start(handler), 3000);
  });
}

function stop() {
  stopped = true;
  last = null;
  onEdge = null;
  if (proc) {
    try {
      proc.kill();
    } catch {
      // already gone
    }
    proc = null;
  }
}

module.exports = { start, stop };
