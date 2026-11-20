/**
 * Now-playing, from Windows' own media session.
 *
 * A long-lived PowerShell child streams one JSON line per second; the control
 * commands each start a short-lived child. Both are the same script, so the
 * "which player does this apply to" rule exists once.
 *
 * The cover art is only present on the line where the track changes — a base64
 * PNG every second would be megabytes of IPC — so the last art is carried
 * forward here.
 */
const platform = require('../platform');
const path = require('node:path');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('media.ps1');
const EMPTY = Object.freeze({ active: false, title: '', artist: '', album: '', playing: false, position: 0, duration: 0, art: '', source: '' });

let state = { ...EMPTY };
let proc = null;
let restartTimer = null;
let stopping = false;
const listeners = new Set();
/** One decoder for the whole stream: a character split across chunks stays whole. */
let buffer = '';
/** Last time a frame reached the renderer; see the heartbeat note in handleLine. */
let lastEmit = 0;
const HEARTBEAT_MS = 5000;

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // A broken listener must not stop the stream.
    }
  }
}

function handleLine(line) {
  if (!line || line[0] !== '{') return;
  let next;
  try {
    next = JSON.parse(line);
  } catch {
    return;
  }
  if (!next.active) {
    if (state.active) {
      state = { ...EMPTY };
      emit();
    }
    return;
  }
  // Carry the cover forward; the child only sends it when the track changes.
  if (!next.art && state.art) next.art = state.art;
  const changed =
    next.title !== state.title ||
    next.artist !== state.artist ||
    next.playing !== state.playing ||
    next.art !== state.art ||
    // The progress bar needs a frame per second; everything else is change-only.
    Math.floor(next.position) !== Math.floor(state.position);
  state = next;
  /*
   * Push on change, and at least every few seconds regardless.
   *
   * A live stream reports duration 0 and a position that never advances, so a
   * playing stream can leave every single field identical forever — that made
   * `changed` permanently false. The one push that did happen is emitted the
   * moment the child prints its first line, which is usually before the island
   * page has loaded and registered its listener, so that frame was dropped and
   * the page then never heard from us again: the media page said "nothing is
   * playing" while audio played for hours. A slow heartbeat makes a dropped
   * frame recoverable instead of permanent.
   */
  const now = Date.now();
  if (changed || now - lastEmit > HEARTBEAT_MS) {
    lastEmit = now;
    emit();
  }
}

function start() {
  if (proc) return;
  stopping = false;
  buffer = '';
  proc = platform.spawnPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, 'watch'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (!proc) {
    // No shell on this platform: media is unavailable, not broken.
    proc = null;
    return;
  }
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) handleLine(line.trim());
  });
  /* Clearing proc only when this child is still current: start() replaces the
   * watcher and the old child's exit fires a tick later, which used to null the
   * new one and let the next restart spawn a duplicate. */
  const self = proc;
  proc.on('exit', () => {
    if (proc !== self) return;
    proc = null;
    if (stopping) return;
    // A crashed child comes back; the island keeps the last frame meanwhile.
    restartTimer = setTimeout(start, 2500);
  });
}

function stop() {
  stopping = true;
  clearTimeout(restartTimer);
  if (proc) {
    try {
      proc.kill();
    } catch {
      // already gone
    }
    proc = null;
  }
}

/** One control action: toggle | next | prev | seek. */
function command(kind, arg = 0) {
  if (!['toggle', 'next', 'prev', 'seek'].includes(kind)) return;
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, kind];
  if (kind === 'seek') args.push(String(arg));
  const child = platform.spawnPowerShell(args, { stdio: 'ignore' });
  child?.on('error', () => {});
}

/** Called after a control action so the UI does not wait a full second. */
function refreshSoon() {
  setTimeout(() => {
    if (!proc) return;
    // The watch loop re-reads on its own tick; asking for a new child would
    // fight it. A no-op keeps this hook honest for future use.
  }, 300);
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function current() {
  return state;
}

module.exports = { start, stop, command, onChange, current, refreshSoon };