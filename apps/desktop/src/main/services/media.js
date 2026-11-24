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
const douyu = require('./douyu');
const netease = require('./netease');
const neteaseArtwork = require('./netease-artwork');
const neteaseCdp = require('./netease-cdp');

const SCRIPT = scriptFile('media.ps1');
const CONNECT_SCRIPT = scriptFile('netease-connect.ps1');
const EMPTY = Object.freeze({ active: false, title: '', artist: '', album: '', trackId: '', playing: false, position: 0, duration: 0, art: '', source: '', output: '', controls: null, error: false, liveSince: 0, sampledAt: 0 });

let state = { ...EMPTY };
/* The two providers keep their own last frame; `state` is the public winner. */
let smtcFrame = { ...EMPTY };
let fallbackFrame = null;
/* The best non-music player while the winning music session is paused. */
let alternateFrame = null;
let pausedMusicSince = 0;
let pausedMusicKey = '';
let pausedHideMin = 15;
let proc = null;
let restartTimer = null;
let stopping = false;
let connectPrepared = false;
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
 * user actually experienced; a different channel starts a new clock.
 */
const LIVE_GRACE_MS = 30000;
let live = { key: '', since: 0, endedAt: 0 };
/** The live metadata lookup currently in flight for this exact frame. */
let liveLookupKey = '';

/*
 * Media ownership is decided once, before anything reaches the renderer.
 *
 * "Media" is not one kind: music can play beside a recorded video, and a live
 * room can stay open while a song plays. The order below is the product rule,
 * not a guess about launch order:
 *
 *   music       known music players or PlaybackType=Music
 *   onDemand    finite-length video, podcast or other recorded media
 *   live        broadcast evidence from a provider/title
 *   generic     an active session we cannot classify further
 *
 * Music stays pinned above every non-music session, including while paused.
 * That keeps the play control on the music player and lets the same frame
 * resume when the user presses play again. Playback state only breaks ties
 * within the same media kind. The title, timeline and cover always travel
 * together from that one frame.
 */
const isNeteaseSource = (frame) => /(?:cloudmusic|netease)/i.test(String(frame?.source || ''));
const needsNetEaseTimeline = (frame) => Boolean(frame?.active && !frame.duration && isNeteaseSource(frame));
const MUSIC_SOURCE = /(?:cloudmusic|netease|spotify|qqmusic|kugou|kuwo|foobar|aimp|musicbee|winamp|itunes|apple[ ._-]*music|tidal|youtube[ ._-]*music|deezer|soundcloud|amazon[ ._-]*music|zune(?:music)?)/i;
const LIVE_EVIDENCE = /(?:bilibili|bililive|douyu|哔哩哔哩|斗鱼|直播)/i;
const MEDIA_PRIORITY = Object.freeze({ music: 400, onDemand: 300, live: 200, generic: 100 });

function classifyMediaFrame(frame) {
  if (!frame?.active) return 'inactive';
  const type = String(frame.type || '').trim().toLowerCase();
  const source = String(frame.source || '');
  const title = String(frame.title || '');

  if (
    (frame.live &&
      (frame.live.platform || frame.live.roomId || frame.live.startedAt || frame.live.roomTitle)) ||
    LIVE_EVIDENCE.test(source) ||
    LIVE_EVIDENCE.test(title)
  ) {
    return 'live';
  }
  if (type === 'music' || type === '1' || MUSIC_SOURCE.test(source)) return 'music';
  if (Number(frame.duration) > 0 || type === 'video' || type === '2' || type === 'podcast') {
    return 'onDemand';
  }
  return 'generic';
}

const mediaIdentity = (frame) =>
  JSON.stringify([
    String(frame?.source || ''),
    String(frame?.title || ''),
    String(frame?.artist || ''),
    String(frame?.album || ''),
  ]);

