/**
 * NetEase Cloud Music fallback for players that do not publish SMTC.
 *
 * Windows exposes no useful now-playing timeline for some NetEase builds.
 * The player still appends track, play/pause and seek events to
 * `cloudmusic.elog`; netease-elog.js turns those into the authoritative clock.
 * The local SQLite history remains a metadata fallback for old clients, while
 * CoreAudio tells us whether NetEase still owns an audio session.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');
const neteaseElog = require('./netease-elog');

const SCRIPT = scriptFile('netease-audio.ps1');
const SOURCE = 'cloudmusic.exe';
const DEFAULT_POLL_MS = 250;
const DATABASE_NAME = 'webdb.dat';

function roundTenths(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultDatabasePath() {
  const local = process.env.LOCALAPPDATA || '';
  return local ? require('node:path').join(local, 'NetEase', 'CloudMusic', 'Library', DATABASE_NAME) : '';
}

function historyPayload(row) {
  if (!row?.jsonStr) return null;
  try {
    const value = typeof row.jsonStr === 'string' ? JSON.parse(row.jsonStr) : row.jsonStr;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function historyTrack(row) {
  const json = historyPayload(row);
  if (!row || !json) return null;
  const id = String(json.id || row.id || '');
  const playtime = Number(json.playtime || row.playtime);
  const durationMs = Number(json.duration);
  if (!id || !Number.isFinite(playtime) || playtime <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const artists = Array.isArray(json.artists)
    ? json.artists.map((artist) => String(artist?.name || '').trim()).filter(Boolean)
    : [];
  const album = json.album && typeof json.album === 'object' ? json.album : {};
  return {
    id,
    playtime,
    title: String(json.name || '').trim(),
    artist: artists.join(' / '),
    album: String(album.name || album.albumName || '').trim(),
    duration: roundTenths(durationMs / 1000),
  };
}

/** Convert one `historyTracks` row to the frame shape media.js publishes. */
function mapHistoryRow(row, options = {}) {
  const track = historyTrack(row);
  if (!track) return null;
  const now = Number(options.now ?? Date.now());
  const playing = options.playing === true;
  const position = clamp((now - track.playtime) / 1000, 0, track.duration);
  return {
    active: true,
    title: track.title,
    artist: track.artist,
    album: track.album,
    trackId: track.id,
    playing,
    position: roundTenths(position),
    duration: track.duration,
    updated: track.playtime,
    source: SOURCE,
    output: '',
    art: '',
    controls: null,
    liveSince: 0,
    error: false,
  };
}

function mergeElogTrack(track, history, now) {
  const duration = Math.max(0, Number(track?.duration) || Number(history?.duration) || 0);
  const position = clamp(Number(track?.position ?? 0), 0, duration || Number.POSITIVE_INFINITY);
  return {
    active: true,
    title: String(track?.title || history?.title || '').trim(),
    artist: String(track?.artist || history?.artist || '').trim(),
    album: String(track?.album || history?.album || '').trim(),
    trackId: String(track?.id || history?.id || ''),
    playing: track?.playing === true,
    position: roundTenths(position),
    duration: roundTenths(duration),
    updated: Number(now),
    source: SOURCE,
    output: '',
    art: '',
    controls: null,
    liveSince: 0,
    error: false,
  };
}

/**
 * A stateful clock for the history row.
 *
 * The first sample may arrive long after playback started, so it is anchored
 * to the row's play timestamp. Later samples advance from the last observed
 * position; that is what lets a pause freeze the clock and a resume continue
 * from the same place instead of counting the paused wall time.
 */
