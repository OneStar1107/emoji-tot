/**
 * NetEase Cloud Music playback state from its local diagnostic log.
 *
 * This is a JavaScript adaptation of the MIT-licensed
 * YouRanCoder/netease-cloudmusic-detector-py project, itself derived from
 * Coooookies/netease-cloudmusic-detector. The upstream implementation and
 * licence are kept in netease-elog.LICENSE.txt next to this file.
 *
 * Why this exists: several NetEase builds publish metadata through Windows
 * SMTC but permanently report a 0/0 timeline. Their local `cloudmusic.elog`
 * does contain the actual track, play/pause state and every seek position.
 * Reading only appended bytes keeps this inexpensive and avoids screen
 * capture, process-memory access and database writes.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_PENDING = 16;
const DEFAULT_POLL_MS = 150;
const HEADER_RE = /^\[(\d+):(\d+):(\d{4}\/\d{6}:\d+):([A-Z]+):([a-zA-Z0-9._-]+)\((\d+)\)\]\s+\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
const POSITION_RE = /【playing】,"setPlayingPosition",(\d+(?:\.\d+)?)/;
const STATUS_RE = /【playing】,"native播放state",(\d+)(?:,"([^"]*)")?/;
const STATUS_PLAY_ID_RE = /【playing】,"native播放state",\d+,"([^"]*)"/;

function buildDecodeTable() {
  const table = new Uint8Array(256);
  for (let encoded = 0; encoded < 256; encoded += 1) {
    const high = encoded >> 4;
    const low = encoded & 0x0f;
    const hexDigit = (high ^ ((low + 8) % 16)) % 16;
    table[encoded] = (hexDigit * 16 + (encoded >> 6) * 4 + (~high & 3)) & 0xff;
  }
  return table;
}

const DECODE_TABLE = buildDecodeTable();
const ENCODED_NEWLINE = DECODE_TABLE.indexOf(0x0a);

function decodeElog(data) {
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const decoded = Buffer.allocUnsafe(input.length);
  for (let index = 0; index < input.length; index += 1) {
    decoded[index] = DECODE_TABLE[input[index]];
  }
  // The upstream reader deliberately ignores malformed UTF-8 fragments.
  return decoded.toString('utf8').replace(/\uFFFD/g, '');
}

/**
 * Decode only complete encoded lines. Keeping the raw tail is important:
 * decoding each filesystem chunk independently can split a Chinese character
 * or the final line as NetEase is still writing it.
 */
function createIncrementalDecoder() {
  let tail = Buffer.alloc(0);

  function push(chunk) {
    if (!chunk?.length) return [];
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const input = tail.length ? Buffer.concat([tail, bytes]) : bytes;
    const lines = [];
    let start = 0;
    for (let index = 0; index < input.length; index += 1) {
      if (input[index] !== ENCODED_NEWLINE) continue;
      lines.push(decodeElog(input.subarray(start, index)).replace(/\r$/, ''));
      start = index + 1;
    }
    tail = input.subarray(start);
    return lines;
  }

  function reset() {
    tail = Buffer.alloc(0);
  }

  return { push, reset };
}

let bootTimeCache = { at: 0, value: 0 };

function bootTimeMs(now = Date.now()) {
  if (!bootTimeCache.value || now - bootTimeCache.at >= 60_000) {
    bootTimeCache = {
      at: now,
      value: now - Math.max(0, Number(os.uptime()) || 0) * 1000,
    };
  }
  return bootTimeCache.value;
}

function parseHeader(line, options = {}) {
  const match = HEADER_RE.exec(String(line || ''));
  if (!match) return null;
  const elapsed = Number(match[3].split(':').at(-1));
  const boot = Number.isFinite(Number(options.bootTimeMs))
    ? Number(options.bootTimeMs)
    : bootTimeMs(options.now?.());
  return {
    pid: match[1],
    threadId: match[2],
    timestamp: boot + elapsed,
    logType: match[4],
    source: match[5],
    line: match[6],
    datetime: match[7],
  };
}

function eventType(line) {
  if (String(line).includes('【app】,{"actionId":"exitApp"}')) return 'exit';
  if (String(line).includes('【playing】,"checkPlayPrivilege",')) return 'candidate';
  if (String(line).includes('【playing】,"playOneTrackInPlayingList"')) return 'candidate';
  if (String(line).includes('【playing】,"native播放资源load完成，开始播放"')) return 'load';
  if (String(line).includes('【playing】,"setPlayingPosition"')) return 'seek';
  if (String(line).includes('【playing】,"native播放state"')) return 'state';
  return '';
}

function parseJsonObject(line) {
  const text = String(line || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function normalizedId(value) {
  if (value == null) return '';
  const id = String(value).trim();
  return id && id !== '-1' ? id : '';
}

function normalizedArtists(value) {
  if (Array.isArray(value)) {
    return value
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name))
      .map((artist) => String(artist || '').trim())
      .filter(Boolean);
  }
  return String(value || '').split(/\s*[,/]\s*/).map((artist) => artist.trim()).filter(Boolean);
}

