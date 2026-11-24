/**
 * What fills the collapsed pill, and how much of it fits.
 *
 * 0.3.49 made the folded capsule "the face and nothing else": island.js kept
 * rendering battery, clock, temperature and balance into .pill-status, and one
 * CSS rule in the collapsed state took the whole row back. The renderer was
 * never the problem — the decision about what the folded pill shows was spread
 * across a stylesheet rule and an if/else inside renderPillStatus, so neither
 * could be tested. It lives here as data instead:
 *
 *   nowPlaying  media is actively playing; its lyric owns the row, with the
 *               track name kept as quiet context underneath
 *   status      no media is playing and at least one component has a value
 *   face        nothing else: the expression keeps the capsule from being empty
 *
 * Kaomoji is no longer automatic filler. It is an opt-in status component and
 * may join the row only when at least one real reading has a value.
 */

/** The collapsed pill's one expression, shared by the island and settings preview. */
export const PILL_EXPRESSION = '(｡･ω･｡)';

const BILIBILI_LIVE_TITLE = /^(?<room>.*?)\s+-\s+(?<anchor>[^-]+?)\s+-\s+哔哩哔哩直播/u;

const clean = (value) => String(value ?? '').trim();

/*
 * Windows exposes the media owner as an AUMID, not a product name:
 * "cloudmusic.exe", "QQMusic.exe", "SpotifyAB.SpotifyMusic_...!Spotify".
 * These aliases are the one place that vocabulary becomes something a person
 * can read. A resolved live provider wins over the browser hosting the page.
 */
const MEDIA_SOURCE_ALIASES = [
  [/netease|cloudmusic|网易云音乐/u, '网易云音乐'],
  [/qqmusic|qq音乐/iu, 'QQ音乐'],
  [/qqplayer|qq影音/iu, 'QQ影音'],
  [/bilibili|bililive|哔哩哔哩/iu, '哔哩哔哩'],
  [/douyu|斗鱼/iu, '斗鱼'],
  [/spotify/iu, 'Spotify'],
  [/apple\s*music|itunes/iu, 'Apple Music'],
  [/youtube\s*music/iu, 'YouTube Music'],
  [/microsoft\s*edge|msedge|edge/iu, 'Microsoft Edge'],
  [/google\s*chrome|chrome/iu, 'Google Chrome'],
  [/firefox/iu, 'Mozilla Firefox'],
  [/potplayer/iu, 'PotPlayer'],
  [/vlc/iu, 'VLC'],
  [/foobar/iu, 'foobar2000'],
  [/windows\s*media\s*player|wmplayer|zunemusic/iu, '媒体播放器'],
];

const MUSIC_SOURCE = /(?:cloudmusic|netease|spotify|qqmusic|kugou|kuwo|foobar|aimp|musicbee|winamp|itunes|apple[ ._-]*music|tidal|youtube[ ._-]*music|deezer|soundcloud|amazon[ ._-]*music)/iu;

/**
 * The one text a playing frame may show.
 *
 * Music is "song - artist". A live room is "room title - anchor name". The
 * platform suffix that Bilibili puts in the SMTC title is metadata, not part
 * of the label, so it never reaches the island.
 */
export function nowPlayingText(media) {
  if (!media) return '';
  const rawTitle = clean(media.title);
  if (media.live) {
    const title = clean(media.live.roomTitle) || rawTitle;
    const bilibili = rawTitle.match(BILIBILI_LIVE_TITLE);
    const anchor =
      clean(media.live.anchorName) ||
      clean(bilibili?.groups.anchor) ||
      clean(media.artist);
    return [title, anchor].filter(Boolean).join(' - ');
  }
  const bilibili = rawTitle.match(BILIBILI_LIVE_TITLE);
  if (bilibili) {
    return [clean(bilibili.groups.room), clean(bilibili.groups.anchor)].filter(Boolean).join(' - ');
  }
  return [rawTitle, clean(media.artist)].filter(Boolean).join(' - ');
}

