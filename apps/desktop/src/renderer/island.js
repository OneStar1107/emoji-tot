/**
 * The island page: one pill that opens into a card.
 *
 * It owns nothing but presentation. Sizes come from the content (reported back
 * to the main process), states arrive from services, and every page has an
 * empty state with one action instead of a blank box.
 */
import {
  PAGE_MANIFEST as PAGES,
  STATUS_MANIFEST as STATUS_ITEMS,
  orderDevices,
  visibleDevices,
  DEVICE_PIN_LIMIT,
} from '../shared/schema.js';
/*
 * 读数怎么长只写一份：设置页的「常驻排列」预览条读的是同一组函数。
 * clockText 起别名：这个文件下面还有一个日历用的 clockText（把 ISO 时间切成
 * HH:mm 给日历行），两个同名 const 会让整个模块在解析期就挂掉。
 */
import {
  batteryGlyph,
  batteryText,
  clockText as clockReadout,
  quotaText,
  temperatureText,
} from '../shared/status-view.js';
import { pagingVisibility } from './island-header.mjs';
import {
  PILL_EXPRESSION,
  fitStatusRow,
  isLiveMedia,
  isMusicMedia,
  lyricPreviewWindow,
  mediaSourceLabel,
  mediaTimingLabel,
  pausedResumeVisible,
  pillContentPlan,
  shouldCollapseForPausedMusic,
  visiblePillStatusKeys,
} from './island-pill.mjs';
import {
  canSeek,
  seekFromKey,
  seekFromRatio,
  seekPercent,
} from './media-controls.mjs';
import {
  lyricIndexAt,
  mediaPlaybackSeconds,
  nextLyricDelayMs,
} from './lyric-clock.mjs';
import { createSpring, geometryAt, stageNeedsRecovery } from './island-motion.mjs';

const api = window.islandAPI;
/* The bridge always reports none now; keep the dataset for old profiles and
   extensions that use it as a read-only surface capability. */
const windowMaterial = api.material && api.material() === 'acrylic' ? 'acrylic' : 'none';
document.body.dataset.material = windowMaterial;

const islandEl = document.getElementById('island');
const frameEl = document.getElementById('frame');
const pillEl = document.getElementById('pill');
const pillStatus = document.getElementById('pill-status');
const pausedResumeEl = document.getElementById('paused-resume');
const pausedResumeArtEl = document.getElementById('paused-resume-art');
const panelEl = document.getElementById('panel');
/* The page + header + dots, the layer the fold keeps at its natural size while
   the panel's box (and its rounded clip) does the folding. */
const panelBodyEl = document.getElementById('panel-body');
const pagesEl = document.getElementById('pages');
const dotsEl = document.getElementById('dots');
const titleEl = document.getElementById('page-name');
const subEl = document.getElementById('page-sub');
const pageCountEl = document.getElementById('page-count');
const topClock = document.getElementById('top-clock');
const topBattery = document.getElementById('top-battery');
const btnSettings = document.getElementById('btn-settings');

await customElements.whenDefined('emojitot-ball');

/* ------------------------------------------------------------ small icons */

const svg = (body, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const ICON = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.6 8.4a5 5 0 0 1 0 7.2"/><path d="M18.4 5.8a9 9 0 0 1 0 12.4"/>',
  volumeOff: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4a2 2 0 0 1 0 4H9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  dot: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  drop: '<path d="M12 2.5S5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z"/>',
  tray: '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/>',
  prev: '<path d="M6 5v14M18 5.5v13a1 1 0 0 1-1.5.86l-8-6.5a1 1 0 0 1 0-1.72l8-6.5A1 1 0 0 1 18 5.5z"/>',
  next: '<path d="M18 5v14M6 5.5v13a1 1 0 0 0 1.5.86l8-6.5a1 1 0 0 0 0-1.72l-8-6.5A1 1 0 0 0 6 5.5z"/>',
};

const WEATHER_ICON = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5"/>',
  'sun-cloud': '<circle cx="9" cy="9" r="3"/><path d="M9 3.2v1.6M3.2 9h1.6M4.9 4.9l1.1 1.1M4.9 13.1l1.1-1.1"/><path d="M8.5 18h8a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.6 1.2A3 3 0 0 0 8.5 18z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.3A3.5 3.5 0 0 0 7 18z"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  drizzle: '<path d="M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.3A3.5 3.5 0 0 0 7 15z"/><path d="M8 18v2M12 18v2M16 18v2"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.3A3.5 3.5 0 0 0 7 15z"/><path d="M8 17.5 7 21M12 17.5 11 21M16 17.5 15 21"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.3A3.5 3.5 0 0 0 7 14z"/><path d="M8 18h.01M12 20h.01M16 18h.01M12 17h.01"/>',
  storm: '<path d="M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.3A3.5 3.5 0 0 0 7 15z"/><path d="m12 15-2.5 4h3L10 23"/>',
};

/* 电池图标在 shared/status-view.js：设置页预览条画的是同一个。 */
const batterySvg = (level, charging) => batteryGlyph(level, charging);

/* --------------------------------------------------------------- app state */

let prefs = {};
let battery = null;
let weather = null;
/*
 * Why the last weather lookup failed, or '' while it has not.
 *
 * It lives apart from `weather` on purpose: a failed refresh keeps the last good
 * reading on the page (see the cache in services/weather.js), and only a page
 * with no reading at all has to say so. A card stuck on "正在获取天气…" forever
 * was the same lie as a blank one.
 */
let weatherError = '';
let media = { active: false, title: '', artist: '', album: '', playing: false, position: 0, duration: 0, art: '', source: '', liveSince: 0, sampledAt: 0 };
/** Wall time the live clock froze at while the stream was paused, or 0 when it runs. */
let liveFrozenAt = 0;
let pausedResumeSince = 0;
let pausedResumeTimer = 0;
let pausedResumePending = false;
let lyrics = null;
/*
 * The music page's second state: the words own the page. This is a view flag,
 * not a preference — nothing writes it to prefs, so every start opens in the
 * default card and the mode is re-entered from the lyric window.
 */
let musicLyricsMode = false;
let focusState = { phase: 'idle', running: false, remaining: 0, total: 0, cycles: 0 };
let healthState = { enabled: false, waterMin: 45, standMin: 60, sinceWater: 0, sinceStand: 0, waterDue: false, standDue: false, waterCount: 0, standCount: 0, trend: [] };
let todos = [];
let todoSummaryState = null;
let shelfFiles = [];
/*
 * The shelf's two pieces of view state: the search box and the folded groups.
 * Neither is a preference — the page is rebuilt from them every render, and a
 * restart opens with everything listed under its group.
 */
let shelfQuery = '';
const shelfFolded = new Set();
let clipboardItems = [];
let messengerState = { apps: [], unread: 0 };
let devicesState = { devices: [] };
/** One selected character feeds the pill, panel, notification and preview surfaces. */
let activeCastId = 'tot';
/** True while the refresh control waits for its probe to be handed off. */
let devicesRefreshing = false;
/** Why the Bluetooth footer is disabled, or '' while the system sheet opens. */
let systemOpenError = '';
let quotaState = { accounts: [], current: null, last: null };
/** Agent sources from the same snapshot that carries the balance. */
let agentsState = null;
let mailState = { accounts: [], messages: [], syncing: false, error: '', lastSync: 0 };
let calendarState = { events: [], upcoming: [] };
/*
 * The day column's editor. `null` means no editor was opened by hand, which is
 * not the same as "no editor on screen": an empty day draws the fields by
 * itself (that is the add gesture), and `{ id: '' }` is the same editor opened
 * from the ＋ key on a day that already has rows.
 */
let calendarDraft = null;
/** Why the last save or delete failed, or '' while nothing has. */
let calendarError = '';
const today = new Date();
let calendarView = { year: today.getFullYear(), month: today.getMonth(), selected: today.getDate() };
let open = false;
let pageIndex = 0;
/** A temporary notification owns the page surface while it is present. */
let notificationState = null;
let notificationTimer = 0;
let notificationReturnScroll = 0;
/** Debug captures pin the clock to the approved board's example time. */
let fixtureClock = '';
/** Debug screenshots must not race the live service polling loop. */
let fixtureLocked = false;

/**
 * Which pages the panel shows, in order.
 *
 * `prefs.pages` is authoritative for any page it mentions; a page it does not
 * mention falls back to the built-in default set. Without that fallback, the
 * first toggle in settings produced a pages object containing one key, and
 * every page it did not mention disappeared.
 */
const enabledPages = () => {
  const on = prefs.pages && typeof prefs.pages === 'object' ? prefs.pages : null;
  const stored = Array.isArray(prefs.pageOrder) && prefs.pageOrder.length ? prefs.pageOrder : [];
  /* A page added to the manifest after this profile was written is not in its
     stored order. Appending it is what makes "add a page" show up on an
     existing profile instead of waiting for prefs.json to be reset. */
  const order = stored.concat(PAGES.map((p) => p.key).filter((key) => !stored.includes(key)));
  // The main process fills in every schema default, so a missing key here only
  // happens before the first prefs payload arrives — then show everything.
  const isOn = (key) => (on && key in on ? on[key] !== false : true);
  return order
    .map((key) => PAGES.find((p) => p.key === key))
    .filter((page) => page && isOn(page.key));
};

let timeFormat24 = true;

const hhmm = () => fixtureClock || clockReadout(new Date(), timeFormat24);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const clock = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const lyricLeadSeconds = () => Number(prefs.music?.offset ?? 0.35);
const currentPlaybackSeconds = () => mediaPlaybackSeconds(media, Date.now());

/** The lyric line that should be highlighted at a given playback position. */
function lyricAt(seconds = currentPlaybackSeconds()) {
  if (!lyrics || !lyrics.synced || !lyrics.lines?.length) return -1;
  return lyricIndexAt(lyrics.lines, seconds, lyricLeadSeconds());
}

/* ------------------------------------------------------------- measurement */

let measuring = false;
/*
 * While the island is collapsed it is not the size it looks: the frame is only
 * the strip. Reporting that box would shrink the window, which would move the
 * pill rectangle the avoid script tests against, which would flip the state
 * straight back. So the collapsed box is never reported — the window keeps the
 * size it had before the browser arrived.
 */
let avoidCollapsed = false;
function measure() {
  if (measuring) return;
  measuring = true;
  /*
   * A microtask, not requestAnimationFrame.
   *
   * rAF does not run while the window is hidden or occluded, so the "already
   * queued" flag stayed set forever after one call from a hidden window: every
   * later measurement returned at the top and the window never resized again.
   * That is why the panel spilled outside the island and looked like a stray
   * rectangle around it, and why it never recovered without a restart.
   */
  queueMicrotask(() => {
    measuring = false;
    /* Every layout change also moves the hover target. */
    reportHit();
    if (avoidCollapsed) return;
    if (collapseResizeHeld) return;
    /*
     * A morph owns the native window. Reporting the half-swapped frame here
     * used to shrink the window to 168x36 while prepareBox was in flight, then
     * grow it again. That resize storm clipped the surface and made the first
     * frame jump. settleMorph reports the exact final box once the driver is
     * done.
     */
    if (preparing || document.body.dataset.morphing === 'true') return;
    /*
     * The frame owns the measured stage. Its height is the real height of
     * whichever surface is showing; reading the surface itself reported zero
     * while a swap was still pending layout and left the window too short.
     */
    const rect = frameEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    api.reportBox({ w: Math.ceil(rect.width), h: Math.ceil(rect.height) });
  });
}
// Observe the frame, not the island: the island's width is what this observer
// writes, so watching it was circular — a collapsed island never changed size
// on its own and the expanded panel never got measured.
new ResizeObserver(measure).observe(frameEl);

/*
 * The frame is measured, the island is animated towards it.
 *
 * While the morph driver runs (see startMorph) the box is its to write: a size
 * write here would drag the animation back to the frame's final target on the
 * next observer tick. Outside a morph this is the plain 'the window is the
 * content' path and lands in one write, with no first-paint transition to hand
 * back — a rule written for that hand-over leaked when the window was not yet
 * visible and left the first open after a cold start with no morph at all.
 */
let morph = null;
let preparing = null;
function syncSize() {
  if (morph || preparing) return;
  const rect = frameEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  islandEl.style.width = `${Math.ceil(rect.width)}px`;
  islandEl.style.height = `${Math.ceil(rect.height)}px`;
}
const sizeObserver = new ResizeObserver(syncSize);
sizeObserver.observe(frameEl);

/* ------------------------------------------------------------- pill status */

/*
 * The line under the title is a status line, not a per-page caption.
 *
 * Whatever page is open, the two facts worth having in sight are "something is
 * playing right now" and the battery. A caption like "当地与七日" told the user
 * what they had already opened; this tells them something they did not know.
 * With nothing playing it falls back to battery alone.
 */
/*
 * Left status line: the machine first, then each peripheral that reports a
 * level, rotating every two seconds. Keyboards, headphones and phones all
 * answer on the same Bluetooth battery property, so one list covers them all
 * without naming any particular kind of device.
 */
const BATTERY_ROTATE_MS = 2000;
let batteryIndex = 0;
let batteryTimer = null;

function batteryEntries() {
  const entries = [];
  if (battery && Number.isFinite(Number(battery.level))) entries.push({ name: '电脑', level: Number(battery.level) });
  /*
   * The status row is a view of the device list, so it obeys the same rules:
   * a device hidden from the island does not get a turn here either, and the
   * order someone dragged in settings is the order this cycles through.
   */
  const pinned = Array.isArray(prefs.devices?.pinned) ? prefs.devices.pinned : [];
  const visible = orderDevices(visibleDevices(devicesState?.devices ?? [], prefs.devices?.hidden), {
    pinned,
    order: prefs.devices?.order,
  });
  for (const device of visible) {
    if (device.battery === null || device.battery === undefined) continue;
    entries.push({ name: device.displayName || device.name, level: Number(device.battery) });
  }
  return entries;
}

function renderSub() {
  const page = enabledPages()[pageIndex];
  const pageSub = page?.sub ?? '';
  if (subEl.textContent !== pageSub) subEl.textContent = pageSub;
  subEl.dataset.muted = String(!pageSub);
  subEl.dataset.over = 'false';
}

/*
 * One timer for the life of the page, never torn down and rebuilt.
 *
 * The first version cleared it whenever the device list was momentarily empty
 * (which happens while Bluetooth is enumerated) and started a fresh one when
 * the list came back, so every restart pushed the next tick further out: six
 * seconds of watching produced a single change. A permanent 2s tick that does
 * nothing when there is only one entry keeps the cadence exact.
 */
function ensureBatteryRotation() {
  if (batteryTimer) return;
  batteryTimer = setInterval(() => {
    const entries = batteryEntries();
    if (entries.length <= 1) {
      if (batteryIndex !== 0) {
        batteryIndex = 0;
        renderSub();
      }
      return;
    }
    batteryIndex = (batteryIndex + 1) % entries.length;
    renderSub();
  }, BATTERY_ROTATE_MS);
}

function renderHeader() {
  const page = enabledPages()[pageIndex];
  if (page && titleEl.textContent !== page.title) titleEl.textContent = page.title;
  titleEl.dataset.over = 'false';
}

/**
 * Trim the status row at a component boundary, never mid-number.
 *
 * The capsule is capped by --pill-max-w; past that cap the row is what gives
 * way. Measuring is the only way to know the cut: the values are localised,
 * the balance is user data, and the two fonts in play have different digit
 * widths. One synchronous read, one trim, and the row the window measures is
 * the row that gets painted — keeping whole components is what stops the last
 * column from reading "¥20." instead of "¥20.8".
 *
 * A hidden pill (the expanded state) measures 0 and is skipped: the row is
 * rendered but not visible, so there is nothing to trim yet.
 */
function fitPillStatus() {
  pillEl.dataset.truncated = 'false';
  for (const el of pillStatus.querySelectorAll('.stat.more')) el.remove();
  const stats = [...pillStatus.querySelectorAll('.stat')];
  if (stats.length < 2) return;
  /*
   * How much of the row the cap took.
   *
   * The row is flex: none, so its own width is the width of every component;
   * the capsule around it is capped, and the difference is what has to go. An
   * earlier version read the row's clientWidth as "the room available", which
   * is the room it is already using — the row then looked one rounding error
   * too wide and trimmed itself on every render, cap or no cap.
   */
  const pillStyle = getComputedStyle(pillEl);
  const cap = parseFloat(pillStyle.maxWidth);
  if (!Number.isFinite(cap)) return;
  const face = pillEl.querySelector('.pill-face');
  if (!face) return;
  const statusWidth = pillStatus.getBoundingClientRect().width;
  if (!statusWidth) return;
  const padding = parseFloat(pillStyle.paddingLeft) + parseFloat(pillStyle.paddingRight);
  const gap = parseFloat(pillStyle.columnGap) || 8;
  const overflow = padding + face.getBoundingClientRect().width + gap + statusWidth - cap;
  if (overflow <= 0.5) return;
  const rowGap = parseFloat(getComputedStyle(pillStatus).columnGap) || 7;
  const widths = stats.map((el) => Math.ceil(el.getBoundingClientRect().width));
  const fit = fitStatusRow(widths, rowGap, statusWidth - overflow);
  if (!fit.truncated) return;
  for (const el of stats.slice(fit.keep)) el.remove();
  const more = document.createElement('span');
  more.className = 'stat more';
  more.setAttribute('aria-hidden', 'true');
  more.textContent = '…';
  pillStatus.appendChild(more);
  pillEl.dataset.truncated = 'true';
}

/*
 * The collapsed pill has a content-sized stage and one moving width.
 *
 * Every mode has a different natural width, but enumerating those modes would
 * make every future status combination a new animation. Instead the stylesheet
 * stays at max-content for one synchronous measurement, that number becomes the
 * spring target, and the pill itself is animated back to it. A new title or
 * battery reading retargets the existing spring from its current position and
 * velocity, so consecutive changes cannot restart the motion with a jump.
 */
const PILL_WIDTH_SPRING = Object.freeze({ mass: 1, stiffness: 520, damping: 36 });
const PILL_WIDTH_SETTLE = 0.35;
const PILL_WIDTH_QUIET_AT = 80;
const PILL_WIDTH_GUARD_MS = 900;

let pillWidthSpring = null;
let pillWidthFrame = 0;
let pillWidthGuard = 0;
let pillWidthStartedAt = 0;
let pillWidthTarget = 0;
let pillWidthMin = 0;
let pillWidthMax = 0;
let pillWidthReady = false;
let pillWidthQueued = false;

function stopPillWidthDriver() {
  if (pillWidthFrame) cancelAnimationFrame(pillWidthFrame);
  if (pillWidthGuard) clearTimeout(pillWidthGuard);
  pillWidthFrame = 0;
  pillWidthGuard = 0;
  pillWidthSpring = null;
}

function writePillWidth(width) {
  pillEl.style.setProperty('--pill-content-w', `${Math.max(1, width)}px`);
}

/**
 * Publish the native stage width.
 *
 * The stage grows before a width spring and shrinks after it settles. A
 * transparent window may therefore have spare room on both sides during the
 * motion, but the painted capsule is never clipped by an OS resize that lags
 * behind the renderer.
 */
function writePillStage(width) {
  islandEl.style.setProperty('--pill-stage-w', `${Math.max(1, width)}px`);
}

/**
 * Read the real current width, then ask the browser for this content's natural
 * width before restoring the current box. Both reads and the restore happen in
 * one task, so the max-content probe is never painted.
 */
function measurePillWidth() {
  const current = pillEl.getBoundingClientRect().width;
  const previous = pillEl.style.getPropertyValue('--pill-content-w');
  pillEl.style.setProperty('--pill-content-w', 'max-content');
  const target = pillEl.getBoundingClientRect().width;
  if (previous) writePillWidth(parseFloat(previous));
  else pillEl.style.removeProperty('--pill-content-w');
  return { current, target };
}

function pillCanAnimateWidth() {
  return (
    !open &&
    !morph &&
    !preparing &&
    !closing &&
    !avoidCollapsed &&
    document.body.dataset.avoid !== '1' &&
    document.body.dataset.morphing !== 'true' &&
    !pillEl.hidden &&
    pillEl.getClientRects().length > 0
  );
}

function finishPillWidth() {
  stopPillWidthDriver();
  writePillWidth(pillWidthTarget);
  writePillStage(pillWidthTarget);
  pillStatus.style.opacity = '';
  reportHit();
  measure();
}

function startPillWidthDriver(from, target) {
  stopPillWidthDriver();
  const now = performance.now();
  pillWidthStartedAt = now;
  pillWidthTarget = target;
  pillWidthMin = Math.min(from, target);
  pillWidthMax = Math.max(from, target);
  pillWidthSpring = createSpring({
    ...PILL_WIDTH_SPRING,
    from,
    target,
    startedAt: now / 1000,
  });
  if (Math.abs(target - from) > 2) pillStatus.style.opacity = '0.42';

  const step = (frameNow) => {
    if (!pillWidthSpring) return;
    const sample = pillWidthSpring.sample(frameNow / 1000);
    /* Bound the visible width to the two measured endpoints. The damping still
       shapes the approach, but a 2px overshoot cannot escape the native stage
       or make a shrinking pill become narrower than its destination. */
    const width = Math.min(pillWidthMax, Math.max(pillWidthMin, sample.position));
    writePillWidth(width);
    reportHit();
    const elapsed = frameNow - pillWidthStartedAt;
    const settled =
      elapsed >= PILL_WIDTH_QUIET_AT &&
      Math.abs(sample.position - pillWidthTarget) < PILL_WIDTH_SETTLE &&
      Math.abs(sample.velocity) < 4;
    if (settled || elapsed >= PILL_WIDTH_GUARD_MS) finishPillWidth();
    else pillWidthFrame = requestAnimationFrame(step);
  };
  pillWidthFrame = requestAnimationFrame(step);
  if (pillWidthGuard) clearTimeout(pillWidthGuard);
  pillWidthGuard = setTimeout(() => {
    if (pillWidthSpring) finishPillWidth();
  }, PILL_WIDTH_GUARD_MS + 80);
}

/**
 * Bring the visual capsule to the current content width. `immediate` is used
 * on first paint and when the panel hands the surface back, never for a normal
 * status change.
 */
function syncPillWidth({ immediate = false } = {}) {
  if (!pillCanAnimateWidth()) return;
  const { current, target } = measurePillWidth();
  pillWidthTarget = target;
  pillWidthMin = Math.min(current, target);
  pillWidthMax = Math.max(current, target);
  /*
   * Expand the stage before the content spring so even its first frame has
   * native pixels to paint into. A shrinking stage keeps its current width
   * until finishPillWidth(), at which point the pill has already reached the
   * smaller target and the native setBounds call cannot reveal a short-lived
   * narrow remainder of the old panel.
   */
  writePillStage(Math.max(current, target));
  if (target > current + 0.5) measure();
  const reduced =
    document.body.dataset.motion === 'off' ||
    document.body.dataset.reduceMotion === 'on';
  if (immediate || reduced || !pillWidthReady || Math.abs(target - current) < 0.5) {
    stopPillWidthDriver();
    writePillWidth(target);
    writePillStage(target);
    pillStatus.style.opacity = '';
    pillWidthReady = true;
    reportHit();
    measure();
    return;
  }
  pillWidthReady = true;
  const now = performance.now();
  if (pillWidthSpring) {
    pillWidthSpring.retarget(target, now / 1000);
    pillWidthMin = Math.min(current, target);
    pillWidthMax = Math.max(current, target);
    pillWidthStartedAt = now;
    if (Math.abs(target - current) > 2) pillStatus.style.opacity = '0.42';
    return;
  }
  startPillWidthDriver(current, target);
}

function schedulePillWidth(options) {
  if (pillWidthQueued) return;
  pillWidthQueued = true;
  queueMicrotask(() => {
    pillWidthQueued = false;
    syncPillWidth(options);
  });
}

