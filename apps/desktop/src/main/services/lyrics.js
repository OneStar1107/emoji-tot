/**
 * Synced lyrics for the current track, from LRCLIB.
 *
 * The lookup runs in a PowerShell child for the same reason weather does: the
 * main process shares Chromium's network stack, which times out here. Results
 * are cached per track, because a song is played more than once and the service
 * is free but not instant.
 */
const platform = require('../platform');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson, scriptFile } = require('../paths');

const SCRIPT = scriptFile('lyrics.ps1');

/** A track with lyrics does not change; a failed lookup is a maybe. */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
/**
 * How long a failed lookup is remembered.
 *
 * It used to be CACHE_TTL, so one offline minute meant "no lyrics" for a week
 * — the cache outlived the cause. Five minutes is long enough to stop a
 * re-render storm from hammering LRCLIB and short enough that the next play
 * after coming back online tries again.
 */
const NEGATIVE_TTL = 5 * 60 * 1000;

/**
 * How many per-track cache files to keep.
 *
 * Each file is named after the track, so nothing ever overwrote anything and
 * the folder grew by one per song played. Forty is several listening sessions
 * and still a couple of hundred KB.
 */
const CACHE_MAX = 40;
/** Checking the directory on every lookup is wasteful; once in a while is not. */
let lookupsSinceTrim = 0;

/** Drop the least recently written lyrics files beyond CACHE_MAX. */
function trimCache() {
  lookupsSinceTrim += 1;
  if (lookupsSinceTrim % 20 !== 0) return;
  let names;
  try {
    names = fs.readdirSync(path.dirname(cacheFile('x')));
  } catch {
    return;
  }
  const files = names.filter((name) => name.startsWith('cache-lyrics-') && name.endsWith('.json'));
  if (files.length <= CACHE_MAX) return;
  const stamped = [];
  for (const name of files) {
    const full = path.join(path.dirname(cacheFile('x')), name);
    try {
      stamped.push({ full, at: fs.statSync(full).mtimeMs });
    } catch {
      // A file that vanished between readdir and stat needs no cleanup.
    }
  }
  stamped.sort((a, b) => a.at - b.at);
  for (const entry of stamped.slice(0, Math.max(0, stamped.length - CACHE_MAX))) {
    try {
      fs.unlinkSync(entry.full);
    } catch {
      // Already gone or locked; the next trim will retry.
    }
  }
}

let current = null;
let pending = null;

/** LRC: [mm:ss.xx] text, one or more timestamps per line. */
function parseLrc(text) {
  if (!text) return [];
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const stamp of stamps) {
      out.push({ t: Number(stamp[1]) * 60 + Number(stamp[2]), text: body });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function cacheFile(key) {
  return cachePath('lyrics-' + key);
}

async function lookupRemote(track) {
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
    '-TrackB64', Buffer.from(track.title || '', 'utf8').toString('base64'),
    '-ArtistB64', Buffer.from(track.artist || '', 'utf8').toString('base64'),
    '-AlbumB64', Buffer.from(track.album || '', 'utf8').toString('base64'),
    '-Duration', String(track.duration || 0),
  ];
  const result = await platform.runPowerShell(args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!result.ok) return null;
  const text = result.stdout.trim();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Resolve lyrics for a track, coalescing repeated asks for the same song.
 * Returns { title, synced, lines } with lines sorted by time.
 */
async function get(track) {
  if (!track || !track.title) return { title: '', synced: false, lines: [] };
  const key = crypto.createHash('sha1').update(track.title + '|' + track.artist + '|' + track.duration).digest('hex').slice(0, 16);
  if (current && current.key === key) return current.value;
  if (pending && pending.key === key) return pending.promise;

  trimCache();
  const cached = readJson(cacheFile(key), null);
  if (cached && Date.now() - cached.at < (cached.negative ? NEGATIVE_TTL : CACHE_TTL)) {
    // A negative entry is returned but is not pinned into `current`, so the
    // next lookup goes out again once the short TTL has passed.
    if (!cached.negative) current = { key, value: cached.value };
    return cached.value;
  }

  const promise = (async () => {
    const raw = await lookupRemote(track);
    if (raw === null) {
      // The lookup itself failed (offline, script error, timeout). That is not
      // the same as "this track has no lyrics", so it gets a short negative
      // entry and never becomes the current answer.
      const value = { title: track.title, synced: false, lines: [], unavailable: true };
      writeJson(cacheFile(key), { at: Date.now(), negative: true, value });
      return value;
    }
    const synced = parseLrc(raw?.syncedLyrics);
    const value = synced.length
      ? { title: raw.trackName || track.title, synced: true, lines: synced }
      : { title: raw?.trackName || track.title, synced: false, lines: [] };
    writeJson(cacheFile(key), { at: Date.now(), negative: false, value });
    current = { key, value };
    return value;
  })();

  pending = { key, promise };
  try {
    return await promise;
  } finally {
    pending = null;
  }
}

module.exports = { get, parseLrc, CACHE_TTL, NEGATIVE_TTL, CACHE_MAX };