function trackPausedMusic(frame, now = Date.now()) {
  if (!frame?.active || classifyMediaFrame(frame) !== 'music' || frame.playing !== false) {
    pausedMusicSince = 0;
    pausedMusicKey = '';
    return;
  }
  const key = mediaIdentity(frame);
  if (!pausedMusicSince || pausedMusicKey !== key) {
    pausedMusicSince = now;
    pausedMusicKey = key;
  }
}

function sameNeteaseTrack(left, right) {
  if (!isNeteaseSource(left) || !isNeteaseSource(right)) return false;
  const leftId = String(left.trackId || '').trim();
  const rightId = String(right.trackId || '').trim();
  if (leftId && rightId) return leftId === rightId;
  const leftTitle = String(left.title || '').trim();
  const rightTitle = String(right.title || '').trim();
  return Boolean(leftTitle && rightTitle && leftTitle === rightTitle);
}

/** Merge only two observations of the same NetEase track. */
function supplementNeteaseTimeline(primary, fallback) {
  if (!needsNetEaseTimeline(primary) || !fallback?.active || !sameNeteaseTrack(primary, fallback)) {
    return primary;
  }
  return {
    ...fallback,
    title: fallback.title || primary.title,
    artist: fallback.artist || primary.artist,
    album: fallback.album || primary.album,
    trackId: fallback.trackId || primary.trackId,
    art: primary.art || fallback.art,
    controls: primary.controls ?? fallback.controls,
    output: primary.output || fallback.output,
    playing: primary.playing === true,
    type: primary.type || fallback.type || 'Music',
  };
}

function pausedMusicExpired(frame, { pausedSince = 0, pausedHideMin = 0, now = Date.now() } = {}) {
  if (classifyMediaFrame(frame) !== 'music' || frame.playing !== false) return false;
  const minutes = Math.max(0, Number(pausedHideMin) || 0);
  const since = Math.max(0, Number(pausedSince) || 0);
  return Boolean(minutes && since && Math.max(0, Number(now) - since) >= minutes * 60_000);
}

function selectMediaFrame(primary, fallback, alternate = null, options = {}) {
  const primaryFrame = supplementNeteaseTimeline(primary, fallback);
  const fallbackWasMerged = primaryFrame !== primary;
  const candidates = [
    { frame: primaryFrame, order: 0 },
    { frame: fallbackWasMerged ? null : fallback, order: 1 },
    { frame: alternate, order: 2 },
  ].filter(({ frame }) => frame?.active && !pausedMusicExpired(frame, options));

  if (candidates.length) {
    candidates.sort((left, right) => {
      const leftKind = classifyMediaFrame(left.frame);
      const rightKind = classifyMediaFrame(right.frame);
      const leftMusic = leftKind === 'music' ? 1 : 0;
      const rightMusic = rightKind === 'music' ? 1 : 0;
      if (leftMusic !== rightMusic) return rightMusic - leftMusic;
      const leftPlaying = left.frame.playing === true ? 1 : 0;
      const rightPlaying = right.frame.playing === true ? 1 : 0;
      if (leftPlaying !== rightPlaying) return rightPlaying - leftPlaying;
      const priority =
        (MEDIA_PRIORITY[rightKind] || 0) -
        (MEDIA_PRIORITY[leftKind] || 0);
      return priority || left.order - right.order;
    });
    return candidates[0].frame;
  }
  if (primary?.error) return primary;
  return EMPTY;
}

/**
 * Keep the NetEase clock available whenever its audio session still exists.
 *
 * A paused player can stop being the playing SMTC session without closing its
 * audio session. Polling only while `audio.playing` is true made a live stream
 * replace paused music before the fallback could publish its paused frame.
 */
function shouldPollNetease(audio, frame) {
  return Boolean(
    !frame?.active ||
      needsNetEaseTimeline(frame) ||
      (audio?.session === true && classifyMediaFrame(frame) !== 'music'),
  );
}

const neteaseFallback = netease.createNeteaseFallback({
  shouldPoll: (audio) => shouldPollNetease(audio, smtcFrame),
});
neteaseFallback.onChange(handleNeteaseFrame);

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
const liveKey = (frame) => JSON.stringify([frame.title || '', frame.artist || '', frame.source || '']);