const pausedHideMinutes = () => Math.max(0, Number(prefs.music?.pausedHideMin ?? 15) || 0);

function pausedResumeEnabled() {
  return prefs.music?.islandLyrics !== false;
}

function pausedResumeIsVisible(now = Date.now()) {
  return pausedResumeEnabled() && pausedResumeVisible({
    media,
    pausedSince: pausedResumeSince,
    hideAfterMin: pausedHideMinutes(),
    now,
  });
}

function schedulePausedResumeExpiry(visible) {
  if (pausedResumeTimer) clearTimeout(pausedResumeTimer);
  pausedResumeTimer = 0;
  const minutes = pausedHideMinutes();
  if (!visible || !minutes || !pausedResumeSince) return;
  const remaining = pausedResumeSince + minutes * 60_000 - Date.now();
  pausedResumeTimer = setTimeout(() => {
    pausedResumeTimer = 0;
    renderPillStatus();
  }, Math.max(0, remaining) + 16);
}

function syncPausedResumeControl(visible) {
  const track = [media.title, media.artist].map((value) => String(value ?? '').trim()).filter(Boolean).join(' - ');
  pausedResumeEl.hidden = !visible;
  pausedResumeEl.disabled = pausedResumePending;
  pausedResumeEl.setAttribute('aria-label', `继续播放：${track || '当前歌曲'}`);
  pausedResumeEl.title = `继续播放：${track || '当前歌曲'}`;
  pillEl.dataset.pausedResume = String(visible);
  const art = typeof media.art === 'string' && /^data:image\//iu.test(media.art) ? media.art : '';
  if (visible && art) {
    pausedResumeArtEl.src = art;
    pausedResumeArtEl.hidden = false;
  } else {
    pausedResumeArtEl.removeAttribute('src');
    pausedResumeArtEl.hidden = true;
  }
}

function refreshPausedResumeIdle() {
  if (pausedResumeEl.hidden || !isMusicMedia(media) || media.playing !== false) return;
  pausedResumeSince = Date.now();
  schedulePausedResumeExpiry(true);
  void api.holdPausedResume?.().catch(() => {});
}

function renderPillStatus() {
  /*
   * The row the collapsed pill carries: the user's order, and only the
   * components that have a value. A component with no data is not drawn at
   * all — a placeholder battery looks like a reading.
   */

  const items = prefs.statusItems ?? ['battery', 'clock', 'weather'];
  const balance = quotaText(quotaState?.last);
  const visible = visiblePillStatusKeys(items, {
    battery: Boolean(battery),
    clock: true,
    weather: Boolean(weather),
    quota: Boolean(balance),
    kaomoji: true,
  });
  const parts = [];
  for (const key of visible) {
    if (key === 'battery' && battery) {
      parts.push(`<span class="stat" title="电量 ${battery.level}%">${batterySvg(battery.level, battery.charging)}<b>${batteryText(battery.level)}</b></span>`);
    } else if (key === 'clock') {
      parts.push(`<span class="stat" data-clock>${hhmm()}</span>`);
    } else if (key === 'weather' && weather) {
      parts.push(`<span class="stat dim">${temperatureText(weather.current?.temp, prefs.weather?.unit)}</span>`);
    } else if (key === 'quota') {
      /*
       * The pill used to offer a balance toggle that drew nothing, because
       * this loop only knew battery, clock and weather. A status item with no
       * renderer is worse than no status item: it looks switched on.
       */
      if (balance) parts.push(`<span class="stat dim" title="AI 余额">${escapeHtml(balance)}</span>`);
    } else if (key === 'kaomoji') {
      parts.push(`<span class="stat dim kaomoji" title="颜文字">${PILL_EXPRESSION}</span>`);
    }
  }
  /*
   * Paused music gives the row back to the readings while a small resume
   * button keeps the session actionable. The button is part of the same
   * preference as the island lyric view: switching island media off also
   * leaves the capsule alone when paused.
   */
  const resumeVisible = pausedResumeIsVisible();
  syncPausedResumeControl(resumeVisible);
  schedulePausedResumeExpiry(resumeVisible);
  const plan = pillContentPlan({
    statusCount: parts.length,
    media,
    showNowPlaying: prefs.music?.islandLyrics !== false,
    lyricLine: currentLyricLine(),
    resumeVisible,
  });
  if (notificationState && !open) {
    pillStatus.innerHTML = notificationPillHtml();
    pillEl.dataset.status = 'notification';
  } else {
    if (plan.mode === 'status') pillStatus.innerHTML = parts.join('');
    else if (plan.mode === 'nowPlaying') {
      pillStatus.innerHTML = `<span class="stat now-playing-pill" data-kind="${plan.lyric ? 'lyric' : 'track'}" title="${escapeHtml(plan.track)}"><span class="now-playing-pill__text">${escapeHtml(plan.text)}</span>${plan.lyric ? `<span class="now-playing-pill__track">${escapeHtml(plan.track)}</span>` : ''}</span>`;
    } else pillStatus.innerHTML = '';
    pillEl.dataset.status = String(plan.statusCount);
  }
  fitPillStatus();
  schedulePillWidth();
  topClock.textContent = hhmm();
  if (battery) {
    topBattery.innerHTML = `<i aria-hidden="true"></i>${Math.round(Number(battery.level) || 0)}%`;
    topBattery.hidden = false;
    topBattery.title = `电量 ${battery.level}%${battery.charging ? ' · 充电中' : ''}`;
  } else {
    topBattery.hidden = true;
  }
  measure();
}

new ResizeObserver(() => schedulePillWidth()).observe(pillStatus);
/*
 * A title can arrive while the pill is hidden behind the open panel, and a
 * font or display-scale change can alter the same text without a new render.
 * Observe the row's own DOM instead of `window.resize`: the latter also fires
 * for our own native setBounds call, which would feed the stage width back into
 * the capsule spring. The spring retargets in place, so a real content change
 * never restarts the motion or produces a second width jump.
 */
new MutationObserver(() => schedulePillWidth()).observe(pillStatus, {
  childList: true,
  subtree: true,
  characterData: true,
});
document.fonts?.ready.then(() => schedulePillWidth()).catch(() => {});

/* ------------------------------------------------------------------- pages */

/**
 * The one empty/error block every page draws.
 *
 * A tone dot, one line of what happened (16 characters at most), an optional
 * second line saying what to do next, and an optional 28px action. All eleven
 * pages use it: the states used to invent a block each, so two pages that were
 * empty for the same reason looked like two different products.
 *
 * `line` states what happened — not that something "failed". `hint` is the
 * next step. `action` is the raw attribute of the button
 * (`data-action="settings:quota"` or `data-local="quota:refresh"`), because
 * both dispatch paths already exist and a third one would be a second copy.
 */
