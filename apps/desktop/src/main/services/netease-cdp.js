/**
 * Bounded, IPv4-loopback-only CDP access for NetEase playback seeking.
 *
 * Adapted from the MIT-licensed alent17/Wind0ws_Dynamic_island service
 * `src-tauri/src/services/netease_cdp.rs` at commit
 * 39704e2ffd1c4c67b04a182272136d20. The original permission notice is in
 * netease-cdp.LICENSE.txt next to this file.
 *
 * NetEase's standard SMTC implementation accepts position changes while
 * advertising a 0/0 timeline, but does not move playback. This client uses the
 * player's own store dispatch through a local debugging port and verifies the
 * resulting native progress before reporting success.
 */
const http = require('node:http');

const DEFAULT_PORT = 9223;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TARGETS = 64;
const MAX_COMMAND_BYTES = 32 * 1024;

function validateEndpoint(value, port = DEFAULT_PORT) {
  const url = new URL(String(value || ''));
  if (
    url.protocol !== 'ws:' ||
    url.hostname !== '127.0.0.1' ||
    Number(url.port) !== Number(port) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/devtools\/page\/[a-z0-9_-]+$/i.test(url.pathname)
  ) {
    throw new Error('unsafe NetEase CDP endpoint');
  }
  return url.pathname;
}

function httpJson(port, requestPath, timeoutMs = 900) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method: 'GET',
        headers: { Accept: 'application/json', Connection: 'close' },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error('NetEase CDP returned a non-200 response'));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            response.destroy(new Error('NetEase CDP response is too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('NetEase CDP returned invalid JSON'));
          }
        });
        response.on('error', reject);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('NetEase CDP timed out')));
    request.on('error', reject);
    request.end();
  });
}

function targetScore(target) {
  if (target?.type !== 'page') return -Infinity;
  const text = `${target.title || ''} ${target.url || ''}`.toLowerCase();
  let score = 0;
  if (text.includes('orpheus')) score += 40;
  if (text.includes('cloudmusic')) score += 20;
  if (text.includes('app.html')) score += 20;
  if (text.includes('subapp.html')) score += 10;
  return score;
}

async function findPage(port = DEFAULT_PORT, timeoutMs = 900) {
  const targets = await httpJson(port, '/json/list', timeoutMs);
  if (!Array.isArray(targets) || targets.length > MAX_TARGETS) {
    throw new Error('NetEase CDP target list is invalid');
  }
  const candidates = targets
    .map((target) => ({ target, score: targetScore(target) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) throw new Error('NetEase CDP page is unavailable');
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    throw new Error('NetEase CDP page is ambiguous');
  }
  const endpoint = String(candidates[0].target.webSocketDebuggerUrl || '');
  validateEndpoint(endpoint, port);
  return { ...candidates[0].target, webSocketDebuggerUrl: endpoint };
}

class LocalCdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      const slot = this.pending.get(payload.id);
      if (!slot) return;
      this.pending.delete(payload.id);
      clearTimeout(slot.timer);
      if (payload.error) slot.reject(new Error('NetEase CDP command failed'));
      else slot.resolve(payload.result);
    });
    socket.addEventListener('close', () => this.failPending(new Error('NetEase CDP closed')));
    socket.addEventListener('error', () => this.failPending(new Error('NetEase CDP socket failed')));
  }

  failPending(error) {
    for (const slot of this.pending.values()) {
      clearTimeout(slot.timer);
      slot.reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}, timeoutMs = 6000) {
    if (this.socket.readyState !== 1) {
      return Promise.reject(new Error('NetEase CDP is not connected'));
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    if (Buffer.byteLength(payload) > MAX_COMMAND_BYTES) {
      return Promise.reject(new Error('NetEase CDP command is too large'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('NetEase CDP command timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression, timeoutMs = 6000) {
    const result = await this.request(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      timeoutMs,
    );
    if (result?.exceptionDetails) throw new Error('NetEase CDP expression failed');
    return result?.result?.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Already closed.
    }
    this.failPending(new Error('NetEase CDP closed'));
  }
}

function openSocket(endpoint, timeoutMs = 1200) {
  if (typeof WebSocket !== 'function') {
    return Promise.reject(new Error('NetEase CDP WebSocket is unavailable'));
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('NetEase CDP connection timed out'));
    }, timeoutMs);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve(new LocalCdpConnection(socket));
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('NetEase CDP connection failed'));
      },
      { once: true },
    );
  });
}