/**
 * Drop the Bilibili placeholder thumbnail before it can suppress the real
 * room lookup. The public room endpoint is the only source that knows whether
 * today's SMTC thumbnail is a useful image or the familiar 300px logo.
 */
function prepareLiveFrame(frame) {
  if (!frame?.active || frame.duration || !bilibili.looksLive(frame.title)) return frame;
  return { ...frame, art: '' };
}

/** Add resolved room metadata without replacing the player's raw title. */
function attachLiveInfo(frame, info) {
  if (!frame || !info?.roomTitle || !info?.anchorName) return frame;
  const startedAt = Number(info.startedAt) || 0;
  const art = typeof info.art === 'string' && info.art.startsWith('data:image/') ? info.art : '';
  return {
    ...frame,
    art: art || frame.art,
    liveSince: startedAt || frame.liveSince,
    live: {
      platform: String(info.platform || ''),
      roomId: String(info.roomId || ''),
      roomTitle: String(info.roomTitle),
      anchorName: String(info.anchorName),
      startedAt,
    },
  };
}

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
  const reportedStart = Number(frame.live?.startedAt) || 0;
  const continuing =
    live.since && live.key === key && (!live.endedAt || now - live.endedAt <= LIVE_GRACE_MS);
  if (continuing) {
    live.endedAt = 0;
    if (reportedStart) live.since = reportedStart;
  } else {
    live = { key, since: reportedStart || now, endedAt: 0 };
  }
  return live.since;
}

/**
 * The provider that can resolve this live frame, if any.
 *
 * Bilibili identifies itself in the title. Douyu uses a browser-shaped live
 * frame with both room name and anchor; the bridge then requires an exact
 * name match before accepting a room.
 */
function liveLookupTarget(frame) {
  if (!frame?.active || frame.duration) return null;
  if (bilibili.looksLive(frame.title)) {
    return {
      key: JSON.stringify(['bilibili', frame.title || '', frame.source || '']),
      run: () => bilibili.infoFor(frame.title),
    };
  }
  if (douyu.looksCandidate(frame)) {
    return {
      key: JSON.stringify(['douyu', frame.title || '', frame.artist || '', frame.source || '']),
      run: () => douyu.infoFor(frame.title, frame.artist),
    };
  }
  return null;
}

/**
 * Fill a missing NetEase cover without changing which frame owns playback.
 *
 * The returned image is written back to every observation of the same track,
 * then the normal selector runs again. If a live stream took over while the
 * request was in flight, the track-id check prevents its artwork from being
 * attached to the new owner.
 */
function resolveSelectedArtwork(frame) {
  if (
    !frame?.active ||
    frame.art ||
    !isNeteaseSource(frame) ||
    !/^\d{1,20}$/.test(String(frame.trackId || ''))
  ) {
    return;
  }
  const trackId = String(frame.trackId);
  void neteaseArtwork.resolve(trackId).then((art) => {
    if (!art || stopping) return;
    let applied = false;
    if (
      isNeteaseSource(smtcFrame) &&
      String(smtcFrame.trackId || '') === trackId
    ) {
      smtcFrame = { ...smtcFrame, art };
      applied = true;
    }
    if (
      fallbackFrame?.active &&
      isNeteaseSource(fallbackFrame) &&
      String(fallbackFrame.trackId || '') === trackId
    ) {
      fallbackFrame = { ...fallbackFrame, art };
      applied = true;
    }
    if (applied) publishSelected(true);
  });
}

