/**
 * The arithmetic behind the media page's seek rail and its "more" panel.
 *
 * Kept out of island.js so it can be tested without a browser: a percentage
 * that runs past its duration, a position that arrives as a string, a rate the
 * player never reports. Everything here is pure; the page owns the DOM and the
 * main process owns the truth.
 */

/** The rates the panel offers. Windows stores a double; these are exact. */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** SMTC's MediaPlaybackAutoRepeatMode, as the wire reports it. */
export const REPEAT_MODES = [
  { value: 0, label: '关' },
  { value: 1, label: '单曲' },
  { value: 2, label: '列表' },
];

export const SHUFFLE_MODES = [
  { value: 0, label: '关' },
  { value: 1, label: '开' },
];

/** Seconds either side for one arrow-key press on the rail. */
export const SEEK_STEP = 5;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** 1 → "1×", 1.25 → "1.25×". Trailing zeroes would read as precision. */
export function rateLabel(rate) {
  return String(Number(rate)) + '×';
}

/**
 * Can this frame be seeked at all?
 *
 * A broadcast has no duration, and a frame with no duration has no rail to put
 * a position on. The page uses this for the disabled state; it is the same
 * rule the main process applies when it refuses to report a live clock.
 */
export function canSeek(frame) {
  if (!frame || frame.active === false) return false;
  return num(frame.duration) > 0;
}

/** Where the rail's fill sits, in percent, clamped to a real bar. */
export function seekPercent(position, duration) {
  const total = num(duration);
  if (total <= 0) return 0;
  const percent = (num(position) / total) * 100;
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}

/**
 * A pointer position on the rail, as a whole tenth of a second.
 *
 * SMTC takes ticks of 100ns but the wire reports one decimal, so rounding to
 * that same precision means the value the panel previews is the value it
 * commits — no last-frame jump between the preview and the real position.
 */
export function seekFromRatio(ratio, duration) {
  const total = num(duration);
  if (total <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, num(ratio)));
  return Math.round(clamped * total * 10) / 10;
}

/** Left/right/Home/End on the focused rail. Null means "not a seek key". */
export function seekFromKey(position, duration, key, step = SEEK_STEP) {
  const total = num(duration);
  if (total <= 0) return null;
  const current = Math.min(total, Math.max(0, num(position)));
  let next;
  if (key === 'ArrowLeft' || key === 'ArrowDown') next = current - step;
  else if (key === 'ArrowRight' || key === 'ArrowUp') next = current + step;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = total;
  else return null;
  return Math.round(Math.min(total, Math.max(0, next)) * 10) / 10;
}

/**
 * Which of the three extra controls this session actually offers.
 *
 * media.ps1 forwards SMTC's own `Controls` flags; a flag is the player saying
 * "I implement this", so it — not the presence of a value — decides whether a
 * row is drawn. A browser tab is the case that matters: Edge accepts
 * TryChangePlaybackRateAsync(1.5) and then goes on playing at 1×, so a speed
 * menu keyed off the returned `true` would be a lie.
 */
export function controlSupport(frame) {
  const controls = frame && typeof frame.controls === 'object' && frame.controls ? frame.controls : null;
  return {
    rate: Boolean(controls?.rate),
    repeat: Boolean(controls?.repeat),
    shuffle: Boolean(controls?.shuffle),
  };
}

/**
 * The rows the "more" panel draws, in order. Empty means "no entry at all" —
 * the page hides the ⋯ key rather than opening an empty card.
 */
export function advancedSections(frame) {
  if (!frame || frame.active === false) return [];
  const support = controlSupport(frame);
  const sections = [];
  if (support.rate) {
    const known = frame.rate !== null && frame.rate !== undefined && Number.isFinite(Number(frame.rate));
    sections.push({
      key: 'rate',
      label: '播放速率',
      value: known ? Number(frame.rate) : null,
      options: RATES.map((rate) => ({ value: rate, label: rateLabel(rate) })),
    });
  }
  if (support.repeat) {
    sections.push({
      key: 'repeat',
      label: '重复',
      value: Number.isInteger(frame.autoRepeatMode) ? frame.autoRepeatMode : null,
      options: REPEAT_MODES,
    });
  }
  if (support.shuffle) {
    sections.push({
      key: 'shuffle',
      label: '随机',
      value: typeof frame.shuffleActive === 'boolean' ? (frame.shuffleActive ? 1 : 0) : null,
      options: SHUFFLE_MODES,
    });
  }
  return sections;
}