function createPlaybackClock(options = {}) {
  const now = options.now ?? Date.now;
  let current = null;

  function reset() {
    current = null;
  }

  function sample(track, playing) {
    const at = Number(now());
    const id = String(track?.id || '');
    const playtime = Number(track?.playtime);
    const duration = Math.max(0, Number(track?.duration) || 0);
    if (!id || !Number.isFinite(playtime) || !Number.isFinite(at)) {
      return { position: 0, duration, playing: playing === true };
    }

    if (!current || current.id !== id || current.playtime !== playtime) {
      const initial = clamp((at - playtime) / 1000, 0, duration);
      current = {
        id,
        playtime,
        duration,
        playing: playing === true,
        position: initial,
        anchorAt: at,
        anchorPosition: initial,
      };
    } else {
      const advancing = playing === true;
      if (advancing && current.playing) {
        current.position = clamp(
          current.anchorPosition + (at - current.anchorAt) / 1000,
          0,
          duration,
        );
      } else if (!advancing && current.playing) {
        current.position = clamp(
          current.anchorPosition + (at - current.anchorAt) / 1000,
          0,
          duration,
        );
      }
      if (advancing && !current.playing) {
        current.anchorAt = at;
        current.anchorPosition = current.position;
      }
      current.playing = advancing;
      current.duration = duration;
    }

    return {
      position: roundTenths(clamp(current.position, 0, duration)),
      duration,
      playing: current.playing,
    };
  }

  /**
   * Move the clock without changing which track owns it.
   *
   * NetEase does not publish a timeline, so an Island seek and a drag in the
   * player are both invisible to SMTC. Re-anchoring here makes the next poll
   * and the lyrics continue from the hand-off point instead of from the old
   * history timestamp.
   */
  function seek(position) {
    if (!current) return null;
    const duration = Math.max(0, Number(current.duration) || 0);
    const target = roundTenths(clamp(Number(position) || 0, 0, duration));
    current.position = target;
    current.anchorAt = Number(now());
    current.anchorPosition = target;
    return target;
  }

  return { sample, seek, reset };
}

/** Read the latest NetEase history row without ever taking a write lock. */
function createHistoryReader() {
  let db = null;
  let statement = null;
  let dbPath = '';

  function close() {
    try {
      db?.close();
    } catch {
      // The connection is already gone.
    }
    db = null;
    statement = null;
    dbPath = '';
  }

  return function readHistory(path = defaultDatabasePath()) {
    if (!path) return null;
    try {
      if (!db || dbPath !== path) {
        close();
        const { DatabaseSync } = require('node:sqlite');
        db = new DatabaseSync(path, { readOnly: true, timeout: 1000 });
        statement = db.prepare(
          'SELECT playtime, id, jsonStr FROM historyTracks ORDER BY playtime DESC LIMIT 1',
        );
        dbPath = path;
      }
      return statement.get() ?? null;
    } catch {
      close();
      return null;
    }
  };
}

/**
 * The long-lived CoreAudio probe. It emits only a small JSON line every half
 * second; the elog reader supplies the precise timeline in parallel.
 */
function createAudioMonitor(options = {}) {
  let child = null;
  let buffer = '';
  let current = { session: false, playing: false, pids: [] };
  const spawn = options.spawn ?? platform.spawnPowerShell;

  function reset() {
    current = { session: false, playing: false, pids: [] };
  }

  function start() {
    if (child) return;
    buffer = '';
    reset();
    child = spawn(
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Watch'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (!child) return;
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line);
          current = {
            session: parsed.session === true,
            playing: parsed.playing === true,
            pids: Array.isArray(parsed.pids) ? parsed.pids.filter(Number.isInteger) : [],
          };
          options.onChange?.(current);
        } catch {
          // Ignore a partial or malformed probe line.
        }
      }
    });
    const self = child;
    child.once('exit', () => {
      if (child !== self) return;
      child = null;
      reset();
      options.onChange?.(current);
    });
  }

  function stop() {
    const running = child;
    child = null;
    reset();
    try {
      running?.kill();
    } catch {
      // Already gone.
    }
  }

  return { start, stop, current: () => current };
}

/**
 * Poll NetEase only while SMTC has no stronger active player. The elog reader
 * gives an immediate first frame and event-driven seeks; history remains a
 * fallback for clients that do not write the fields we need.
 */