/** Three lyric rows around the line that is playing now. */
export function lyricPreviewWindow(lines, index) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return ['', '', ''];
  const current = Math.min(
    list.length - 1,
    Math.max(0, Math.trunc(Number(index)) || 0),
  );
  return [list[current - 1], list[current], list[current + 1]]
    .map((line) => clean(line?.text));
}

/** A readable playback source, including live providers behind a browser. */
export function mediaSourceLabel(media) {
  if (!media) return '未知来源';
  const candidates = [
    clean(media.live?.platform),
    clean(media.source),
    clean(media.title),
    clean(media.artist),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const alias = MEDIA_SOURCE_ALIASES.find(([pattern]) => pattern.test(candidate));
    if (alias) return alias[1];
  }

  const raw = clean(media.source);
  if (!raw) return media.live ? '直播来源' : '未知来源';
  const executable = raw
    .split('!')[0]
    .split(/[\\/]/u)
    .filter(Boolean)
    .pop() || raw;
  const name = executable
    .replace(/\.exe$/iu, '')
    .replace(/_[a-z0-9]{8,}$/iu, '')
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .trim();
  return name || '未知来源';
}

/**
 * Whether this frame is a broadcast rather than recorded media.
 *
 * Duration 0 is common in music players that omit timeline metadata, so it
 * cannot be the only signal. A provider lookup, a platform-specific live title,
 * or a native Douyu source are positive evidence; the absence of a duration is
 * not.
 */
export function isLiveMedia(media) {
  if (!media?.active) return false;
  if (media.live && (media.live.platform || media.live.roomId || media.live.startedAt || media.live.roomTitle)) {
    return true;
  }
  const title = clean(media.title);
  if (BILIBILI_LIVE_TITLE.test(title)) return true;
  if (/哔哩哔哩直播/u.test(title)) return true;
  if (/斗鱼直播|douyu\s*live/iu.test(title)) return true;
  return /douyu|斗鱼/iu.test(clean(media.source));
}

/**
 * Music that should keep its ownership and resume affordance while paused.
 *
 * Explicit live evidence wins over the playback type because browsers can
 * publish a Bilibili room as `PlaybackType=Music`.
 */
export function isMusicMedia(media) {
  if (!media?.active || isLiveMedia(media)) return false;
  const type = clean(media.type).toLowerCase();
  if (type === 'music' || type === '1') return true;
  /* An explicit video/recording type outranks the executable. Desktop music
     apps can also host video, and a paused video must stay on its media page. */
  if (type === 'video' || type === '2') return false;
  return MUSIC_SOURCE.test(clean(media.source));
}

/**
 * Whether a playing music frame just crossed into pause.
 *
 * Pausing recorded video uses the same Transport Controls surface, but the
 * hand-back to the status row is intentionally limited to music so the video
 * page can continue showing its paused timeline.
 */
export function shouldCollapseForPausedMusic(previous, next) {
  return Boolean(
    previous?.active &&
    previous.playing === true &&
    next?.active &&
    next.playing === false &&
    isMusicMedia(next),
  );
}

/**
 * Keep the compact resume control visible until its selected idle limit.
 *
 * A limit of 0 means "never hide". At the exact boundary the control is gone,
 * matching a visible countdown rather than lingering for one more sample.
 */
export function pausedResumeVisible({
  media = null,
  pausedSince = 0,
  hideAfterMin = 0,
  now = Date.now(),
} = {}) {
  if (!isMusicMedia(media) || media.playing !== false) return false;
  const minutes = Math.max(0, Number(hideAfterMin) || 0);
  if (!minutes) return true;
  const since = Math.max(0, Number(pausedSince) || 0);
  if (!since) return true;
  return Math.max(0, Number(now) - since) < minutes * 60_000;
}

