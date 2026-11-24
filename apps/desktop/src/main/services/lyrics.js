/**
 * Synced lyrics for the current track, from the player catalogue or LRCLIB.
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
/** A valid answer that contains no lyrics may appear upstream later. */
const MISS_TTL = 24 * 60 * 60 * 1000;
/** Invalidates the old LRCLIB-only misses after the NetEase source was added. */
const CACHE_VERSION = 2;
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
    names = fs.readdirSync(path.dirname(cachePath('lyrics-x')));
  } catch {
    return;
  }
  const files = names.filter((name) => name.startsWith('cache-lyrics-') && name.endsWith('.json'));
  if (files.length <= CACHE_MAX) return;
  const stamped = [];
  for (const name of files) {
    const full = path.join(path.dirname(cachePath('lyrics-x')), name);
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
  let offset = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const offsetTag = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i);
    if (offsetTag) {
      offset = Number(offsetTag[1]) || 0;
      continue;
    }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const stamp of stamps) {
      const t = Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) - offset / 1000);
      out.push({ t, text: body });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Normalise one lookup candidate for the renderer.
 *
 * A player can omit its timeline end time even for recorded music. The matched
 * catalogue duration is a safe display fallback and is never evidence that the
 * track is a live stream.
 */
function lyricsValue(raw, track, source = '') {
  const synced = parseLrc(raw?.syncedLyrics);
  const duration = Number(raw?.duration) > 0
    ? Number(raw.duration)
    : Number(track?.duration) > 0
      ? Number(track.duration)
      : 0;
  return synced.length
    ? { title: raw.trackName || track.title, synced: true, lines: synced, duration, source }
    : { title: raw?.trackName || track.title, synced: false, lines: [], duration, source };
}

function cacheFile(track) {
  return cachePath('lyrics-' + cacheKey(track));
}

const words = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/**
 * Pick the closest synced result for the media session.
 *
 * Search results are already scoped by title and artist, but one track can
 * have a live edit, a remix and a wrong-artist namesake. Duration is a
 * tie-breaker, never a gate: a short video clip can legitimately differ from
 * the full catalogue track while pointing at the same timed lyrics.
 */
function pickLyricsCandidate(candidates, track) {
  const wantedTitle = words(track?.title);
  const wantedArtist = words(track?.artist);
  if (!wantedTitle || !Array.isArray(candidates)) return null;
  let best = null;
  for (const candidate of candidates) {
    if (!candidate || candidate.instrumental === true || !String(candidate.syncedLyrics ?? '').trim()) continue;
    const title = words(candidate.trackName);
    const artist = words(candidate.artistName);
    if (!title) continue;
    const titleExact = title === wantedTitle;
    const artistExact = wantedArtist && artist === wantedArtist;
    const titleNear = title.includes(wantedTitle) || wantedTitle.includes(title);
    const artistNear = !wantedArtist || artist.includes(wantedArtist) || wantedArtist.includes(artist);
    if (!titleExact && !titleNear) continue;
    if (wantedArtist && !artistExact && !artistNear) continue;
    const wantedDuration = Number(track?.duration) || 0;
    const candidateDuration = Number(candidate.duration) || 0;
    const durationGap = wantedDuration && candidateDuration
      ? Math.min(30, Math.abs(wantedDuration - candidateDuration) / 5)
      : 0;
    const score =
      (titleExact ? 100 : 55) +
      (artistExact ? 80 : wantedArtist ? 35 : 20) +
      Math.max(0, 30 - durationGap);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best?.candidate ?? null;
}

const isNetease = (track) => /(?:cloudmusic|netease)/i.test(String(track?.source || ''));

/** NetEase knows its own catalogue best; everything else starts at LRCLIB. */
function providerOrder(track) {
  return isNetease(track) ? ['netease', 'lrclib'] : ['lrclib'];
}

/** Identity used by both the disk cache and the main process's in-flight guard. */
function trackLookupKey(track) {
  return [
    track?.title || '',
    track?.artist || '',
    track?.trackId || '',
    track?.source || '',
  ].join('|');
}

function cacheKey(track) {
  return crypto.createHash('sha1').update(trackLookupKey(track)).digest('hex').slice(0, 16);
}

async function lookupRemote(track, provider = 'lrclib') {
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
    '-TrackB64', Buffer.from(track.title || '', 'utf8').toString('base64'),
    '-ArtistB64', Buffer.from(track.artist || '', 'utf8').toString('base64'),
    '-AlbumB64', Buffer.from(track.album || '', 'utf8').toString('base64'),
    '-Duration', String(track.duration || 0),
    '-Provider', provider === 'netease' ? 'Netease' : 'Lrclib',
    '-TrackId', String(track.trackId || ''),
  ];
  const result = await platform.runPowerShell(args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!result.ok) return { ok: false, candidate: null };
  const text = result.stdout.trim();
  if (!text || text === 'null') return { ok: false, candidate: null };
  try {
    const payload = JSON.parse(text);
    if (Array.isArray(payload)) return { ok: true, candidate: pickLyricsCandidate(payload, track) };
    if (payload?.ok !== true) return { ok: false, candidate: null };
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    return {
      ok: true,
      candidate: pickLyricsCandidate(candidates, track),
      source: String(payload.source || provider),
    };
  } catch {
    return { ok: false, candidate: null };
  }
}

/**
 * Resolve lyrics for a track, coalescing repeated asks for the same song.
 * Returns { title, synced, lines } with lines sorted by time.
 */
async function get(track) {
  if (!track || !track.title) return { title: '', synced: false, lines: [] };
  const key = cacheKey(track);
  if (current && current.key === key) return current.value;
  if (pending && pending.key === key) return pending.promise;

  trimCache();
  const cached = readJson(cacheFile(track), null);
  const cacheTtl = cached?.negative
    ? NEGATIVE_TTL
    : cached?.value?.synced
      ? CACHE_TTL
      : MISS_TTL;
  if (cached?.version === CACHE_VERSION && Date.now() - cached.at < cacheTtl) {
    // A negative entry is returned but is not pinned into `current`, so the
    // next lookup goes out again once the short TTL has passed.
    if (!cached.negative) current = { key, value: cached.value };
    return cached.value;
  }

  const promise = (async () => {
    let reachedLyricsService = false;
    let value = null;
    for (const provider of providerOrder(track)) {
      const lookup = await lookupRemote(track, provider);
      if (lookup.ok) reachedLyricsService = true;
      if (!lookup.candidate) continue;
      value = lyricsValue(lookup.candidate, track, lookup.source || provider);
      break;
    }
    if (!value && !reachedLyricsService) {
      // The lookup itself failed (offline, script error, timeout). That is not
      // the same as "this track has no lyrics", so it gets a short negative
      // entry and never becomes the current answer.
      const unavailable = {
        title: track.title,
        synced: false,
        lines: [],
        unavailable: true,
        source: '',
      };
      writeJson(cacheFile(track), {
        version: CACHE_VERSION,
        at: Date.now(),
        negative: true,
        value: unavailable,
      });
      return unavailable;
    }
    value ||= {
      title: track.title,
      synced: false,
      lines: [],
      duration: Number(track.duration) || 0,
      source: '',
    };
    writeJson(cacheFile(track), {
      version: CACHE_VERSION,
      at: Date.now(),
      negative: false,
      value,
    });
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

module.exports = {
  get,
  parseLrc,
  lyricsValue,
  pickLyricsCandidate,
  providerOrder,
  trackLookupKey,
  CACHE_TTL,
  MISS_TTL,
  NEGATIVE_TTL,
  CACHE_MAX,
  CACHE_VERSION,
};
