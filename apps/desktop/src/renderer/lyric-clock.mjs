/** Seconds between media samples, while the player is running. */
const playbackRate = (media) => Math.min(4, Math.max(0.25, Number(media?.rate) || 1));

export function mediaPlaybackSeconds(media, now = Date.now()) {
  const rawPosition = Math.max(0, Number(media?.position) || 0);
  const sampledAt = Number(media?.sampledAt) || 0;
  const elapsed = media?.playing === true && sampledAt > 0
    ? Math.max(0, Number(now) - sampledAt) / 1000 * playbackRate(media)
    : 0;
  const duration = Math.max(0, Number(media?.duration) || 0);
  const position = rawPosition + elapsed;
  return duration > 0 ? Math.min(position, duration) : position;
}

/** Index of the last lyric whose lead-adjusted time has arrived. */
export function lyricIndexAt(lines, seconds, leadSeconds = 0) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  const target = Math.max(0, Number(seconds) || 0) + (Number(leadSeconds) || 0);
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    // Decimal LRC times commonly land a few floating-point ulps above the
    // exact boundary (4.85 + 0.35), which must still select the new line.
    if ((Number(lines[middle]?.t) || 0) <= target + 0.0005) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Milliseconds until the next line, or null when this is the last one. */
export function nextLyricDelayMs(lines, index, seconds, leadSeconds = 0, rate = 1) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const next = Number(index) < 0 ? lines[0] : lines[Number(index) + 1];
  if (!next) return null;
  const target = (Number(next.t) || 0) - (Number(leadSeconds) || 0);
  const normalizedRate = Math.min(4, Math.max(0.25, Number(rate) || 1));
  return Math.max(0, Math.round((target - (Number(seconds) || 0)) * 1000 / normalizedRate));
}