const stateBlock = (tone, line, hint = '', actionLabel = '', action = '') => `
  <div class="state" data-tone="${tone}">
    <i class="state-dot" aria-hidden="true"></i>
    <div class="state-text">
      <p class="state-line">${escapeHtml(line)}</p>
      ${hint ? `<p class="state-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
    ${actionLabel ? `<button type="button" class="ghost state-go" ${action}>${escapeHtml(actionLabel)}</button>` : ''}
  </div>`;

function lyricEmptyLabel() {
  if (lyrics?.loading) return '正在同步歌词…';
  if (lyrics?.unavailable) return '歌词服务连接失败';
  return '这首歌没有同步歌词';
}

function currentLyricLine(index = lyricAt()) {
  if (!lyrics?.synced || !lyrics.lines?.length) return '';
  return lyricPreviewWindow(lyrics.lines, index)[1] || '';
}

function lyricSliceHtml(index, span = 3) {
  if (!lyrics?.synced || !lyrics.lines.length) {
    return `<span class="lyric-empty pgm-lyric-empty">${lyricEmptyLabel()}</span>`;
  }
  /*
   * data-n is the signed distance from "now": the default window shows one
   * line either side, lyrics mode two, and the stylesheet fades by |data-n|.
   * Carrying the distance instead of relying on child position keeps two lines
   * visible above and below the current one when the window hits the start or
   * the end of the song and cannot be recentred.
   */
  const start = Math.max(0, index - (span - 1) / 2);
  return lyrics.lines
    .slice(start, start + span)
    .map((line, offset) => {
      const distance = start + offset - index;
      return `<p class="lyric-line${distance === 0 ? ' on is-current' : ''}" data-n="${distance}">${escapeHtml(line.text)}</p>`;
    })
    .join('');
}

/**
 * The large lyric preview inside the cover row.
 *
 * Three rows keep the current lyric in the middle, with the previous and next
 * lines as quiet context above and below.
 */
function lyricPreviewHtml(index) {
  if (!lyrics?.synced || !lyrics.lines?.length) {
    return `<span class="music-lyric-empty pgm-lyric-empty">${lyricEmptyLabel()}</span>`;
  }
  const [previous, current, next] = lyricPreviewWindow(lyrics.lines, index);
  if (!current) return '<span class="music-lyric-empty pgm-lyric-empty">等待歌词</span>';
  return `<span class="music-prev-lyric" data-prev-lyric>${escapeHtml(previous)}</span><span class="music-current-lyric is-current" data-current-lyric>${escapeHtml(current)}</span><span class="music-next-lyric" data-next-lyric>${escapeHtml(next)}</span>`;
}

/**
 * How long the broadcast has been on: wall time since the main process saw it.
 *
 * A pause does not end the broadcast, but it does stop the clock on screen:
 * the page freezes it at the second the pause arrived and only runs again
 * when playback resumes from the same liveSince. Without the freeze a paused
 * stream kept counting, so "paused for a minute" read as "on air for one more
 * minute", and resuming looked like it had lost the elapsed time.
 */
function liveElapsed() {
  const since = Number(media.liveSince) || 0;
  if (!since) return 0;
  if (liveFrozenAt) return Math.max(0, (liveFrozenAt - since) / 1000);
  return Math.max(0, (Date.now() - since) / 1000);
}

/** HH:MM:SS for the live clock; the row's tabular digits keep it from jittering. */
const liveClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const pad = (value) => String(value).padStart(2, '0');
  return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor((total % 3600) / 60)) + ':' + pad(total % 60);
};

function musicPage() {
  if (!media.active) {
    return stateBlock('good', '没有在播放的媒体', '打开播放器后这里会显示', '去设置', 'data-action="settings:music"');
  }
  const duration = Number(media.duration) > 0
    ? Number(media.duration)
    : Number(lyrics?.duration) || 0;
  const playback = currentPlaybackSeconds();
  const pct = duration ? Math.min(100, (playback / duration) * 100) : 0;
  const live = isLiveMedia(media);
  /*
   * The rail is draggable only when the frame carries a length. A broadcast
   * reports none, and a paused player that reports none is the same shape:
   * there is no position to seek to, so the rail stays the live one.
   */
  const seekable = canSeek(media);
  /*
   * A broadcast with no artwork still gets a cover-shaped block in the skin
   * colour: an empty rectangle reads as "the picture failed", a tinted one
   * reads as "this stream has no cover".
   */
  const art = media.art
    ? `<img class="cover-img pgm-cover pgm-true-image" src="${media.art}" alt="" />`
    : `<div class="cover pgm-cover${live ? ' cover-live' : ''}">${svg(ICON.music)}</div>`;
  /*
   * The output badge names the device the sound leaves through. Only some
   * Windows media sessions report an endpoint, so it is drawn when the frame
   * actually carries an output field: a placeholder would claim a route we
   * have not been told about. It is a badge, not a key — nothing to press.
   */
  /* The bottom bar already owns volume; a second badge here only added noise. */
  /*
   * Lyrics mode is entered from the lyric window itself, and only when there
   * are synced lines to fill the page with. With the lyric window switched off
   * in settings there is nothing to tap, so the second state stays unreachable.
   */
  const canLyrics = prefs.music?.lyrics !== false && Boolean(lyrics?.synced && lyrics.lines?.length);
  const lyricMode = canLyrics && musicLyricsMode;
  const lyricIndex = lyricAt(playback);
  const source = mediaSourceLabel(media);
  const title = String(media.title || '未知媒体');
  const artist = [media.artist, source].filter(Boolean).join(' · ');
  const timing = mediaTimingLabel(media, {
    position: playback,
    liveSeconds: liveElapsed(),
    fallbackDuration: duration,
  });
  const remaining = Math.max(0, duration - playback);
  const lyricToggle = canLyrics
    ? ` role="button" tabindex="0" data-lyric-toggle="1" aria-pressed="${lyricMode}" aria-label="${lyricMode ? '收起歌词' : '展开歌词'}"`
    : '';
  /* One stage, two columns, exactly as the approved master artboard: cover at
     left; title, artist, three lyric levels, transport, then seek at right. */
  const progress = seekable
    ? `<div class="pgm-seek"><div class="pgm-seek-track music-seek" data-seek role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="${Math.round(media.duration)}" aria-valuenow="${Math.round(playback)}" aria-valuetext="${clock(playback)} / ${clock(media.duration)}"><i data-progress style="width:${pct.toFixed(1)}%"></i><span class="music-thumb" data-thumb style="left:${pct.toFixed(1)}%"></span></div><div class="pgm-time-row music-times"><span class="music-time-pair" data-pos>${clock(playback)}</span><span data-remaining>-${clock(remaining)}</span><span class="music-source" data-source hidden>${escapeHtml(source)}</span></div></div>`
    : live
      ? `<div class="pgm-seek"><div class="pgm-seek-track is-live"><i></i></div><div class="pgm-time-row music-times"><span class="music-live" data-live title="${Number(media.live?.startedAt) > 0 ? '主播已开播时长' : '直播中，开播时间暂不可用'}">${escapeHtml(timing)}</span><span>直播</span></div></div>`
      : `<div class="pgm-seek"><div class="pgm-seek-track"><i data-progress style="width:0%"></i></div><div class="pgm-time-row music-times"><span class="music-time-pair">${escapeHtml(timing)}</span><span>--:--</span></div></div>`;
  const lyricHtml = lyricMode
    ? lyricSliceHtml(lyricIndex, 5)
    : lyricPreviewHtml(lyricIndex);
  const stopTitle = '停止播放（系统媒体接口以暂停当前会话实现）';
  return `<div class="music pgm-media" data-music="${lyricMode ? 'lyrics' : 'default'}">
      ${art}
      <div class="pgm-media-copy">
        <h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
        <div class="pgm-artist">${escapeHtml(artist || 'EmojiTot')}</div>
        ${prefs.music?.lyrics === false
          ? ''
          : `<div class="pgm-lyrics music-current-lyric${lyricMode ? ' is-expanded' : ''}"${lyricToggle}>${lyricHtml}</div>`}
        <div class="pgm-media-controls music-controls" aria-label="播放控制">
          <button type="button" class="pgm-transport" data-media="prev" aria-label="上一首">${svg(ICON.prev)}</button>
          <button type="button" class="pgm-transport" data-media="stop" aria-label="${stopTitle}" title="${stopTitle}"${media.playing ? '' : ' disabled'}>${svg('<rect x="7" y="7" width="10" height="10" rx="1" />')}</button>
          <button type="button" class="main is-main pgm-transport-main" data-media="toggle" aria-label="${media.playing ? '暂停' : '播放'}">${svg(media.playing ? ICON.pause : ICON.play)}</button>
          <button type="button" class="pgm-transport" data-media="next" aria-label="下一首">${svg(ICON.next)}</button>
          <button type="button" class="pgm-transport" data-volume="toggle" aria-label="系统音量" aria-expanded="false" aria-controls="volume-panel" title="系统音量">${svg(ICON.volume)}</button>
        </div>
        ${progress}
        <div class="volume-panel" id="volume-panel" data-volume-panel data-state="loading" hidden>
          <div class="volume-body" data-volume-body>
            <div class="volume-head">
              <button type="button" data-volume="mute" aria-label="静音" aria-pressed="false" title="静音">${svg(ICON.volume)}</button>
            </div>
            <div class="volume-slide">
              <input type="range" min="0" max="100" step="1" value="0" aria-label="音量" data-volume-range disabled />
              <output data-volume-value>--</output>
            </div>
          </div>
          <p class="volume-note" data-volume-note hidden>系统音量不可用</p>
        </div>
      </div>
  </div>`;
}

/*
 * The volume key is its own control, not a switch on the player.
 *
 * A player's own volume only changes that player; this panel drives the
 * machine's master volume through CoreAudio in the main process, which is
 * what the volume keys on a keyboard change. The panel is absolutely
 * positioned and 96px tall: the page's 205px box is already full, so anything
 * that opened in the flow would either scroll or push the keys out of view.
 *
 * The first open pays for starting the PowerShell watcher; after that a drag
 * is a line on its stdin. Sets are coalesced here so a fast drag never builds
 * a queue of old positions behind the one the finger is on now.
 */
let volumeState = { volume: null, muted: false };
let volumePanelOpen = false;
let volumeSetBusy = false;
let volumeSetPending = null;
let volumeFailed = false;

function paintVolume() {
  const panel = pagesEl.querySelector('[data-volume-panel]');
  const toggle = pagesEl.querySelector('[data-volume="toggle"]');
  if (toggle) toggle.setAttribute('aria-expanded', String(volumePanelOpen));
  if (!panel) return;
  panel.hidden = !volumePanelOpen;
  panel.dataset.state = volumeFailed ? 'error' : volumeState.volume === null ? 'loading' : 'ready';
  const body = panel.querySelector('[data-volume-body]');
  const note = panel.querySelector('[data-volume-note]');
  if (body) body.hidden = volumeFailed;
  if (note) note.hidden = !volumeFailed;
  const value = panel.querySelector('[data-volume-value]');
  if (value) value.textContent = volumeState.volume === null ? '--' : String(volumeState.volume);
  const range = panel.querySelector('[data-volume-range]');
  if (range) {
    range.disabled = volumeState.volume === null;
    if (document.activeElement !== range) range.value = String(volumeState.volume ?? 0);
  }
  const mute = panel.querySelector('[data-volume="mute"]');
  if (mute) {
    mute.disabled = volumeState.volume === null;
    mute.setAttribute('aria-pressed', String(volumeState.muted));
    const label = volumeState.muted ? '取消静音' : '静音';
    mute.setAttribute('aria-label', label);
    mute.title = label;
    mute.innerHTML = svg(volumeState.muted ? ICON.volumeOff : ICON.volume);
  }
}

/** One failed read is a permanent state for this page until it re-renders. */
function failVolume(state) {
  volumeFailed = true;
  volumeState = { volume: null, muted: false };
  const toggle = pagesEl.querySelector('[data-volume="toggle"]');
  if (toggle) {
    toggle.disabled = true;
    toggle.title = '系统音量不可用';
    toggle.setAttribute('aria-label', '系统音量不可用');
  }
  const note = pagesEl.querySelector('[data-volume-note]');
  if (note && state?.error) note.title = String(state.error);
  paintVolume();
}

function applyVolume(state) {
  volumeFailed = false;
  volumeState = { volume: state.volume, muted: state.muted === true };
  paintVolume();
}

function toggleVolumePanel() {
  volumePanelOpen = !volumePanelOpen;
  paintVolume();
  if (!volumePanelOpen) return;
  // Always re-read on open: the volume keys on the keyboard can change the
  // machine while the panel is closed, and a stale slider would lie.
  api
    .volumeGet()
    .then((state) => {
      if (!volumePanelOpen) return;
      if (state?.ok) applyVolume(state);
      else failVolume(state);
    })
    .catch((error) => failVolume({ error: error?.message }));
}

function closeVolumePanel() {
  if (!volumePanelOpen) return;
  volumePanelOpen = false;
  paintVolume();
}

/*
 * The rail: press to jump, hold to scrub.
 *
 * The preview is local — the fill and the left clock follow the pointer — and
 * only the release commits. Frames are ignored while the pointer is down and
 * for the moment after the release, otherwise the one-second push would drag
 * the handle back under the user's finger.
 */
let seekDrag = null;
let seekHoldUntil = 0;

function paintSeekPreview(seconds) {
  const rail = pagesEl.querySelector('[data-seek]');
  if (!rail) return;
  const percent = seekPercent(seconds, media.duration);
  const fill = rail.querySelector('[data-progress]');
  if (fill) {
    /* No glide while dragging: the preview has to follow the pointer, not
       chase it at one second per tick. */
    fill.style.transition = seekDrag ? 'none' : '';
    fill.style.width = percent.toFixed(1) + '%';
  }
  const thumb = rail.querySelector('[data-thumb]');
  if (thumb) thumb.style.left = percent.toFixed(1) + '%';
  const position = pagesEl.querySelector('[data-pos]');
  if (position) position.textContent = clock(seconds);
  const remaining = pagesEl.querySelector('[data-remaining]');
  if (remaining) remaining.textContent = '-' + clock(Math.max(0, Number(media.duration) - seconds));
  rail.setAttribute('aria-valuenow', String(Math.round(seconds)));
  rail.setAttribute('aria-valuetext', clock(seconds) + ' / ' + clock(media.duration));
}

function moveSeek(event) {
  if (!seekDrag) return;
  const rail = pagesEl.querySelector('[data-seek]');
  if (!rail) return;
  const rect = rail.getBoundingClientRect();
  if (!rect.width) return;
  seekDrag.seconds = seekFromRatio((event.clientX - rect.left) / rect.width, media.duration);
  paintSeekPreview(seekDrag.seconds);
}

function stopSeek() {
  if (!seekDrag) return null;
  const seconds = seekDrag.seconds;
  seekDrag = null;
  window.removeEventListener('pointermove', moveSeek);
  window.removeEventListener('pointerup', endSeek);
  window.removeEventListener('pointercancel', endSeek);
  const rail = pagesEl.querySelector('[data-seek]');
  if (rail) rail.removeAttribute('data-dragging');
  return seconds;
}

/** Drop a drag without committing — a page rebuild must not seek. */
function cancelSeek() {
  seekDrag = null;
  window.removeEventListener('pointermove', moveSeek);
  window.removeEventListener('pointerup', endSeek);
  window.removeEventListener('pointercancel', endSeek);
}

function endSeek(event) {
  const seconds = stopSeek();
  if (seconds === null) return;
  if (event && event.type === 'pointercancel') return;
  /* Keep the committed position on screen until the player's next frame
     lands. Without this the rail snapped back for up to a second and read as
     "the seek did not take". */
  seekHoldUntil = Date.now() + 900;
  api
    .control('seek', seconds)
    .then((state) => {
      if (state && state.control && state.control.ok === false) {
        seekHoldUntil = 0;
        renderPage();
      }
    })
    .catch(() => {
      seekHoldUntil = 0;
    });
}

function beginSeek(event) {
  if (event.button !== undefined && event.button !== 0) return false;
  const rail = event.target.closest('[data-seek]');
  if (!rail) return false;
  const rect = rail.getBoundingClientRect();
  if (!rect.width) return false;
  seekDrag = { seconds: seekFromRatio((event.clientX - rect.left) / rect.width, media.duration) };
  rail.dataset.dragging = 'true';
  paintSeekPreview(seekDrag.seconds);
  window.addEventListener('pointermove', moveSeek);
  window.addEventListener('pointerup', endSeek);
  window.addEventListener('pointercancel', endSeek);
  /* Not preventDefault: that would keep the rail from taking focus, and the
     arrows above are the reason it is focusable at all. Selection is stopped
     by user-select on .music-seek instead. */
  event.stopPropagation();
  return true;
}

/** Left/right move five seconds, Home/End jump to the ends; everything else passes. */
function seekByKey(event) {
  const rail = event.target.closest ? event.target.closest('[data-seek]') : null;
  if (!rail) return false;
  const base = Number(rail.dataset.seekFrom ?? media.position) || 0;
  const target = seekFromKey(base, media.duration, event.key);
  if (target === null) return false;
  rail.dataset.seekFrom = String(target);
  seekHoldUntil = Date.now() + 900;
  paintSeekPreview(target);
  api.control('seek', target).catch(() => {});
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function setVolume(level) {
  const value = Math.max(0, Math.min(100, Math.round(Number(level) || 0)));
  volumeState = { ...volumeState, volume: value };
  paintVolume();
  if (volumeSetBusy) {
    volumeSetPending = value;
    return;
  }
  volumeSetBusy = true;
  api
    .volumeSet(value)
    .then((state) => {
      volumeSetBusy = false;
      if (!state?.ok) {
        volumeSetPending = null;
        failVolume(state);
        return;
      }
      volumeState = { ...volumeState, muted: state.muted === true };
      paintVolume();
      if (volumeSetPending !== null) {
        const next = volumeSetPending;
        volumeSetPending = null;
        setVolume(next);
      }
    })
    .catch(() => {
      volumeSetBusy = false;
    });
}

function setVolumeMute(next) {
  const muted = next === true;
  volumeState = { ...volumeState, muted };
  paintVolume();
  api
    .volumeMute(muted)
    .then((state) => {
      if (state?.ok) {
        volumeState = { ...volumeState, volume: state.volume, muted: state.muted === true };
        paintVolume();
      } else {
        failVolume(state);
      }
    })
    .catch((error) => failVolume({ error: error?.message }));
}

/** Cheap per-second update: progress, time and the lyric window only. */
let lastLyricIndex = -2;
let lyricTimer = 0;

function paintMusicLyricWindow(index) {
  if (!open || enabledPages()[pageIndex]?.key !== 'music') return;
  const preview = pagesEl.querySelector('.music-current-lyric');
  if (preview) preview.innerHTML = lyricPreviewHtml(index);
  const box = pagesEl.querySelector('[data-lyric-box]');
  if (box && box.closest('.music')?.dataset.music === 'lyrics') {
    box.innerHTML = lyricSliceHtml(index, 5);
  }
}

/** Only repaint the expanded lyric window when the selected line changes. */
function paintCurrentLyric(force = false) {
  const index = lyricAt();
  if (!force && index === lastLyricIndex) return index;
  lastLyricIndex = index;
  paintMusicLyricWindow(index);
  /*
   * The folded capsule has a fixed content slot. Replace only its text here:
   * rebuilding the status on every lyric boundary used to measure the same
   * width again and made the island spring pulse while a song was playing.
   */
  const pillLyric = pillStatus.querySelector(
    '.now-playing-pill[data-kind="lyric"] .now-playing-pill__text',
  );
  if (pillLyric) pillLyric.textContent = currentLyricLine(index);
  return index;
}

function stopLyricClock() {
  if (lyricTimer) clearTimeout(lyricTimer);
  lyricTimer = 0;
}

/**
 * A media frame is sampled once a second, but a lyric boundary is not. Wake
 * exactly when the next lead-adjusted line starts instead of waiting for the
 * next one-second media tick.
 */
function scheduleLyricClock() {
  stopLyricClock();
  if (!media.active || !media.playing || !lyrics?.synced || !lyrics.lines?.length) return;
  const seconds = currentPlaybackSeconds();
  const index = paintCurrentLyric();
  const delay = nextLyricDelayMs(lyrics.lines, index, seconds, lyricLeadSeconds(), media.rate);
  if (delay === null) return;
  lyricTimer = setTimeout(() => {
    lyricTimer = 0;
    scheduleLyricClock();
  }, Math.max(8, delay + 8));
}

function updateMusicLive() {
  const page = enabledPages()[pageIndex];
  if (!page || page.key !== 'music') return;
  /* The live clock is wall time, and the bar it sits beside does not exist on a
     live page — update it before the progress branch gives up. */
  const live = pagesEl.querySelector('[data-live]');
  const duration = Number(media.duration) > 0
    ? Number(media.duration)
    : Number(lyrics?.duration) || 0;
  const playback = currentPlaybackSeconds();
  const timing = mediaTimingLabel(media, {
    position: playback,
    liveSeconds: liveElapsed(),
    fallbackDuration: duration,
  });
  if (live) live.textContent = timing;
  const timePair = pagesEl.querySelector('[data-time-pair]');
  if (timePair) timePair.textContent = timing;
  const position = pagesEl.querySelector('[data-pos]');
  if (position) position.textContent = clock(playback);
  const remaining = pagesEl.querySelector('[data-remaining]');
  if (remaining) remaining.textContent = '-' + clock(Math.max(0, duration - playback));
  /*
   * Lyrics follow the authoritative position even while the rail is held.
   * A main-process seek can arrive during the short hold window, and delaying
   * the words until after it used to make the lyric look one line behind.
   */
  const index = lyricAt(playback);
  if (index !== lastLyricIndex) {
    lastLyricIndex = index;
    paintMusicLyricWindow(index);
  }
  /* The rail belongs to whoever is holding it, and to the value they just
     committed until the player's next frame confirms it. */
  if (seekDrag || Date.now() < seekHoldUntil) return;
  const bar = pagesEl.querySelector('[data-progress]');
  if (!bar) return;
  const pct = duration ? Math.min(100, (playback / duration) * 100) : 0;
  bar.style.width = pct.toFixed(1) + '%';
  const thumb = pagesEl.querySelector('[data-thumb]');
  if (thumb) thumb.style.left = pct.toFixed(1) + '%';
  const livePosition = pagesEl.querySelector('[data-pos]');
  if (livePosition) livePosition.textContent = clock(playback);
}

/*
 * Place names come from the IP locator in English ("Tung Chung", "Hong Kong").
 * The rest of this page is Chinese, so the common ones are translated here.
 * Anything not listed keeps its original spelling rather than being guessed.
 */
const PLACE_ZH = {
  'hong kong': '香港',
  'tung chung': '东涌',
  'kowloon': '九龙',
  'tsuen wan': '荃湾',
  'sha tin': '沙田',
  'tai po': '大埔',
  'yuen long': '元朗',
  'tuenshui wai': '天水围',
  'tuen mun': '屯门',
  'central': '中环',
  'beijing': '北京',
  'shanghai': '上海',
  'guangzhou': '广州',
  'shenzhen': '深圳',
  'hangzhou': '杭州',
  'chengdu': '成都',
  'wuhan': '武汉',
  'nanjing': '南京',
  "xi'an": '西安',
  'tianjin': '天津',
  'chongqing': '重庆',
  'singapore': '新加坡',
  'tokyo': '东京',
  'osaka': '大阪',
  'seoul': '首尔',
  'taipei': '台北',
  'new york': '纽约',
  'los angeles': '洛杉矶',
  'san francisco': '旧金山',
  'london': '伦敦',
  'paris': '巴黎',
  'berlin': '柏林',
  'sydney': '悉尼',
  'toronto': '多伦多',
  'vancouver': '温哥华',
};

const placeZh = (name) => PLACE_ZH[String(name || '').trim().toLowerCase()] ?? name;

const COUNTRY_ZH = {
  HK: '中国香港',
  CN: '中国',
  TW: '中国台湾',
  MO: '中国澳门',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  US: '美国',
  GB: '英国',
  FR: '法国',
  DE: '德国',
  AU: '澳大利亚',
  CA: '加拿大',
};

const countryZh = (code) => COUNTRY_ZH[String(code || '').toUpperCase()] ?? code;

/*
 * The weather page's city switch is a flyout, not a fifth page: the list is at
 * most four rows and the 205px budget is already spent on readings. A scrim
 * under it closes the menu on any click, which is why there is no document
 * level listener to leak into the island's other pages.
 */
let cityMenuOpen = false;

/** Cities the menu offers: the list from settings, with the active one kept. */
function cityChoices() {
  const saved = Array.isArray(prefs.weather?.cities) ? prefs.weather.cities : [];
  const current = String(prefs.weather?.city ?? '').trim();
  const listed = saved.map((city) => String(city ?? '').trim()).filter(Boolean);
  const ordered = current && !listed.includes(current) ? [current, ...listed] : listed;
  const out = [];
  for (const name of ordered) {
    const city = name.slice(0, 32);
    if (!city || out.includes(city)) continue;
    out.push(city);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * Pick a city for good: one preference write, and the main process takes the
 * refresh (serviceChanges sees weather.city change). Picking an explicit city
 * also wins over the IP guess, otherwise the locator would immediately put the
 * page back where it was.
 */
function selectCity(value) {
  cityMenuOpen = false;
  renderPage();
  const city = String(value ?? '').trim().slice(0, 32);
  const currentCity = String(prefs.weather?.city ?? '').trim();
  if (!city || (city === currentCity && prefs.weather?.autoLocate !== true)) return;
  if (typeof api.patchPrefs !== 'function') return;
  api.patchPrefs({ weather: { ...(prefs.weather ?? {}), city, autoLocate: false } }).catch(() => {});
}

function weatherPage() {
  if (!weather) {
    /*
     * The first reading takes a second or two, and an offline machine never
     * finishes it: the loading line and the failure line are two states, and
     * only the failure one can say what to do next.
     */
    return weatherError
      ? stateBlock('bad', '天气没连上', '检查网络，五分钟后自动重试', '去设置', 'data-action="settings:weather"')
      : stateBlock('warn', '正在获取天气', '第一次需要几秒钟');
  }
  const fahrenheit = prefs.weather?.unit === 'f';
  const show = (celsius) => {
    const value = Number(celsius) || 0;
    return fahrenheit ? Math.round((value * 9) / 5 + 32) : Math.round(value);
  };
  const now = weather.current;
  /* The master island shows five comparable forecast cells: today plus the
     next four days. The hourly strip and the four-cell metric grid remain in
     the data model, but not in this compact page. */
  const days = (weather.days ?? []).slice(0, 5);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'];
  const dayCells = days
    .map((day, index) => {
      const date = new Date(day.date);
      const label = index === 0 ? '今天' : '周' + weekday[date.getDay()];
      return `<div title="${escapeHtml(day.text || '')}">
        <b>${label}</b>
        <span>${show(day.max)}° / ${show(day.min)}°</span>
      </div>`;
    })
    .join('');
  /*
   * The district leads: someone in 番禺区 is in 番禺区, and the city only says
   * how far down the map the locator got. A place without one (an IP-only
   * answer, or a city a person picked by hand) falls back to the city name.
   */
  const district = placeZh(weather.place?.district || '');
  const cityName = placeZh(weather.place?.name || '');
  const place = escapeHtml(district || cityName || '当前位置');
  const subtitle = district && cityName && district !== cityName ? ' · ' + escapeHtml(cityName) : '';
  const country = (subtitle || '') + (weather.place?.country ? ' · ' + escapeHtml(countryZh(weather.place.country)) : '');
  const sunrise = (now.sunrise || '').slice(11, 16) || '--:--';
  const sunset = (now.sunset || '').slice(11, 16) || '--:--';
  /*
   * With auto-locate on the reading belongs to the IP's city, not to the city
   * preference, so no menu row is "current" then; picking one turns the locator
   * off (see selectCity).
   */
  const autoLocate = prefs.weather?.autoLocate === true;
  const activeCity = autoLocate ? '' : String(prefs.weather?.city ?? '').trim();
  const cityRows = cityChoices()
    .map((city) => `<button type="button" class="wx-city-opt" role="menuitemradio" aria-checked="${city === activeCity}" data-city-pick="${escapeHtml(city)}">
      <span>${escapeHtml(city)}</span>
      ${city === activeCity ? svg(ICON.check, 'wx-city-check') : ''}
    </button>`)
    .join('');
  const cityMenu = cityMenuOpen
    ? `<div class="wx-cities" role="menu" aria-label="切换城市">
        ${cityRows}
        <button type="button" class="wx-city-manage" role="menuitem" data-action="settings:weather">管理城市</button>
      </div>`
    : '';
  return `<div class="pgm-weather wx">
    <div class="pgm-weather-main">
      <div class="pgm-temp wx-temp">${show(now.temp)}<sup>°</sup></div>
      <div class="pgm-weather-copy">
        <button type="button" class="pgm-city-trigger wx-city" data-city-menu aria-expanded="${cityMenuOpen}" aria-haspopup="menu" title="切换城市">
          <b>${escapeHtml(now.text)} · ${place}</b>
          ${svg('<path d="m7 10 5 5 5-5"/>', 'wx-caret')}
        </button>
        <span>体感 ${show(now.feels)}° · 湿度 ${Number(now.humidity) || 0}%<br>风速 ${Number(now.wind) || 0} km/h · 日落 ${sunset}</span>
      </div>
    </div>
    <div class="pgm-forecast" role="list" aria-label="五日天气预报">${dayCells}</div>
    ${cityMenuOpen ? '<div class="wx-scrim" data-city-close aria-hidden="true"></div>' : ''}
    ${cityMenu}
  </div>`;
}
const timeOf = (ms) => {
  const date = new Date(Number(ms) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The compact timestamps used by the four-line mailbox summary. */
const mailTimeLabel = (ms) => {
  const at = Number(ms) || Date.now();
  const date = new Date(at);
  const now = new Date();
  if (now.getTime() - at < 60 * 60 * 1000) return '刚刚';
  if (date.toDateString() === now.toDateString()) return timeOf(at);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const PROVIDER_NAMES = {
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  siliconflow: 'SiliconFlow',
  openrouter: 'OpenRouter',
};

/** A provider slug is not a label: DeepSeek reads as DeepSeek, not deepseek. */
const providerName = (value) => {
  const key = String(value || '').toLowerCase();
  return PROVIDER_NAMES[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : 'AI');
};

const CURRENCY_MARKS = { CNY: '¥', USD: '$', PCT: '%' };

/**
 * The agent block under the balance.
 *
 * The balance and the linkage share one page and one snapshot, so this block
 * answers the two questions the page can: how many sources are listened to, and
 * which one is running or merely open. Rows are read-only on purpose:
 * the sources are status files, not windows, and no mapping from a source to a
 * window handle exists — a button that cannot switch anywhere would be worse
 * than a plain row. The one action is the summary line, which opens the
 * settings page that owns these switches.
 */
const AGENT_ROWS = 3;
let agentClock = null;

/** "12 秒 / 3 分 / 2 小时": the age of one linkage state change. */
function agentAge(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return seconds + ' 秒';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' 分';
  return Math.floor(minutes / 60) + ' 小时';
}

/** Repaint the durations only; a live second must not rebuild the page. */
function paintAgentAges() {
  const now = Date.now();
  for (const node of document.querySelectorAll('[data-agent-since]')) {
    if (node.dataset.agentUnknown === '1' || node.dataset.agentActive !== '1') continue;
    const prefix = node.dataset.agentRunning === '1' ? '运行 ' : '已启动 ';
    node.textContent = prefix + agentAge(now - Number(node.dataset.agentSince));
  }
}

function stopAgentClock() {
  if (agentClock) clearInterval(agentClock);
  agentClock = null;
}

function startAgentClock() {
  stopAgentClock();
  if (!document.querySelector('[data-agent-since]')) return;
  agentClock = setInterval(() => {
    if (!open || enabledPages()[pageIndex]?.key !== 'quota') {
      stopAgentClock();
      return;
    }
    paintAgentAges();
  }, 1000);
}

function agentBlock() {
  const list = Array.isArray(agentsState) ? agentsState : [];
  const on = list.filter((agent) => agent.on);
  const active = on.filter((agent) => agent.active).length;
  const running = on.filter((agent) => agent.running).length;
  const idle = Math.max(0, active - running);
  const stopped = Math.max(0, on.length - active);
  const rows = on.slice(0, AGENT_ROWS).map((agent, index) => {
    const since = Number(agent.since);
    const known = agent.active && Number.isFinite(since) && since > 0;
    const state = agent.running ? 'run' : agent.active ? 'open' : 'unknown';
    const time = known
      ? (agent.running ? '运行 ' : '已启动 ') + agentAge(Date.now() - since)
      : agent.active ? '已启动' : '未启动';
    const taskTitle = Number(agent.taskCount) > 0 ? ` · ${Number(agent.taskCount)} 个任务` : '';
    const percent = Number.isFinite(Number(agent.percent))
      ? Math.max(0, Math.min(100, Math.round(Number(agent.percent))))
      : null;
    const fill = percent ?? (agent.running ? 86 - index * 18 : agent.active ? 54 - index * 10 : 28);
    const readout = agent.displayValue ?? (percent === null ? time : `${percent}%`);
    return `<div class="pgm-ai-row quota-agent-row" data-state="${state}" title="${escapeHtml(agent.label + taskTitle + ' · ' + time)}">
      <span class="quota-agent-label">${escapeHtml(agent.label)}</span>
      <span class="quota-agent-time" data-agent-since="${percent === null && known ? since : ''}" data-agent-active="${agent.active ? '1' : '0'}" data-agent-running="${agent.running ? '1' : '0'}" data-agent-unknown="${percent === null && known ? '0' : '1'}">${escapeHtml(readout)}</span>
      <span class="pgm-meter" aria-hidden="true"><i style="width:${Math.max(18, fill)}%"></i></span>
    </div>`;
  }).join('');
  const label = on.length
    ? `Agent 联动：${on.length} 个监听来源，${running} 个运行中，${idle} 个空闲，${stopped} 个未启动；打开 AI 额度设置`
    : 'Agent 联动：没有启用的状态来源；打开 AI 额度设置';
  return `<button type="button" class="quota-agent-sum" data-action="settings:quota" aria-label="${escapeHtml(label)}" title="在设置里改 Agent 联动">
      <span class="pgm-label">Agent 状态</span>
      <svg class="quota-agent-open" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </button>
    ${rows || '<p class="quota-agent-none">没有启用 Agent 联动</p>'}
    <span class="pgm-ai-note"><b>${stopped}</b>未启动 · ${idle} 空闲 · ${running} 运行</span>`;
}

function quotaPage() {
  const state = quotaState ?? { accounts: [], current: null, last: null };
  if (!state.accounts.length) {
    /*
     * One line and one action, against the top of the page.
     *
     * The old empty state used the shared 96px block, and .pages > .empty
     * centres that in 205px: on a page with nothing else to show, that band of
     * air above and below is the one state where the card reads as broken.
     */
    return stateBlock('warn', '还没有连接额度账号', '添加后能看余额和 Agent', '添加账号', 'data-action="settings:quota"');
  }
  const current = state.accounts.find((account) => account.current);
  const last = state.last;
  const provider = providerName(last?.provider ?? current?.provider);
  const currency = last?.currency ?? '';
  const mark = CURRENCY_MARKS[currency] ?? '';
  const markIsSuffix = mark === '%';
  /*
   * More than one account is a switch, not a stack of cards: one 6px dot per
   * account in the provider row, the active one widened. The hit box stays
   * 28px even though the paint is a dot, so the row is still safe to click.
   */
  const dots = state.accounts.length > 1
    ? `<span class="quota-accounts">` + state.accounts
      .map((account) => `<button type="button" data-local="quota:select" data-id="${escapeHtml(account.id)}" aria-current="${account.current ? 'true' : 'false'}" aria-label="${escapeHtml(account.name)}" title="${escapeHtml(account.name)}"></button>`)
      .join('') + `</span>`
    : '';
  const refresh = '<button type="button" class="ghost quota-refresh" data-local="quota:refresh">刷新</button>';
  const meta = `<div class="quota-meta pgm-visually-hidden">
      <span class="quota-id"><b>${escapeHtml(provider)}</b>${currency ? `<i>·</i>${escapeHtml(currency)}` : ''}</span>
      <span class="quota-meta-actions">${dots}${refresh}</span>
    </div>`;
  if (!last || last.error) {
    /* What failed is the lookup, not the account: the line names the state and
       the second line carries the provider and the reason the service gave. */
    return stateBlock(
      'bad',
      '额度暂时查不到',
      `${provider} · ${last?.error ?? '正在查询…'}`,
      '刷新',
      'data-local="quota:refresh"',
    );
  }
  /*
   * A provider can answer "this balance is not available" (expired key, plan
   * exhausted). That is not a number with a zero in it, so it is not drawn as
   * one: it is the same failure block, with the one action that retries.
   */
  if (last.available === false) {
    return stateBlock('bad', '额度不可用', `${provider} · 充值后点刷新看看`, '刷新', 'data-local="quota:refresh"');
  }
  /*
   * The balance is the page's one focus: 30px of tabular figures. Below it,
   * the only ratio these two amounts contain — topped vs granted — as a 4px
   * bar with a legend that names its two colours. The split is written as a
   * custom property; no new data field is introduced, and every skin paints
   * the same numbers.
   */
  const remaining = Math.max(0, Math.min(100, Number(last.total) || 0));
  const agentList = (Array.isArray(agentsState) ? agentsState : []).filter((agent) => agent.on).slice(0, 3);
  const runningAgents = agentList.filter((agent) => agent.running).length;
  const rows = agentList.map((agent, index) => {
    const percent = Number.isFinite(Number(agent.percent))
      ? Math.max(0, Math.min(100, Math.round(Number(agent.percent))))
      : Math.max(18, 86 - index * 18);
    const readout = agent.displayValue ?? `${percent}%`;
    return `<div class="pgm-ai-row quota-agent-row" data-state="${agent.running ? 'run' : agent.active ? 'open' : 'unknown'}">
      <span class="quota-agent-label">${escapeHtml(agent.label)}</span>
      <span class="quota-agent-time">${escapeHtml(readout)}</span>
      <span class="pgm-meter" aria-hidden="true"><i style="width:${percent}%"></i></span>
    </div>`;
  }).join('');
  const resetLabel = String(last.resetLabel || '周日 14:09 重置');
  return `<div class="pgm-ai quota-page" data-gauge="true" style="--quota-share:${remaining};--pgm-info:#8fa9c3">
    <div class="pgm-ai-main quota-summary">
      ${meta}
      <span class="pgm-label">${escapeHtml(provider)} · 本周剩余额度</span>
      <div class="pgm-big-number quota-balance" title="${escapeHtml(provider + ' ' + remaining + '%')}"><span class="quota-amount">${escapeHtml(String(remaining))}</span><small>%</small></div>
      <div class="pgm-meter quota-ratio" aria-hidden="true" style="color:var(--pgm-info)"><i class="quota-meter" style="width:${remaining}%"></i></div>
      <span class="pgm-ai-note">${escapeHtml(resetLabel)}<br>当前 ${runningAgents} 个 Agent 正在运行</span>
    </div>
    <div class="pgm-ai-list quota-scroll" tabindex="0" aria-label="Agent 状态">
      ${rows || '<p class="quota-agent-none">没有启用的 Agent 联动</p>'}
    </div>
  </div>`;
}

/**
 * "(3) 张三" is a window title; a row wants the conversation.
 *
 * The probe publishes only that title, so its unread prefix is stripped here.
 * The app label stays in front of the name on purpose: six pixels of colour
 * beside "张三" does not say which app is waiting.
 */
function sessionLabel(app) {
  const label = String(app.label ?? '');
  let title = String(app.title ?? '').replace(/^\s*(?:\(\d+\)|\[\d+\s*条|\d+\s*条)\s*/, '').trim();
  if (title.startsWith(label)) title = title.slice(label.length).replace(/^\s*[-–—·:：]\s*/, '').trim();
  return title && title !== label ? label + ' · ' + title : label;
}

/** Rows the message centre shows at once; the rest scroll inside the list. */
const MESSAGE_ROWS = 4;

/**
 * Message centre: every running app, one 24px row each, grouped by app.
 *
 * The probe publishes one window title per app (plus how many windows it has),
 * so a group is one row today; the group wrapper is what keeps a second window
 * under the same dot instead of looking like a new app. The row is the whole
 * switch — clicking it brings that window forward (messenger:activate).
 *
 * No "全部已读" button: Windows exposes no way to mark an app read, and
 * services/messenger.js only starts, stops, snapshots and activates. A button
 * with nothing behind it is worse than no button.
 */
function messengerPage() {
  const apps = messengerState?.apps ?? [];
  if (!apps.length) {
    /* One line and one action, at the top: an empty box reads as a failure. */
    return stateBlock('good', '没有消息应用在运行', '打开微信或 QQ 后会出现在这里', '去设置', 'data-action="settings:comm"');
  }
  const appCount = Math.max(apps.length, Number(messengerState?.appCount) || 0);
  const groups = apps
    .slice(0, MESSAGE_ROWS)
    .map((app) => {
      const name = sessionLabel(app);
      const pending = Number(app.unread) || 0;
      const aria = name + '，' + (pending ? pending + ' 条未读，' : '') + '切过去';
      const appName = String(app.label || '消息');
      let conversation = String(app.title || '').replace(/^\s*(?:\(\d+\)|\[\d+\s*条|\d+\s*条)\s*/, '').trim();
      if (conversation.startsWith(appName)) {
        conversation = conversation.slice(appName.length).replace(/^\s*[-–—·:：]\s*/, '').trim();
      }
      const preview = String(app.preview || (pending ? '点击切到这条会话' : '已读完，点按切到应用'));
      return `<div class="msg-group" data-app="${escapeHtml(app.id)}">
        <button type="button" class="pgm-message-row msg-row" data-local="messenger:activate" data-id="${escapeHtml(app.handle)}" title="${escapeHtml(name)}" aria-label="${escapeHtml(aria)}">
          <i class="pgm-avatar" aria-hidden="true">${escapeHtml(Array.from(appName)[0] || '消')}</i>
          <span class="pgm-message-copy">
            <b title="${escapeHtml(appName + (conversation ? ' · ' + conversation : ''))}">${escapeHtml(appName)}${conversation ? ' · ' + escapeHtml(conversation) : ''}</b>
            <span title="${escapeHtml(preview)}">${escapeHtml(preview)}</span>
          </span>
          <em>${pending || ''}</em>
        </button>
      </div>`;
    })
    .join('');
  const unread = apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0);
  const more = appCount > MESSAGE_ROWS
    ? `<div class="pgm-visually-hidden">还有 ${appCount - MESSAGE_ROWS} 个应用</div>`
    : '';
  return `<div class="pgm-messages msg-page">
    <div class="pgm-unread">
      <b class="msg-total">${unread}</b>
      <span>未读消息<br>来自 ${appCount} 个应用</span>
      <span class="pgm-tag">全部已读</span>
    </div>
    <div class="pgm-message-list msg-list">${groups}${more}</div>
  </div>`;
}


/**
 * The mailbox's own filter: which tab and which account the list draws.
 *
 * Radios keep the tab in the DOM, but a re-render rewrites the page from this
 * state, so the two must agree. The account lives here because the list is
 * sliced after filtering — a CSS-only filter would hide the rows below the
 * fold instead of letting the chosen account fill them.
 */
let mailFilter = { tab: 'all', account: 'all' };
/** The last mail write that failed, drawn once on the stats line. */
let mailActionError = '';

/** The rows the mailbox draws under its two header lines. */
const MAIL_ROWS = 4;

/** The account the mailbox filters to, resolved against the live list. */
function mailScope() {
  const wanted = mailFilter?.account ?? 'all';
  if (wanted === 'all') return 'all';
  return (mailState?.accounts ?? []).some((account) => account.id === wanted) ? wanted : 'all';
}

/** The tab line: two radios plus the counts for what the list is showing. */
function mailTabs(total, unread) {
  const unreadTab = mailFilter.tab === 'unread';
  return `<input type="radio" name="mail-tab" id="mail-tab-all" class="mail-tab-radio"${unreadTab ? '' : ' checked'} />
    <label class="mail-tab" for="mail-tab-all">全部<i>${total}</i></label>
    <input type="radio" name="mail-tab" id="mail-tab-unread" class="mail-tab-radio"${unreadTab ? ' checked' : ''} />
    <label class="mail-tab" for="mail-tab-unread">未读<i>${unread}</i></label>`;
}

/**
 * The account picker.
 *
 * "全部账户" is the default; each other entry is one configured address. The
 * label is the local part because the full address does not fit a 22px line;
 * the option's title carries the address for the hover.
 */
function mailAccountPicker(accounts, scope) {
  if (accounts.length < 2) return '';
  const options = [
    `<option value="all"${scope === 'all' ? ' selected' : ''}>全部账户</option>`,
    ...accounts.map((account) => {
      const address = String(account.address || account.id);
      const local = address.includes('@') ? address.slice(0, address.indexOf('@')) : address;
      return `<option value="${escapeHtml(account.id)}" title="${escapeHtml(address)}"${scope === account.id ? ' selected' : ''}>${escapeHtml(local.slice(0, 12))}</option>`;
    }),
  ].join('');
  return `<select class="mail-account" data-mail-account aria-label="按账户筛选">${options}</select>`;
}

/** One line of error, short enough for the stats row. */
function mailErrorLine(error) {
  const text = String(error || '');
  return text.length > 28 ? text.slice(0, 28) + '…' : text;
}

function mailPage() {
  const state = mailState ?? { accounts: [], messages: [] };
  const accounts = state.accounts ?? [];
  if (!accounts.length) {
    /* One line and one action at the top of the page: the centred icon, title,
       provider note and button filled 205px with a band of air. */
    return stateBlock('warn', '还没有添加邮箱', '添加后能看摘要和验证码', '添加邮箱', 'data-action="settings:comm"');
  }
  const messages = state.messages ?? [];
  const scope = mailScope();
  mailFilter.account = scope;
  const scoped = scope === 'all' ? messages : messages.filter((message) => message.accountId === scope);
  /* The count is the account's own answer, not the visible slice: "未读 12" that
     only ever drew nine rows was the mismatch the old tab count carried. */
  const unreadAll = scoped.filter((message) => !message.seen).length;
  const listed = mailFilter.tab === 'unread' ? scoped.filter((message) => !message.seen) : scoped;
  const visible = listed.slice(0, MAIL_ROWS);
  const sync = state.syncing ? '同步中' : state.error ? '部分失败' : state.lastSync ? timeOf(state.lastSync) + ' 更新' : '';
  const apps = messengerState?.apps ?? [];
  const msgUnread = apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0);
  const msgPageOn = enabledPages().some((page) => page.key === 'messenger');
  const msgEntry = msgPageOn
    ? `<button type="button" class="mail-msg-entry pgm-summary-link" data-goto="messenger" aria-label="消息${msgUnread ? '，' + msgUnread + ' 条未读' : ''}">消息${msgUnread ? ' ' + msgUnread : ''}</button>`
    : '';
  const unreadTab = mailFilter.tab === 'unread';
  const filters = `<span class="pgm-mail-filters">
    <input type="radio" name="mail-tab" id="mail-tab-all" class="pgm-visually-hidden"${unreadTab ? '' : ' checked'} />
    <label for="mail-tab-all">全部邮件 <b>${scoped.length}</b></label>
    <input type="radio" name="mail-tab" id="mail-tab-unread" class="pgm-visually-hidden"${unreadTab ? ' checked' : ''} />
    <label class="pgm-visually-hidden" for="mail-tab-unread">未读</label>
  </span>`;
  const note = mailActionError
    ? `<span class="mail-action-error" title="${escapeHtml(mailActionError)}">${escapeHtml(mailErrorLine(mailActionError))}</span>`
    : `<span class="mail-sync" title="${escapeHtml(state.error || '')}">${escapeHtml(sync)}</span>`;
  const allRead = unreadAll
    ? '<button type="button" class="mail-allread pgm-summary-link pgm-visually-hidden" data-mail-all-read>全部已读</button>'
    : '';
  const stats = `<div class="pgm-summary-row mail-stats">
    ${filters}
    <span class="pgm-mail-summary">未读 <b>${unreadAll}</b> · 摘要 <b>${Math.min(MAIL_ROWS, listed.length)}</b>${note}${allRead}${msgEntry}</span>
  </div>`;
  if (!visible.length) {
    /* One line and one action, at the top: the empty, the filtered-empty and
       the failed mailbox are the three states this page can be wrong in. */
    /*
     * The three ways an empty list can be right: the account never answered,
     * it has not answered yet, and it answered with nothing new. Each gets its
     * own tone and its own next step instead of one sentence for all three.
     */
    const block = state.error
      ? stateBlock('bad', '邮箱没连上', mailErrorLine(state.error), '去设置', 'data-action="settings:comm"')
      : state.syncing
        ? stateBlock('warn', '正在同步邮箱', '第一次同步要等一会儿')
        : mailFilter.tab === 'unread'
          ? stateBlock('good', '没有未读邮件', '', '看全部', 'data-mail-tab-all')
          : stateBlock('good', '还没有邮件', '新邮件到了会出现在这里', '去设置', 'data-action="settings:comm"');
    return `<div class="pgm-list-page mail-page">${stats}${accounts.length > 1 ? mailAccountPicker(accounts, scope) : ''}${block}</div>`;
  }
  const rows = visible
    .map((message) => {
      const from = message.fromName || message.fromAddress || '未知发件人';
      const unread = message.seen ? 0 : 1;
      const title = [message.fromName, message.subject].filter(Boolean).join(' · ');
      const toggleLabel = unread ? '标为已读' : '标为未读';
      const subject = String(message.subject || '').trim();
      const address = String(message.fromAddress || '').trim();
      return `<div class="pgm-rule mail-row${unread ? ' unread' : ''}" data-unread="${unread}" title="${escapeHtml(title)}">
        <button type="button" class="pgm-rule-copy" data-mail-act="toggle" data-seen="${unread}" data-id="${escapeHtml(message.id)}" aria-label="${escapeHtml(from + ' · ' + toggleLabel)}">
          <b>${escapeHtml(from)}${subject ? ' · ' + escapeHtml(subject) : ''}</b>
          <span>${escapeHtml(message.summary || address || (unread ? '未读邮件，点按标记为已读' : '已读邮件，点按标记为未读'))}</span>
        </button>
        <span class="pgm-rule-meta">${escapeHtml(message.displayTime || mailTimeLabel(message.date))}
          <button type="button" class="mail-row-act pgm-rule-delete" data-mail-act="delete" data-id="${escapeHtml(message.id)}" aria-label="删除" title="删除">${svg(ICON.trash, 'mail-act-icon')}</button>
        </span>
      </div>`;
    })
    .join('');
  return `<div class="pgm-list-page mail-page">${stats}${accounts.length > 1 ? mailAccountPicker(accounts, scope) : ''}<div class="pgm-rule-list mail mail-list">${rows}</div></div>`;
}

/* --------------------------------------------------------------- calendar */

const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** 21:30 — the clock shape the day list and the editor both use. */
const clockText = (start) => {
  const date = new Date(start);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
};

/** 09:00 on another day; the next whole hour on today, which is what a new
event is usually set to. */
function nextSlotText() {
  const now = new Date();
  const pickingToday = dayKey(now) === dayKey(new Date(calendarView.year, calendarView.month, calendarView.selected));
  if (!pickingToday) return '09:00';
  return String(Math.min(23, now.getHours() + 1)).padStart(2, '0') + ':00';
}

const FESTIVALS = {
  '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '3-12': '植树节',
  '4-1': '愚人节', '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节',
  '7-1': '建党节', '8-1': '建军节', '9-10': '教师节', '10-1': '国庆节',
  '12-24': '平安夜', '12-25': '圣诞节',
};

function calendarPage() {
  const failedSubs = (calendarState.subscriptions ?? []).filter((sub) => sub.error);
  const subError = failedSubs.length
    ? failedSubs.length + ' 个订阅拉取失败：' + failedSubs.map((sub) => sub.name || sub.id).join('、')
    : '';
  const events = calendarState.events ?? [];
  const byDay = new Map();
  for (const event of events) {
    const key = dayKey(new Date(event.start));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  const now = new Date();
  const first = new Date(calendarView.year, calendarView.month, 1);
  const daysInMonth = new Date(calendarView.year, calendarView.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  /*
   * A fixed 7x5 window, 24px rows: 35 cells is the whole budget for the month.
   * Short months still fill five rows so every month keeps the same height; a
   * month that needs a sixth week ends at cell 35 here — the grid keeps one
   * height on every month, which is what the 205px page is sized against.
   */
  while (cells.length < 35) cells.push(null);
  const shown = cells.slice(0, 35);

  const todayKey = dayKey(now);
  const selectedKey = dayKey(new Date(calendarView.year, calendarView.month, calendarView.selected));
  const selectedEvents = [...(byDay.get(selectedKey) ?? [])].sort((a, b) => {
    if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? 1 : -1;
    return Number(a.start) - Number(b.start);
  });
  const visibleEvents = selectedEvents.slice(0, 4);

  const grid = shown
    .map((day) => {
      if (day === null) return '<span class="pgm-month-cell is-empty" aria-hidden="true"></span>';
      const key = `${calendarView.year}-${calendarView.month + 1}-${day}`;
      const list = byDay.get(key) ?? [];
      const isToday = key === todayKey;
      const classes = ['pgm-month-cell'];
      if (isToday) classes.push('is-today');
      if (day === calendarView.selected) classes.push('is-selected');
      if (list.length) classes.push('has-events');
      return `<span class="${classes.join(' ')}" role="button" tabindex="0" data-cal-day="${day}" aria-label="${calendarView.month + 1} 月 ${day} 日${list.length ? '，' + list.length + ' 件事' : ''}">${day}</span>`;
    })
    .join('');

  const selectedDate = new Date(
    calendarView.year,
    calendarView.month,
    calendarView.selected,
  );
  const title = `${calendarView.month + 1} 月 ${calendarView.selected} 日 · 周${WEEK_ZH[selectedDate.getDay()]}`;
  const editingEvent = calendarDraft ? events.find((event) => event.id === calendarDraft.id) : null;
  const form = calendarDraft
    ? `<div class="cal-form pgm-cal-editor">
        <input type="text" class="cal-input" data-cal-input="title" maxlength="160" placeholder="标题" aria-label="日程标题" value="${escapeHtml(editingEvent ? editingEvent.title : '')}" />
        ${editingEvent
          ? `<input type="text" class="cal-input cal-input-time" data-cal-input="time" maxlength="5" inputmode="numeric" aria-label="时间，例如 21:30" value="${clockText(editingEvent.start)}" />
        <div class="cal-form-row cal-form-acts">
          <button type="button" class="cal-key" data-cal-act="delete">删除</button>
          <button type="button" class="cal-key on" data-cal-act="save">保存</button>
        </div>`
          : `<div class="cal-form-row">
          <input type="text" class="cal-input cal-input-time" data-cal-input="time" maxlength="5" inputmode="numeric" aria-label="时间，例如 21:30" value="${nextSlotText()}" />
          <button type="button" class="cal-key on" data-cal-act="save">保存</button>
        </div>`}
      </div>`
    : '';
  const rows = visibleEvents
    .map((event) => `<button type="button" class="pgm-event cal-event" data-cal-event="${escapeHtml(event.id)}" aria-label="编辑 ${event.allDay ? '全天' : clockText(event.start)} ${escapeHtml(event.title)}">
        <time>${event.allDay ? '全天' : clockText(event.start)}</time>
        <div><b>${escapeHtml(event.title)}</b><span>${escapeHtml(event.detail || '本地日程 · 点按编辑')}</span></div>
      </button>`)
    .join('');
  const headKey = `<button type="button" class="pgm-visually-hidden" data-cal-act="${calendarDraft ? 'cancel' : 'new'}" aria-label="${calendarDraft ? '取消编辑' : '新建日程'}">${calendarDraft ? '取消' : '新建日程'}</button>`;
  const reminderCount = Number(calendarState.reminderCount) || selectedEvents.length;
  const festival = FESTIVALS[calendarView.month + 1 + '-' + calendarView.selected];

  return `<div class="pgm-calendar calendar">
    <div class="pgm-month">
      <div class="pgm-month-head">
        <button type="button" class="cal-nav pgm-cal-prev" data-cal-nav="-1" aria-label="上个月">‹</button>
        <span>${calendarView.year} 年 ${calendarView.month + 1} 月</span>
        <button type="button" class="cal-nav pgm-cal-next" data-cal-nav="1" aria-label="下个月">›</button>
      </div>
      <div class="pgm-month-grid">
        ${[...WEEK_ZH.slice(1), WEEK_ZH[0]].map((day) => `<span class="is-weekday">${day}</span>`).join('')}
        ${grid}
      </div>
    </div>
    <div class="pgm-events">
      <div class="pgm-summary-row">
        <span><b>${title}</b></span>
        <span>${reminderCount ? reminderCount + ' 项提醒' : '暂无安排'}${headKey}</span>
      </div>
      ${!calendarDraft && festival ? `<em class="cal-festival" title="${escapeHtml(festival)}">${festival}</em>` : ''}
      ${form}
      ${!calendarDraft && rows ? `<div class="pgm-event-list">${rows}</div>` : ''}
      ${!calendarDraft && !rows ? '<p class="pgm-cal-empty">这一天还没有安排，点 + 新建。</p>' : ''}
      ${calendarError ? `<p class="cal-error" title="${escapeHtml(calendarError)}">${escapeHtml(calendarError)}</p>` : ''}
      ${subError ? `<p class="cal-error" title="${escapeHtml(subError)}">${escapeHtml(subError)}</p>` : ''}
    </div>
  </div>`;
}

/* ------------------------------------------------------- calendar editing */

/** Put the cursor in the title field of an editor that is on screen. */
function focusCalendarInput() {
  const input = panelEl.querySelector('[data-cal-input="title"]');
  if (!input) return;
  input.focus();
  input.select();
}

/**
 * Read the two fields.
 *
 * A time that cannot be parsed marks its field instead of being silently
 * dropped: the editor stays exactly as the user typed it, so the fix is one
 * keystroke and not a second attempt from scratch.
 */
function calendarFormValues() {
  const titleEl = panelEl.querySelector('[data-cal-input="title"]');
  const timeEl = panelEl.querySelector('[data-cal-input="time"]');
  const title = String(titleEl?.value ?? '').trim();
  const match = /^(\d{1,2})[:：](\d{2})$/.exec(String(timeEl?.value ?? '').trim());
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  const timeOk = Number.isInteger(hours) && Number.isInteger(minutes) && hours < 24 && minutes < 60;
  return { titleEl, timeEl, title, hours, minutes, timeOk };
}

function markCalendarField(input, invalid) {
  if (!input) return;
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

/** Add when the editor carries no id, update when it does. */
function saveCalendarDraft() {
  const { titleEl, timeEl, title, hours, minutes, timeOk } = calendarFormValues();
  markCalendarField(titleEl, !title);
  markCalendarField(timeEl, !timeOk);
  if (!title || !timeOk) {
    (title ? timeEl : titleEl)?.focus();
    return;
  }
  const start = new Date(calendarView.year, calendarView.month, calendarView.selected, hours, minutes).getTime();
  const id = calendarDraft?.id ?? '';
  api
    .calendarDo(id ? 'update' : 'add', id ? { id, title, start } : { title, start })
    .then((snapshot) => {
      /* A refused payload answers null: nothing was written, so the editor
         stays open and says so instead of closing on a failed save. */
      if (!snapshot) {
        calendarError = '保存失败';
        if (open) renderPage();
        return;
      }
      calendarState = { ...calendarState, ...snapshot };
      calendarError = snapshot.actionResult?.ok === false ? (snapshot.actionResult.error || '保存失败') : '';
      if (!calendarError) calendarDraft = null;
      if (open) renderPage();
    })
    .catch(() => {
      calendarError = '保存失败';
      if (open) renderPage();
    });
}

function deleteCalendarDraft() {
  const id = calendarDraft?.id;
  if (!id) return;
  api
    .calendarDo('remove', { id })
    .then((snapshot) => {
      if (!snapshot) {
        calendarError = '删除失败';
        if (open) renderPage();
        return;
      }
      calendarState = { ...calendarState, ...snapshot };
      calendarDraft = null;
      calendarError = '';
      if (open) renderPage();
    })
    .catch(() => {
      calendarError = '删除失败';
      if (open) renderPage();
    });
}

function fallbackPage(page) {
  return stateBlock('warn', `${page.title}还没开放`, `这一页在阶段 ${page.stage} 开放`);
}

/** Per-second focus update without rebuilding the ring's DOM. */
function updateFocusLive() {
  const ring = pagesEl.querySelector('.focus-ring');
  if (!ring) return;
  const pct = focusState.total ? Math.min(100, ((focusState.total - focusState.remaining) / focusState.total) * 100) : 0;
  ring.style.setProperty('--pct', pct.toFixed(2));
  const time = pagesEl.querySelector('.focus-time');
  if (time) time.textContent = clock(focusState.remaining);
}

/* ------------------------------------------------------------ local pages */

function focusPage() {
  const state = focusState;
  /*
   * A pomodoro that cannot start is a page of dead keys: focus.enabled gates
   * the timer in main, so show the one action that fixes it instead of a
   * 25:00 that never moves. A one-line state plus one button, pinned to the
   * top of the box rather than centred in it.
   */
  if (prefs.focus?.enabled !== true) {
    return stateBlock('warn', '专注还没有打开', '打开后计时和休息在这里', '去打开', 'data-action="settings:focus"');
  }
  const workMin = Math.max(1, Number(prefs.focus?.work) || 25);
  const restMin = Math.max(1, Number(prefs.focus?.rest) || 5);
  const phase = state.phase;
  const running = state.running;
  const idle = phase === 'idle';
  const rest = phase === 'rest';
  /* At rest the clock is the configured 25:00, not 0:00: the page is a
     stopwatch waiting to start, and the number is its face. */
  const seconds = idle ? workMin * 60 : state.remaining;
  const pct = state.total ? Math.min(100, ((state.total - state.remaining) / state.total) * 100) : 0;
  /* A long rest names itself: 15 minutes is the one rest the page has to explain. */
  const phaseText = idle ? '准备开始' : rest ? (state.longRest ? '长休息' : running ? '休息中' : '休息暂停') : running ? '专注中' : '已暂停';
  const focusKey = idle || (phase === 'work' && !running)
    ? `<button type="button" class="focus-key" data-local="focus:${idle ? 'start' : 'resume'}">专注</button>`
    : '<button type="button" class="focus-key" disabled>专注</button>';
  const restKey = idle
    ? '<button type="button" class="pgm-tag focus-key" disabled>休息</button>'
    : `<button type="button" class="pgm-tag focus-key${rest ? ' is-on' : ''}" data-local="focus:skip">${rest ? '结束休息' : '提前结束'}</button>`;
  const playKey = running
    ? '<button type="button" class="pgm-chip-button focus-key is-main" data-local="focus:pause">暂停</button>'
    : `<button type="button" class="pgm-chip-button focus-key is-main" data-local="focus:${idle ? 'start' : 'resume'}">${idle ? '开始' : '继续'}</button>`;
  const statRow = (label, value) => `<span class="pgm-label focus-stat">${label} ${value?.count ?? 0} · ${value?.minutes ?? 0}m</span>`;
  const round = Math.max(1, Number(state.stats?.today?.count || 0) + 1);
  return `<div class="pgm-focus focus">
    <div class="pgm-ring focus-ring" style="--pct:${pct.toFixed(1)}" role="img" aria-label="${clock(seconds)}，${phaseText}，第 ${round} 轮">
      <div class="pgm-ring-copy">
        <b class="focus-time">${clock(seconds)}</b>
        <span>${phaseText} · 第 ${round} 轮</span>
      </div>
    </div>
    <div class="pgm-focus-copy">
      <h3>把整张画板收到一屏</h3>
      <p>${workMin} 分钟工作 · ${restMin} 分钟休息<br>完成后自动回到灵动岛</p>
      <div class="pgm-inline-tags">${playKey}${restKey}</div>
      <div class="focus-stats">${statRow('本轮', state.stats?.today)}${statRow('本日', state.stats?.week)}</div>
    </div>
  </div>`;
}

function healthPage() {
  const state = healthState;
  if (!state.enabled) {
    return stateBlock('warn', '健康提醒还没有打开', '打开后记录喝水和站立', '去打开', 'data-action="settings:focus"');
  }
  const total = (state.waterCount || 0) + (state.standCount || 0);
  const row = (label, action, since, every, due, hint, displayRight = '') => `<button type="button" class="pgm-health-row health-row" data-local="health:${action}" aria-label="${hint}" title="${hint}">
      <i aria-hidden="true"></i>
      <span>下一次${label} · ${Math.max(0, every - since)}m</span>
      <span>${displayRight || `${Math.max(0, since)} 分钟前`}</span>
    </button>`;
  const week = Array.isArray(state.trend) ? state.trend : [];
  const series = week.map((day) => (Number(day.water) || 0) + (Number(day.stand) || 0));
  while (series.length < 9) series.unshift(0);
  series.push(total);
  const values = series.slice(-9);
  const masterBars = Array.isArray(state.barPercents) && state.barPercents.length === 9
    ? state.barPercents.map(Number)
    : null;
  const max = Math.max(1, ...values);
  const bars = values.map((count, index) => {
    const height = masterBars ? masterBars[index] : Math.round((100 * count) / max);
    return `<i style="height:${height}%" title="${index + 1}: ${count} 次" data-count="${count}"></i>`;
  }).join('');
  const litres = Number.isFinite(Number(state.waterLitres))
    ? Number(state.waterLitres)
    : Math.max(0, Number(state.waterCount) || 0) * 0.2;
  return `<div class="pgm-health health">
    ${row('喝水', 'drink', state.sinceWater, state.waterMin, state.waterDue, '记录一次喝水', state.waterRightLabel)}
    ${row('起身', 'stand', state.sinceStand, state.standMin, state.standDue, '记录一次站立', state.standRightLabel)}
    <div class="pgm-bars" role="img" aria-label="今日喝水与站立记录，共 ${total} 次">${bars}</div>
    <div class="pgm-summary-row">
      <span>今日共 ${total} 次 · 约 ${litres.toFixed(1)}L</span>
      <button type="button" class="health-clear pgm-summary-link" data-local="health:reset">重置今日</button>
    </div>
  </div>`;
}

function dueLabel(due) {
  if (!due) return '';
  const date = new Date(due);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return '今天';
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days > 0 && days < 7) return '周' + WEEK_ZH[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** The three repeat rules, in the order the picker offers them. */
const REPEAT_LABEL = { daily: '每天', weekly: '每周', workday: '工作日' };

function todoPage() {
  if (prefs.todo?.enabled === false) {
    /* The disabled state is another empty page, so it follows the same rule:
       one line, one action, against the top. */
    return stateBlock('warn', '待办已在设置里关闭', '打开后清单会回到这里', '去打开', 'data-action="settings:todo"');
  }
  const openItems = todos.filter((item) => !item.done);
  const doneItems = todos.filter((item) => item.done);
  const total = todos.length;
  const done = doneItems.length;
  const summary = {
    current: Number(todoSummaryState?.current) || openItems.length,
    due: Number(todoSummaryState?.due) || openItems.filter((item) => item.due && item.due < Date.now()).length,
    done: Number(todoSummaryState?.done) || done,
    total: Number(todoSummaryState?.total) || total,
  };
  const addRow = `<div class="todo-add pgm-todo-add">
      <input type="text" class="pgm-chip-button pgm-todo-input" placeholder="添加任务" aria-label="添加任务，回车保存" data-todo-input maxlength="200" />
      <label class="todo-prio-pick" title="优先级">
        <select data-todo-priority aria-label="优先级" data-priority="mid">
          <option value="high">高</option>
          <option value="mid" selected>中</option>
          <option value="low">低</option>
        </select>
      </label>
      <label class="todo-due-pick" title="设到期时间">
        <input type="datetime-local" data-todo-due />
        <span>到期</span>
      </label>
      <label class="todo-repeat-pick" title="重复">
        <select data-todo-repeat aria-label="重复">
          <option value="none">不重复</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="workday">工作日</option>
        </select>
      </label>
    </div>`;
  if (!total) {
    return `<div class="pgm-todo todo todo-blank-page">
      <div class="pgm-todo-count"><b>0/0</b><span>本周已完成</span>${addRow}</div>
      <div>
        <div class="pgm-summary-row"><span>当前任务 <b>0</b></span><span>到期 0</span></div>
        <p class="pgm-todo-empty">还没有待办，在上面的输入框写一条。</p>
      </div>
    </div>`;
  }
  const itemHtml = (item) => `<div class="pgm-check-row todo-item${item.done ? ' done is-done' : ''}" data-id="${item.id}" data-priority="${item.priority || 'mid'}">
      <button type="button" class="pgm-check-toggle todo-check" data-local="todo:toggle" data-id="${item.id}" aria-label="${item.done ? '标为未完成' : '完成'}">${item.done ? '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' : '<i></i>'}</button>
      <span class="todo-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
      <span class="pgm-check-meta">
        ${item.repeat ? `<em class="todo-repeat">${REPEAT_LABEL[item.repeat] ?? ''}</em>` : ''}
        ${item.due ? `<em class="todo-due${item.due < Date.now() && !item.done ? ' late' : ''}">${escapeHtml(item.displayDue || (item.done && item.nextDue ? '下次 ' + dueLabel(item.nextDue) : dueLabel(item.due)))}</em>` : '<em>今天</em>'}
        <button type="button" class="todo-del" data-local="todo:remove" data-id="${item.id}" aria-label="删除">×</button>
      </span>
    </div>`;
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  return `<div class="pgm-todo todo" data-progress="${pct}">
    <div class="pgm-todo-count">
      <b>${summary.done}/${summary.total}</b>
      <span>本周已完成</span>
      ${addRow}
    </div>
    <div>
      <div class="pgm-summary-row"><span>当前任务 <b>${summary.current}</b></span><span>到期 <b>${summary.due}</b></span></div>
      <div class="pgm-check-list todo-list">${openItems.slice(0, 4).map(itemHtml).join('')}</div>
      ${done ? `<button type="button" class="todo-clear pgm-summary-link pgm-visually-hidden" data-local="todo:clearDone">清空 ${done} 条已完成</button>` : ''}
    </div>
  </div>`;
}

const sizeLabel = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

/** The clipboard stays one row until the user opens it; this is UI state only. */
let clipboardExpanded = false;

const SHELF_GROUPS = ['未分组', '组 1', '组 2', '组 3', '组 4'];
const SHELF_CARET = svg('<path d="m9 6 6 6-6 6"/>');
const SHELF_CATEGORY_EXTENSIONS = {
  pdf: '设计',
  fig: '设计',
  sketch: '设计',
  svg: '角色',
  png: '待整理',
  jpg: '待整理',
  jpeg: '待整理',
  gif: '待整理',
  webp: '待整理',
  txt: '文本',
  md: '文本',
  doc: '文档',
  docx: '文档',
  zip: '归档',
};

/** A file's group index; anything unknown falls back to "未分组". */
function shelfGroupOf(file) {
  const value = Number(file?.group);
  return Number.isInteger(value) && value > 0 && value < SHELF_GROUPS.length ? value : 0;
}

function shelfFilesMatching() {
  const needle = shelfQuery.trim().toLowerCase();
  return needle ? shelfFiles.filter((file) => file.name.toLowerCase().includes(needle)) : shelfFiles;
}

/** A shelf row answers what the file is and how fresh it is, not just its
 * storage group and byte size. The group control still owns both of those
 * details through its title and accessible name. */
function shelfCategoryOf(file) {
  if (file?.category) return String(file.category);
  const extension = String(file?.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  return SHELF_CATEGORY_EXTENSIONS[extension] || '文件';
}

function shelfRelativeTime(file) {
  if (file?.relativeTime) return String(file.relativeTime);
  const modified = Number(file?.mtime ?? file?.modifiedAt);
  if (!Number.isFinite(modified) || modified <= 0) return '刚刚';
  const seconds = Math.max(0, Math.floor((Date.now() - modified) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 172_800) return '昨天';
  return `${Math.floor(seconds / 86_400)} 天前`;
}

/**
 * The scrolling half of the shelf: group heads plus file rows.
 *
 * Split out from shelfPage() so typing in the search box can replace just this
 * block. Re-rendering the page would destroy the input the user is typing in —
 * taking the caret, the IME candidate window and the focus with it.
 *
 * With a query the list is flat: every row already carries its group on the
 * chip, and a folded group would otherwise hide a match the search promised.
 */
function shelfListHtml() {
  const matches = shelfFilesMatching();
  const fileIcon = svg('<path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21V3a.5.5 0 0 1 .5-.5z"/><path d="M13 2.5V8h5"/>');
  const closeIcon = svg('<path d="m6 6 12 12M18 6 6 18"/>');
  /*
   * One row is 28px: a 16px file glyph, the name at reading size with an
   * ellipsis, the group chip and a 28px delete key. The size label lives in the
   * open key's tooltip — a third column did not fit.
   */
  const row = (file) => {
    const group = shelfGroupOf(file);
    const label = SHELF_GROUPS[group];
    const category = shelfCategoryOf(file);
    const age = shelfRelativeTime(file);
    const details = `${category} · ${age}`;
    return `<div class="pgm-file-row shelf-item" data-id="${escapeHtml(file.name)}">
            <span class="shelf-icon">${fileIcon}</span>
            <button type="button" class="shelf-open" data-local="shelf:open" data-name="${escapeHtml(file.name)}" title="打开 · ${sizeLabel(file.size)}">${escapeHtml(file.name)}</button>
            <span class="pgm-file-actions">
              <button type="button" class="shelf-group-pick" data-local="shelf:setGroup" data-name="${escapeHtml(file.name)}" data-group="${group}" title="${details} · ${sizeLabel(file.size)} · 分组：${label}，点按移到下一组" aria-label="${details}，${sizeLabel(file.size)}，分组：${label}，点按移到下一组">${details}</button>
              <button type="button" class="shelf-del" data-local="shelf:remove" data-name="${escapeHtml(file.name)}" aria-label="删除">${closeIcon}</button>
            </span>
          </div>`;
  };
  if (shelfQuery.trim()) {
    return matches.length
      ? matches.map(row).join('')
      : `<p class="shelf-noresult">没有匹配「${escapeHtml(shelfQuery.trim())}」的文件</p>`;
  }
  return matches.map(row).join('');
}

function shelfPage() {
  if (prefs.shelf?.enabled === false) {
    return stateBlock('warn', '置物架已关闭', '打开后可以把文件拖上来', '去打开', 'data-action="settings:todo"');
  }
  const clips = clipboardItems.map((item) => `<div class="clip-item">
      <button type="button" class="clip-text" data-local="clipboard:copy" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.text)} · 点击复制">${escapeHtml(clipLabel(item.text))}</button>
      <button type="button" class="clip-pin${item.pinned ? ' on' : ''}" data-local="clipboard:togglePin" data-id="${escapeHtml(item.id)}" aria-label="固定">★</button>
    </div>`).join('');
  const clipOpen = clipboardExpanded && clipboardItems.length > 0;
  const showClip = clipboardItems.length > 0 && prefs.shelf?.showClipboard !== false;
  const clipBlock = `<div class="clip pgm-shelf-clip${clipOpen ? ' clip-open' : ''}">
    <div class="clip-head">${clipboardItems.length
      ? `<button type="button" class="clip-fold" data-clipfold aria-expanded="${clipOpen}"><span>剪贴板</span><b>${clipboardItems.length} 条</b><span class="clip-caret${clipOpen ? ' on' : ''}">${SHELF_CARET}</span></button>`
      : '<p class="clip-fold-empty">剪贴板 · 复制文字后会出现在这里。</p>'}
      ${clipOpen ? '<button type="button" class="ghost" data-local="clipboard:clear">清空</button>' : ''}
    </div>
    ${clipOpen ? `<div class="clip-list">${clips}</div>` : ''}
  </div>`;
  const folderIcon = svg('<path d="M3.5 7.5h6l1.8 2H20.5v9.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M13 13v5M10.5 15.5h5"/>');
  return `<div class="pgm-shelf shelf${clipOpen ? ' shelf-clip-open' : ''}${showClip ? '' : ' shelf-no-clip'}" data-shelf-drop>
    <label class="pgm-shelf-head shelf-search">
      ${folderIcon}
      <input type="text" class="shelf-q" data-shelf-query value="${escapeHtml(shelfQuery)}" placeholder="${shelfFiles.length ? '搜索已置物文件' : '拖放文件到这里，自动保留来源信息'}" aria-label="搜索文件名或接收拖放文件" spellcheck="false" />
      <span class="shelf-drop-note">${shelfFiles.length ? '拖入文件' : '拖入后自动收纳'}</span>
    </label>
    <div class="pgm-file-list shelf-list">
      ${shelfFiles.length ? shelfListHtml() : '<p class="pgm-shelf-empty">置物架是空的。把文件拖进来，或复制文字到剪贴板。</p>'}
    </div>
    ${showClip ? clipBlock : ''}
  </div>`;
}

/** One line of the clipboard list: a copy is text, not a document. */
function clipLabel(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > 42 ? flat.slice(0, 42) + '…' : flat;
}

/**
 * Toggle one device's pin, then repaint from the prefs the main process returned.
 *
 * The reply is the whole preference object rather than a boolean: the cap and
 * the stored order live in one place, and rendering the answer it gives is what
 * keeps a fourth pin from appearing between the click and the next push.
 */
function pinDevice(name) {
  if (typeof api.pinDevice !== 'function' || !name) return;
  api.pinDevice(name).then((next) => {
    if (!next) return;
    prefs = next;
    applyPrefs();
    if (open) renderPage();
  }).catch(() => {});
}

/* The Bluetooth mark, drawn at 20px on every device row. */
const DEVICE_ICON = '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>';
/*
 * One star for both states: an outline when the row is free, filled when it is
 * pinned. Using the same glyph for the marker and the control keeps "this
 * device is pinned" and "pin this device" the same object — two shapes would
 * have to be told apart, and the row is 26px tall.
 */
const STAR_ICON = '<path d="m12 3.4 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>';

/*
 * Where a row's level came from, in words.
 *
 * The probe names the source because the level is not one property: Bluetooth
 * publishes it through DEVPKEY_Bluetooth_Battery, a 2.4G receiver usually has
 * no battery property at all, and that difference is exactly what makes a row
 * show a number or an em dash. Printing it in the row's title answers "why is
 * this one —" without adding a column.
 */
const DEVICE_SOURCE_LABEL = {
  bluetooth: '蓝牙',
  'hid-wireless': '2.4G 接收器（HID）',
  hid: 'USB / HID',
  wmi: 'WMI',
};

/**
 * Five rows is what the 217px page shows without scrolling. The list renders
 * every device and the page itself scrolls, so the sixth row is reachable
 * instead of hidden behind a count line — a ROG mouse that only answers after
 * its receiver wakes used to be the row that fell off.
 */
const DEVICE_ROWS = 5;
/** Three pins fit above the unpinned rows without pushing the fifth row out. */
/* The limit lives in the schema; a second copy here drifts the first time it
   changes. Wired through the existing import block. */
const DEVICE_PINS = DEVICE_PIN_LIMIT;

/**
 * Battery first, devices second.
 *
 * The level is the page's answer, so it owns the first line at 26px in tabular
 * figures; charging is one quiet caption under it, and the 4px bar closes the
 * block at about 64px. It used to be 30px over a taller gap, and that height
 * came straight out of the list: the block was the only part of the page that
 * could shrink, so it did, and the two rows it gave back are the rows the list
 * now shows.
 *
 * A device row is 26px: 20px glyph, name at 12.5 with an ellipsis, a 60x3 bar
 * and the number at 11 in tabular figures. A device with no battery property
 * still gets a row — "the headset is connected" is half the answer — with an
 * em dash where the number would be. Five rows is the capacity; the count line
 * carries the rest rather than a scrolling list that would hide the levels
 * below the fold.
 *
 * Two preferences shape the list. `devices.showBattery` swaps the meter and the
 * number for one connection word — the row still answers "is it connected",
 * which is the other half. `devices.pinned` lifts up to three devices to the
 * top in the order they were pinned and marks them with a star; the star is
 * also the control, so the marker and the action cannot disagree.
 *
 * The footer dot is a status, not a switch: the island cannot toggle the radio,
 * and a switch that only looks interactive is a false affordance. The row is
 * the page's one action instead: it opens the system's own Bluetooth page,
 * where the radio can actually be toggled. If that call fails the row is
 * disabled and says why, rather than staying a button that opens nothing.
 */
/**
 * Tell main whether the devices page is on screen.
 *
 * The vendor probe is expensive and a sleeping mouse answers all zeros, so it
 * only runs at its 30-second rate while someone is looking at the rows; the
 * call also triggers one probe as the page opens.
 */
function syncDevicesFocus() {
  const list = enabledPages();
  const current = list[pageIndex];
  const active = open && Boolean(current) && current.key === 'devices';
  api.devicesFocus?.(active);
}

/**
 * The refresh control: ask main for one vendor probe now.
 *
 * The reply is the list as it stands at hand-off, so it cannot be mistaken for
 * the probe's answer. That answer arrives through the normal devices push,
 * which is also why the control only shows its pending word until the call
 * returns - waiting for a slow HID sweep behind a spinner on a 217px page
 * would cost more than it tells.
 */
function refreshDevices() {
  if (devicesRefreshing) return;
  devicesRefreshing = true;
  if (open) renderPage();
  const settle = () => {
    devicesRefreshing = false;
    if (open) renderPage();
  };
  const call = api.devicesRefresh;
  if (typeof call !== 'function') {
    settle();
    return;
  }
  Promise.resolve(call()).then((value) => {
    if (value && Array.isArray(value.devices)) devicesState = value;
  }).catch(() => {}).then(settle);
}

function devicesPage() {
  const probed = devicesState?.devices ?? [];
  const scanning = devicesState?.scanning === true;
  /*
   * Hidden is a display decision, not a probe result: a hidden device stays
   * paired, keeps its level and keeps its pin, it just has no row here. The
   * filter lives in the schema so the settings page (which must still list it)
   * and this page agree on what "hidden" means.
   */
  const list = visibleDevices(probed, prefs.devices?.hidden);
  const showBattery = prefs.devices?.showBattery !== false;
  const pinned = Array.isArray(prefs.devices?.pinned) ? prefs.devices.pinned : [];
  /* One source for both the number and the bar: a missing battery is "-", not 0. */
  const knownLevel = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const level = Number(value);
    if (!Number.isFinite(level)) return null;
    return Math.max(0, Math.min(100, Math.round(level)));
  };
  const toneOf = (level) => (level === null ? '' : level < 20 ? ' bad' : level < 50 ? ' warn' : '');
  const level = knownLevel(battery?.level);
  const bluetoothOn = probed.length ? ' is-active' : '';
  const systemButton = systemOpenError
    ? '<button type="button" class="dev-foot" data-open-system="bluetooth" disabled>蓝牙</button>'
    : '<button type="button" class="dev-foot' + bluetoothOn + '" data-open-system="bluetooth" title="打开系统蓝牙设置">蓝牙</button>';
  const powerButton = '<button type="button" data-open-system="power" title="打开系统电源设置">电源</button>';
  const runtimeMinutes = level === null ? null : Math.max(1, Math.round(Number(level) * 3.62));
  const runtimeHours = runtimeMinutes === null ? null : Math.floor(runtimeMinutes / 60);
  const runtimeRest = runtimeMinutes === null ? null : runtimeMinutes % 60;
  const hero = `<div class="pgm-battery-large dev-hero">
      <span class="pgm-label">本机电量</span>
      <b class="dev-level">${level === null ? '—' : `${level}<span>%</span>`}</b>
      <span class="dev-charge">${level === null ? '电源模式：未知' : battery?.charging ? '电源模式：充电中' : '电源模式：均衡'}<br>${level === null ? '未检测到电池' : `约 ${runtimeHours} 小时 ${runtimeRest} 分`}</span>
      <div class="pgm-segment">${systemButton}${powerButton}</div>
    </div>`;
  if (!list.length) {
    /*
     * "Nothing paired" and "everything hidden" are different problems with
     * different ways back. Claiming no device is connected while the user hid
     * three of them would send them to the system Bluetooth sheet to fix a
     * setting on this app's own settings page.
     */
    const empty = probed.length
      ? stateBlock('good', '设备都隐藏了', '在设置 → 设备里重新显示', '去设置', 'data-action="settings:devices"')
      : scanning
        ? stateBlock('warn', '正在检测外设', '蓝牙与 HID 列表通常一秒内出现')
      : stateBlock('good', '没有已连接的蓝牙设备', '在系统蓝牙里配对后会显示', '去设置', 'data-action="settings:general"');
    /* The state line goes first, against the top: the battery block below it is
       this machine's own reading, not a device answer, and it stays. */
    return `<div class="pgm-device dev">
      ${hero}
      <div class="pgm-device-list dev-list">${empty}</div>
    </div>`;
  }
  /*
   * Pinned rows first, then the order the person dragged into place in
   * settings; a device the stored order has never seen keeps the probe's
   * order, so a newly paired one does not jump to the top.
   */
  const ordered = orderDevices(list, { pinned, order: prefs.devices?.order });
  /*
   * Every row is rendered. .dev-list is the scroll container (see island.css),
   * so the fifth row is where the viewport ends, not where the list ends: a
   * device below it stays reachable by scrolling instead of disappearing into
   * a count line that nothing can open. Because the list scrolls itself, its
   * selector is in WHEEL_OWNERS — otherwise the same wheel also turns the page.
   */
  const shown = ordered;
  const full = pinned.length >= DEVICE_PINS;
  const rows = shown
    .map((device) => {
      const isPinned = pinned.includes(device.name);
      const displayName = String(device.displayName || device.name);
      const deviceLevel = knownLevel(device.battery);
      const source = DEVICE_SOURCE_LABEL[device.source] || '';
      /*
       * The title carries the three facts a 26px row cannot: connection state,
       * whether a level exists at all, and where that level was read from.
       */
      const title = [
        displayName,
        device.status === 'OK' ? '已连接' : device.status || '已连接',
        showBattery ? (deviceLevel === null ? '电量不可读，显示为 —' : `电量 ${deviceLevel}%`) : '电量已隐藏',
        source ? `来源：${source}` : '',
      ].filter(Boolean).join(' · ');
      const right = showBattery
        ? `<span class="dev-bat${toneOf(deviceLevel)}">${deviceLevel === null ? '—' : deviceLevel + '%'}</span>`
        : `<span class="dev-conn">${device.status === 'OK' ? '已连接' : escapeHtml(device.status || '已连接')}</span>`;
      const pinTitle = isPinned ? '取消置顶' : full ? `已置顶 ${DEVICE_PINS} 台，先取消一台` : '置顶（最多 3 台）';
      return `<div class="pgm-device-row dev-item${isPinned ? ' pinned' : ''}" title="${escapeHtml(title)}">
        <i aria-hidden="true"></i>
        <button type="button" class="dev-name" data-pin="${escapeHtml(device.name)}" aria-pressed="${isPinned}" aria-label="${isPinned ? '取消置顶' : '置顶'} ${escapeHtml(displayName)}" title="${pinTitle}"${!isPinned && full ? ' disabled' : ''}>
          ${isPinned ? `<span class="dev-pin-mark" aria-hidden="true">${svg(STAR_ICON)}</span>` : ''}${escapeHtml(displayName)}
        </button>
        ${right}
      </div>`;
    })
    .join('');
  return `<div class="pgm-device dev">
    ${hero}
    <div class="pgm-device-list dev-list">${rows}</div>
    ${ordered.length > DEVICE_ROWS ? `<div class="dev-more">共 ${ordered.length} 台 · 滚动查看</div>` : ''}
  </div>`;
}

const RENDERERS = {
  devices: devicesPage,
  music: musicPage,
  weather: weatherPage,
  quota: quotaPage,
  mail: mailPage,
  focus: focusPage,
  todo: todoPage,
  health: healthPage,
  shelf: shelfPage,
  calendar: calendarPage,
  messenger: messengerPage,
};

/** Replace local state from any snapshot (bootstrap, push or action reply). */
/**
 * Push every visual preference into CSS variables.
 *
 * Settings writes prefs; this is the only place that turns them into pixels.
 * Adding a knob is then two lines here plus one row in settings — not a new
 * state path.
 */
function resolveTheme() {
  const theme = prefs.theme ?? 'dark';
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The skin the island currently paints; null until the boot paint. */
let appliedSkin = null;

/**
 * One 120ms cross-fade on a skin switch.
 *
 * The frame is dropped to 0.72 with transitions off, then handed back to the
 * stylesheet one frame later: opacity goes 0.72 → 1 through the 120ms opacity
 * transition on #frame instead of repainting as a jump cut. Dropping the
 * transition for that first write matters — with it on, setting 0.72 starts a
 * 1 → 0.72 transition, the restore then reverses a half-finished one, and the
 * visible result is a 6ms bounce that never reaches 0.72.
 *
 * Opacity only: no layout number and no hit area moves, and the morph clock is
 * untouched (that lives on #island, this is #frame). Under reduced motion the
 * stylesheet keeps the transition off (its rules are !important), so the two
 * values land in one style pass — the new skin simply appears.
 *
 * Both inline values are cleared rather than written to 1, so nothing is left
 * outranking the skin rules or the reduce-motion rules afterwards.
 */
function crossFadeSkin() {
  const frame = document.getElementById('frame');
  if (!frame) return;
  frame.style.transition = 'none';
  frame.style.opacity = '0.72';
  // Lock the drop in before the transition comes back, or the same style pass
  // would still see a 1 → 0.72 change and animate it.
  void frame.offsetWidth;
  requestAnimationFrame(() => {
    frame.style.transition = '';
    frame.style.opacity = '';
  });
}

function applyPrefs() {
  const root = document.documentElement;
  root.style.setProperty('--radius', `${Number(prefs.radius) || 22}px`);
  root.style.setProperty('--island-w', `${Number(prefs.islandWidth) || 420}px`);
  /*
   * Scaling the content, not the window: the island measures its own content
   * and resizes the window to match, so a CSS transform would scale the box
   * without changing the layout and leave the two out of sync. Type and chrome
   * grow together here and the measurement follows.
   */
  const scale = Math.min(1.4, Math.max(0.8, (Number(prefs.uiScale) || 100) / 100));
  root.style.setProperty('--pill-h', `${(Number(prefs.pillHeight) || 34) * scale}px`);
  root.style.setProperty('--ui-scale', String(scale));
  const fonts = {
    system: '"MiSans", "MiSans VF", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    pingfang: '"MiSans", "MiSans VF", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    yahei: '"MiSans", "MiSans VF", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif',
    mono: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  };
  root.style.setProperty('--ui-font', fonts[prefs.font] ?? fonts.system);
  root.style.setProperty('--ui-size', `${(13 + (Number(prefs.fontSize) || 0)) * scale}px`);
  root.style.setProperty('--ui-weight', String(prefs.weight || 400));
  const skin = prefs.skin ?? 'frost';
  // The boot paint has nothing to fade from; every later skin value is a switch.
  if (appliedSkin !== null && appliedSkin !== skin) crossFadeSkin();
  appliedSkin = skin;
  document.body.dataset.skin = skin;
  document.body.dataset.blur = prefs.blur === false ? 'off' : 'on';
  /* Kept as a call so a future material has one place to hook into; the glass
     itself was removed (see the no-glass section). */
  syncGlassMaterial();
  document.body.dataset.motion = prefs.motion === false ? 'off' : 'on';
  document.body.dataset.reduceMotion = prefs.reduceMotion === true ? 'on' : 'off';
  for (const face of document.querySelectorAll('emojitot-ball[live]')) {
    face.toggleAttribute(
      'paused',
      prefs.reduceMotion === true || prefs.motion === false,
    );
  }
  document.body.dataset.theme = resolveTheme();
  /* The visible material is CSS-only; this remains a compatibility signal. */
  document.body.dataset.material = windowMaterial;
  timeFormat24 = prefs.timeFormat !== '12h';
  schedulePillWidth();
}

function applyLocal(snapshot) {
  if (!snapshot) return;
  if (snapshot.focus) focusState = snapshot.focus;
  if (snapshot.health) healthState = snapshot.health;
  if (Array.isArray(snapshot.todos)) todos = snapshot.todos;
  if (Array.isArray(snapshot.shelf)) {
    shelfFiles = snapshot.shelf;
    /* The search box only exists while something can be filtered. */
    if (!shelfFiles.length) shelfQuery = '';
  }
  if (Array.isArray(snapshot.clipboard)) clipboardItems = snapshot.clipboard;
  if (snapshot.messenger) messengerState = snapshot.messenger;
  if (snapshot.devices) devicesState = snapshot.devices;
}

/** +1 = next page, -1 = previous; the panel slides in from the side it came from. */
let pageDir = 1;

function stepPage(delta, animate = true) {
  const list = enabledPages();
  if (list.length <= 1 || !Number.isFinite(delta) || delta === 0) return false;
  const current = Math.max(0, Math.min(pageIndex, list.length - 1));
  const next = Math.max(0, Math.min(current + Math.sign(delta), list.length - 1));
  if (next === current) {
    pageIndex = current;
    return false;
  }
  pageDir = next > current ? 1 : -1;
  pageIndex = next;
  /* Announce the successful switch once. renderPage() writes the very same
     string for its other repaint paths, so the live region is not spoken twice;
     a failed step (next === current above) never reaches this line. */
  const announcer = document.getElementById('page-announcer');
  if (announcer) {
    const spoken = `${list[next].title}，第 ${next + 1} 页，共 ${list.length} 页`;
    if (announcer.textContent !== spoken) announcer.textContent = spoken;
  }
  renderPage(animate);
  return true;
}

const NOTIFICATION_MS = 3500;

function notificationPageHtml() {
  const title = String(notificationState?.title || '通知');
  const body = String(notificationState?.body || '当前页面将在 3.5 秒后恢复');
  return `<div class="pgm-notification" role="status" aria-live="polite">
    <span class="pgm-notification-cast" aria-hidden="true"><emojitot-ball cast="${escapeHtml(activeCastId)}" size="28" state="idle"></emojitot-ball></span>
    <div class="pgm-notification-copy">
      <b>${escapeHtml(title)}</b>
      <span>${escapeHtml(body)}</span>
    </div>
    <span class="pgm-notification-mark" aria-hidden="true">${svg('<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15zM19 4l.5 1.5L21 6l-1.5.5L19 8l-.5-1.5L17 6l1.5-.5L19 4z"/>')}</span>
  </div>`;
}

function notificationPillHtml() {
  return `<span class="stat now-playing-pill pgm-notification-pill" data-kind="notification" title="${escapeHtml(notificationState?.title || '通知')}">
    <span class="now-playing-pill__text">${escapeHtml(notificationState?.title || '通知')}</span>
    <span class="now-playing-pill__track">3.5 秒后恢复</span>
  </span>`;
}

function clearNotificationTimer() {
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = 0;
}

function finishNotification() {
  clearNotificationTimer();
  notificationState = null;
  if (open) {
    renderPage();
    pagesEl.scrollTop = notificationReturnScroll;
  } else {
    renderPillStatus();
  }
}

function receiveNotification(value) {
  if (!value || (prefs.notify?.system === false)) return;
  const title = String(value.title || '').trim();
  if (!title) return;
  if (!notificationState) notificationReturnScroll = pagesEl.scrollTop || 0;
  notificationState = {
    title,
    body: prefs.notify?.body === false ? '' : String(value.body || '').trim(),
    at: Number(value.at) || Date.now(),
  };
  clearNotificationTimer();
  if (open) renderPage();
  else renderPillStatus();
  notificationTimer = setTimeout(finishNotification, NOTIFICATION_MS);
}

function renderPage(animate = false) {
  stopAgentClock();
  const list = enabledPages();
  // A new page is a new DOM: the old panel (and its open state) is gone.
  volumePanelOpen = false;
  cancelSeek();
  if (!list.length) {
    document.body.dataset.pages = '0';
    delete pagesEl.dataset.page;
    titleEl.textContent = '还没有页面';
    titleEl.dataset.over = 'false';
    subEl.textContent = '去设置里打开';
    subEl.dataset.muted = 'false';
    subEl.dataset.over = 'false';
    pagesEl.innerHTML = stateBlock('warn', '页面都是关的', '在设置 → 页面管理里打开', '打开设置', 'data-action="settings:pages"');
    dotsEl.innerHTML = '';
    dotsEl.hidden = true;
    if (pageCountEl) pageCountEl.textContent = '00 / 00';
    const announcer = document.getElementById('page-announcer');
    if (announcer && announcer.textContent !== '还没有页面') announcer.textContent = '还没有页面';
    for (const pager of document.querySelectorAll('.pager')) {
      pager.hidden = true;
      pager.disabled = true;
    }
    measure();
    return;
  }
  // Bounded navigation: leaving the last page requires a deliberate wrap path,
  // not an accidental click on a disabled control.
  pageIndex = Math.max(0, Math.min(pageIndex, list.length - 1));
  document.body.dataset.pages = String(list.length);
  const page = list[pageIndex];
  const showingNotification = Boolean(notificationState);
  pagesEl.dataset.page = showingNotification ? 'notification' : page.key;
  /* The menu belongs to the weather page; paging away drops it. */
  if (page.key !== 'weather') cityMenuOpen = false;
  const nameEl = document.getElementById('page-name');
  if (nameEl) nameEl.textContent = page.title;
  renderHeader();
  renderSub();
  if (showingNotification) {
    titleEl.textContent = '临时通知';
    subEl.textContent = '当前页面将在 3.5 秒后恢复';
    pagesEl.innerHTML = notificationPageHtml();
  } else {
    pagesEl.innerHTML = (RENDERERS[page.key] ?? ((p) => fallbackPage(p)))(page);
    startAgentClock();
  }
  dotsEl.innerHTML = list
    .map((p, index) => `<i class="dot${index === pageIndex ? ' is-active' : ''}" data-page="${index}" aria-current="${index === pageIndex}" title="${p.title}"></i>`)
    .join('');
  const paging = pagingVisibility(list.length);
  document.body.dataset.pages = String(list.length);
  if (pageCountEl) {
    pageCountEl.textContent =
      String(pageIndex + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0');
  }
  /* Announce the switch once per distinct page. renderPage() also runs on data
     refreshes, so rewriting the same string would spam the live region. */
  const announcer = document.getElementById('page-announcer');
  if (announcer) {
    const spoken = `${page.title}，第 ${pageIndex + 1} 页，共 ${list.length} 页`;
    if (announcer.textContent !== spoken) announcer.textContent = spoken;
  }
  dotsEl.hidden = !paging.dots;
  for (const pager of document.querySelectorAll('.pager')) {
    pager.hidden = !paging.arrows;
    pager.disabled = pager.dataset.pageNav === '-1' ? pageIndex === 0 : pageIndex === list.length - 1;
  }
  if (animate) {
    pagesEl.classList.remove('page-in-left', 'page-in-right');
    // Force a style flush so re-adding the class restarts the animation even
    // when two consecutive switches use the same direction.
    void pagesEl.offsetWidth;
    pagesEl.classList.add(pageDir > 0 ? 'page-in-left' : 'page-in-right');
  }
  measure();
  if (open && !morph && !preparing) scheduleOpenStageRecovery();
  syncDevicesFocus();
}

/*
 * Scrolling inside a scrollable block must stay there.
 *
 * The wheel handler that flips pages sits on #panel, above every page, so a
 * wheel over an inner list both scrolled that list and turned the page. Stopping
 * propagation at the list is the narrowest fix: everywhere else the wheel still
 * pages as before.
 *
 * The named lists are every block that scrolls inside the 217px page today —
 * clipboard, shelf, todo, mailbox, devices, message centre. Devices belonged to
 * this rule from the day .dev-list got its own scrollbar and did not get the
 * name: a wheel over the sixth device turned the page under the pointer.
 *
 * The second arm states the rule the names cannot: anything inside #pages that
 * scrolls vertically owns its own wheel, so the next page that caps a block and
 * lets it scroll is isolated without editing this list. #pages is excluded on
 * purpose — that box is where paging itself lives, and swallowing its wheel
 * would kill paging on any page whose content overflows it.
 *
 * The scrollHeight gate is what makes the boundary absolute: once the list is
 * at its end the wheel is still swallowed, so it never leaks to the pager, and
 * a wheel over a list with nothing to scroll still pages as it always did.
 */
const WHEEL_OWNERS =
  '.clip-list, .shelf-list, .todo-list, .dev-list, .msg-list, .mail-page, .mail, .quota-scroll';

/** The page-level scroll block under the pointer, or null when the wheel pages. */
function wheelOwner(target) {
  if (!(target instanceof Element)) return null;
  const named = target.closest(WHEEL_OWNERS);
  if (named) return named;
  for (let el = target; el && el !== pagesEl; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
  }
  return null;
}

document.addEventListener(
  'wheel',
  (event) => {
    /* A city menu is a modal choice: paging away under it would close the menu
       and land somewhere else in one wheel tick. */
    if (cityMenuOpen) {
      event.stopPropagation();
      return;
    }
    const list = wheelOwner(event.target);
    if (list && (list.matches('.quota-scroll') || list.scrollHeight > list.clientHeight + 1)) {
      // The workbench's lower block is a strict wheel boundary: even when it
      // has nothing to scroll, a wheel there must not turn the page.
      event.stopPropagation();
    }
  },
  { capture: true },
);

/*
 * The capsule stretches into the panel — one object, not two.
 *
 * The island's box is the model: the driver below writes its own width and
 * height every frame, then paints the panel at that box. The panel is already
 * laid out at its final size, so painting it at scale(box / target) closes the
 * gap between what the OS shows and what the page has drawn; without it the
 * panel is wider than the window for the length of the morph and the OS clips
 * both of its sides — the 'hard cut' seen on every open.
 *
 * Why the box is stepped here instead of by a CSS transition:
 *
 * - The two axes do not share a schedule (width lands at 60% of the open, the
 *   height starts at 15%), so one property list was always two clocks. In JS
 *   the panel's scale and the box read the same numbers in the same frame, with
 *   nothing to drift between the surface and its content.
 * - The CSS transition could not be reversed during the 240ms fold: setOpen
 *   returned while `closing`, so a second intention was dropped. A driver can
 *   re-target from the box on screen on any frame; each axis restarts from its
 *   current value, which is the continuity a re-written CSS transition gets.
 * - The reduce-motion path used to write `transition: none` for the first
 *   paint and hand it back on the next rAF. When the window was still hidden
 *   that rAF never ran and the inline rule survived, so the first open after a
 *   cold start had no morph at all. There is no inline rule to leak now.
 *
 * The panel's scale is deliberately not uniform: the two axes travel different
 * distances and a uniform scale could not land on both end boxes. The content
 * therefore separates only as much as the two tracks differ, and opacity hides
 * the squash where it is worst (paintMorph).
 *
 * Timings are the ones island.css used to carry (--morph-*). Open: width
 * 240ms, height 340ms after a 60ms delay, 400ms end to end. Close: height
 * 190ms first, width 210ms after 30ms, 240ms — dismissing is quicker than
 * arriving, and the card drains downwards before it narrows.
 */
const ISLAND_SPRING = Object.freeze({ mass: 1, stiffness: 520, damping: 34.2 });
const MORPH_SETTLE_MS = 320;
const MORPH_GUARD_MS = 520;

let morphFrame = 0;
/** Fires if the rAF chain dies mid-flight (hidden or occluded window). */
let morphGuard = 0;
/* A delayed IPC reply must not leave the panel painted inside the pill stage. */
let openStageTimers = new Set();
/** True from the moment a fold starts until the pill is the surface again. */
let closing = false;
/** Monotonic token so a delayed native resize cannot start a stale morph. */
let morphIntent = 0;
/*
 * The hand-off after a close keeps the expanded native surface for two painted
 * frames. Hiding the panel and shrinking a transparent Windows window in the
 * same task lets DWM present the new bounds with the old swap chain still
 * attached, which is the large rounded ghost in the report. Once the compact
 * frame has actually reached the compositor, the smaller native box is safe to
 * report.
 */
const COLLAPSE_RESIZE_GUARD_MS = 180;
let collapseResizeHeld = false;
let collapseResizeFrames = new Set();
let collapseResizeGuard = 0;

function cancelCollapseResizeHold() {
  for (const frame of collapseResizeFrames) cancelAnimationFrame(frame);
  collapseResizeFrames = new Set();
  if (collapseResizeGuard) clearTimeout(collapseResizeGuard);
  collapseResizeGuard = 0;
  collapseResizeHeld = false;
}

function holdCollapsedNativeResize() {
  cancelCollapseResizeHold();
  collapseResizeHeld = true;
  const finish = () => {
    if (!collapseResizeHeld || open || morph || preparing) return;
    cancelCollapseResizeHold();
    reportBoxNow({ force: true });
    measure();
  };
  const secondFrame = () => {
    const frame = requestAnimationFrame(finish);
    collapseResizeFrames.add(frame);
  };
  const firstFrame = requestAnimationFrame(() => {
    const frame = requestAnimationFrame(secondFrame);
    collapseResizeFrames.add(frame);
  });
  collapseResizeFrames.add(firstFrame);
  collapseResizeGuard = setTimeout(finish, COLLAPSE_RESIZE_GUARD_MS);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** 0→1 with no corners: carries opacity, never the box. */
const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/*
 * The public calibration remains k=520, c=32, m=1 (response 0.2755 s,
 * damping fraction 0.7016, 4.54% overshoot). The shipped surface uses c=34.2:
 * the damping fraction becomes 0.750 and overshoot falls to ~2.95%, without
 * materially lengthening the same ~0.27 s perceptual response.
 */

/** The radius the panel rests at, read from the preference the stylesheet publishes. */
function panelRadius() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius'));
  return Number.isFinite(value) ? value : 22;
}

function clearMorphStyles() {
  islandEl.style.width = '';
  islandEl.style.height = '';
  islandEl.style.transition = '';
  frameEl.style.width = '';
  frameEl.style.height = '';
  panelEl.style.width = '';
  panelEl.style.height = '';
  panelEl.style.opacity = '';
  panelEl.style.borderRadius = '';
  panelEl.style.clipPath = '';
  if (panelBodyEl) {
    panelBodyEl.style.width = '';
    panelBodyEl.style.height = '';
    panelBodyEl.style.opacity = '';
  }
  pillEl.style.opacity = '';
}

/** Drop the painted box and return every surface to its natural layout. */
function stopMorph() {
  if (morphFrame) cancelAnimationFrame(morphFrame);
  morphFrame = 0;
  if (morphGuard) clearTimeout(morphGuard);
  morphGuard = 0;
  morph = null;
  preparing = null;
  delete document.body.dataset.preparing;
  delete document.body.dataset.morphing;
  clearMorphStyles();
}

/** Paint one frame from the single spring progress. */
function paintMorph() {
  const m = morph;
  const progress = clamp01(m.progress);
  const geometry = geometryAt(m.compact, m.expanded, progress);
  const width = Math.max(1, geometry.width);
  const height = Math.max(1, geometry.height);
  const radius = Math.max(0, geometry.radius);
  islandEl.style.width = `${width}px`;
  islandEl.style.height = `${height}px`;
  panelEl.style.width = `${width}px`;
  panelEl.style.height = `${height}px`;
  panelEl.style.borderRadius = `${radius}px`;
  panelEl.style.clipPath = `inset(0 round ${radius}px)`;
  panelEl.style.opacity = '1';
  /*
   * The content layer stays at its natural size and position. The panel's
   * rounded clipping box supplies every visible change, so there is no inverse
   * transform and no one-frame disagreement between the shell and character.
   */
  if (panelBodyEl) {
    panelBodyEl.style.opacity = String(smoothstep((m.progress - 0.08) / 0.34));
  }
  pillEl.style.opacity = String(1 - smoothstep((m.progress - 0.015) / 0.25));
  reportHit();
}

function retargetMorph(open, nowMs) {
  morph.open = open;
  morph.startedAt = nowMs;
  morph.spring.retarget(open ? 1 : 0, nowMs / 1000);
  morph.progress = morph.spring.sample(nowMs / 1000).position;
}

function createMorphState(open, compact, expanded) {
  const now = performance.now();
  return {
    open,
    compact,
    expanded,
    startedAt: now,
    progress: open ? 0 : 1,
    spring: createSpring({
      ...ISLAND_SPRING,
      from: open ? 0 : 1,
      target: open ? 1 : 0,
      startedAt: now / 1000,
    }),
  };
}

function cancelOpenStageRecovery() {
  for (const timer of openStageTimers) clearTimeout(timer);
  openStageTimers = new Set();
}

/**
 * Verify the native stage after the morph has landed.
 *
 * `prepareBox()` has a timeout below, but Windows can still acknowledge a
 * setBounds call before DWM has presented it. A few bounded retries recover
 * from that transient state; they never run while a morph owns the surface and
 * stop immediately when the panel closes.
 */
function scheduleOpenStageRecovery() {
  cancelOpenStageRecovery();
  for (const delay of [0, 90, 260, 700]) {
    const timer = setTimeout(() => {
      openStageTimers.delete(timer);
      if (!open || morph || preparing || closing || panelEl.hidden) return;
      const panel = {
        width: Math.ceil(panelEl.offsetWidth),
        height: Math.ceil(panelEl.offsetHeight),
      };
      if (
        stageNeedsRecovery(
          { width: window.innerWidth, height: window.innerHeight },
          panel,
          0,
          0,
          1,
        )
      ) {
        api.reportBox(panel);
        reportHit();
      }
    }, delay);
    openStageTimers.add(timer);
  }
}

/**
 * Grow the native window before painting the first open frame.
 *
 * The invoke normally answers in one task. A stuck renderer/main reply used to
 * hold `preparing` forever, which made every later measurement return early and
 * left the full panel clipped to the compact capsule. The deadline is long
 * enough for a loaded IPC queue and short enough to be invisible.
 */
async function prepareNativeBox(expanded) {
  const box = { w: expanded.width, h: expanded.height };
  let timer = 0;
  try {
    const prepared = await Promise.race([
      api.prepareBox(box).then(() => true).catch(() => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 220);
      }),
    ]);
    if (!prepared) api.reportBox(box);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run one spring on the compact/expanded pair.
 *
 * An existing spring is retargeted in place, which preserves both position and
 * velocity. A first run creates the analytic state at compact (opening) or
 * expanded (closing).
 */
function startMorph(open, compact, expanded, content) {
  if (!compact?.width || !compact?.height || !expanded?.width || !expanded?.height) return false;
  document.body.dataset.morphing = 'true';
  islandEl.style.transition = 'none';
  frameEl.style.width = `${expanded.width}px`;
  frameEl.style.height = `${expanded.height}px`;
  if (panelBodyEl && content?.width && content?.height) {
    panelBodyEl.style.width = `${content.width}px`;
    panelBodyEl.style.height = `${content.height}px`;
  }
  if (!morph) morph = createMorphState(open, compact, expanded);
  else {
    morph.compact = compact;
    morph.expanded = expanded;
    retargetMorph(open, performance.now());
  }
  paintMorph();
  if (morphFrame) cancelAnimationFrame(morphFrame);
  const step = (now) => {
    const m = morph;
    if (!m) return;
    const sample = m.spring.sample(now / 1000);
    m.progress = sample.position;
    paintMorph();
    if (now - m.startedAt >= MORPH_SETTLE_MS) settleMorph();
    else morphFrame = requestAnimationFrame(step);
  };
  morphFrame = requestAnimationFrame(step);
  if (morphGuard) clearTimeout(morphGuard);
  morphGuard = setTimeout(() => {
    morphGuard = 0;
    if (morph) settleMorph();
  }, MORPH_GUARD_MS);
  return true;
}

/** Land the running morph on the exact target, never on a stale sample. */
function settleMorph() {
  if (morphFrame) cancelAnimationFrame(morphFrame);
  morphFrame = 0;
  if (morphGuard) clearTimeout(morphGuard);
  morphGuard = 0;
  const wasOpen = morph ? morph.open : false;
  morph = null;
  preparing = null;
  delete document.body.dataset.preparing;
  delete document.body.dataset.morphing;
  clearMorphStyles();
  if (wasOpen) {
    landOpen();
  } else {
    landClosed();
  }
}

/** Land directly on the open panel when there is no spring to run. */
function landOpen() {
  closing = false;
  islandEl.dataset.closing = 'false';
  cancelCollapseResizeHold();
  stopMorph();
  pillEl.hidden = true;
  panelEl.hidden = false;
  syncSize();
  reportBoxNow();
  reportHit();
  measure();
  requestGlass();
  scheduleOpenStageRecovery();
}

/*
 * The close, on the same driver as the open.
 *
 * Closing used to be a state flip: the panel was hidden in the same task and
 * the only thing left moving was the pill's own entrance — the card did not
 * fold, it ceased to exist. The fold now retargets the same spring towards the
 * pill's compact geometry.
 *
 * The native window stays at the panel's box while the card folds inside it.
 * Resizing the OS window on every frame reads as a cut: the page can lay out a
 * frame or two behind the window, so the still-visible card would be clipped
 * and shoved sideways during its own animation. After the compact frame has
 * painted, holdCollapsedNativeResize reports the smaller box. What follows the
 * fold immediately is the hit box (reportHit): the wide transparent margin the
 * fold leaves behind may never swallow a click.
 *
 * The pill is not shown until the hand-off. It stays laid out out of flow (see
 * #island[data-closing] in island.css) at opacity 0, and fades in over the
 * last stretch; by then the panel has reached the pill's own box, so the swap
 * is one silhouette dissolving into the other, not a change of shape.
 */
function closeMorph() {
  if (preparing) {
    preparing = null;
    landClosed();
    return;
  }
  /*
   * The pill may have received a new title while it was hidden behind the
   * panel. Size it once, invisibly, before sampling the compact geometry; the
   * fold then has an exact destination instead of landing on last render's
   * width and jumping when the status observer catches up.
   */
  if (!morph) {
    closing = false;
    pillEl.hidden = false;
    syncPillWidth({ immediate: true });
  }
  closing = true;
  islandEl.dataset.closing = 'true';
  pillEl.style.animation = 'none';
  pillEl.hidden = false;
  pillEl.style.opacity = '0';
  const pillW = Math.ceil(pillEl.offsetWidth);
  const pillH = Math.ceil(pillEl.offsetHeight);
  const compact = { width: pillW, height: pillH, radius: Math.ceil(Math.min(pillW, pillH) / 2) };
  const expanded = {
    width: Math.ceil(panelEl.offsetWidth),
    height: Math.ceil(panelEl.offsetHeight),
    radius: panelRadius(),
  };
  const content = panelBodyEl
    ? { width: Math.ceil(panelBodyEl.offsetWidth), height: Math.ceil(panelBodyEl.offsetHeight) }
    : null;
  if (!pillW || !pillH || !expanded.width || !expanded.height) return landClosed();
  if (morph) retargetMorph(false, performance.now());
  if (!startMorph(false, compact, expanded, content)) landClosed();
}

/** Land the fold: the pill is the surface now, and every report follows it. */
function landClosed() {
  closing = false;
  islandEl.dataset.closing = 'false';
  clearGlass();
  panelEl.hidden = true;
  pillEl.hidden = false;
  pillEl.style.animation = 'none';
  stopMorph();
  syncPillWidth({ immediate: true });
  syncAvoidVisual();
  syncSize();
  reportHit();
  holdCollapsedNativeResize();
}

/* ------------------------------------------------------------- no glass */

/*
 * The photographed glass used to live here: the main process captured the
 * display, this painted that frame behind the card, and a tint sat over it.
 * The user asked for the flat board back — the capture path brought flicker,
 * a stale frame after any window move, and a content-protection toggle that
 * recomposited the window. Nothing is captured now; both surfaces paint
 * --card-solid. The names stay because the call sites sit inside the fold and
 * resize paths, and an empty implementation is the whole behaviour.
 */
function clearGlass() {}
function requestGlass() {}
function scheduleGlassRefresh() {}
function syncGlassMaterial() {}
async function setOpen(next) {
  const opening = next === true && !open;
  const folding = next === false && open;
  /* Already there, or the same toggle twice: nothing to move. */
  if (!opening && !folding) return;
  if (folding) cancelOpenStageRecovery();
  cancelCollapseResizeHold();
  /* Folding releases the photograph in the same task: a full-screen bitmap has
     no business outliving the panel that shows it. */
  if (folding) clearGlass();
  /*
   * A fold under reduced motion, or while a listed app covers the island, is
   * a state change, not an animation: it has to land in this same task so the
   * measurement below describes the surface the user ends up with.
   */
  const animated = document.body.dataset.motion !== 'off';
  /* A folded island has no menu: reopening starts from the reading. */
  if (folding) cityMenuOpen = false;
  const intent = ++morphIntent;
  open = next;
  islandEl.dataset.open = String(open);
  /* Only the devices page needs the vendor probe awake. */
  syncDevicesFocus();
  pillEl.setAttribute('aria-expanded', String(open));
  if (opening) {
    if (morph) {
      closing = false;
      islandEl.dataset.closing = 'false';
      retargetMorph(true, performance.now());
      syncAvoidVisual();
      reportHit();
      return;
    }
    const fold = (document.body.dataset.avoid === '1' ? frameEl : pillEl).getBoundingClientRect();
    const compact = {
      width: Math.ceil(fold.width),
      height: Math.ceil(fold.height),
      radius: Math.ceil(Math.min(fold.width, fold.height) / 2),
    };
    closing = false;
    islandEl.dataset.closing = 'false';
    /*
     * Keep the pill out of the flex row while measuring the panel. Now that
     * #frame has a fixed width, two visible flex items would shrink the panel
     * from 420px to the leftover 252px, and the native stage would be prepared
     * at that wrong width. The pill comes back after the measurement, under the
     * same absolute layout the morph uses.
     */
    pillEl.hidden = true;
    panelEl.hidden = false;
    preparing = { intent };
    renderPage();
    /*
     * Measure the resting panel before installing the morph layout. The morph
     * makes .panel-body absolute so it can stay still while the rounded shell
     * grows; leaving that rule on during this read removed the body from flow
     * and collapsed the panel height to its padding. The window then grew only
     * in width, clipping the lower content until the next measurement.
     */
    const expanded = {
      width: Math.ceil(panelEl.offsetWidth),
      height: Math.ceil(panelEl.offsetHeight),
      radius: panelRadius(),
    };
    const content = panelBodyEl
      ? { width: Math.ceil(panelBodyEl.offsetWidth), height: Math.ceil(panelBodyEl.offsetHeight) }
      : null;
    /*
     * Keep the resting panel measurable until the native window has already
     * grown. `preparing` uses the same absolute layout rules as a morph, but
     * the test and, more importantly, the first visible spring frame only see
     * `data-morphing` after setBounds has completed.
     */
    document.body.dataset.preparing = 'true';
    pillEl.hidden = false;
    frameEl.style.width = `${expanded.width}px`;
    frameEl.style.height = `${expanded.height}px`;
    if (panelBodyEl) {
      panelBodyEl.style.width = `${content.width}px`;
      panelBodyEl.style.height = `${content.height}px`;
      panelBodyEl.style.opacity = '0';
    }
    islandEl.style.width = `${compact.width}px`;
    islandEl.style.height = `${compact.height}px`;
    panelEl.style.width = `${compact.width}px`;
    panelEl.style.height = `${compact.height}px`;
    panelEl.style.borderRadius = `${compact.radius}px`;
    panelEl.style.clipPath = `inset(0 round ${compact.radius}px)`;
    pillEl.style.opacity = '1';
    if (typeof api.prepareBox === 'function') await prepareNativeBox(expanded);
    else api.reportBox({ w: expanded.width, h: expanded.height });
    if (intent !== morphIntent || !open) {
      preparing = null;
      delete document.body.dataset.preparing;
      if (!open) landClosed();
      return;
    }
    preparing = null;
    delete document.body.dataset.preparing;
    if (!animated || avoiding) {
      landOpen();
    } else if (!startMorph(true, compact, expanded, content)) {
      open = false;
      islandEl.dataset.open = 'false';
      landClosed();
    }
  } else if (animated && !avoiding) {
    closeMorph();
    return;
  } else {
    pillEl.hidden = false;
    panelEl.hidden = true;
    closing = false;
    islandEl.dataset.closing = 'false';
    stopMorph();
  }
  /* Opening leaves the strip state (and unfreezes the box reports); closing it
     while a listed app still covers the island puts the strip back. */
  /*
   * Closing while a listed app still covers the island: read the *normal pill*
   * layout once (the strip keeps the pill out of flow measurements), report
   * that box, and only then collapse.
   */
  if (!open && avoiding) {
    document.body.dataset.avoid = '0';
    const pillBox = frameEl.getBoundingClientRect();
    if (pillBox.width && pillBox.height) {
      api.reportBox({ w: Math.ceil(pillBox.width), h: Math.ceil(pillBox.height) });
    }
  }
  syncAvoidVisual();
  /*
   * Size the wrapper here instead of trusting the frame's ResizeObserver to
   * fire on time. Opening swaps a hidden pill for a visible panel; the observer
   * kept reporting the collapsed frame and the wrapper stayed at the collapsed
   * width, so the window never grew and the panel spilled outside it.
   */
  syncSize();
  if (!open && !avoiding) holdCollapsedNativeResize();
  else reportBoxNow();
  reportHit();
  measure();
  /* No morph to wait for (reduced motion, or a fold interrupted by an avoid
     switch): the panel is already at its final box, so ask now. When a morph is
     running, settleMorph asks instead — painting mid-fold would scale the
     photograph with the card. */
  if (open && !morph) requestGlass();
}

/**
 * Tell the main process what the pointer has to be inside to count as hovering.
 *
 * The active surface is exactly what is drawn — the current compact capsule,
 * the panel's box when open, or the auto-avoid slit — while the window keeps its
 * transparent padding. Sending this is what makes the island stop opening when
 * the pointer merely crosses the empty space around it.
 */
function activeHitSurface() {
  if (morph || preparing || closing) return islandEl;
  if (avoidCollapsed) return frameEl;
  return open ? panelEl : pillEl;
}

function reportHit() {
  /* During the fold the drawn surface is the island's animated box, not the
     frame's pre-fold layout (see closeMorph). "collapsed" is the main process'
     licence to hand the pointer straight to the app below whenever it is
     outside the drawn box, whatever the click-through preference says — the
     fold leaves a wide transparent margin behind it for a quarter of a second
     and none of it may swallow a click. */
  const rect = activeHitSurface().getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  api.reportHit({
    w: Math.ceil(rect.width),
    h: Math.ceil(rect.height),
    collapsed: closing || avoidCollapsed,
  });
}

/**
 * Send the current frame size immediately.
 *
 * The deferred path (measure) reads the frame after a microtask, which can land
 * before the browser has laid out the pill/panel swap — during the close that
 * reported the open size, so the window stayed big around a collapsed pill.
 * Reading synchronously right after the swap forces the layout and the value is
 * then the one actually on screen.
 */
function reportBoxNow({ force = false } = {}) {
  if (avoidCollapsed) return;
  /* landClosed paints the compact state first, then reports it after two
     painted frames. Any layout observer firing in that window must not shrink
     the native surface before the new frame exists. */
  if (collapseResizeHeld && !force) return;
  const rect = frameEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  api.reportBox({ w: Math.ceil(rect.width), h: Math.ceil(rect.height) });
}

/* ------------------------------------------------------------------- wiring */

/*
 * pointerdown, not click. A click needs press and release to land on the same
 * element, and the island resizes itself under the pointer the moment it
 * opens — which is exactly how a click gets lost. Pressing is unambiguous.
 */
function openFromPointer(event) {
  /* A press during the fold takes the card back — the driver re-targets from
     the box on screen — so only the open state itself is a non-starter. */
  if (open) return;
  if (event && event.button !== 0) return;
  /*
   * Only the drawn pill / panel / strip opens the island.
   *
   * With click-through off the window swallows clicks over its whole padded
   * rectangle, and a document-level pointerdown used to open the panel from
   * anywhere in that padding (the plain skin made this obvious: a click well
   * above the thin line still expanded it).
   */
  if (!pointerOverContent(event)) return;
  setOpen(true);
}
document.addEventListener('pointerdown', openFromPointer, true);

pausedResumeEl.addEventListener('pointerenter', refreshPausedResumeIdle);
pausedResumeEl.addEventListener('focus', refreshPausedResumeIdle);
pausedResumeEl.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (pausedResumePending) return;
  pausedResumePending = true;
  syncPausedResumeControl(true);
  Promise.resolve(api.control('toggle'))
    .catch(() => {})
    .finally(() => {
      pausedResumePending = false;
      syncPausedResumeControl(pausedResumeIsVisible());
    });
});

btnSettings.addEventListener('click', () => api.openSettings());

/*
 * Paging runs on pointerdown, not click.
 *
 * Switching pages re-renders the panel and the window follows the new content
 * size, so the pointer can end up over a different element by the time the
 * release lands — the click never fires and the arrow looks dead until pressed
 * two or three times. Pressing is unambiguous, and the same reasoning already
 * drives opening the island.
 */
panelEl.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const pageNav = event.target.closest('[data-page-nav]');
  if (pageNav) {
    const delta = Number(pageNav.dataset.pageNav);
    if (!delta) return;
    stepPage(delta);
    event.stopPropagation();
    event.preventDefault();
    return;
  }
});

/*
 * The rail is scrubbed from the press, not the click: a drag starts on
 * pointerdown, and by the time a click would fire the pointer has already
 * moved off the 3px line.
 */
pagesEl.addEventListener('pointerdown', (event) => {
  beginSeek(event);
});

panelEl.addEventListener('click', (event) => {
  /*
   * A pointer press already handles the pager on pointerdown, before the
   * growing native window can move the release target. Keyboard and assistive
   * activation have no pointer press, so their synthetic click (detail 0)
   * follows this path instead.
   */
  const pageNav = event.target.closest('[data-page-nav]');
  if (pageNav && event.detail === 0) {
    const delta = Number(pageNav.dataset.pageNav);
    if (delta) stepPage(delta);
    event.stopPropagation();
    event.preventDefault();
    return;
  }
  /*
   * The city menu owns the first three clicks it can receive. The scrim is a
   * layer inside the page, so "click outside" never needs a document listener
   * that would also see clicks on other pages.
   */
  if (event.target.closest('[data-city-menu]')) {
    cityMenuOpen = !cityMenuOpen;
    renderPage();
    event.stopPropagation();
    return;
  }
  if (event.target.closest('[data-city-close]')) {
    cityMenuOpen = false;
    renderPage();
    event.stopPropagation();
    return;
  }
  const cityPick = event.target.closest('[data-city-pick]');
  if (cityPick) {
    selectCity(cityPick.dataset.cityPick);
    event.stopPropagation();
    return;
  }
  const volumeControl = event.target.closest('[data-volume]');
  if (volumeControl) {
    if (volumeControl.dataset.volume === 'toggle') toggleVolumePanel();
    else if (volumeControl.dataset.volume === 'mute') setVolumeMute(!volumeState.muted);
    event.stopPropagation();
    return;
  }
  if (volumePanelOpen && !event.target.closest('[data-volume-panel]')) closeVolumePanel();

  /* The lyric window is the switch between the card and lyrics mode. */
  const lyricToggle = event.target.closest('[data-lyric-toggle]');
  if (lyricToggle) {
    musicLyricsMode = !musicLyricsMode;
    renderPage();
    event.stopPropagation();
    return;
  }

  const mediaButton = event.target.closest('[data-media]');
  if (mediaButton) {
    /*
     * Windows exposes pause/resume rather than a distinct destructive stop
     * for the active SMTC session. The square key therefore stops audible
     * playback by pausing the current session; the round key remains the
     * explicit transport toggle shown by the master artboard.
     */
    api.control(mediaButton.dataset.media === 'stop' ? 'toggle' : mediaButton.dataset.media);
    event.stopPropagation();
    return;
  }
  /*
   * The day column's own controls: save, delete, drop the editor, open it for a
   * new event, or open it on an existing row. Every write goes through
   * calendar:do, so the redraw below is the service snapshot, not an optimistic
   * guess.
   */
  const calAct = event.target.closest('[data-cal-act]');
  if (calAct) {
    const act = calAct.dataset.calAct;
    if (act === 'save') saveCalendarDraft();
    else if (act === 'delete') deleteCalendarDraft();
    else if (act === 'new') {
      calendarDraft = { id: '' };
      calendarError = '';
      renderPage();
      focusCalendarInput();
    } else if (act === 'cancel') {
      calendarDraft = null;
      calendarError = '';
      renderPage();
    }
    event.stopPropagation();
    return;
  }
  const calEvent = event.target.closest('[data-cal-event]');
  if (calEvent) {
    calendarDraft = { id: calEvent.dataset.calEvent };
    calendarError = '';
    renderPage();
    focusCalendarInput();
    event.stopPropagation();
    return;
  }
  const calDay = event.target.closest('[data-cal-day]');
  if (calDay) {
    calendarView.selected = Number(calDay.dataset.calDay);
    /* A day picked elsewhere drops an editor left open on the old one. */
    calendarDraft = null;
    calendarError = '';
    renderPage();
    /* The blank day's fields are the add gesture; put the cursor in the first
       one so the press that picked the day is also the press that starts it. */
    focusCalendarInput();
    event.stopPropagation();
    return;
  }
  const calNav = event.target.closest('[data-cal-nav]');
  if (calNav) {
    calendarView.month += Number(calNav.dataset.calNav);
    if (calendarView.month < 0) {
      calendarView.month = 11;
      calendarView.year -= 1;
    } else if (calendarView.month > 11) {
      calendarView.month = 0;
      calendarView.year += 1;
    }
    calendarView.selected = 1;
    calendarDraft = null;
    calendarError = '';
    renderPage();
    event.stopPropagation();
    return;
  }
  /*
   * The clipboard row is the one interactive piece that is pure UI: opening it
   * needs no service call, so it toggles here and re-renders. stopPropagation
   * keeps the click from reaching the document's outside-click handler, which
   * would fold the whole island.
   */
  const clipFold = event.target.closest('[data-clipfold]');
  if (clipFold) {
    clipboardExpanded = !clipboardExpanded;
    renderPage();
    event.stopPropagation();
    return;
  }
  /*
   * Mailbox row actions and the bulk read. Every one of them is a service
   * call: the mailbox owns read and delete state, so a row redraws only once
   * the server (or its failure) comes back. A write that fails says so on the
   * stats line instead of pretending the row moved.
   */
  const mailAllRead = event.target.closest('[data-mail-all-read]');
  const mailToggle = event.target.closest('[data-mail-act]');
  if (mailAllRead || mailToggle) {
    const scope = mailScope();
    const ids = mailAllRead
      ? (mailState?.messages ?? [])
        .filter((message) => !message.seen && (scope === 'all' || message.accountId === scope))
        .map((message) => message.id)
      : [mailToggle.dataset.id];
    if (ids.length) {
      const run = mailToggle?.dataset.mailAct === 'delete'
        ? api.mailDo('delete', { ids })
        : api.mailDo('markRead', { ids, seen: mailAllRead ? true : mailToggle.dataset.seen === '1' });
      run
        .then((snapshot) => {
          mailActionError = snapshot?.actionResult?.ok === false ? (snapshot.actionResult.error || '操作失败') : '';
          mailState = snapshot;
          if (open) renderPage();
        })
        .catch(() => {
          mailActionError = '操作失败';
          if (open) renderPage();
        });
    }
    event.stopPropagation();
    return;
  }
  /* The unread tab's empty state offers the way back, not a settings door that
     has nothing to do with an empty filter. */
  const mailTabAll = event.target.closest('[data-mail-tab-all]');
  if (mailTabAll) {
    mailFilter.tab = 'all';
    renderPage();
    event.stopPropagation();
    return;
  }
  /* A group head is a fold key: the list, the counts and the caret all come
     back from the next render, so there is no second source of truth. */
  const foldButton = event.target.closest('[data-fold-group]');
  if (foldButton) {
    const group = Number(foldButton.dataset.foldGroup);
    if (shelfFolded.has(group)) shelfFolded.delete(group);
    else shelfFolded.add(group);
    renderPage();
    event.stopPropagation();
    return;
  }
  const localButton = event.target.closest('[data-local]');
  if (localButton) {
    const [service, action] = localButton.dataset.local.split(':');
    if (service === 'quota') {
      const run =
        action === 'next'
          ? (() => {
              const list = quotaState.accounts ?? [];
              const index = list.findIndex((account) => account.current);
              const next = list[(index + 1) % Math.max(1, list.length)];
              return next ? api.quotaDo('select', { id: next.id }) : Promise.resolve(quotaState);
            })()
          : api.quotaDo(action, { id: localButton.dataset.id });
      run.then((snapshot) => { quotaState = snapshot; if (open) renderPage(); }).catch(() => {});
      event.stopPropagation();
      return;
    }
    const data = { id: localButton.dataset.id, name: localButton.dataset.name };
    if (service === 'shelf' && action === 'setGroup') {
      /* The chip is one target with five states: 未分组 → 组 1 … 组 4 → 未分组.
         The group it was drawn with is the state before this click. */
      data.group = (Number(localButton.dataset.group) + 1) % SHELF_GROUPS.length;
    }
    api
      .localDo(service, action, data)
      .then((snapshot) => {
        applyLocal(snapshot);
        if (open) renderPage();
      })
      .catch(() => {});
    event.stopPropagation();
    return;
  }
  /* A control that opens another page ("消息 N" on the mail tab line). The
     index is resolved against the live page list, so a page switched off in
     settings is simply not a target. */
  const gotoButton = event.target.closest('[data-goto]');
  if (gotoButton) {
    const target = enabledPages().findIndex((page) => page.key === gotoButton.dataset.goto);
    if (target >= 0) {
      pageDir = target >= pageIndex ? 1 : -1;
      pageIndex = target;
      renderPage(true);
    }
    event.stopPropagation();
    return;
  }
  /* The devices page's Bluetooth footer: one action, the system sheet. A
     failed call disables the row and names the reason on the same line. */
  const systemButton = event.target.closest('[data-open-system]');
  if (systemButton && !systemButton.disabled) {
    const target = systemButton.dataset.openSystem;
    const fail = () => {
      systemOpenError = '无法打开系统蓝牙设置';
      renderPage();
    };
    if (typeof api.openSystem !== 'function') {
      fail();
    } else {
      api.openSystem(target).then((result) => { if (!result?.ok) fail(); }).catch(fail);
    }
    event.stopPropagation();
    return;
  }
  /*
   * A pinned device is a display preference, not a service action. The star
   * writes through one narrow channel: main owns the three-pin cap, so the
   * renderer cannot invent a fourth pin or write an arbitrary preference.
   */
  const pinButton = event.target.closest('[data-pin]');
  if (pinButton && !pinButton.disabled) {
    pinDevice(pinButton.dataset.pin);
    event.stopPropagation();
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    const [kind, page] = action.split(':');
    if (kind === 'settings') api.openSettings(page);
    if (kind === 'devices' && page === 'refresh') refreshDevices();
    return;
  }
});

panelEl.addEventListener('change', (event) => {
  /*
   * The mailbox's two filters. The list is rebuilt from mailFilter on every
   * render, so the radios and the picker are read once here and never trusted
   * to survive a re-render — the DOM is the echo, the state is the truth.
   */
  const mailTab = event.target.closest('input[name="mail-tab"]');
  if (mailTab) {
    mailFilter.tab = mailTab.id === 'mail-tab-unread' ? 'unread' : 'all';
    renderPage();
    return;
  }
  const picker = event.target.closest('[data-mail-account]');
  if (picker) {
    mailFilter.account = String(picker.value || 'all');
    renderPage();
    return;
  }
  /*
   * The priority picker carries its own colour bar, so the closed control
   * already shows which left-edge stripe the next task will get.
   */
  const priority = event.target.closest('[data-todo-priority]');
  if (priority) priority.dataset.priority = priority.value;
});

panelEl.addEventListener('input', (event) => {
  const range = event.target.closest('[data-volume-range]');
  if (range) {
    setVolume(Number(range.value));
    event.stopPropagation();
    return;
  }
  /*
   * The shelf's search box filters on every keystroke. Only the list is
   * replaced: re-rendering the page would take the input — and with it the
   * caret and any IME candidate window — away from the person typing.
   */
  const shelfQueryInput = event.target.closest('[data-shelf-query]');
  if (!shelfQueryInput) return;
  shelfQuery = shelfQueryInput.value;
  const shelfList = pagesEl.querySelector('.shelf-list');
  if (shelfList) shelfList.innerHTML = shelfListHtml();
  event.stopPropagation();
});

panelEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cityMenuOpen) {
    cityMenuOpen = false;
    renderPage();
    event.stopPropagation();
    return;
  }
  /* First Escape clears the search, the next one closes the island: clearing a
     field should not also dismiss the page it belongs to. */
  const queryInput = event.target.closest('[data-shelf-query]');
  if (event.key === 'Escape' && queryInput && shelfQuery) {
    shelfQuery = '';
    queryInput.value = '';
    const shelfList = pagesEl.querySelector('.shelf-list');
    if (shelfList) shelfList.innerHTML = shelfListHtml();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Escape' && volumePanelOpen) {
    closeVolumePanel();
    event.stopPropagation();
    return;
  }
  /* The rail is focusable, so it answers the keyboard as well. */
  if (seekByKey(event)) return;

  /* The lyric window is focusable, so it answers the keyboard as well. */
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-lyric-toggle]')) {
    musicLyricsMode = !musicLyricsMode;
    renderPage();
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  /* The calendar's inline editor answers the keyboard: Enter saves from either
     field, Escape drops a draft that was opened on purpose. */
  if (event.key === 'Escape' && calendarDraft) {
    calendarDraft = null;
    calendarError = '';
    renderPage();
    event.stopPropagation();
    return;
  }

  if (event.key !== 'Enter') return;
  if (event.target.closest('[data-cal-input]')) {
    saveCalendarDraft();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const input = event.target.closest('[data-todo-input]');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const dueInput = panelEl.querySelector('[data-todo-due]');
  const due = dueInput?.value ? new Date(dueInput.value).getTime() : null;
  const repeat = panelEl.querySelector('[data-todo-repeat]')?.value ?? 'none';
  const priority = panelEl.querySelector('[data-todo-priority]')?.value ?? 'mid';
  api
    .localDo('todo', 'add', { text, due, repeat, priority })
    .then((snapshot) => {
      applyLocal(snapshot);
      if (open) renderPage();
    })
    .catch(() => {});
});

panelEl.addEventListener('dragenter', (event) => {
  const zone = event.target.closest('[data-shelf-drop]');
  if (zone) zone.classList.add('dragover');
});

panelEl.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('[data-shelf-drop]');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('dragover');
});

panelEl.addEventListener('dragover', (event) => {
  const zone = event.target.closest('[data-shelf-drop]');
  if (zone) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('dragover');
  }
});

panelEl.addEventListener('drop', async (event) => {
  const zone = event.target.closest('[data-shelf-drop]');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('dragover');
  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) return;
  const direct = [];
  const blobs = [];
  for (const file of files) {
    const resolved = api.filePath(file);
    if (resolved) direct.push(resolved);
    else if (file.size <= 20 * 1024 * 1024) blobs.push(file);
  }
  try {
    let snapshot = direct.length ? await api.localDo('shelf', 'add', { paths: direct }) : null;
    for (const file of blobs) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      snapshot = await api.shelfAddBuffer(file.name, bytes);
    }
    if (snapshot) applyLocal(snapshot);
    if (open) renderPage();
  } catch {
    // A refused drop leaves the list as it was.
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && open) setOpen(false);
  if (!open) return;
  /* Caret navigation inside a field must never page away and drop the draft:
     the todo/shelf/calendar inputs all live inside the panel, so their arrow
     keys bubble up to this document-level handler. */
  if (event.target instanceof Element &&
      event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'ArrowRight' && stepPage(1)) event.preventDefault();
  if (event.key === 'ArrowLeft' && stepPage(-1)) event.preventDefault();
});

panelEl.addEventListener('wheel', (event) => {
  if (prefs.wheelPaging === false) return;
  if (Math.abs(event.deltaY) < 8) return;
  const delta = event.deltaY > 0 ? 1 : -1;
  stepPage(delta);
}, { passive: true });

/*
 * No document-level "click outside to collapse" handler.
 *
 * The window is exactly the size of the island, so a click outside it never
 * reaches this page — and the version that tried still collapsed the panel on
 * every paging click, because the re-rendered dot was no longer inside the
 * DOM island by the time the event bubbled. Escape and blur are the two real
 * dismiss gestures; the window edge is the third.
 */
window.addEventListener('blur', () => {
  if (prefs.blurCollapse === false) return;
  if (open) setOpen(false);
});

/*
 * A resized window has a resized panel, and the desktop behind it moved with
 * the edges. Debounced (see GLASS_REFRESH_MS): opening resizes the window once
 * and the fold lands on its own clock, so the refresh must not fire per frame.
 */
window.addEventListener('resize', scheduleGlassRefresh);

/* -------------------------------------------------------------------- boot */

/*
 * Hover to open, driven by the page itself.
 *
 * Once the pointer is over the window the main process stops ignoring the
 * mouse, and from that moment this document receives real mouse events — so
 * the whole window is a hover target, not just the pill element.
 */
let hoverOpenTimer = null;
let hoverCloseTimer = null;

/**
 * Hover in opens after a beat; leaving closes after a longer beat.
 *
 * Both delays are user settings. Opening is the eager one — 120-200ms reads as
 * responsiveness — while closing waits, because a pointer that briefly leaves
 * the island (reaching for the taskbar, crossing a corner) should not collapse
 * the panel under your hand.
 */
function scheduleHoverOpen() {
  clearTimeout(hoverCloseTimer);
  if (open) return;
  if (
    !pausedResumeEl.hidden &&
    (pausedResumeEl.matches(':hover') || document.activeElement === pausedResumeEl)
  ) return;
  clearTimeout(hoverOpenTimer);
  // A profile written before this setting existed has no value: default on.
  const raw = prefs.hoverOpenDelay;
  const delay = raw === undefined ? 100 : Number(raw);
  if (!Number.isFinite(delay) || delay <= 0) return;
  hoverOpenTimer = setTimeout(() => setOpen(true), Math.min(800, delay));
}

function scheduleHoverClose() {
  clearTimeout(hoverOpenTimer);
  if (!open || prefs.hoverAutoHide === false) return;
  clearTimeout(hoverCloseTimer);
  const raw = Number(prefs.hoverCloseDelay);
  const delay = Number.isFinite(raw) && raw > 0 ? raw : 120;
  hoverCloseTimer = setTimeout(() => {
    if (open) setOpen(false);
  }, Math.max(120, Math.min(2000, delay)));
}

/*
 * The page only counts a pointer that is over the drawn content.
 *
 * The window is padded, and while the island is collapsed to the auto-avoid
 * strip that padding is most of the window. Forwarded mouse events arrive for
 * the whole window, so without this the island still opened when the pointer
 * merely crossed the empty space next to the strip.
 */
function pointerOverContent(event) {
  if (!event) return false;
  const target = event.target instanceof Node ? event.target : null;
  if (target?.closest?.('#paused-resume')) return false;
  /*
   * A pointerdown dispatched on the pill itself (the desktop smoke test does
   * this, and a page script may too) carries no real coordinates, but its
   * target is inside the drawn frame — that is the content by definition.
   * Real clicks in the transparent padding land on body/#island, not here.
   */
  const surface = activeHitSurface();
  if (target && surface.contains(target)) return true;
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  const rect = surface.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

document.documentElement.addEventListener('mouseenter', (event) => {
  if (pointerOverContent(event)) scheduleHoverOpen();
});
document.addEventListener('mousemove', (event) => {
  if (pointerOverContent(event)) scheduleHoverOpen();
});
document.documentElement.addEventListener('mouseleave', scheduleHoverClose);
/*
 * Leaving is also reported by the main process. Once the pointer is outside,
 * the window goes click-through within ~25ms and the page stops receiving
 * mouse events — so a mouseleave that lands after that moment never arrives.
 * The main process knows the cursor position regardless, and its "inside became
 * false" is the dependable close signal.
 */
/*
 * Auto-avoid: the pill collapses to a 6px slit while a listed app covers it.
 *
 * The window follows the measured box, so collapsing the layout is the whole
 * implementation — but a bare width jump is unreadable, so the current size is
 * frozen first and the CSS transition animates from it to the slit size.
 * The slit is a third of the expanded panel: 140px at the 420px default, and
 * always below the old 42% ceiling.
 */
let avoiding = false;

/**
 * The strip is a state of the *content*, not of the window.
 *
 * Collapsed means "a listed app is covering the island and the island is not
 * being used". Opening it (hover or click) wins over avoidance: otherwise the
 * panel is painted inside a 6px clipped frame and hovering the slit looks
 * like the island ignored the pointer completely.
 */
/**
 * The slit's width comes from the expanded panel, not the folded pill.
 *
 * C's slit is a third of the panel it can grow into (140px at the 420px
 * default), and a third stays below the old 42% ceiling on every island width.
 * Reading --island-w means a preference change is picked up on the next avoid
 * without tracking a transient first paint.
 */
function applyAvoidWidth() {
  const panelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--island-w')) || 420;
  document.documentElement.style.setProperty('--avoid-w', Math.max(48, Math.round(panelWidth / 3)) + 'px');
}

function syncAvoidVisual() {
  const collapsed = avoiding && !open;
  avoidCollapsed = collapsed;
  document.body.dataset.avoid = collapsed ? '1' : '0';
  if (collapsed) applyAvoidWidth();
  /* The slit is 6px tall; the window around it is not a hover target. */
  reportHit();
  return collapsed;
}

function applyAvoid(on) {
  const next = on === true;
  if (next === avoiding) return;
  avoiding = next;
  const rect = frameEl.getBoundingClientRect();
  syncAvoidVisual();
  frameEl.style.width = Math.round(rect.width) + 'px';
  frameEl.style.height = Math.round(rect.height) + 'px';
  requestAnimationFrame(() => {
    frameEl.style.width = '';
    frameEl.style.height = '';
    /* Re-report on the way out; every call is a no-op while collapsed. */
    measure();
  });
}

api.onAvoid(applyAvoid);


api.onHover((inside) => {
  /*
   * Entry opens; exit closes.
   *
   * The page's own mouseenter/mousemove used to be the only open trigger. Both
   * are unreliable here: while the window is click-through the page may receive
   * no mousemove at all (Electron's forward option does not promise it on
   * Windows), and once the main process turns click-through off the pointer is
   * already resting inside, so no further mousemove is generated. A pointer
   * that is simply moved onto the island and stopped therefore never opened it.
   * The main process knows the cursor entered regardless of events, so its
   * "inside became true" has to open too.
   */
  if (inside) {
    scheduleHoverOpen();
    return;
  }
  if (!open) return;
  scheduleHoverClose();
});

const serviceData = (listener) => (value) => {
  if (!fixtureLocked) listener(value);
};

api.onBattery(serviceData((value) => {
  battery = value;
  renderPillStatus();
  renderSub();
  if (open && enabledPages()[pageIndex]?.key === 'weather') return;
}));

api.onWeather(serviceData((value) => {
  if (!value) return;
  /*
   * A failed lookup arrives as { error }. It does not overwrite the last good
   * reading — an offline minute should not blank a card that already has data —
   * and only a page with nothing to show draws the failure block.
   */
  if (value.error) {
    weatherError = String(value.error);
    if (!weather && open && enabledPages()[pageIndex]?.key === 'weather') renderPage();
    return;
  }
  weatherError = '';
  weather = value;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'weather') renderPage();
}));

api.onMedia(serviceData((value) => {
  if (!value) return;
  const previous = media;
  const collapseForPausedMusic = shouldCollapseForPausedMusic(previous, value);
  const pausedMusic = isMusicMedia(value) && value.playing === false;
  const wasPausedMusic = isMusicMedia(previous) && previous.playing === false;
  const pausedTrackChanged =
    pausedMusic &&
    (!wasPausedMusic || value.title !== previous.title || value.artist !== previous.artist);
  if (!pausedMusic) pausedResumeSince = 0;
  else if (pausedTrackChanged) pausedResumeSince = Date.now();
  const trackChanged = value.title !== media.title || value.active !== media.active;
  const playingChanged = value.playing !== media.playing;
  /* A provider resolving live metadata changes the rail and timing row even
     when the player's duration stays at zero. */
  const liveChanged = isLiveMedia(value) !== isLiveMedia(media);
  const liveInfoChanged =
    value.live?.roomTitle !== media.live?.roomTitle ||
    value.live?.anchorName !== media.live?.anchorName ||
    value.live?.startedAt !== media.live?.startedAt;
  /* A cover that arrives a beat after its frame (the Bilibili lookup) is a repaint. */
  const artChanged = value.art !== media.art;
  /*
   * Freeze the live clock while the broadcast is paused. The main process
   * keeps liveSince across a pause, so unfreezing on the next playing frame
   * continues from the real start rather than from the pause or from zero.
   */
  const liveFrame = isLiveMedia(value);
  if (!liveFrame || Number(value.liveSince) !== Number(media.liveSince)) liveFrozenAt = 0;
  else if (!value.playing) liveFrozenAt = liveFrozenAt || Date.now();
  else liveFrozenAt = 0;
  media = value;
  pausedResumePending = false;
  if (collapseForPausedMusic) {
    musicLyricsMode = false;
    if (enabledPages()[pageIndex]?.key === 'music') {
      const pages = enabledPages();
      const preferred = pages.findIndex((page) => page.key === prefs.defaultPage);
      if (preferred >= 0) pageIndex = preferred;
    }
  }
  renderPillStatus();
  renderSub();
  renderHeader();
  if (open && enabledPages()[pageIndex]?.key === 'music') {
    if (trackChanged || playingChanged || liveChanged || liveInfoChanged || artChanged) {
      lastLyricIndex = -2;
      renderPage();
    } else {
      updateMusicLive();
    }
  }
  scheduleLyricClock();
  if (collapseForPausedMusic && open) setOpen(false);
}));

api.onLyrics(serviceData((value) => {
  lyrics = value;
  lastLyricIndex = -2;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'music') renderPage();
  scheduleLyricClock();
}));

api.onFocus(serviceData((value) => {
  if (!value) return;
  const structural = value.phase !== focusState.phase || value.running !== focusState.running;
  focusState = value;
  if (!open || enabledPages()[pageIndex]?.key !== 'focus') return;
  if (structural) renderPage();
  else updateFocusLive();
}));

api.onHealth(serviceData((value) => {
  if (!value) return;
  healthState = value;
  if (open && enabledPages()[pageIndex]?.key === 'health') renderPage();
}));

api.onTodos(serviceData((value) => {
  if (!Array.isArray(value)) return;
  todos = value;
  if (open && enabledPages()[pageIndex]?.key === 'todo') renderPage();
}));

api.onShelf(serviceData((value) => {
  if (!Array.isArray(value)) return;
  shelfFiles = value;
  if (open && enabledPages()[pageIndex]?.key === 'shelf') renderPage();
}));

api.onClipboard(serviceData((value) => {
  if (!Array.isArray(value)) return;
  clipboardItems = value;
  if (open && enabledPages()[pageIndex]?.key === 'shelf') renderPage();
}));

api.onMessenger(serviceData((value) => {
  if (!value || !Array.isArray(value.apps)) return;
  messengerState = value;
  const current = enabledPages()[pageIndex]?.key;
  /* The probe pushes on every title change, so the row list is the page's only
     live data; the mail tab line's count reads the same snapshot. */
  if (open && (current === 'messenger' || current === 'mail')) renderPage();
}));

/* Switching character updates every face on the island, not only the ball. */
api.onCast((cast) => {
  if (!cast) return;
  activeCastId = String(cast);
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('cast', activeCastId);
  }
});

/*
 * The island wears the face the main process owns.
 *
 * Both the pill's face and the panel header's face get the same state, and the
 * state only ever arrives on this event — no local mood timer, no second
 * interpretation of the protocol. The main process also resends the current
 * value when this page (re)loads, so a reconnect starts from the same face.
 */
api.onFace((payload) => {
  const state = payload && typeof payload === 'object' ? payload.state : '';
  if (!state) return;
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('state', String(state));
  }
});

api.onDevices(serviceData((value) => {
  if (!value || !Array.isArray(value.devices)) return;
  devicesState = value;
  /* Peripheral levels feed the rotating status line, not just the devices page. */
  renderSub();
  if (open && enabledPages()[pageIndex]?.key === 'devices') renderPage();
}));

/* One event, one paint: the balance and the agent list arrive together, so the
   page cannot show a fresh number beside a stale row. */
api.onQuotaAgent(serviceData((value) => {
  if (!value) return;
  quotaState = value.quota ?? quotaState;
  agentsState = Array.isArray(value.agents) ? value.agents : agentsState;
  if (open && enabledPages()[pageIndex]?.key === 'quota') renderPage();
  renderPillStatus();
}));

api.onMail(serviceData((value) => {
  /* A snapshot from the service is newer than the last click: whatever failed
     then is either fixed or already carried by state.error. */
  mailActionError = '';
  if (!value) return;
  mailState = value;
  if (open && enabledPages()[pageIndex]?.key === 'mail') renderPage();
}));

api.onCalendar(serviceData((value) => {
  if (!value) return;
  calendarState = value;
  if (open && enabledPages()[pageIndex]?.key === 'calendar') renderPage();
}));

api.onNotification?.(receiveNotification);

/* The main process moved the window: same desktop question, new answer. */
api.onMoved?.(scheduleGlassRefresh);

api.onPrefs((next) => {
  prefs = next ?? prefs;
  applyPrefs();
  renderPillStatus();
  // A page was switched on or reordered in settings: the dots and the current
  // page have to follow, otherwise the island keeps showing the old set.
  if (open) renderPage();
  scheduleLyricClock();
});

const boot = await api.bootstrap();
prefs = boot?.prefs ?? {};
/* Main owns the OS check; a preference never decides this, because a Windows 10
   machine cannot paint the material no matter what the switch says. */
/* Synchronous, from the preload argv: no round-trip, no first-frame guess. */
document.body.dataset.material = windowMaterial;
if (boot?.cast) {
  activeCastId = String(boot.cast);
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('cast', activeCastId);
  }
}
battery = boot?.battery ?? null;
weather = boot?.weather ?? null;
media = boot?.media ?? media;
// Opening the panel mid-pause must not restart the clock; freeze it at boot too.
if (isLiveMedia(media) && !media.playing && media.liveSince) liveFrozenAt = Date.now();
if (isMusicMedia(media) && media.playing === false) pausedResumeSince = Date.now();
lyrics = boot?.lyrics ?? null;
applyLocal(boot);
quotaState = boot?.quotaAgent?.quota ?? quotaState;
agentsState = Array.isArray(boot?.quotaAgent?.agents) ? boot.quotaAgent.agents : agentsState;
mailState = boot?.mail ?? mailState;
calendarState = boot?.calendar ?? calendarState;

applyPrefs();
renderPillStatus();

function mergePreferencePatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return current;
  const next = { ...(current && typeof current === 'object' ? current : {}) };
  for (const [key, value] of Object.entries(patch)) {
    const currentValue = next[key];
    next[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      currentValue &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue)
        ? mergePreferencePatch(currentValue, value)
        : value;
  }
  return next;
}

/*
 * Throwaway-profile capture hook. `rendererDebug` is a schema preference, so a
 * normal user session cannot inject fabricated service data into the island.
 */
window.__emojitotUiFixture = (fixture) => {
  if (!prefs.rendererDebug || !fixture || typeof fixture !== 'object') return false;
  fixtureLocked = true;
  if (fixture.clock !== undefined) fixtureClock = String(fixture.clock || '');
  if (fixture.battery !== undefined) battery = fixture.battery;
  if (fixture.weather !== undefined) {
    weather = fixture.weather;
    weatherError = '';
  }
  if (fixture.media !== undefined) media = fixture.media;
  if (fixture.lyrics !== undefined) lyrics = fixture.lyrics;
  if (fixture.focus !== undefined) focusState = fixture.focus;
  if (fixture.health !== undefined) healthState = fixture.health;
  if (Array.isArray(fixture.todos)) todos = fixture.todos;
  if (fixture.todoSummary !== undefined) todoSummaryState = fixture.todoSummary;
  if (Array.isArray(fixture.shelf)) shelfFiles = fixture.shelf;
  if (Array.isArray(fixture.clipboard)) clipboardItems = fixture.clipboard;
  if (fixture.messenger !== undefined) messengerState = fixture.messenger;
  if (fixture.devices !== undefined) devicesState = fixture.devices;
  if (fixture.quota !== undefined) quotaState = fixture.quota;
  if (Array.isArray(fixture.agents)) agentsState = fixture.agents;
  if (fixture.mail !== undefined) mailState = fixture.mail;
  if (fixture.calendar !== undefined) calendarState = fixture.calendar;
  if (fixture.calendarView !== undefined) calendarView = fixture.calendarView;
  if (fixture.cast !== undefined) {
    activeCastId = String(fixture.cast || 'tot');
    for (const face of document.querySelectorAll('emojitot-ball')) {
      face.setAttribute('cast', activeCastId);
    }
  }
  if (fixture.prefsPatch) prefs = mergePreferencePatch(prefs, fixture.prefsPatch);
  applyPrefs();
  renderPillStatus();
  renderHeader();
  renderSub();
  if (open) renderPage();
  return true;
};

window.__emojitotAvoid = (on) => {
  if (!prefs.rendererDebug) return undefined;
  applyAvoid(on === true);
  return avoiding;
};

window.__emojitotNotification = (payload, hold = false) => {
  if (!prefs.rendererDebug) return false;
  receiveNotification(payload);
  if (hold) clearNotificationTimer();
  return Boolean(notificationState);
};

window.__emojitotClearNotification = () => {
  if (!prefs.rendererDebug || !notificationState) return false;
  finishNotification();
  return true;
};

// "Follow the system" only matters while the OS theme actually changes.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((prefs.theme ?? 'dark') === 'system') applyPrefs();
});
// Land on the user's default page, not always the first one.
const bootPages = enabledPages();
const preferred = bootPages.findIndex((page) => page.key === prefs.defaultPage);
pageIndex = preferred >= 0 ? preferred : 0;
setOpen(false);
scheduleLyricClock();
/* Skip the repaint while the window is not on screen: a hidden window still
   runs timers, and rebuilding the status row for nobody is pure garbage. */
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  renderPillStatus();
}, 20000);
/*
 * A live stream's frames are identical from one second to the next (there is no
 * position to advance), so the page cannot lean on them for its second hand.
 */
setInterval(() => {
  if (!open || enabledPages()[pageIndex]?.key !== 'music' || !isLiveMedia(media)) return;
  updateMusicLive();
}, 1000);
reportHit();
measure();