async function connect(port = DEFAULT_PORT, timeoutMs = 1200) {
  const target = await findPage(port, timeoutMs);
  return openSocket(target.webSocketDebuggerUrl, timeoutMs);
}

const CAPTURE_TOOL = String.raw`function captureTool(withProgress = false) {
  const queue = globalThis.webpackJsonp;
  if (!Array.isArray(queue) || queue.push === Array.prototype.push) return {};
  const entries = queue.flatMap(chunk => chunk && Array.isArray(chunk[2]) ? chunk[2] : []);
  const previousEntry = entries.length ? entries[entries.length - 1][0] : undefined;
  const id = '__emojitot_seek_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  let req;
  const chunk = [[], { [id]: (_module, _exports, runtime) => { req = runtime; } }, [[id]]];
  try {
    queue.push(chunk);
    if (!req || !req.c) return {};

    /*
     * Module numbers are not a public NetEase API and move between releases.
     * Identify the player tool by its capabilities instead. The known module
     * ids remain first choices so this stays cheap on the releases we tested.
     */
    const playerExports = req.c[7] && req.c[7].exports;
    const legacyExports = req.c[8] && req.c[8].exports;
    const tool = [playerExports && playerExports.a, legacyExports && legacyExports.a]
      .concat(Object.keys(req.c).map(key => {
        const exports = req.c[key] && req.c[key].exports;
        return [exports, exports && exports.a, exports && exports.b, exports && exports.default];
      }).reduce((all, values) => all.concat(values), []))
      .find(value => value && value.inited === true && value.app && value.app._store &&
        typeof value.getStore === 'function' && typeof value.getDispatch === 'function');
    if (!tool) return {};

    let progress = null;
    if (withProgress) {
      const known = [req.c[149], req.c[148]];
      for (const module of known) {
        const candidate = module && module.exports && module.exports.b;
        if (typeof candidate === 'function') {
          progress = candidate;
          break;
        }
      }
      if (!progress && req.m) {
        for (const key of Object.keys(req.m)) {
          let source = '';
          try { source = String(req.m[key]); } catch (_) { continue; }
          if (!source.includes('subscribePlayStatus') ||
              !source.includes('playprogress') ||
              !source.includes('cacheProgress')) continue;
          const candidate = req.c[key] && req.c[key].exports && req.c[key].exports.b;
          if (typeof candidate === 'function') {
            progress = candidate;
            break;
          }
        }
      }
      if (typeof progress !== 'function') return {};
    }
    return { tool, progress };
  } catch (_) {
    return {};
  } finally {
    if (req) { delete req.m[id]; delete req.c[id]; req.s = previousEntry; }
    const index = queue.indexOf(chunk);
    if (index >= 0) queue.splice(index, 1);
  }
}`;