/** Publish whichever provider wins now, without losing its per-second clock. */
function publishSelected(force = false) {
  const now = Date.now();
  trackPausedMusic(selectMediaFrame(smtcFrame, fallbackFrame, alternateFrame), now);
  const selected = selectMediaFrame(smtcFrame, fallbackFrame, alternateFrame, {
    pausedSince: pausedMusicSince,
    pausedHideMin,
    now,
  });
  const next = {
    ...selected,
    liveSince: liveSinceFor(selected),
    // The renderer uses this local receipt time to run its lyric clock
    // between the once-per-second media frames. Player-provided `updated`
    // timestamps are not portable (NetEase reports 0/0 there).
    sampledAt: Date.now(),
  };
  if (!next.active) liveLookupKey = '';

  const changed =
    next.active !== state.active ||
    next.error !== state.error ||
    next.title !== state.title ||
    next.artist !== state.artist ||
    next.album !== state.album ||
    next.playing !== state.playing ||
    next.duration !== state.duration ||
    next.source !== state.source ||
    next.art !== state.art ||
    next.liveSince !== state.liveSince ||
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
  if (force || changed || now - lastEmit > HEARTBEAT_MS) {
    lastEmit = now;
    emit();
  }
  resolveSelectedArtwork(next);
}

function handleLine(line) {
  if (!line || line[0] !== '{') return;
  let next;
  try {
    next = JSON.parse(line);
  } catch {
    return;
  }
  const alternate = next.alternate;
  delete next.alternate;
  next = prepareLiveFrame(next);
  const preparedAlternate = alternate?.active ? prepareLiveFrame(alternate) : null;
  if (
    preparedAlternate &&
    alternateFrame?.live &&
    preparedAlternate.title === alternateFrame.title &&
    preparedAlternate.artist === alternateFrame.artist &&
    preparedAlternate.source === alternateFrame.source
  ) {
    preparedAlternate.live = alternateFrame.live;
  }
  if (
    preparedAlternate &&
    !preparedAlternate.art &&
    alternateFrame?.art &&
    preparedAlternate.title === alternateFrame.title &&
    preparedAlternate.artist === alternateFrame.artist
  ) {
    preparedAlternate.art = alternateFrame.art;
  }
  alternateFrame = preparedAlternate;
  /*
   * The PowerShell stream sends metadata only when it changes. Carry resolved
   * live metadata and artwork forward for the same frame, just as the cover is
   * carried for the same track.
   */
  if (
    smtcFrame.live &&
    next.title === smtcFrame.title &&
    next.artist === smtcFrame.artist &&
    next.source === smtcFrame.source
  ) {
    next.live = smtcFrame.live;
  }
  if (!next.art && smtcFrame.art && next.title === smtcFrame.title && next.artist === smtcFrame.artist) {
    next.art = smtcFrame.art;
  }
  next.error = false;
  smtcFrame = next;
  neteaseFallback.setPlayingHint(next.active && isNeteaseSource(next) ? next.playing : null);
  if (!next.active) {
    liveLookupKey = '';
    publishSelected();
    return;
  }
  const primaryLookup = liveLookupTarget(next);
  const lookupIsAlternate = !primaryLookup && Boolean(alternateFrame);
  const lookup = primaryLookup || liveLookupTarget(alternateFrame);
  if (lookup && lookup.key !== liveLookupKey) {
    liveLookupKey = lookup.key;
    const title = lookupIsAlternate ? alternateFrame.title : next.title;
    const artist = lookupIsAlternate ? alternateFrame.artist : next.artist;
    const source = lookupIsAlternate ? alternateFrame.source : next.source;
    lookup
      .run()
      .then((info) => {
        const current = lookupIsAlternate ? alternateFrame : smtcFrame;
        if (
          !info ||
          !current ||
          current.duration ||
          current.title !== title ||
          current.artist !== artist ||
          current.source !== source ||
          current.live?.roomId === info.roomId
        ) {
          if (!info && liveLookupKey === lookup.key) liveLookupKey = '';
          return;
        }
        if (lookupIsAlternate) alternateFrame = attachLiveInfo(alternateFrame, info);
        else smtcFrame = attachLiveInfo(smtcFrame, info);
        publishSelected(true);
      })
      .catch(() => {
        if (liveLookupKey === lookup.key) liveLookupKey = '';
      });
  } else if (!lookup) {
    liveLookupKey = '';
  }
  publishSelected();
}

