/**
 * Synced lyrics for the current track, from LRCLIB.
 *
 * The lookup runs in a PowerShell child for the same reason weather does: the
 * main process shares Chromium's network stack, which times out here. Results
 * are cached per track, because a song is played more than once and the service
 * is free but not instant.
 */
const { execFile } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson } = require('../paths');

const SCRIPT = path.join(__dirname, 'lyrics.ps1');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

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

function lookupRemote(track) {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
      '-TrackB64', Buffer.from(track.title || '', 'utf8').toString('base64'),
      '-ArtistB64', Buffer.from(track.artist || '', 'utf8').toString('base64'),
      '-AlbumB64', Buffer.from(track.album || '', 'utf8').toString('base64'),
      '-Duration', String(track.duration || 0),
    ];
    execFile('powershell.exe', args, { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      const text = String(stdout).trim();
      if (!text || text === 'null') return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    });
  });
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

  const cached = readJson(cacheFile(key), null);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    current = { key, value: cached.value };
    return cached.value;
  }

  const promise = (async () => {
    const raw = await lookupRemote(track);
    const synced = parseLrc(raw?.syncedLyrics);
    const value = synced.length
      ? { title: raw.trackName || track.title, synced: true, lines: synced }
      : { title: raw?.trackName || track.title, synced: false, lines: [] };
    writeJson(cacheFile(key), { at: Date.now(), value });
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

module.exports = { get, parseLrc };
