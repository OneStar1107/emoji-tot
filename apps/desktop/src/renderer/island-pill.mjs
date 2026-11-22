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
 *   status   at least one component has a value  (the default)
 *   lyric    no component, a song is playing, and the "岛上歌词" switch is on
 *   face     nothing else: the expression keeps the capsule from being empty
 *
 * The expression is filler, so it never shares the row with two or more
 * components — at that point it is noise, not status.
 */

/** The collapsed pill's one expression. Named so the tests and CSS agree. */
export const PILL_EXPRESSION = '(｡･ω･｡)';

/**
 * The collapsed pill's content plan.
 *
 * Status components always win, including while a song plays: they were hidden
 * before this module existed, and the lyric that replaced them (when
 * music.islandLyrics is on) covered the very components the pill is for. The
 * lyric still has a place — the expanded panel's music page — and on the
 * collapsed pill only when no component has a value at all, so the switch the
 * settings window offers is not a dead one.
 */
export function pillContentPlan({ statusCount = 0, playing = false, islandLyrics = true } = {}) {
  const count = Math.max(0, Number(statusCount) || 0);
  if (count > 0) return { mode: 'status', statusCount: count, trailer: count < 2 };
  if (playing && islandLyrics !== false) return { mode: 'lyric', statusCount: 0, trailer: false };
  return { mode: 'face', statusCount: 0, trailer: true };
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