const PROGRESS_EXPRESSION = String.raw`(() => {
  const captured = (__CAPTURE_TOOL__)(true);
  const tool = captured.tool;
  const playing = tool && tool.getStore().playing;
  if (!playing || playing.isLoadingFirst || playing.isPlayingVideo) return {};
  const native = captured.progress && captured.progress();
  const track = playing.curPlaying && playing.curPlaying.track;
  const artists = track && (track.artists || track.ar);
  const title = String(playing.resourceName || track && track.name || '');
  const artist = String(playing.resourceArtist || (Array.isArray(artists) ? artists.map(item => item && item.name || '').filter(Boolean).join(', ') : ''));
  const position = Number(native && native.current);
  const duration = Number(playing.resourceDuration);
  const cur = playing.curPlaying || {};
  const curTrack = playing.curTrack || {};
  const trackId = String(playing.resourceTrackId || playing.onlineResourceId || cur.trackId || cur.id || curTrack.id || '');
  const nativeId = String(native && native.playId || '');
  const identities = [playing.playId, playing.resourceTrackId, playing.onlineResourceId, cur.playId, cur.trackId, cur.id, curTrack.id]
    .map(value => String(value || ''))
    .filter(Boolean);
  if (!native || !trackId || !nativeId || !identities.includes(nativeId) || !title || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration <= 0 || position > duration + 1) return {};
  return { ready: true, trackId, playId: nativeId, title, artist, positionMs: Math.round(position * 1000), durationMs: Math.round(duration * 1000) };
})()`;

const SEEK_EXPRESSION = String.raw`(async () => {
  const captured = (__CAPTURE_TOOL__)(true);
  const tool = captured.tool;
  const requested = __REQUESTED_SECONDS__;
  const expected = __EXPECTED_IDENTITY__;
  const read = () => {
    const playing = tool && tool.getStore().playing;
    if (!playing || playing.isLoadingFirst || playing.isPlayingVideo) return null;
    const native = captured.progress && captured.progress();
    const track = playing.curPlaying && playing.curPlaying.track;
    const artists = track && (track.artists || track.ar);
    const artist = String(playing.resourceArtist || (Array.isArray(artists) ? artists.map(item => item && item.name || '').filter(Boolean).join(', ') : ''));
    const position = Number(native && native.current);
    const duration = Number(playing.resourceDuration);
    const cur = playing.curPlaying || {};
    const curTrack = playing.curTrack || {};
    const trackId = String(playing.resourceTrackId || playing.onlineResourceId || cur.trackId || cur.id || curTrack.id || '');
    const nativeId = String(native && native.playId || '');
    const identities = [playing.playId, playing.resourceTrackId, playing.onlineResourceId, cur.playId, cur.trackId, cur.id, curTrack.id]
      .map(value => String(value || ''))
      .filter(Boolean);
    if (!native || !trackId || !nativeId || !identities.includes(nativeId) || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration <= 0 || position > duration + 1) return null;
    return { trackId, playId: nativeId, title: String(playing.resourceName || track && track.name || ''), artist, position, duration };
  };
  const readRestore = () => {
    const playing = tool && tool.getStore().playing;
    const restore = playing && playing.restoreResource;
    if (!playing || !restore) return null;
    const cur = playing.curPlaying || {};
    const curTrack = playing.curTrack || {};
    const trackId = String(playing.resourceTrackId || playing.onlineResourceId || cur.trackId || cur.id || curTrack.id || '');
    const position = Number(restore.current);
    const duration = Number(playing.resourceDuration);
    if (!trackId || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0 || position > duration + 1) return null;
    return { trackId, position, duration };
  };
  const before = read();
  if (!before) return { verified: false, unsupported: true };
  if (before.trackId !== expected.trackId || before.playId !== expected.playId) return { verified: false, trackChanged: true };
  if (!Number.isFinite(requested) || requested < 0 || requested >= before.duration) return { verified: false, invalidPosition: true };
  const pausedRestore = Boolean(tool.getStore().playing.restoreResource);
  await tool.getDispatch()({ type: 'playing/setPlayingPosition', payload: { duration: requested } });
  if (pausedRestore) {
    const deadline = Date.now() + 1500;
    while (Date.now() <= deadline) {
      const restored = readRestore();
      if (!restored || restored.trackId !== before.trackId) return { verified: false, trackChanged: true };
      if (Math.abs(restored.position - requested) <= 0.25) {
        return { verified: true, trackId: restored.trackId, playId: before.playId, title: before.title, artist: before.artist, positionMs: Math.round(restored.position * 1000), durationMs: Math.round(restored.duration * 1000) };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return { verified: false, timedOut: true };
  }
  const deadline = Date.now() + 4000;
  while (Date.now() <= deadline) {
    const after = read();
    if (!after || after.trackId !== before.trackId || after.playId !== before.playId) return { verified: false, trackChanged: true };
    if (Math.abs(after.position - requested) <= 1) {
      return { verified: true, trackId: after.trackId, playId: after.playId, title: after.title, artist: after.artist, positionMs: Math.round(after.position * 1000), durationMs: Math.round(after.duration * 1000) };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { verified: false, timedOut: true };
})()`;

