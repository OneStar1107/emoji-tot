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
 *   nowPlaying  media is actively playing; its title owns the row
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
 * Playback is the one state that outranks the status row. A title is more
 * useful than four unrelated readings while music, video, or a live stream is
 * running; stopping or pausing restores that row. The existing island-content
 * preference can switch the title off for users who prefer the readings.
 */
export function pillContentPlan({ statusCount = 0, media = null, showNowPlaying = true } = {}) {
  const count = Math.max(0, Number(statusCount) || 0);
  const playing = Boolean(showNowPlaying && media?.active && media?.playing);
  const text = playing ? nowPlayingText(media) || '正在播放' : '';
  if (text) return { mode: 'nowPlaying', text, statusCount: 0 };
  if (count > 0) return { mode: 'status', statusCount: count };
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