function parseTrack(data) {
  if (!data || typeof data !== 'object') return null;
  const track = data.track && typeof data.track === 'object' ? data.track : data;
  const id = normalizedId(track.id ?? track.songId ?? data.songId);
  if (!id) return null;
  const album = track.album && typeof track.album === 'object' ? track.album : {};
  const rawDuration = Number(track.duration ?? track.durationMs);
  // NetEase payloads use milliseconds. A tiny value is already in seconds.
  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? rawDuration > 3600
      ? rawDuration / 1000
      : rawDuration
    : 0;
  return {
    id,
    title: String(track.name ?? track.title ?? track.songName ?? '').trim(),
    artist: normalizedArtists(track.artists ?? track.artist).join(' / '),
    album: String(album.name ?? album.albumName ?? track.albumName ?? '').trim(),
    duration,
  };
}

function mergeTrack(base, update) {
  if (!base) return update ? { ...update } : null;
  if (!update) return { ...base };
  return {
    id: update.id || base.id,
    title: update.title || base.title || '',
    artist: update.artist || base.artist || '',
    album: update.album || base.album || '',
    duration: Number(update.duration) > 0 ? Number(update.duration) : Number(base.duration) || 0,
  };
}

function parseSeekPosition(line) {
  const match = POSITION_RE.exec(String(line || ''));
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isFinite(position) && position >= 0 ? position : null;
}

function parsePlaybackState(line) {
  const match = STATUS_RE.exec(String(line || ''));
  if (!match) return null;
  const state = Number(match[1]);
  if (state !== 1 && state !== 2) return null;
  const playId = STATUS_PLAY_ID_RE.exec(String(line || ''))?.[1] || '';
  return {
    paused: state === 2,
    songId: normalizedId(playId.split('_')[0]),
  };
}

function createElogTracker(options = {}) {
  const now = options.now ?? Date.now;
  let current = null;
  let playing = false;
  let anchorAt = 0;
  let anchorPosition = 0;
  let anchoredSinceSwitch = false;
  let lastEventAt = 0;
  let lastEventKind = '';
  const pending = new Map();

  function reset() {
    current = null;
    playing = false;
    anchorAt = 0;
    anchorPosition = 0;
    anchoredSinceSwitch = false;
    lastEventAt = Number(now());
    lastEventKind = 'exit';
    pending.clear();
  }

  function durationOf(track = current) {
    return Math.max(0, Number(track?.duration) || 0);
  }

  function pinnedPosition(at = Number(now())) {
    const duration = durationOf();
    let position = anchorPosition;
    if (playing && anchorAt) position += Math.max(0, at - anchorAt) / 1000;
    if (duration) position = Math.min(duration, position);
    return Math.max(0, Math.round(position * 10) / 10);
  }

  function pin(position, at) {
    const duration = durationOf();
    anchorPosition = Math.max(0, Number(position) || 0);
    if (duration) anchorPosition = Math.min(duration, anchorPosition);
    anchorAt = Number(at) || Number(now());
    anchoredSinceSwitch = true;
  }

  function rememberCandidate(track) {
    if (!track || track.id === current?.id) {
      if (track && current?.id === track.id) current = mergeTrack(current, track);
      return;
    }
    pending.delete(track.id);
    pending.set(track.id, track);
    while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value);
  }

  function setCurrent(track, nextPlaying, at, position = 0) {
    const remembered = pending.get(track?.id);
    current = mergeTrack(remembered, track);
    pending.delete(track?.id);
    playing = nextPlaying === true;
    anchorAt = Number(at) || Number(now());
    anchorPosition = Math.max(0, Number(position) || 0);
    const duration = durationOf();
    if (duration) anchorPosition = Math.min(duration, anchorPosition);
    anchoredSinceSwitch = false;
  }

  function snapshot(kind = lastEventKind, at = Number(now())) {
    return {
      active: Boolean(current?.id),
      track: current ? { ...current } : null,
      playing,
      position: pinnedPosition(at),
      duration: durationOf(),
      anchorPosition,
      anchorAt,
      lastEventAt,
      eventKind: kind || '',
      updated: Number(now()),
    };
  }

  function consumeLine(line) {
    const header = parseHeader(line, {
      bootTimeMs: options.bootTimeMs,
      now,
    });
    if (!header) return null;
    const kind = eventType(line);
    if (!kind) return null;
    const at = header.timestamp;

    if (kind === 'exit') {
      reset();
      lastEventAt = at;
      return snapshot('exit');
    }

    if (kind === 'candidate') {
      const track = parseTrack(parseJsonObject(line));
      if (!track) return null;
      rememberCandidate(track);
      lastEventAt = at;
      lastEventKind = 'candidate';
      return null;
    }

    if (kind === 'load') {
      const data = parseJsonObject(line);
      const id = normalizedId(data?.songId ?? data?.id ?? data?.track?.id);
      if (!id) return null;
      if (current?.id === id) {
        current = mergeTrack(current, pending.get(id));
        pending.delete(id);
        const ended = durationOf() > 0 && pinnedPosition(at) >= durationOf() - 0.25;
        if (playing && (!anchoredSinceSwitch || ended)) {
          anchorAt = at;
          anchorPosition = 0;
        }
      } else {
        setCurrent(pending.get(id) ?? { id }, true, at, 0);
      }
      lastEventAt = at;
      lastEventKind = 'load';
      return snapshot('load');
    }

    if (kind === 'seek') {
      const position = parseSeekPosition(line);
      if (position == null || !current) return null;
      pin(position, at);
      lastEventAt = at;
      lastEventKind = 'seek';
      return snapshot('seek');
    }

    if (kind === 'state') {
      const state = parsePlaybackState(line);
      if (!state) return null;
      const pendingTrack = state.songId ? pending.get(state.songId) : null;
      if (pendingTrack && pendingTrack.id !== current?.id) {
        setCurrent(pendingTrack, !state.paused, at, 0);
      } else {
        if (!current && state.songId) current = { id: state.songId, title: '', artist: '', album: '', duration: 0 };
        if (!current) return null;
        const position = pinnedPosition(at);
        playing = !state.paused;
        anchorAt = at;
        anchorPosition = position;
        anchoredSinceSwitch = true;
      }
      lastEventAt = at;
      lastEventKind = 'state';
      return snapshot('state');
    }

    return null;
  }

  function processText(text) {
    let changed = null;
    for (const line of String(text || '').split(/\r?\n/)) {
      const next = consumeLine(line);
      if (next) changed = next;
    }
    return changed ?? snapshot();
  }

  return {
    consumeLine,
    processText,
    snapshot,
    reset,
  };
}