function handleNeteaseFrame(frame) {
  fallbackFrame = frame?.active ? frame : null;
  /*
   * This callback is the clock for NetEase. It must publish even when SMTC
   * has an active zero-length NetEase frame, and it may also be the winner
   * over a simultaneously playing live session.
   */
  publishSelected();
}

const normalizePausedHideMin = (value) => Math.max(0, Number(value) || 0);

function setPausedHideMin(value) {
  const next = normalizePausedHideMin(value);
  if (next === pausedHideMin) return;
  pausedHideMin = next;
  publishSelected(true);
}

function holdPausedResume() {
  if (!pausedMusicSince) return false;
  pausedMusicSince = Date.now();
  publishSelected(true);
  return true;
}

function start(options = {}) {
  if (proc) return;
  stopping = false;
  buffer = '';
  pausedHideMin = normalizePausedHideMin(options.pausedHideMin ?? pausedHideMin);
  if (!connectPrepared) {
    connectPrepared = true;
    try {
      const setup = platform.spawnPowerShell(
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CONNECT_SCRIPT, '-Action', 'Ensure'],
        { stdio: 'ignore' },
      );
      setup?.unref?.();
    } catch {
      // A read-only user profile can still use elog playback and external seek.
    }
  }
  /*
   * Start both probes together. Whichever player is already running wins on
   * its first frame, so launch order is no longer part of the contract.
   */
  neteaseFallback.start();
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
    smtcFrame = { ...EMPTY, error: true };
    publishSelected();
    // A crashed child comes back; the island keeps the last frame meanwhile.
    restartTimer = setTimeout(start, 2500);
  });
}

function stop() {
  stopping = true;
  clearTimeout(restartTimer);
  neteaseFallback.stop();
  smtcFrame = { ...EMPTY };
  fallbackFrame = null;
  alternateFrame = null;
  pausedMusicSince = 0;
  pausedMusicKey = '';
  connectPrepared = false;
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

function commandTargetArgs(frame = state) {
  if (!frame?.active) return [];
  const source = String(frame.source || '').trim();
  if (!source) return [];
  return ['-TargetSource', source, '-TargetTitle', String(frame.title || '')];
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
  /*
   * NetEase's SMTC endpoint accepts a seek and returns true even when its
   * advertised timeline is 0/0 and no native progress moves. Use the bounded
   * local CDP path when NetEase owns the visible frame, and do not report a
   * success until the player itself reads back the new native position.
   */
  if (request.kind === 'seek' && isNeteaseSource(state)) {
    return neteaseCdp
      .seek(request.arg, { trackId: state.trackId })
      .then((result) => {
        if (!result.ok) {
          return { kind: 'seek', ok: false, note: String(result.note || 'netease-cdp') };
        }
        neteaseFallback.seek(result.position);
        return {
          kind: 'seek',
          ok: true,
          note: 'netease-cdp',
          position: result.position,
        };
      })
      .catch(() => ({ kind: 'seek', ok: false, note: 'netease-cdp' }));
  }
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, request.kind];
  /* toggle/next/prev take no value; everything else must pass its own, zero
     included — "shuffle 0" and "shuffle with no argument" are the same call
     only by accident of the script's default, and the page should not rely
     on that. */
  if (!['toggle', 'next', 'prev'].includes(request.kind)) args.push(String(request.arg));
  args.push(...commandTargetArgs());
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
      if (request.kind === 'seek' && result.ok) {
        if (smtcFrame.active) {
          const duration = Math.max(0, Number(smtcFrame.duration) || 0);
          smtcFrame = {
            ...smtcFrame,
            position: duration ? Math.min(duration, request.arg) : request.arg,
            updated: Date.now(),
          };
          publishSelected(true);
        }
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

module.exports = {
  start,
  stop,
  setPausedHideMin,
  holdPausedResume,
  command,
  normalizeCommand,
  commandTargetArgs,
  classifyMediaFrame,
  selectMediaFrame,
  shouldPollNetease,
  onChange,
  current,
  refreshSoon,
  prepareLiveFrame,
  attachLiveInfo,
  liveLookupTarget,
};
