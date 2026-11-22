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
const bilibili = require('./bilibili');

const SCRIPT = scriptFile('media.ps1');
const EMPTY = Object.freeze({ active: false, title: '', artist: '', album: '', playing: false, position: 0, duration: 0, art: '', source: '', output: '', controls: null, error: false, liveSince: 0 });

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
/*
 * The live clock: when the broadcast started, and when the stream last showed
 * it gone.
 *
 * Every frame is a sample, not an event, so "the stream dropped" and "the
 * player was closed" look identical for a second or two. Holding the start
 * stamp through a short gap keeps the clock continuous for the reconnect the
 * user actually experienced; a different channel, or a longer gap, is a
 * different broadcast and starts at zero.
 */
const LIVE_GRACE_MS = 30000;
let live = { key: '', since: 0, endedAt: 0 };

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // A broken listener must not stop the stream.
    }
  }
}

/** What makes two frames the same broadcast: the channel and who played it. */
const liveKey = (frame) => JSON.stringify([frame.title || '', frame.source || '']);

/**
 * The start time to report for this frame, or 0 when it is not live.
 *
 * Live is the renderer's rule — a frame without a duration — applied once
 * here so the clock is owned by the process that sees every frame: the page
 * can reload, miss a beat or re-render without losing it.
 */
function liveSinceFor(frame) {
  if (!frame.active || frame.duration) {
    // A recording, or nothing playing: close the clock, remember when.
    if (live.since && !live.endedAt) live.endedAt = Date.now();
    return 0;
  }
  const now = Date.now();
  const key = liveKey(frame);
  const continuing =
    live.since && live.key === key && (!live.endedAt || now - live.endedAt <= LIVE_GRACE_MS);
  if (continuing) {
    live.endedAt = 0;
  } else {
    live = { key, since: now, endedAt: 0 };
  }
  return live.since;
}