function defaultElogPath() {
  const local = process.env.LOCALAPPDATA || '';
  return local ? path.join(local, 'NetEase', 'CloudMusic', 'cloudmusic.elog') : '';
}

function createElogMonitor(options = {}) {
  const filePath = options.filePath ?? defaultElogPath();
  const pollMs = Math.max(50, Number(options.pollMs) || DEFAULT_POLL_MS);
  const tracker = options.tracker ?? createElogTracker(options);
  const decoder = createIncrementalDecoder();
  const listeners = new Set();
  let timer = null;
  let offset = 0;
  let inFlight = null;
  let stopped = true;

  function notify(kind, force = false) {
    const snapshot = tracker.snapshot(kind);
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // A renderer-side failure must not stop the file watcher.
      }
    }
    return force ? snapshot : snapshot;
  }

  function processLines(lines) {
    let kind = '';
    let changed = false;
    for (const line of lines) {
      const next = tracker.consumeLine(line);
      if (next) {
        kind = next.eventKind || kind;
        changed = true;
      }
    }
    if (changed) notify(kind, true);
  }

  async function readInitial() {
    decoder.reset();
    offset = 0;
    try {
      const data = await fs.promises.readFile(filePath);
      offset = data.length;
      const lines = decoder.push(data);
      let kind = '';
      for (const line of lines) {
        const next = tracker.consumeLine(line);
        if (next) kind = next.eventKind || kind;
      }
      notify(kind || 'startup', true);
    } catch {
      tracker.reset();
      notify('missing', true);
    }
  }

  async function pollOnce() {
    if (inFlight || stopped) return inFlight;
    inFlight = (async () => {
      let handle;
      try {
        handle = await fs.promises.open(filePath, 'r');
        const stat = await handle.stat();
        if (stat.size < offset) {
          tracker.reset();
          decoder.reset();
          offset = 0;
        }
        if (stat.size === offset) return;
        const length = stat.size - offset;
        const chunk = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(chunk, 0, length, offset);
        offset += bytesRead;
        processLines(decoder.push(chunk.subarray(0, bytesRead)));
      } catch {
        if (offset) {
          tracker.reset();
          decoder.reset();
          offset = 0;
          notify('missing', true);
        }
      } finally {
        await handle?.close().catch(() => {});
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
    return null;
  }

  function start() {
    if (timer || !filePath) return Promise.resolve();
    stopped = false;
    const initial = readInitial();
    timer = setInterval(() => {
      void pollOnce();
    }, pollMs);
    timer.unref?.();
    return initial;
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = null;
    offset = 0;
    decoder.reset();
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    start,
    stop,
    poll: pollOnce,
    onChange,
    snapshot: () => tracker.snapshot(),
    path: filePath,
  };
}

module.exports = {
  buildDecodeTable,
  createElogMonitor,
  createElogTracker,
  createIncrementalDecoder,
  decodeElog,
  defaultElogPath,
  parseHeader,
};