function createNeteaseFallback(options = {}) {
  const now = options.now ?? Date.now;
  const pollMs = Math.max(250, Number(options.pollMs) || DEFAULT_POLL_MS);
  const clock = options.clock ?? createPlaybackClock({ now });
  const readHistory = options.readHistory ?? createHistoryReader();
  const shouldPoll = options.shouldPoll ?? (() => true);
  const listeners = new Set();
  let monitor = null;
  let readAudio = options.readAudio;
  let timer = null;
  let inFlight = null;
  let last = null;
  let latestFrame = null;
  let elogSnapshot = options.elogSnapshot ?? null;
  let playingHint = null;
  let stopped = false;
  let elogMonitor = options.elogMonitor;

  if (elogMonitor === undefined) {
    elogMonitor = neteaseElog.createElogMonitor({ ...options, now });
  }
  elogMonitor?.onChange?.((snapshot) => {
    if (stopped) return;
    elogSnapshot = snapshot;
    void poll();
  });

  if (!readAudio) {
    monitor = createAudioMonitor({
      onChange: () => { void poll(); },
      spawn: options.spawn,
    });
    readAudio = () => monitor.current();
  }

  function emit(frame) {
    latestFrame = frame;
    const signature = frame ? JSON.stringify(frame) : '';
    if (signature === last) return;
    last = signature;
    for (const listener of listeners) {
      try {
        listener(frame);
      } catch {
        // A broken listener must not stop the fallback.
      }
    }
  }

  async function poll() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let audio;
      try {
        audio = await readAudio();
      } catch {
        audio = null;
      }
      if (!shouldPoll(audio)) {
        // SMTC owns the clock while another player is active. Re-anchor from
        // the history row if NetEase becomes the visible source later.
        clock.reset();
        if (last) emit(null);
        return null;
      }
      const recentElog =
        elogSnapshot?.active && Number(now()) - Number(elogSnapshot.lastEventAt) < 2_000;
      if (!audio?.session && !recentElog) {
        clock.reset();
        emit(null);
        return null;
      }

      /*
       * The elog clock is the primary NetEase timeline. It updates on the
       * player's own seek/play/pause events, so the Island does not have to
       * wait for a history row or a second CoreAudio sample.
       */
      const elogFresh =
        elogSnapshot?.active &&
        (audio?.session || Number(now()) - Number(elogSnapshot.lastEventAt) < 2_000);
      if (elogFresh) {
        let track = elogSnapshot.track ? { ...elogSnapshot.track } : null;
        let history = null;
        if (track && (!track.title || !track.duration)) {
          try {
            history = historyTrack(await readHistory());
          } catch {
            history = null;
          }
          if (history && history.id !== track.id) history = null;
        }
        if (track?.title || history?.title) {
          const position = clamp(
            Number(elogSnapshot.position) +
              (elogSnapshot.playing ? (Number(now()) - Number(elogSnapshot.updated)) / 1000 : 0),
            0,
            Number(track?.duration) || Number(history?.duration) || Number.POSITIVE_INFINITY,
          );
          const frame = mergeElogTrack(
            {
              ...track,
              position,
              playing: elogSnapshot.playing,
            },
            history,
            now(),
          );
          latestFrame = frame;
          emit(frame);
          return frame;
        }
      }

      let row;
      try {
        row = await readHistory();
      } catch {
        row = null;
      }
      const track = historyTrack(row);
      if (!track) {
        emit(null);
        return null;
      }
      const playing = playingHint ?? audio.playing === true;
      const sample = clock.sample(track, playing);
      const frame = {
        ...mapHistoryRow(row, { now: now(), playing }),
        position: sample.position,
        duration: sample.duration,
        playing: sample.playing,
      };
      emit(frame);
      return frame;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function start() {
    if (timer) return;
    stopped = false;
    monitor?.start();
    elogMonitor?.start?.();
    void poll();
    timer = setInterval(() => {
      if (!stopped) void poll();
    }, pollMs);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = null;
    monitor?.stop();
    elogMonitor?.stop?.();
    clock.reset();
    last = null;
    latestFrame = null;
    playingHint = null;
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setPlayingHint(playing) {
    playingHint = playing == null ? null : playing === true;
    void poll();
  }

  /**
   * Apply a fraction of the current track as a new playback anchor.
   *
   * The caller writes a frame through `emit`, so the Island repaints the rail
   * and lyrics in the same tick as the pointer gesture, before the player's
   * audio probe has caught up with the input.
   */
  function seekToRatio(ratio) {
    if (!latestFrame?.active) return null;
    const duration = Math.max(0, Number(latestFrame.duration) || 0);
    if (!duration) return null;
    const normalized = clamp(Number(ratio) || 0, 0, 1);
    return seek(normalized * duration);
  }

  /** Re-anchor an absolute position, used by an Island-originated seek. */
  function seek(position) {
    if (!latestFrame?.active) return null;
    const duration = Math.max(0, Number(latestFrame.duration) || 0);
    if (!duration) return null;
    const target = clock.seek(position);
    if (target === null) return null;
    const frame = { ...latestFrame, position: target, updated: Number(now()) };
    emit(frame);
    return frame;
  }

  return { start, stop, poll, onChange, setPlayingHint, seek, seekToRatio };
}

module.exports = {
  SOURCE,
  mapHistoryRow,
  historyTrack,
  createPlaybackClock,
  createHistoryReader,
  createAudioMonitor,
  createNeteaseFallback,
  mergeElogTrack,
};
