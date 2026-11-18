/**
 * Hide the island while another app is full screen — videos, slides, games.
 *
 * The check is a resident PowerShell child printing 1/0 every two seconds. Only
 * the edge is acted on: hiding twice is a no-op, and showing twice would fight
 * the user closing the island on purpose, so a manual hide wins until the next
 * full-screen edge.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'fullscreen.ps1');
let proc = null;
let last = null;
let stopped = true;
let onEdge = null;

function start(handler) {
  stop();
  stopped = false;
  onEdge = handler;
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  proc.stdout.setEncoding('utf8');
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const value = line.trim();
      if (value !== '1' && value !== '0') continue;
      const full = value === '1';
      if (full === last) continue;
      last = full;
      try {
        onEdge?.(full);
      } catch {
        // A broken handler must not stop the watcher.
      }
    }
  });
  proc.on('exit', () => {
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