const formatMediaClock = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(remainder)}`;
};

const formatBroadcastClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/**
 * The left-hand timing label below the rail.
 *
 * Recorded media reads as "current / total", matching the compact player
 * reference. Live playback only claims a broadcast age after a provider has
 * returned the real anchor start; the watcher timestamp is useful for carrying
 * a clock across a reconnect, but it is not evidence of when the anchor went
 * live.
 */
export function mediaTimingLabel(media, {
  position = 0,
  liveSeconds = 0,
  fallbackDuration = 0,
} = {}) {
  if (!media?.active) return '';
  if (isLiveMedia(media)) {
    return Number(media.live?.startedAt) > 0
      ? formatBroadcastClock(liveSeconds)
      : '直播中';
  }
  const duration = Number(media.duration) > 0
    ? Number(media.duration)
    : Number(fallbackDuration) || 0;
  return `${formatMediaClock(position)} / ${duration > 0 ? formatMediaClock(duration) : '--:--'}`;
}

/**
 * Resolve the status keys that can actually be drawn.
 *
 * Missing readings never become placeholders. Kaomoji keeps its user-defined
 * slot when enabled, but disappears by itself when every real reading is
 * unavailable — the character face remains the fallback instead.
 */
export function visiblePillStatusKeys(keys = [], available = {}) {
  const ordered = Array.isArray(keys) ? [...new Set(keys)] : [];
  const readings = ordered.filter((key) => key !== 'kaomoji' && Boolean(available?.[key]));
  if (!readings.length) return [];
  return ordered.filter((key) => key === 'kaomoji' || Boolean(available?.[key]));
}

/**
 * The collapsed pill's content plan.
 *
 * Playing media owns the row. Paused music hands it back to the readings while
 * an optional compact control keeps the same player resumable from the pill.
 * The existing island-content preference can switch both media views off.
 */
export function pillContentPlan({
  statusCount = 0,
  media = null,
  showNowPlaying = true,
  lyricLine = '',
  resumeVisible = false,
} = {}) {
  const count = Math.max(0, Number(statusCount) || 0);
  const playing = Boolean(showNowPlaying && media?.active && media?.playing);
  const track = playing ? nowPlayingText(media) || '正在播放' : '';
  const lyric = playing ? clean(lyricLine) : '';
  /*
   * The capsule still owns one deliberately fixed text viewport. The lyric
   * changes inside it and the track stays underneath, so neither a long line
   * nor the next lyric boundary can retarget the width spring.
   */
  if (track) {
    return {
      mode: 'nowPlaying',
      text: lyric || track,
      track,
      lyric,
      statusCount: 0,
    };
  }
  if (count > 0 || (showNowPlaying && resumeVisible)) return { mode: 'status', statusCount: count };
  return { mode: 'face', statusCount: 0 };
}

/**
 * How many leading status components fit on one line.
 *
 * The pill is capped by --pill-max-w, and past that cap the row is what gives
 * way. Trimming keeps whole components and replaces the rest with a "…" (which
 * costs `moreWidth`), because clipping at the pixel is how a capsule ends up
 * reading "¥20." — a number that is not a number.
 *
 * `available` is the row's own width once the face, gaps and padding are paid
 * for; the caller measures it, this function only decides the cut.
 */
export function fitStatusRow(widths, gap, available, moreWidth = 10) {
  const n = widths.length;
  if (!n) return { keep: 0, truncated: false };
  const span = (k) => {
    let total = 0;
    for (let i = 0; i < k; i += 1) total += widths[i];
    return total + Math.max(0, k - 1) * gap;
  };
  if (span(n) <= available) return { keep: n, truncated: false };
  for (let k = n - 1; k >= 1; k -= 1) {
    if (span(k) + gap + moreWidth <= available) return { keep: k, truncated: true };
  }
  /* Even one component does not fit next to the ellipsis: keep it whole and let
     the row clip rather than showing "…" with no number beside it. */
  return { keep: 1, truncated: n > 1 };
}