function buildProgressExpression() {
  return PROGRESS_EXPRESSION.replace('__CAPTURE_TOOL__', CAPTURE_TOOL);
}

function buildSeekExpression(seconds, trackId, playId) {
  return SEEK_EXPRESSION
    .replace('__CAPTURE_TOOL__', CAPTURE_TOOL)
    .replace('__REQUESTED_SECONDS__', JSON.stringify(Number(seconds)))
    .replace(
      '__EXPECTED_IDENTITY__',
      JSON.stringify({ trackId: String(trackId || ''), playId: String(playId || '') }),
    );
}

function normalizeProgress(value) {
  const trackId = String(value?.trackId || '');
  const playId = String(value?.playId || '');
  const position = Number(value?.positionMs);
  const duration = Number(value?.durationMs);
  if (
    value?.ready !== true ||
    !trackId ||
    !playId ||
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    position < 0 ||
    position > duration
  ) {
    return null;
  }
  return {
    trackId,
    playId,
    title: String(value.title || ''),
    artist: String(value.artist || ''),
    position: position / 1000,
    duration: duration / 1000,
  };
}

async function readProgress(options = {}) {
  let connection;
  try {
    connection = await connect(options.port ?? DEFAULT_PORT, options.connectTimeoutMs);
    return normalizeProgress(await connection.evaluate(buildProgressExpression(), options.timeoutMs));
  } catch {
    return null;
  } finally {
    connection?.close();
  }
}

async function seek(position, expected, options = {}) {
  const seconds = Number(position);
  if (!Number.isFinite(seconds) || seconds < 0) return { ok: false, note: 'invalid-position' };
  let connection;
  try {
    connection = await connect(options.port ?? DEFAULT_PORT, options.connectTimeoutMs);
    const before = normalizeProgress(
      await connection.evaluate(buildProgressExpression(), options.timeoutMs),
    );
    if (!before) return { ok: false, note: 'player-not-ready' };
    if (expected?.trackId && before.trackId !== String(expected.trackId)) {
      return { ok: false, note: 'track-changed' };
    }
    if (seconds >= before.duration) return { ok: false, note: 'invalid-position' };
    const result = await connection.evaluate(
      buildSeekExpression(seconds, before.trackId, before.playId),
      options.timeoutMs,
    );
    if (result?.verified === true) {
      return {
        ok: true,
        trackId: String(result.trackId || before.trackId),
        playId: String(result.playId || before.playId),
        position: Number(result.positionMs) / 1000,
        duration: Number(result.durationMs) / 1000,
      };
    }
    if (result?.trackChanged) return { ok: false, note: 'track-changed' };
    if (result?.invalidPosition) return { ok: false, note: 'invalid-position' };
    if (result?.unsupported) return { ok: false, note: 'unsupported' };
    if (result?.timedOut) return { ok: false, note: 'timeout' };
    return { ok: false, note: 'verification' };
  } catch {
    return { ok: false, note: 'unavailable' };
  } finally {
    connection?.close();
  }
}

async function probe(options = {}) {
  try {
    const target = await findPage(options.port ?? DEFAULT_PORT, options.timeoutMs);
    return { ok: true, title: String(target.title || ''), url: String(target.url || '') };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  DEFAULT_PORT,
  buildProgressExpression,
  buildSeekExpression,
  findPage,
  normalizeProgress,
  probe,
  readProgress,
  seek,
  validateEndpoint,
};