function handleLine(line) {
  if (!line || line[0] !== '{') return;
  let next;
  try {
    next = JSON.parse(line);
  } catch {
    return;
  }
  next.error = false;
  // Derived from the frame, never reported by the script itself.
  next.liveSince = liveSinceFor(next);
  if (!next.active) {
    if (state.active || state.error) {
      state = { ...EMPTY };
      emit();
    }
    return;
  }
  /*
   * Carry the cover forward, but only while it is the same track. The child
   * sends art on the frame where the track changes, and a broadcast has no
   * art at all: carrying across a change put the previous song's cover on
   * the next stream.
   */
  if (!next.art && state.art && next.title === state.title && next.artist === state.artist) next.art = state.art;

  /*
   * Bilibili's live page sets no MediaSession artwork, so Windows hands us a
   * title and no thumbnail. The title names the broadcast; the public live
   * API names the room and its cover. One silent lookup per broadcast, and
   * the frame is only updated if it is still the same broadcast without art.
   */
  if (!next.art && !next.duration && bilibili.looksLive(next.title)) {
    const title = next.title;
    const source = next.source;
    bilibili
      .coverFor(title)
      .then((art) => {
        if (!art || state.art || state.duration || state.title !== title || state.source !== source) return;
        state = { ...state, art };
        emit();
      })
      .catch(() => {});
  }
  const changed =
    next.title !== state.title ||
    next.artist !== state.artist ||
    next.playing !== state.playing ||
    next.art !== state.art ||
    // A device switch is the whole reason the badge exists; push it at once.
    next.output !== state.output ||
    // The progress bar needs a frame per second; everything else is change-only.
    Math.floor(next.position) !== Math.floor(state.position) ||
    /*
     * Speed, repeat and shuffle drive the "more" panel, which is redrawn only
     * on a structural change. Comparing the three flags of `controls` rather
     * than the object keeps a per-second frame from repainting the page.
     */
    next.rate !== state.rate ||
    next.autoRepeatMode !== state.autoRepeatMode ||
    next.shuffleActive !== state.shuffleActive ||
    next.controls?.rate !== state.controls?.rate ||
    next.controls?.repeat !== state.controls?.repeat ||
    next.controls?.shuffle !== state.controls?.shuffle;
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
    /*
     * A crashed watcher is a media failure, not "nothing is playing": the
     * face says Puzzled until a real frame comes back, so the state is
     * visibly different from a paused track instead of silently identical.
     */
    if (!state.error) {
      state = { ...EMPTY, error: true };
      emit();
    }
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

/* One control action: toggle | next | prev | seek | rate | repeat | shuffle. */
const COMMAND_KINDS = ['toggle', 'next', 'prev', 'seek', 'rate', 'repeat', 'shuffle'];
/** SMTC rejects a rate outside this; a wrong value must not reach the player. */
const RATE_RANGE = [0.25, 4];
/** A seek target past a day is not a position, it is a bug. */
const SEEK_MAX = 86400;
/** How long one control child may take before the caller is told it failed. */
const COMMAND_TIMEOUT_MS = 4000;

/**
 * The one whitelist, and the one place an argument is turned into a number.
 *
 * The renderer is untrusted and can send any string; this returns null for
 * anything the script has no branch for, so an unknown kind is refused here
 * instead of being handed to PowerShell as an argument. It is exported so the
 * refusal is testable without spawning a process.
 */
function normalizeCommand(kind, arg = 0) {
  if (typeof kind !== 'string' || !COMMAND_KINDS.includes(kind)) return null;
  const value = Number(arg);
  if (!Number.isFinite(value)) return null;
  if (kind === 'seek') {
    return { kind, arg: Math.round(Math.min(SEEK_MAX, Math.max(0, value)) * 10) / 10 };
  }
  if (kind === 'rate') {
    if (value < RATE_RANGE[0] || value > RATE_RANGE[1]) return null;
    return { kind, arg: Math.round(value * 100) / 100 };
  }
  if (kind === 'repeat') {
    if (!Number.isInteger(value) || value < 0 || value > 2) return null;
    return { kind, arg: value };
  }
  if (kind === 'shuffle') {
    if (value !== 0 && value !== 1) return null;
    return { kind, arg: value };
  }
  return { kind, arg: 0 };
}

/**
 * Run one control action; resolves with what the player answered.
 *
 * The script prints one `{"kind":..,"ok":bool}` line and the boolean is the
 * player's own Try* answer. It is a claim, not proof — Edge accepts a rate
 * change and keeps playing at 1x — so the page reads values from the watch
 * frames and uses this only to say "refused" instead of pretending it worked.
 */
function command(kind, arg = 0) {
  const request = normalizeCommand(kind, arg);
  if (!request) return Promise.resolve({ kind: String(kind), ok: false, note: 'unknown' });
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, request.kind];
  /* toggle/next/prev take no value; everything else must pass its own, zero
     included — "shuffle 0" and "shuffle with no argument" are the same call
     only by accident of the script's default, and the page should not rely
     on that. */
  if (!['toggle', 'next', 'prev'].includes(request.kind)) args.push(String(request.arg));
  let child;
  try {
    child = platform.spawnPowerShell(args, { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    child = null;
  }
  if (!child) return Promise.resolve({ kind: request.kind, ok: false, note: 'spawn' });
  return new Promise((resolve) => {
    let settled = false;
    let buffered = '';
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ kind: request.kind, ok: false, note: 'timeout' }), COMMAND_TIMEOUT_MS);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      buffered += chunk;
      const line = buffered.split(/\r?\n/).find((part) => part.trim().startsWith('{'));
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        finish({ kind: request.kind, ok: parsed.ok === true, note: String(parsed.note || '') });
      } catch {
        // Half a line; the rest is still on its way.
      }
    });
    child.on('error', () => finish({ kind: request.kind, ok: false, note: 'spawn' }));
    child.on('close', () => finish({ kind: request.kind, ok: false, note: 'exit' }));
  });
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

module.exports = { start, stop, command, normalizeCommand, onChange, current, refreshSoon };