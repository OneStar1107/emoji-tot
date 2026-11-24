/**
 * Resolve missing NetEase artwork from public song metadata.
 *
 * Adapted from the MIT-licensed artwork lookup in
 * alent17/Wind0ws_Dynamic_island. The complete permission notice lives in
 * netease-artwork.LICENSE.txt beside this file.
 *
 * Windows sometimes reports the new NetEase title before its SMTC thumbnail,
 * and the local elog fallback has no artwork at all. A track id is enough to
 * ask NetEase for the album image. Only exact-id responses and NetEase CDN
 * hosts are accepted; the small in-memory cache prevents a miss from becoming
 * one network request per media frame.
 */
const https = require('node:https');

const API_HOST = 'music.163.com';
const MAX_JSON_BYTES = 512 * 1024;
const MAX_ARTWORK_BYTES = 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const REDIRECT_LIMIT = 2;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function isNeteaseImageHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'music.163.com' || host === 'music.126.net' || host.endsWith('.music.126.net');
}

function normalizeArtworkUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || !isNeteaseImageHost(url.hostname)) return '';
    if (url.username || url.password || url.hash) return '';
    if (url.port && url.port !== '443') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function thumbnailUrl(value) {
  const normalized = normalizeArtworkUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  url.searchParams.set('param', '200y200');
  return url.toString();
}

function isNeteaseApiUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return (
      url.protocol === 'https:' &&
      url.hostname === API_HOST &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function requestBuffer(target, options = {}, redirects = 0) {
  const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_JSON_BYTES);
  const timeoutMs = Math.max(250, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const targetUrl = new URL(String(target));
  const allowed = options.allowedUrl ?? isNeteaseApiUrl;
  if (!allowed(targetUrl) || targetUrl.protocol !== 'https:') {
    return Promise.reject(new Error('unsafe NetEase artwork URL'));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      targetUrl,
      {
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Referer: 'https://music.163.com/',
          'User-Agent': 'EmojiTot/MediaArtwork',
          ...(options.headers || {}),
        },
      },
      (response) => {
        const status = Number(response.statusCode) || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects >= REDIRECT_LIMIT) {
            reject(new Error('too many NetEase artwork redirects'));
            return;
          }
          let next;
          try {
            next = new URL(response.headers.location, targetUrl).toString();
          } catch {
            reject(new Error('invalid NetEase artwork redirect'));
            return;
          }
          requestBuffer(next, options, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error('NetEase artwork request failed'));
          return;
        }
        const declaredLength = Number(response.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.destroy(new Error('NetEase artwork response is too large'));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy(new Error('NetEase artwork response is too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks),
            contentType: String(response.headers['content-type'] || '').toLowerCase(),
          });
        });
        response.on('error', reject);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('NetEase artwork timed out')));
    request.on('error', reject);
    request.end();
  });
}

function detailUrl(trackId) {
  const id = encodeURIComponent(trackId);
  return `https://${API_HOST}/api/song/detail/?id=${id}&ids=%5B${id}%5D`;
}

async function requestJson(url, options = {}) {
  const response = await requestBuffer(url, {
    ...options,
    maxBytes: MAX_JSON_BYTES,
    allowedUrl: isNeteaseApiUrl,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  return JSON.parse(response.body.toString('utf8'));
}

function sniffImageType(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) return '';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return '';
}

async function requestImage(url, options = {}) {
  const response = await requestBuffer(url, {
    ...options,
    maxBytes: MAX_ARTWORK_BYTES,
    allowedUrl: (value) => Boolean(normalizeArtworkUrl(value)),
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*' },
  });
  const declared = response.contentType.split(';', 1)[0].trim();
  const contentType = IMAGE_TYPES.has(declared) ? declared : sniffImageType(response.body);
  return { contentType, bytes: response.body };
}

function createArtworkResolver(options = {}) {
  const json = options.requestJson ?? requestJson;
  const image = options.requestImage ?? requestImage;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const negativeTtlMs = Math.max(0, Number(options.negativeTtlMs) || DEFAULT_NEGATIVE_TTL_MS);
  const cache = new Map();
  const pending = new Map();

  function remember(trackId, value) {
    if (cache.has(trackId)) cache.delete(trackId);
    cache.set(trackId, {
      value,
      expiresAt: value ? Number.POSITIVE_INFINITY : now() + negativeTtlMs,
    });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    return value;
  }

  async function lookup(trackId) {
    const detail = await json(detailUrl(trackId), { timeoutMs });
    const songs = Array.isArray(detail?.songs) ? detail.songs : [];
    const song = songs.find((entry) => String(entry?.id || '') === trackId);
    if (!song) return '';
    const candidates = [
      song.album?.picUrl,
      song.album?.blurPicUrl,
      song.al?.picUrl,
    ];
    const artworkUrl = candidates.map(thumbnailUrl).find(Boolean);
    if (!artworkUrl) return '';

    const downloaded = await image(artworkUrl, { timeoutMs });
    const bytes = downloaded?.bytes;
    const contentType = String(downloaded?.contentType || '').toLowerCase();
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > MAX_ARTWORK_BYTES ||
      !IMAGE_TYPES.has(contentType)
    ) {
      return '';
    }
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  }

  function resolve(trackId) {
    const id = String(trackId || '').trim();
    if (!/^\d{1,20}$/.test(id)) return Promise.resolve('');
    const cached = cache.get(id);
    if (cached && now() < cached.expiresAt) return Promise.resolve(cached.value);
    if (cached) cache.delete(id);
    if (pending.has(id)) return pending.get(id);
    const task = lookup(id)
      .catch(() => '')
      .then((art) => remember(id, art))
      .finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  }

  return { resolve };
}

const defaultResolver = createArtworkResolver();

module.exports = {
  MAX_ARTWORK_BYTES,
  createArtworkResolver,
  detailUrl,
  normalizeArtworkUrl,
  thumbnailUrl,
  resolve: (trackId) => defaultResolver.resolve(trackId),
  sniffImageType,
};
