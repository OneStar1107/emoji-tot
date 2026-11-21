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
} from '../shared/schema.js';
import { islandHeaderState, pagingVisibility } from './island-header.mjs';

const api = window.islandAPI;

const islandEl = document.getElementById('island');
const frameEl = document.getElementById('frame');
const pillEl = document.getElementById('pill');
const pillStatus = document.getElementById('pill-status');
const panelEl = document.getElementById('panel');
const pagesEl = document.getElementById('pages');
const dotsEl = document.getElementById('dots');
const titleEl = document.getElementById('page-title');
const subEl = document.getElementById('page-sub');
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

function batterySvg(level, charging) {
  const width = Math.max(2, Math.round(13 * Math.max(0, Math.min(1, level / 100))));
  const tone = level <= 12 ? 'var(--bad)' : level <= 30 ? 'var(--warn)' : 'currentColor';
  return svg(
    `<rect x="1.2" y="7" width="17" height="10" rx="2.6"/><rect x="19" y="10" width="2" height="4" rx="1"/><rect x="3" y="8.8" width="${width}" height="6.4" rx="1.4" fill="${tone}" stroke="none"/>${charging ? '<path d="m11 8-2.6 4.2h2.4L9.6 16l3.4-4.6H10.8z" fill="var(--good)" stroke="none"/>' : ''}`,
  );
}

/* --------------------------------------------------------------- app state */

let prefs = {};
let battery = null;
let weather = null;
let media = { active: false, title: '', artist: '', album: '', playing: false, position: 0, duration: 0, art: '', source: '' };
let lyrics = null;
/*
 * The music page's second state: the words own the page. This is a view flag,
 * not a preference — nothing writes it to prefs, so every start opens in the
 * default card and the mode is re-entered from the lyric window.
 */
let musicLyricsMode = false;
let focusState = { phase: 'idle', running: false, remaining: 0, total: 0, cycles: 0 };
let healthState = { enabled: false, waterMin: 45, standMin: 60, sinceWater: 0, sinceStand: 0, waterDue: false, standDue: false, waterCount: 0, standCount: 0 };
let todos = [];
let shelfFiles = [];
let clipboardItems = [];
let messengerState = { apps: [], unread: 0 };
let devicesState = { devices: [] };
/** Why the Bluetooth footer is disabled, or '' while the system sheet opens. */
let systemOpenError = '';
let quotaState = { accounts: [], current: null, last: null };
/** Latest snapshot of the agent sources behind the quota page's agent row. */
let agentsState = null;
let mailState = { accounts: [], messages: [], syncing: false, error: '', lastSync: 0 };
let calendarState = { events: [], upcoming: [] };
const today = new Date();
let calendarView = { year: today.getFullYear(), month: today.getMonth(), selected: today.getDate() };
let open = false;
let pageIndex = 0;

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

const hhmm = () => {
  const now = new Date();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (timeFormat24) return `${String(now.getHours()).padStart(2, '0')}:${minutes}`;
  const hour = now.getHours() % 12 || 12;
  return `${hour}:${minutes} ${now.getHours() < 12 ? 'AM' : 'PM'}`;
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const clock = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** The lyric line that should be highlighted at a given playback position. */
function lyricAt(seconds) {
  if (!lyrics || !lyrics.synced || !lyrics.lines?.length) return -1;
  const offset = Number(prefs.music?.offset ?? 0.35);
  const t = seconds + offset;
  let index = -1;
  for (let i = 0; i < lyrics.lines.length; i += 1) {
    if (lyrics.lines[i].t <= t) index = i;
    else break;
  }
  return index;
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
    /*
     * The frame is the content's natural box — it is out of flow with
     * width: max-content, so it reports the real size of whichever surface is
     * showing. Reading the surface itself (panel/pill) reported zero while the
     * swap was still pending a layout, and a zero box is dropped, which left
     * the window at its collapsed size with the panel spilling out.
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
function syncSize() {
  if (morph) return;
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
  for (const device of devicesState?.devices ?? []) {
    if (device.battery === null || device.battery === undefined) continue;
    entries.push({ name: device.name, level: Number(device.battery) });
  }
  return entries;
}

function renderSub() {
  const entries = batteryEntries();
  if (!entries.length) {
    /* Clear the inner span, never the host: writing textContent on the host
       would delete the span the scroller needs. */
    const empty = subEl.firstElementChild;
    if (empty && empty.textContent !== '') empty.textContent = '';
    subEl.dataset.muted = 'true';
    subEl.dataset.over = 'false';
    return;
  }
  if (batteryIndex >= entries.length) batteryIndex = 0;
  const entry = entries[batteryIndex];
  /*
   * Line two: where you are, then the battery. The level still leads within its
   * own segment so a truncated device name never hides the number, and the
   * whole line scrolls when a long device name makes it wider than the slot.
   */
  /* The page name now lives under the ball, so this line is purely battery. */
  const text = entry.level + '% · ' + entry.name;
  const textEl = subEl.firstElementChild;
  if (textEl && textEl.textContent !== text) textEl.textContent = text;
  subEl.dataset.muted = 'false';
  /*
   * Measure the overflow after writing the text, every call: the first write
   * happens before layout, so a one-off check would answer "fits" forever. The
   * shift is published as a custom property so the keyframes can use it.
   */
  const over = subEl.scrollWidth > subEl.clientWidth + 2;
  subEl.dataset.over = String(over);
  if (over && textEl) subEl.style.setProperty('--sub-shift', (textEl.scrollWidth - subEl.clientWidth + 6) + 'px');
  ensureBatteryRotation();
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

/* The playing title owns the header line; the page name lives under the ball. */
function renderHeader() {
  const state = islandHeaderState(media);
  const textEl = titleEl.firstElementChild;
  if (textEl && textEl.textContent !== state.title) textEl.textContent = state.title;
  /*
   * Measure after writing: the first write happens before layout, so a one-off
   * check would answer "fits" forever. The distance is handed to CSS through a
   * custom property — the slot width is not known to the stylesheet.
   */
  const over = state.title.length > 0 && titleEl.scrollWidth > titleEl.clientWidth + 2;
  titleEl.dataset.over = String(over);
  if (over && textEl) {
    titleEl.style.setProperty('--title-shift', textEl.scrollWidth - titleEl.clientWidth + 6 + 'px');
  }
}

function renderPillStatus() {
  const playing = Boolean(media.active && media.playing);
  document.body.dataset.playing = String(playing);
  /*
   * While a song plays the pill shows the current lyric instead of battery,
   * clock and temperature: three numbers plus a lyric sentence does not fit in
   * a pill, and the lyric is the only one of them that changes every few
   * seconds. Pausing brings the status row back.
   */
  const lyricMode = playing && prefs.music?.islandLyrics !== false;
  if (lyricMode) {
    const line = currentLyricLine() || media.title || '';
    pillStatus.innerHTML = `<span class="stat lyric-pill">${escapeHtml(clip(line, 24))}</span>`;
  } else {
    const items = prefs.statusItems ?? ['battery', 'clock', 'weather'];
    const parts = [];
    for (const key of items) {
      if (key === 'battery' && battery) {
        parts.push(`<span class="stat" title="电量 ${battery.level}%">${batterySvg(battery.level, battery.charging)}<b>${battery.level}%</b></span>`);
      } else if (key === 'clock') {
        parts.push(`<span class="stat" data-clock>${hhmm()}</span>`);
      } else if (key === 'weather' && weather) {
        const celsius = Number(weather.current?.temp) || 0;
        const temp = prefs.weather?.unit === 'f' ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius);
        parts.push(`<span class="stat dim">${temp}°</span>`);
      } else if (key === 'quota') {
        /*
         * The pill used to offer a balance toggle that drew nothing, because
         * this loop only knew battery, clock and weather. A status item with no
         * renderer is worse than no status item: it looks switched on.
         */
        const last = quotaState?.last;
        if (last && !last.error && last.total !== undefined) {
          parts.push(`<span class="stat dim" title="AI 余额">¥${escapeHtml(String(last.total))}</span>`);
        }
      }
    }
    pillStatus.innerHTML = parts.join('');
  }
  topClock.textContent = hhmm();
  if (battery) {
    topBattery.innerHTML = batterySvg(battery.level, battery.charging);
    topBattery.hidden = false;
    topBattery.title = `电量 ${battery.level}%${battery.charging ? ' · 充电中' : ''}`;
  } else {
    topBattery.hidden = true;
  }
  measure();
}

/* ------------------------------------------------------------------- pages */

const empty = (icon, title, text, actionLabel, action) => `
  <div class="empty">
    ${svg(icon)}
    <b>${title}</b>
    <span>${text}</span>
    ${actionLabel ? `<button type="button" class="ghost" data-action="${action}">${actionLabel}</button>` : ''}
  </div>`;

/** The line that should read as "now" in the collapsed pill. */
function currentLyricLine() {
  const index = lyricAt(media.position);
  if (index < 0 || !lyrics?.lines?.[index]) return '';
  return lyrics.lines[index].text;
}

const clip = (text, max) => (String(text).length > max ? String(text).slice(0, max - 1) + '…' : String(text));

function lyricSliceHtml(index, span = 3) {
  if (!lyrics?.synced || !lyrics.lines.length) return '<span class="lyric-empty">这首歌没有同步歌词</span>';
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
      return `<p class="lyric-line${distance === 0 ? ' on' : ''}" data-n="${distance}">${escapeHtml(line.text)}</p>`;
    })
    .join('');
}

/**
 * A browser session is "media", not "music": the user asked for the distinction
 * because a video tab and a music player are different things to interrupt.
 */
const BROWSER_SOURCES = ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'egolite', 'browser', 'chromium'];

function isBrowserMedia() {
  const source = String(media.source || '').toLowerCase();
  return BROWSER_SOURCES.some((name) => source.includes(name));
}

/** Live streams and video tabs often report no duration at all. */
const isLiveMedia = () => !media.duration;

function musicPage() {
  if (!media.active) {
    return empty(
      ICON.music,
      '系统里没有正在播放的媒体',
      '打开任意播放器后，这里会显示封面、歌名和进度。',
      '查看设置',
      'settings:music',
    );
  }
  const pct = media.duration ? Math.min(100, (media.position / media.duration) * 100) : 0;
  const live = isLiveMedia();
  const browser = isBrowserMedia();
  const art = media.art
    ? `<img class="cover-img" src="${media.art}" alt="" />`
    : `<div class="cover">${svg(ICON.music)}</div>`;
  /*
   * The output badge names the device the sound leaves through. Only some
   * Windows media sessions report an endpoint, so it is drawn when the frame
   * actually carries an output field: a placeholder would claim a route we
   * have not been told about. It is a badge, not a key — nothing to press.
   */
  const output = media.output
    ? `<span class="music-out" title="输出设备：${escapeHtml(media.output)}" aria-label="输出设备：${escapeHtml(media.output)}">${svg(ICON.volume)}</span>`
    : '';
  /*
   * Lyrics mode is entered from the lyric window itself, and only when there
   * are synced lines to fill the page with. With the lyric window switched off
   * in settings there is nothing to tap, so the second state stays unreachable.
   */
  const canLyrics = prefs.music?.lyrics !== false && Boolean(lyrics?.synced && lyrics.lines?.length);
  const lyricMode = canLyrics && musicLyricsMode;
  /*
   * Cover + one lyric line + progress + four keys, stacked to the top of the
   * page. The old block centred a 56px cover and a three-line 54px lyric
   * window, so the page read as three islands inside the card. The lyric stays
   * a one-line window: the current sentence at reading size, the next one dimmed
   * underneath (the previous line is hidden by CSS), and the heights are fixed
   * so a long title or a font preference cannot push the controls past 205px.
   */
  return `<div class="music" data-music="${lyricMode ? 'lyrics' : 'default'}">
    <div class="music-row">
      <div class="music-cover">${art}${output}</div>
      <div class="music-meta">
        <b>${escapeHtml(media.title || '未命名')}</b>
        <span>${escapeHtml(media.artist || media.album || (browser ? '媒体 · ' + (media.source || '浏览器') : media.source || ''))}</span>
      </div>
    </div>
    ${prefs.music?.lyrics === false
      ? ''
      : `<div class="lyric-box" data-lyric-box${canLyrics ? ` role="button" tabindex="0" data-lyric-toggle="1" aria-pressed="${lyricMode}" aria-label="${lyricMode ? '收起歌词' : '展开歌词'}"` : ''}>${lyricSliceHtml(lyricAt(media.position), lyricMode ? 5 : 3)}</div>`}
    ${live
      ? '<div class="music-bar live"><i></i></div><div class="music-times"><span data-pos>' + clock(media.position) + '</span><span>直播</span></div>'
      : '<div class="music-bar"><i data-progress style="width:' + pct.toFixed(1) + '%"></i></div><div class="music-times"><span data-pos>' + clock(media.position) + '</span><span data-dur>' + clock(media.duration) + '</span></div>'}
    <div class="music-controls">
      <button type="button" data-media="prev" aria-label="上一首">${svg(ICON.prev)}</button>
      <button type="button" class="main" data-media="toggle" aria-label="${media.playing ? '暂停' : '播放'}">${svg(media.playing ? ICON.pause : ICON.play)}</button>
      <button type="button" data-media="next" aria-label="下一首">${svg(ICON.next)}</button>
      <button type="button" data-action="settings:music" aria-label="歌词设置" title="歌词设置">${svg('<path d="M4 7h16M4 12h9M4 17h13"/>')}</button>
      <button type="button" data-volume="toggle" aria-label="系统音量" aria-expanded="false" aria-controls="volume-panel" title="系统音量">${svg(ICON.volume)}</button>
    </div>
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
  </div>`;
}

/*
 * The volume key is a fifth control, not a switch on the player.
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

function updateMusicLive() {
  const page = enabledPages()[pageIndex];
  if (!page || page.key !== 'music') return;
  const bar = pagesEl.querySelector('[data-progress]');
  if (!bar) return;
  const pct = media.duration ? Math.min(100, (media.position / media.duration) * 100) : 0;
  bar.style.width = pct.toFixed(1) + '%';
  const position = pagesEl.querySelector('[data-pos]');
  if (position) position.textContent = clock(media.position);
  const index = lyricAt(media.position);
  if (index !== lastLyricIndex) {
    lastLyricIndex = index;
    const box = pagesEl.querySelector('[data-lyric-box]');
    if (box) {
      const span = box.closest('.music')?.dataset.music === 'lyrics' ? 5 : 3;
      box.innerHTML = lyricSliceHtml(index, span);
    }
  }
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

function weatherPage() {
  if (!weather) {
    /*
     * The first reading takes a second or two. Keep the note at the top of the
     * box instead of centring it in 205px: it is a loading line, not a page.
     */
    return `<div class="wx wx-empty">${empty(ICON.sun, '正在获取天气…', '第一次需要几秒钟。')}</div>`;
  }
  const fahrenheit = prefs.weather?.unit === 'f';
  const show = (celsius) => {
    const value = Number(celsius) || 0;
    return fahrenheit ? Math.round((value * 9) / 5 + 32) : Math.round(value);
  };
  const now = weather.current;
  /* Six days after today: today owns the big number above, so the strip is
     only what comes next. */
  const days = (weather.days ?? []).slice(1, 7);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'];
  const dayCells = days
    .map((day) => {
      const date = new Date(day.date);
      return `<div class="wx-day">
        <em>周${weekday[date.getDay()]}</em>
        ${svg(WEATHER_ICON[day.icon] ?? WEATHER_ICON.cloud)}
        <span class="wx-range"><b>${show(day.max)}°</b><i>${show(day.min)}°</i></span>
      </div>`;
    })
    .join('');
  const place = escapeHtml(placeZh(weather.place.name) || '当前位置');
  const country = weather.place.country ? ' · ' + escapeHtml(countryZh(weather.place.country)) : '';
  const sunrise = (now.sunrise || '').slice(11, 16) || '--:--';
  const sunset = (now.sunset || '').slice(11, 16) || '--:--';
  const updated = weather.fetchedAt ? ' · ' + timeOf(weather.fetchedAt) + ' 更新' : '';
  return `<div class="wx">
    <div class="wx-now">
      <div class="wx-where"><b>${place}</b><em>${escapeHtml(now.text)}${country}</em></div>
      <div class="wx-temp">${show(now.temp)}<sup>°</sup></div>
      <span class="wx-icon">${svg(WEATHER_ICON[now.icon] ?? WEATHER_ICON.cloud)}</span>
    </div>
    <div class="wx-grid">
      <div class="wx-cell"><em>体感</em><b>${show(now.feels)}°</b></div>
      <div class="wx-cell"><em>湿度</em><b>${Number(now.humidity) || 0}%</b></div>
      <div class="wx-cell"><em>风速</em><b>${Number(now.wind) || 0}<small>km/h</small></b></div>
      <div class="wx-cell"><em>日出 · 日落</em><b>${sunrise} / ${sunset}</b></div>
    </div>
    <div class="wx-days">${dayCells}</div>
    <p class="wx-src">Open-Meteo${updated}</p>
  </div>`;
}

const timeOf = (ms) => {
  const date = new Date(Number(ms) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

const CURRENCY_MARKS = { CNY: '¥', USD: '$' };

/**
 * The agent row under the balance.
 *
 * Three figures, not a second quota: how many agent sessions the linkage
 * watches, how many of them are working right now, and the rest. The numbers
 * come from the agent sources' own status files through the main process; a
 * missing snapshot or every source switched off reads as "未连接" instead of a
 * row of zeros that would claim a measured zero.
 */
function agentRow() {
  const list = Array.isArray(agentsState) ? agentsState : null;
  const on = list ? list.filter((agent) => agent.on) : [];
  const running = on.filter((agent) => agent.running).length;
  const live = on.length > 0;
  const idle = Math.max(0, on.length - running);
  const figure = (value) => (live ? String(value) : '—');
  const state = !live ? 'off' : running ? 'busy' : 'idle';
  const label = live
    ? `Agent 联动：${on.length} 个会话，${running} 个运行中，${idle} 个空闲`
    : 'Agent 联动：未连接';
  return `<button type="button" class="quota-agent" data-action="settings:agent" data-state="${state}" aria-label="${escapeHtml(label)}">
    <i class="quota-agent-dot" aria-hidden="true"></i>
    <span class="quota-agent-name">Agent</span>
    <span class="quota-agent-stats"><b>${figure(on.length)}</b>会话<b>${figure(running)}</b>运行<b>${figure(idle)}</b>空闲</span>
    <span class="quota-agent-note">${live ? '' : '未连接'}</span>
  </button>`;
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
    return `<div class="quota-page quota-page-empty">
      <p class="quota-blank">还没有连接额度账号</p>
      <button type="button" class="ghost" data-action="settings:quota">添加账号</button>
    </div>`;
  }
  const current = state.accounts.find((account) => account.current);
  const last = state.last;
  const provider = providerName(last?.provider ?? current?.provider);
  const currency = last?.currency ?? '';
  const mark = CURRENCY_MARKS[currency] ?? '';
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
  const meta = `<div class="quota-meta">
      <span class="quota-id"><b>${escapeHtml(provider)}</b>${currency ? `<i>·</i>${escapeHtml(currency)}` : ''}${last && last.available === false ? '<em class="quota-off">不可用</em>' : ''}</span>
      ${dots}
    </div>`;
  const refresh = '<button type="button" class="ghost" data-local="quota:refresh">刷新</button>';
  if (!last || last.error) {
    return `<div class="quota quota-broken">
      ${meta}
      <p class="quota-flag">${escapeHtml(last?.error ?? '正在查询…')}</p>
      <div class="quota-foot">
        <span>${last?.at ? '更新于 ' + timeOf(last.at) : '尚未更新'}</span>
        <span class="spacer"></span>
        ${refresh}
      </div>
    </div>`;
  }
  /*
   * The balance is the page's one focus: 30px of tabular figures. Below it,
   * the only ratio these two amounts contain — topped vs granted — as a 4px
   * bar with a legend that names its two colours. The split is written as a
   * custom property; no new data field is introduced, and every skin paints
   * the same numbers.
   */
  const topped = Number(last.topped) || 0;
  const granted = Number(last.granted) || 0;
  const split = topped + granted;
  const share = split > 0 ? Math.round((topped / split) * 100) : 0;
  return `<div class="quota" data-gauge="true" style="--quota-share:${share}">
    ${meta}
    <div class="quota-balance"><span class="quota-amount"><small>${mark}</small>${escapeHtml(last.total)}</span></div>
    <div class="quota-ratio">
      <span class="quota-meter" aria-hidden="true"></span>
      <div class="quota-legend">
        <span class="quota-part topped"><i class="quota-piece"></i>充值 ${mark}${escapeHtml(last.topped)}</span>
        <span class="quota-part granted"><i class="quota-piece"></i>赠送 ${mark}${escapeHtml(last.granted)}</span>
      </div>
    </div>
    ${agentRow()}
    <div class="quota-foot">
      <span>更新于 ${timeOf(last.at)}</span>
      <span class="spacer"></span>
      ${refresh}
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
    return `<div class="msg-page msg-page-empty">
      <p class="msg-empty-line">没有消息应用在运行</p>
      <button type="button" class="ghost" data-action="settings:comm">去设置</button>
    </div>`;
  }
  const groups = apps
    .map((app) => {
      const name = sessionLabel(app);
      const pending = Number(app.unread) || 0;
      const aria = name + '，' + (pending ? pending + ' 条未读，' : '') + '切过去';
      return `<div class="msg-group" data-app="${escapeHtml(app.id)}">
      <button type="button" class="msg-row" data-local="messenger:activate" data-id="${escapeHtml(app.handle)}" title="${escapeHtml(app.title || app.label)}" aria-label="${escapeHtml(aria)}">
        <span class="msg-dot" aria-hidden="true"></span>
        <span class="msg-session">${escapeHtml(name)}</span>
        <span class="msg-unread">${pending ? pending : ''}</span>
      </button>
    </div>`;
    })
    .join('');
  const unread = apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0);
  /* The number is the page's answer, so it owns the first line and is tabular;
     the two words beside it are what turn it into a sentence. */
  const head = unread
    ? `<b class="msg-total">${unread}</b><span class="msg-total-label">条未读</span>`
    : '<span class="msg-quiet">没有未读</span>';
  /* A list that silently hides a fifth app is a list you cannot trust: the
     count line carries the rows below the fold the way the device page does. */
  const more = apps.length > MESSAGE_ROWS
    ? `<div class="msg-more">还有 ${apps.length - MESSAGE_ROWS} 个应用</div>`
    : '';
  return `<div class="msg-page">
    <div class="msg-top">${head}</div>
    <div class="msg-list">${groups}</div>
    ${more}
  </div>`;
}

/**
 * Mailbox: two tabs over one fixed-height row per sender.
 *
 * The page used to stack a messenger switchboard, a head line and two-line
 * subject rows: six messages in 205px, every row a different height, and a dot
 * that shifted the sender depending on whether the mail was read. Now the tabs
 * own the first 22px, a row is exactly 20px, and unread is a 3px accent bar on
 * the left. The subject moves to the row tooltip — this list is scanned for who
 * wrote and when. 全部/未读 is two radios plus :has(), so a mail push that
 * re-renders the page cannot leave stale script state behind.
 */
function mailTabs(total, unread) {
  return `<input type="radio" name="mail-tab" id="mail-tab-all" class="mail-tab-radio" checked />
    <label class="mail-tab" for="mail-tab-all">全部<i>${total}</i></label>
    <input type="radio" name="mail-tab" id="mail-tab-unread" class="mail-tab-radio" />
    <label class="mail-tab" for="mail-tab-unread">未读<i>${unread}</i></label>`;
}

function mailPage() {
  const state = mailState ?? { accounts: [], messages: [] };
  if (!state.accounts.length) {
    /* One line and one action at the top of the page: the centred icon, title,
       provider note and button filled 205px with a band of air. */
    return `<div class="mail-page mail-page-empty">
      <div class="mail-empty">
        <p class="mail-empty-line">还没有添加邮箱</p>
        <button type="button" class="ghost" data-action="settings:comm">添加邮箱</button>
      </div>
    </div>`;
  }
  const messages = state.messages ?? [];
  /* The tab counts follow the rows the page actually shows: the list is capped
     at nine, so an unread mail below the fold must not inflate "未读" past the
     bars the list can draw. */
  const visible = messages.slice(0, 9);
  const unread = visible.filter((message) => !message.seen).length;
  const sync = state.syncing ? '同步中' : state.error ? '部分失败' : state.lastSync ? timeOf(state.lastSync) + ' 更新' : '';
  /* The tab line's one door to the message centre: "消息 N" opens that page.
     It is drawn only while that page is switched on — the rows, the empty state
     and the settings hint all live there, so an entry jumping into a hidden
     page would be exactly the dead control the popover was. */
  const apps = messengerState?.apps ?? [];
  const msgUnread = apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0);
  const msgPageOn = enabledPages().some((page) => page.key === 'messenger');
  const msgEntry = msgPageOn
    ? `<button type="button" class="mail-msg-entry" data-goto="messenger" aria-label="消息${msgUnread ? '，' + msgUnread + ' 条未读' : ''}">消息${msgUnread ? ' ' + msgUnread : ''}</button>`
    : '';
  /* The sync note rides on the tab line: a separate head row above the list
     pushed the last message past the content box. */
  const head = `<div class="mail-tabs">${mailTabs(messages.length, unread)}<span class="mail-tab-spacer"></span><span class="mail-sync" title="${escapeHtml(state.error || '')}">${escapeHtml(sync)}</span>${msgEntry}</div>`;
  if (!messages.length) {
    const hint = state.syncing ? '正在同步…' : state.error ? '检查授权码或网络，然后在设置里重新同步。' : '新邮件到达后会出现在这里。';
    return `<div class="mail-page">${head}<div class="mail mail-empty-inline">
      <p class="mail-empty-line">${escapeHtml(hint)}</p>
      <button type="button" class="ghost" data-action="settings:comm">去设置</button>
    </div></div>`;
  }
  /* Nine rows is exactly what the 189px the tab line leaves can hold; the list
     scrolls if a future row height widens it, but the page never grows. */
  const rows = visible
    .map((message) => {
      /* The sender is the line; the subject is the tooltip. An address without
         a display name is still a sender, so a row never renders blank. */
      const from = message.fromName || message.fromAddress || '未知发件人';
      const isUnread = message.seen ? 0 : 1;
      const title = [message.subject, message.fromAddress].filter(Boolean).join(' · ');
      return `<div class="mail-row${isUnread ? ' unread' : ''}" data-unread="${isUnread}" title="${escapeHtml(title)}">
        <span class="mail-from">${escapeHtml(from)}</span>
        <time class="mail-time">${timeOf(message.date)}</time>
      </div>`;
    })
    .join('');
  return `<div class="mail-page">${head}<div class="mail">
    <div class="mail-list">${rows}<p class="mail-none">没有未读邮件</p></div>
  </div></div>`;
}

/* --------------------------------------------------------------- calendar */

const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

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
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
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
  const selectedEvents = byDay.get(selectedKey) ?? [];
  const visibleEvents = selectedEvents.slice(0, 2);

  const grid = shown
    .map((day) => {
      if (day === null) return '<span class="cal-cell empty"></span>';
      const key = `${calendarView.year}-${calendarView.month + 1}-${day}`;
      const list = byDay.get(key) ?? [];
      const isToday = key === todayKey;
      const classes = ['cal-cell'];
      if (isToday) classes.push('today');
      if (day === calendarView.selected) classes.push('picked');
      return `<button type="button" class="${classes.join(' ')}" data-cal-day="${day}" aria-label="${calendarView.month + 1} 月 ${day} 日">
        <span>${day}</span>${isToday ? '<i class="cal-today-dot"></i>' : ''}${list.length ? '<i class="cal-ev-dot"></i>' : ''}
      </button>`;
    })
    .join('');

  const isToday = selectedKey === todayKey;
  const title = isToday
    ? `今天 · ${selectedEvents.length} 件事`
    : `${calendarView.month + 1} 月 ${calendarView.selected} 日 · ${selectedEvents.length} 件事`;
  const rows = visibleEvents
    .map((event) => {
      const start = new Date(event.start);
      const time = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
      return `<div class="cal-event"><span class="cal-time">${time}</span><b>${escapeHtml(event.title)}</b></div>`;
    })
    .join('');
  const festival = FESTIVALS[calendarView.month + 1 + '-' + calendarView.selected];

  return `<div class="calendar">
    <div class="cal-left">
      <div class="cal-head">
        <button type="button" class="icon-btn" data-cal-nav="-1" aria-label="上个月">${svg('<path d="m15 5-7 7 7 7"/>')}</button>
        <b>${calendarView.year} 年 ${calendarView.month + 1} 月</b>
        <button type="button" class="icon-btn" data-cal-nav="1" aria-label="下个月">${svg('<path d="m9 5 7 7-7 7"/>')}</button>
      </div>
      <div class="cal-week">${WEEK_ZH.map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="cal-grid">${grid}</div>
    </div>
    <div class="cal-right">
      <div class="cal-day-title">${title}</div>
      ${festival ? `<em class="cal-festival">${festival}</em>` : ''}
      ${visibleEvents.length
        ? `<div class="cal-events">${rows}</div>`
        : '<p class="cal-empty">没有安排</p>'}
      ${subError ? `<p class="cal-error" title="${escapeHtml(subError)}">${escapeHtml(subError)}</p>` : ''}
    </div>
  </div>`;
}

function fallbackPage(page) {
  return empty(
    ICON[page.icon] ?? ICON.check,
    page.title,
    `这一页在阶段 ${page.stage} 开放。`,
  );
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
    return `<div class="focus focus-empty">
      <p>专注还没有打开</p>
      <button type="button" class="ghost" data-action="settings:focus">去打开</button>
    </div>`;
  }
  const workMin = Math.max(1, Number(prefs.focus?.work) || 25);
  const phase = state.phase;
  const running = state.running;
  const idle = phase === 'idle';
  const rest = phase === 'rest';
  /* At rest the clock is the configured 25:00, not 0:00: the page is a
     stopwatch waiting to start, and the number is its face. */
  const seconds = idle ? workMin * 60 : state.remaining;
  const pct = state.total ? Math.min(100, ((state.total - state.remaining) / state.total) * 100) : 0;
  const phaseText = idle ? '准备开始' : rest ? (running ? '休息中' : '休息暂停') : running ? '专注中' : '已暂停';
  /*
   * Three keys, three real actions from the main process: 专注 starts or
   * resumes work, 休息 skips into (or out of) the rest phase, 播放 is the
   * transport. A move the current phase cannot perform is disabled, not
   * hidden, so the row keeps its shape and the next move stays visible.
   */
  const focusKey = idle || (phase === 'work' && !running)
    ? `<button type="button" class="focus-key" data-local="focus:${idle ? 'start' : 'resume'}">专注</button>`
    : '<button type="button" class="focus-key" disabled>专注</button>';
  const restKey = idle
    ? '<button type="button" class="focus-key" disabled>休息</button>'
    : `<button type="button" class="focus-key${rest ? ' on' : ''}" data-local="focus:skip">${rest ? '结束休息' : '休息'}</button>`;
  const playKey = running
    ? '<button type="button" class="focus-key on" data-local="focus:pause">暂停</button>'
    : `<button type="button" class="focus-key" data-local="focus:${idle ? 'start' : 'resume'}">${idle ? '播放' : '继续'}</button>`;
  return `<div class="focus">
    <div class="focus-main">
      <div class="focus-ring" style="--pct:${pct.toFixed(1)}"><span class="focus-phase">${phaseText}</span></div>
      <b class="focus-time">${clock(seconds)}</b>
    </div>
    <div class="focus-keys">${focusKey}${restKey}${playKey}</div>
    <p class="focus-note">已完成 ${state.cycles} 轮专注</p>
  </div>`;
}

function healthPage() {
  const state = healthState;
  if (!state.enabled) {
    return `<div class="health health-empty">
      <p>健康提醒还没有打开</p>
      <button type="button" class="ghost" data-action="settings:focus">去打开</button>
    </div>`;
  }
  const waterPct = Math.min(100, (state.sinceWater / state.waterMin) * 100);
  const standPct = Math.min(100, (state.sinceStand / state.standMin) * 100);
  const total = (state.waterCount || 0) + (state.standCount || 0);
  /*
   * Two rows, one per counter: label, the 4px bar, then the elapsed/interval
   * figure. The row itself is the record button — one 36px hit target instead
   * of a separate pill, which is what keeps both counters on the page at
   * reading size without a card around each.
   */
  const row = (label, action, since, every, pct, due, hint) => `<button type="button" class="health-row" data-local="health:${action}" aria-label="${hint}" title="${hint}">
      <b class="health-label">${label}</b>
      <span class="health-bar"><i style="width:${pct.toFixed(0)}%" data-due="${due}"></i></span>
      <span class="health-num">${since}<i>/${every}</i></span>
    </button>`;
  return `<div class="health">
    ${row('喝水', 'drink', state.sinceWater, state.waterMin, waterPct, state.waterDue, '记录一次喝水')}
    ${row('站立', 'stand', state.sinceStand, state.standMin, standPct, state.standDue, '记录一次站立')}
    <div class="health-foot">
      <span>今日已记录 ${total} 次</span>
      <button type="button" class="health-clear" data-local="health:reset">清空</button>
    </div>
  </div>`;
}

function dueLabel(due) {
  if (!due) return '';
  const date = new Date(due);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return time;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function todoPage() {
  if (prefs.todo?.enabled === false) {
    /* The disabled state is another empty page, so it follows the same rule:
       one line, one action, against the top. */
    return `<div class="todo todo-blank-page">
      <p class="todo-blank">待办已在设置里关闭</p>
      <button type="button" class="ghost" data-action="settings:todo">去打开</button>
    </div>`;
  }
  const openItems = todos.filter((item) => !item.done);
  const doneItems = todos.filter((item) => item.done);
  const total = todos.length;
  const done = doneItems.length;
  const addRow = `<div class="todo-add">
      <input type="text" placeholder="加一个，回车保存" data-todo-input maxlength="200" />
      <label class="todo-due-pick" title="设到期时间">
        <input type="datetime-local" data-todo-due />
        <span>到期</span>
      </label>
      <label class="todo-repeat-pick" title="重复">
        <select data-todo-repeat>
          <option value="none">不重复</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
        </select>
      </label>
    </div>`;
  if (!total) {
    /*
     * One line and the field itself. The input is the page's only action, so
     * the empty state needs no icon, no second button and no centred block:
     * the old one sat in the middle of the card with 50px of air around it.
     */
    return `<div class="todo todo-blank-page">
      <p class="todo-blank">还没有待办</p>
      ${addRow}
    </div>`;
  }
  const itemHtml = (item) => `<div class="todo-item${item.done ? ' done' : ''}" data-id="${item.id}">
      <button type="button" class="todo-check" data-local="todo:toggle" data-id="${item.id}" aria-label="完成">${item.done ? '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' : ''}</button>
      <span class="todo-text">${escapeHtml(item.text)}</span>
      ${item.repeat ? `<em class="todo-repeat">${item.repeat === 'daily' ? '每天' : '每周'}</em>` : ''}
      ${item.due ? `<em class="todo-due${item.due < Date.now() && !item.done ? ' late' : ''}">${item.done && item.nextDue ? '下次 ' + dueLabel(item.nextDue) : dueLabel(item.due)}</em>` : ''}
      <button type="button" class="todo-del" data-local="todo:remove" data-id="${item.id}" aria-label="删除">×</button>
    </div>`;
  const pct = Math.round((done / total) * 100);
  /*
   * Four bands against the top: done/total with a 4px bar, the add row, a
   * three-row list, and the clear line. Six tasks used to stack 197px of rows
   * into a 167px list; the list now has its own 88px viewport and scrolls
   * there, so neither the page nor the panel can grow with the list.
   */
  return `<div class="todo">
    <div class="todo-progress">
      <span class="todo-count"><b>${done}</b><i>/</i>${total} 完成</span>
      <span class="todo-bar" aria-hidden="true"><i style="width:${pct}%"${pct === 100 ? ' data-done="true"' : ''}></i></span>
    </div>
    ${addRow}
    <div class="todo-list">${[...openItems, ...doneItems].map(itemHtml).join('')}</div>
    ${done ? `<button type="button" class="todo-clear" data-local="todo:clearDone">清空 ${done} 条已完成</button>` : ''}
  </div>`;
}

const sizeLabel = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

/** The clipboard stays one row until the user opens it; this is UI state only. */
let clipboardExpanded = false;

function shelfPage() {
  if (prefs.shelf?.enabled === false) {
    return empty(ICON.tray, '置物架已关闭', '打开后可以把文件拖到岛上暂存。', '去打开', 'settings:todo');
  }
  /*
   * An empty shelf is a small drop target pinned to the top, not a page.
   *
   * The page used to be a full-height column: the hint at the top, a centred
   * "置物架是空的" paragraph, and the clipboard panel stretching into whatever
   * was left. That reads as three blocks floating in 205px. With no files there
   * is one 96px prompt, and the clipboard keeps its own row below.
   */
  const emptyShelf = shelfFiles.length === 0;
  /*
   * One row is 24px: a 16px file glyph, the name at reading size with an
   * ellipsis and a 16px delete key. The size label is gone — it was the third
   * column in a 24px row and the only thing that did not fit; the open key's
   * tooltip still carries it. The list shows four rows and scrolls, so a busy
   * shelf cannot push the clipboard entry off the page.
   */
  const fileIcon = svg('<path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21V3a.5.5 0 0 1 .5-.5z"/><path d="M13 2.5V8h5"/>');
  const closeIcon = svg('<path d="m6 6 12 12M18 6 6 18"/>');
  const caretIcon = svg('<path d="m9 6 6 6-6 6"/>');
  const rows = shelfFiles
    .map((file) => `<div class="shelf-item" data-id="${escapeHtml(file.name)}">
            <span class="shelf-icon">${fileIcon}</span>
            <button type="button" class="shelf-open" data-local="shelf:open" data-name="${escapeHtml(file.name)}" title="打开 · ${sizeLabel(file.size)}">${escapeHtml(file.name)}</button>
            <button type="button" class="shelf-del" data-local="shelf:remove" data-name="${escapeHtml(file.name)}" aria-label="删除">${closeIcon}</button>
          </div>`)
    .join('');
  const clips = clipboardItems.map((item) => `<div class="clip-item">
      <button type="button" class="clip-text" data-local="clipboard:copy" data-id="${escapeHtml(item.id)}" title="点击复制">${escapeHtml(clipLabel(item.text))}</button>
      <button type="button" class="clip-pin${item.pinned ? ' on' : ''}" data-local="clipboard:togglePin" data-id="${escapeHtml(item.id)}" aria-label="固定">★</button>
    </div>`).join('');
  /*
   * The clipboard is one row until asked for. Folded it is the page's entry
   * line — a 28px key with the count and a caret; opened it lists the copies in
   * place and caps itself so a long history never becomes the page.
   */
  const clipOpen = clipboardExpanded && clipboardItems.length > 0;
  const clipBlock = `<div class="clip${clipOpen ? ' clip-open' : ''}">
    <div class="clip-head">${clipboardItems.length
      ? `<button type="button" class="clip-fold" data-clipfold aria-expanded="${clipOpen}"><span>剪贴板</span><b>${clipboardItems.length} 条</b><span class="clip-caret${clipOpen ? ' on' : ''}">${caretIcon}</span></button>`
      : '<p class="clip-fold-empty">剪贴板 · 复制文字后会出现在这里。</p>'}
      ${clipOpen ? '<button type="button" class="ghost" data-local="clipboard:clear">清空</button>' : ''}
    </div>
    ${clipOpen ? `<div class="clip-list">${clips}</div>` : ''}
  </div>`;
  return `<div class="shelf${emptyShelf ? ' shelf-empty' : ''}${clipOpen ? ' shelf-clip-open' : ''}" data-shelf-drop>
    <div class="shelf-hint">${emptyShelf
      ? '<b>置物架是空的</b><span>把文件拖到这里 · 复制到 <code>shelf</code> 文件夹</span>'
      : '把文件拖到这里 · 复制到 <code>shelf</code> 文件夹'}</div>
    ${emptyShelf ? '' : `<div class="shelf-list">${rows}</div>`}
    ${clipBlock}
  </div>`;
}

/** One line of the clipboard list: a copy is text, not a document. */
function clipLabel(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > 42 ? flat.slice(0, 42) + '…' : flat;
}

/* The Bluetooth mark, drawn at 20px on every device row. */
const DEVICE_ICON = '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>';

/**
 * Battery first, paired devices second.
 *
 * The level is the page's answer, so it owns the first line at 30px in tabular
 * figures; charging is one quiet caption under it. The 4px bar below only gives
 * the number a shape, and it changes colour in three bands — red under 20,
 * amber under 50, the accent from there up — so the state is legible before the
 * digits are read.
 *
 * A device row is 28px: 20px glyph, name at 12.5 with an ellipsis, a 60x3 bar
 * and the number at 11 in tabular figures. A device with no battery property
 * still gets a row — "the headset is connected" is half the answer — with an
 * em dash where the number would be. Three rows is the density the page
 * promises; the count line carries the rest rather than a scrolling list that
 * would hide the levels below the fold.
 *
 * The footer dot is a status, not a switch: the island cannot toggle the radio,
 * and a switch that only looks interactive is a false affordance. The row is
 * the page's one action instead: it opens the system's own Bluetooth page,
 * where the radio can actually be toggled. If that call fails the row is
 * disabled and says why, rather than staying a button that opens nothing.
 */
function devicesPage() {
  const list = devicesState?.devices ?? [];
  /* One source for both the number and the bar: a missing battery is "-", not 0. */
  const knownLevel = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const level = Number(value);
    if (!Number.isFinite(level)) return null;
    return Math.max(0, Math.min(100, Math.round(level)));
  };
  const toneOf = (level) => (level === null ? '' : level < 20 ? ' bad' : level < 50 ? ' warn' : '');
  const level = knownLevel(battery?.level);
  const hero = `<div class="dev-hero">
      <b class="dev-level">${level === null ? '—' : `${level}<span>%</span>`}</b>
      <span class="dev-charge">${level === null ? '未检测到电池' : battery?.charging ? '充电中' : '使用电池'}</span>
    </div>
    <div class="dev-power${toneOf(level)}" aria-hidden="true"><i style="width:${level === null ? 0 : level}%"></i></div>`;
  /*
   * The footer is a button now, and it is rendered from the same state as the
   * rest of the page: a failed open sets systemOpenError, the next render puts
   * the row in its disabled form, and a reload cannot silently re-enable it.
   */
  const bluetoothOn = list.length ? ' on' : '';
  const footer = systemOpenError
    ? '<button type="button" class="dev-foot" data-open-system="bluetooth" disabled><span class="dev-bt"><i class="' + bluetoothOn + '"></i>蓝牙</span><span class="dev-foot-note">' + escapeHtml(systemOpenError) + '</span></button>'
    : '<button type="button" class="dev-foot" data-open-system="bluetooth" title="打开系统蓝牙设置"><span class="dev-bt"><i class="' + bluetoothOn + '"></i>蓝牙</span><span class="dev-foot-note">系统设置</span></button>';
  if (!list.length) {
    return `<div class="dev">
      ${hero}
      <div class="dev-empty">
        <p class="dev-empty-line">没有已连接的蓝牙设备</p>
        <button type="button" class="ghost" data-action="settings:general">去设置</button>
      </div>
      ${footer}
    </div>`;
  }
  const shown = list.slice(0, 3);
  const rest = list.length - shown.length;
  const rows = shown
    .map((device) => {
      const level = knownLevel(device.battery);
      return `<div class="dev-item">
        <span class="dev-icon">${svg(DEVICE_ICON)}</span>
        <span class="dev-name">${escapeHtml(device.name)}</span>
        <span class="dev-meter${toneOf(level)}" aria-hidden="true"><i style="width:${level === null ? 0 : level}%"></i></span>
        <span class="dev-bat${toneOf(level)}">${level === null ? '—' : level + '%'}</span>
      </div>`;
    })
    .join('');
  return `<div class="dev">
    ${hero}
    <div class="dev-list">${rows}</div>
    ${rest > 0 ? `<div class="dev-more">还有 ${rest} 台</div>` : ''}
    ${footer}
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
    system: 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    pingfang: '"PingFang SC", "Microsoft YaHei", sans-serif',
    yahei: '"Microsoft YaHei", "PingFang SC", sans-serif',
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
  document.body.dataset.motion = prefs.motion === false ? 'off' : 'on';
  document.body.dataset.reduceMotion = prefs.reduceMotion === true ? 'on' : 'off';
  document.body.dataset.theme = resolveTheme();
  timeFormat24 = prefs.timeFormat !== '12h';
}

function applyLocal(snapshot) {
  if (!snapshot) return;
  if (snapshot.focus) focusState = snapshot.focus;
  if (snapshot.health) healthState = snapshot.health;
  if (Array.isArray(snapshot.todos)) todos = snapshot.todos;
  if (Array.isArray(snapshot.shelf)) shelfFiles = snapshot.shelf;
  if (Array.isArray(snapshot.clipboard)) clipboardItems = snapshot.clipboard;
  if (snapshot.messenger) messengerState = snapshot.messenger;
  if (snapshot.devices) devicesState = snapshot.devices;
}

/** +1 = next page, -1 = previous; the panel slides in from the side it came from. */
let pageDir = 1;

function renderPage(animate = false) {
  const list = enabledPages();
  // A new page is a new DOM: the old panel (and its open state) is gone.
  volumePanelOpen = false;
  if (!list.length) {
    document.body.dataset.pages = '0';
    /* Write the inner span, never the host: textContent on #page-title would
       delete the span the marquee needs, and every later render would find
       nothing to write into. */
    const titleText = titleEl.firstElementChild;
    if (titleText) titleText.textContent = '还没有页面';
    titleEl.dataset.over = 'false';
    const subText = subEl.firstElementChild;
    if (subText) subText.textContent = '去设置里打开';
    subEl.dataset.muted = 'false';
    subEl.dataset.over = 'false';
    pagesEl.innerHTML = empty(ICON.check, '页面都是关的', '在设置 → 页面管理里打开至少一个。', '打开设置', 'settings:pages');
    dotsEl.innerHTML = '';
    dotsEl.hidden = true;
    for (const pager of document.querySelectorAll('.pager')) {
      pager.hidden = true;
    }
    measure();
    return;
  }
  if (!list.length) {
    document.body.dataset.pages = '0';
    /* Write the inner span, never the host: textContent on #page-title would
       delete the span the marquee needs, and every later render would find
       nothing to write into. */
    const titleText = titleEl.firstElementChild;
    if (titleText) titleText.textContent = '还没有页面';
    titleEl.dataset.over = 'false';
    const subText = subEl.firstElementChild;
    if (subText) subText.textContent = '去设置里打开';
    subEl.dataset.muted = 'false';
    subEl.dataset.over = 'false';
    pagesEl.innerHTML = empty(ICON.check, '页面都是关的', '在设置 → 页面管理里打开至少一个。', '打开设置', 'settings:pages');
    dotsEl.innerHTML = '';
    dotsEl.hidden = true;
    for (const pager of document.querySelectorAll('.pager')) {
      pager.hidden = true;
    }
    measure();
    return;
  }
  // Wrapping, not clamping: the arrows are a carousel, not a dead end.
  pageIndex = ((pageIndex % list.length) + list.length) % list.length;
  // One page means the paging arrows would be dead controls.
  document.body.dataset.pages = String(list.length);
  const page = list[pageIndex];
  const nameEl = document.getElementById('page-name');
  if (nameEl) nameEl.textContent = page.title;
  renderHeader();
  renderSub();
  pagesEl.innerHTML = (RENDERERS[page.key] ?? ((p) => fallbackPage(p)))(page);
  dotsEl.innerHTML = list
    .map((p, index) => `<button type="button" data-page="${index}" aria-current="${index === pageIndex}" aria-label="${p.title}"></button>`)
    .join('');
  const paging = pagingVisibility(list.length);
  document.body.dataset.pages = String(list.length);
  dotsEl.hidden = !paging.dots;
  for (const pager of document.querySelectorAll('.pager')) {
    pager.hidden = !paging.arrows;
  }
  if (animate) {
    pagesEl.classList.remove('page-in-left', 'page-in-right');
    // Force a style flush so re-adding the class restarts the animation even
    // when two consecutive switches use the same direction.
    void pagesEl.offsetWidth;
    pagesEl.classList.add(pageDir > 0 ? 'page-in-left' : 'page-in-right');
  }
  measure();
}

/*
 * Scrolling inside a scrollable block must stay there.
 *
 * The pages container is the island's own scroller and the wheel handler that
 * flips pages sits above it, so a wheel over the clipboard both scrolled the
 * list and turned the page. Stopping propagation at the list is the narrowest
 * fix: everywhere else the wheel still pages as before.
 *
 * The todo list joins them now that it scrolls itself instead of growing the
 * page: a wheel over a long list should scroll the list, not flip away from it.
 */
document.addEventListener(
  'wheel',
  (event) => {
    const list =
      event.target instanceof Element
        ? event.target.closest('.clip-list, .shelf-list, .todo-list, .mail-page, .mail')
        : null;
    if (list && list.scrollHeight > list.clientHeight + 1) event.stopPropagation();
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
const MORPH_OPEN = { durW: 240, durH: 340, delayW: 0, delayH: 60, total: 400 };
const MORPH_CLOSE = { durW: 210, durH: 190, delayW: 30, delayH: 0, total: 240 };

let morphFrame = 0;
/** True from the moment a fold starts until the pill is the surface again. */
let closing = false;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** 0→1 with no corners: carries opacity, never the box. */
const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** cubic-bezier(0.22, 1, 0.36, 1): the curve the CSS morph used. expo-out, no overshoot. */
function easeMorph(u) {
  const x = clamp01(u);
  if (x === 0 || x === 1) return x;
  const bezier = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const at = bezier(0.22, 0.36, t);
    if (Math.abs(at - x) < 0.0001) break;
    if (at < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return bezier(1, 1, t);
}

/** The radius the panel rests at, read from the preference the stylesheet publishes. */
function panelRadius() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius'));
  return Number.isFinite(value) ? value : 22;
}

/** Drop the painted scale and the inline box rule; the panel is its layout again. */
function stopMorph() {
  if (morphFrame) cancelAnimationFrame(morphFrame);
  morphFrame = 0;
  morph = null;
  islandEl.style.transition = '';
  panelEl.style.transform = '';
  panelEl.style.opacity = '';
  panelEl.style.borderRadius = '';
  pillEl.style.opacity = '';
}

/*
 * Paint one frame of the morph from the box the driver just wrote.
 *
 * The corner and the fade are carried values, not functions of the box: each
 * frame re-aims a short tween at the surface's end state (open or folded) and
 * keeps the value the previous frame reached. That is what lets a reversed
 * morph resume exactly where the eye left it — neither snaps back to an end
 * state, and neither derives its rate from an axis that is front-loaded.
 */
function paintMorph(w, h, elapsed) {
  const m = morph;
  islandEl.style.width = `${w}px`;
  islandEl.style.height = `${h}px`;
  /* Two short tweens, not ratios of the box: the close drains 264px of height
     in 190ms and the width is front-loaded, so a radius or a fade read off
     either axis moves in visible steps. These follow the same schedule for
     both directions and only ever continue from their last value. */
  const cornerAt = clamp01(elapsed / m.cornerMs);
  m.corner = m.cornerFrom + (m.cornerTo - m.cornerFrom) * smoothstep(cornerAt);
  const fadeAt = clamp01((elapsed - m.fadeDelay) / m.fadeMs);
  m.opacity = m.fadeFrom + (m.fadeTo - m.fadeFrom) * smoothstep(fadeAt);
  /* Transform origin is top centre (island.css), so this box is pinned to the
     pill's top edge and grows outwards without a second position animation. */
  panelEl.style.transform = `scale(${Math.min(1, w / m.panelW)}, ${Math.min(1, h / m.panelH)})`;
  panelEl.style.opacity = String(m.opacity);
  panelEl.style.borderRadius = `${Math.round(999 + (m.radius - 999) * m.corner)}px`;
  if (!m.open) {
    /* The pill comes back over the last stretch, once the card is nearly the
       pill's own box: one silhouette dissolving into the other. */
    const progress = clamp01(elapsed / MORPH_CLOSE.total);
    pillEl.style.opacity = String(smoothstep((progress - 0.55) / 0.45));
  }
  reportHit();
}

/**
 * Run the box to the open (or folded) target from the box on screen.
 *
 * `from` is read from the live box, not from the previous target, so an
 * interrupt starts where the eye left it. `fold` is the pill box the morph
 * measures itself against: the panel's opacity and corner are a function of
 * where the box sits between the two, not of elapsed time alone.
 */
function startMorph(open, from, fold) {
  const panelW = panelEl.offsetWidth;
  const panelH = panelEl.offsetHeight;
  if (!panelW || !panelH || !fold.width || !fold.height) return false;
  /* Carry the corner and the fade where the eye last saw them, so a reversed
     morph does not snap either back to an end state. */
  const carriedCorner = morph ? morph.corner : open ? 0 : 1;
  const carriedFade = morph ? morph.opacity : open ? 0 : 1;
  stopMorph();
  const clock = open ? MORPH_OPEN : MORPH_CLOSE;
  morph = {
    open,
    fromW: from.width,
    fromH: from.height,
    toW: open ? panelW : Math.ceil(fold.width),
    toH: open ? panelH : Math.ceil(fold.height),
    panelW,
    panelH,
    foldW: fold.width,
    foldH: fold.height,
    radius: panelRadius(),
    corner: carriedCorner,
    cornerFrom: carriedCorner,
    cornerTo: open ? 1 : 0,
    cornerMs: open ? 400 : 240,
    opacity: carriedFade,
    fadeFrom: carriedFade,
    fadeTo: open ? 1 : 0,
    fadeMs: 160,
    fadeDelay: open ? 0 : 80,
    startedAt: performance.now(),
  };
  /* The CSS transition is the fallback clock for non-morph size changes; while
     this loop owns the box it must be off, or every write would start a race
     between the transition and the next frame. */
  islandEl.style.transition = 'none';
  paintMorph(morph.fromW, morph.fromH, 0);
  const step = (now) => {
    const m = morph;
    if (!m) return;
    const t = now - m.startedAt;
    const w = m.fromW + (m.toW - m.fromW) * easeMorph((t - clock.delayW) / clock.durW);
    const h = m.fromH + (m.toH - m.fromH) * easeMorph((t - clock.delayH) / clock.durH);
    paintMorph(w, h, t);
    if (t >= clock.total) settleMorph();
    else morphFrame = requestAnimationFrame(step);
  };
  morphFrame = requestAnimationFrame(step);
  return true;
}

/** Land the running morph: drop the painted scale and make the target the surface. */
function settleMorph() {
  if (morphFrame) cancelAnimationFrame(morphFrame);
  morphFrame = 0;
  const wasOpen = morph ? morph.open : false;
  morph = null;
  islandEl.style.transition = '';
  panelEl.style.transform = '';
  panelEl.style.opacity = '';
  panelEl.style.borderRadius = '';
  pillEl.style.opacity = '';
  if (wasOpen) {
    syncSize();
    reportBoxNow();
    reportHit();
    measure();
  } else {
    landClosed();
  }
}

/*
 * The close, on the same driver as the open.
 *
 * Closing used to be a state flip: the panel was hidden in the same task and
 * the only thing left moving was the pill's own entrance — the card did not
 * fold, it ceased to exist. The fold now runs the open backwards on its own
 * 240ms clock (see MORPH_CLOSE).
 *
 * The window stays at the panel's box while the card folds inside it. Growing
 * the OS window frame by frame was the alternative and it is the one that
 * reads as a cut: the page lays out a frame or two behind the window, so the
 * still-visible card would be clipped and shoved sideways on every frame of
 * its own animation. What does follow the fold is the hit box (reportHit): the
 * wide transparent margin the fold leaves behind may never swallow a click.
 *
 * The pill is not shown until the hand-off. It stays laid out out of flow (see
 * #island[data-closing] in island.css) at opacity 0, and fades in over the
 * last stretch; by then the panel has reached the pill's own box, so the swap
 * is one silhouette dissolving into the other, not a change of shape.
 */
function closeMorph() {
  closing = true;
  islandEl.dataset.closing = 'true';
  pillEl.style.animation = 'none';
  pillEl.hidden = false;
  pillEl.style.opacity = '0';
  /* offsetWidth, not the rect: a hovered pill carries a 1.02 scale in its
     rect, and folding to that would leave the island 3px wider than the pill
     it lands on. */
  const fold = { width: Math.ceil(pillEl.offsetWidth), height: Math.ceil(pillEl.offsetHeight) };
  if (!fold.width || !fold.height || !panelEl.offsetWidth) return landClosed();
  const start = islandEl.getBoundingClientRect();
  if (!startMorph(false, { width: start.width, height: start.height }, fold)) landClosed();
}

/** Land the fold: the pill is the surface now, and every report follows it. */
function landClosed() {
  closing = false;
  islandEl.dataset.closing = 'false';
  panelEl.hidden = true;
  pillEl.hidden = false;
  pillEl.style.animation = 'none';
  stopMorph();
  syncAvoidVisual();
  syncSize();
  reportBoxNow();
  reportHit();
  measure();
}

function setOpen(next) {
  const opening = next === true && !open;
  const folding = next === false && open;
  /* Already there, or the same toggle twice: nothing to move. */
  if (!opening && !folding) return;
  /*
   * The pill's box has to be read while it is still laid out — the very next
   * line hides it. In the strip state the pill is visibility:hidden but keeps
   * its box, while what is actually drawn is the 5px strip inside #frame, so
   * the strip is what the panel grows out of there.
   */
  const fold = opening
    ? (document.body.dataset.avoid === '1' ? frameEl : pillEl).getBoundingClientRect()
    : null;
  /*
   * A fold under reduced motion, or while a listed app covers the island, is
   * a state change, not an animation: it has to land in this same task so the
   * measurement below describes the surface the user ends up with.
   */
  const animated = document.body.dataset.motion !== 'off';
  open = next;
  islandEl.dataset.open = String(open);
  pillEl.setAttribute('aria-expanded', String(open));
  if (opening) {
    /*
     * A press during the fold takes the card back: the driver re-targets from
     * the box on screen, so there is no dead quarter-second and no seam to
     * jump. The pill's own overlay is dropped in the same task.
     */
    closing = false;
    islandEl.dataset.closing = 'false';
    pillEl.hidden = true;
    pillEl.style.opacity = '';
    panelEl.hidden = false;
    renderPage();
    /*
     * Measured after renderPage, not before: the target ratio is the pill over
     * the panel's *final* box, and reading the panel before the first page has
     * rendered sized it from a half-built panel (300 instead of 324).
     */
    const start = islandEl.getBoundingClientRect();
    if (!animated || !startMorph(true, { width: start.width, height: start.height }, fold)) {
      stopMorph();
    }
  } else if (animated && !avoiding) {
    /* closeMorph paints, reports and hands off on its own loop; the frame is
       still the panel, so nothing below may measure it yet. */
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
  reportBoxNow();
  reportHit();
  measure();
}

/**
 * Tell the main process what the pointer has to be inside to count as hovering.
 *
 * The frame is exactly what is drawn — 168x64 for the folded pill, the panel's
 * box when open, 140x6 for the auto-avoid slit — while the window keeps its
 * transparent padding. Sending this is what makes the island stop opening when
 * the pointer merely crosses the empty space around it.
 */
function reportHit() {
  /* During the fold the drawn surface is the island's animated box, not the
     frame's pre-fold layout (see closeMorph). "collapsed" is the main process'
     licence to hand the pointer straight to the app below whenever it is
     outside the drawn box, whatever the click-through preference says — the
     fold leaves a wide transparent margin behind it for a quarter of a second
     and none of it may swallow a click. */
  const rect = (morph || closing ? islandEl : frameEl).getBoundingClientRect();
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
function reportBoxNow() {
  if (avoidCollapsed) return;
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
    pageDir = delta;
    pageIndex += delta;
    renderPage(true);
    event.stopPropagation();
    event.preventDefault();
    return;
  }
});

panelEl.addEventListener('click', (event) => {
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
    api.control(mediaButton.dataset.media);
    event.stopPropagation();
    return;
  }
  const calDay = event.target.closest('[data-cal-day]');
  if (calDay) {
    calendarView.selected = Number(calDay.dataset.calDay);
    renderPage();
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
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    const [kind, page] = action.split(':');
    if (kind === 'settings') api.openSettings(page);
    return;
  }
  const dot = event.target.closest('[data-page]');
  if (dot) {
    const next = Number(dot.dataset.page);
    pageDir = next >= pageIndex ? 1 : -1;
    pageIndex = next;
    renderPage(true);
    /*
     * renderPage() replaces the dot that was clicked, so this event's target
     * is detached by the time it bubbles to document. Any outside-click
     * handler that tests island.contains(target) then sees false and collapses
     * the panel — which is exactly what happened: every paging click closed the
     * island. Stop here; clicks inside the island never mean "dismiss".
     */
    event.stopPropagation();
  }
});

panelEl.addEventListener('input', (event) => {
  const range = event.target.closest('[data-volume-range]');
  if (!range) return;
  setVolume(Number(range.value));
  event.stopPropagation();
});

panelEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && volumePanelOpen) {
    closeVolumePanel();
    event.stopPropagation();
    return;
  }

  /* The lyric window is focusable, so it answers the keyboard as well. */
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-lyric-toggle]')) {
    musicLyricsMode = !musicLyricsMode;
    renderPage();
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (event.key !== 'Enter') return;
  const input = event.target.closest('[data-todo-input]');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const dueInput = panelEl.querySelector('[data-todo-due]');
  const due = dueInput?.value ? new Date(dueInput.value).getTime() : null;
  const repeat = panelEl.querySelector('[data-todo-repeat]')?.value ?? 'none';
  api
    .localDo('todo', 'add', { text, due, repeat })
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
  if (event.key === 'ArrowRight') { pageDir = 1; pageIndex += 1; renderPage(true); }
  if (event.key === 'ArrowLeft') { pageDir = -1; pageIndex -= 1; renderPage(true); }
});

panelEl.addEventListener('wheel', (event) => {
  if (prefs.wheelPaging === false) return;
  if (Math.abs(event.deltaY) < 8) return;
  const delta = event.deltaY > 0 ? 1 : -1;
  pageDir = delta;
  pageIndex += delta;
  renderPage(true);
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
  /*
   * A pointerdown dispatched on the pill itself (the desktop smoke test does
   * this, and a page script may too) carries no real coordinates, but its
   * target is inside the drawn frame — that is the content by definition.
   * Real clicks in the transparent padding land on body/#island, not here.
   */
  const target = event.target instanceof Node ? event.target : null;
  if (target && frameEl.contains(target)) return true;
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  const rect = frameEl.getBoundingClientRect();
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

api.onBattery((value) => {
  battery = value;
  renderPillStatus();
  renderSub();
  if (open && enabledPages()[pageIndex]?.key === 'weather') return;
});

api.onWeather((value) => {
  if (!value) return;
  weather = value;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'weather') renderPage();
});

api.onMedia((value) => {
  if (!value) return;
  const trackChanged = value.title !== media.title || value.active !== media.active;
  const playingChanged = value.playing !== media.playing;
  media = value;
  renderPillStatus();
  renderSub();
  renderHeader();
  if (open && enabledPages()[pageIndex]?.key === 'music') {
    if (trackChanged || playingChanged) {
      lastLyricIndex = -2;
      renderPage();
    } else {
      updateMusicLive();
    }
  }
});

api.onLyrics((value) => {
  lyrics = value;
  lastLyricIndex = -2;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'music') renderPage();
});

api.onFocus((value) => {
  if (!value) return;
  const structural = value.phase !== focusState.phase || value.running !== focusState.running;
  focusState = value;
  if (!open || enabledPages()[pageIndex]?.key !== 'focus') return;
  if (structural) renderPage();
  else updateFocusLive();
});

api.onHealth((value) => {
  if (!value) return;
  healthState = value;
  if (open && enabledPages()[pageIndex]?.key === 'health') renderPage();
});

api.onTodos((value) => {
  if (!Array.isArray(value)) return;
  todos = value;
  if (open && enabledPages()[pageIndex]?.key === 'todo') renderPage();
});

api.onShelf((value) => {
  if (!Array.isArray(value)) return;
  shelfFiles = value;
  if (open && enabledPages()[pageIndex]?.key === 'shelf') renderPage();
});

api.onClipboard((value) => {
  if (!Array.isArray(value)) return;
  clipboardItems = value;
  if (open && enabledPages()[pageIndex]?.key === 'shelf') renderPage();
});

api.onMessenger((value) => {
  if (!value || !Array.isArray(value.apps)) return;
  messengerState = value;
  const current = enabledPages()[pageIndex]?.key;
  /* The probe pushes on every title change, so the row list is the page's only
     live data; the mail tab line's count reads the same snapshot. */
  if (open && (current === 'messenger' || current === 'mail')) renderPage();
});

/*
 * Both faces follow the protocol state — the pill's and the header's. Without
 * this the island always showed the idle face while the ball reacted.
 */
/* Switching character updates every face on the island, not only the ball. */
api.onCast((cast) => {
  if (!cast) return;
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('cast', String(cast));
  }
});

api.onState((message) => {
  const state = message && message.state;
  if (!state) return;
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('state', String(state));
  }
});

/*
 * The ball owns the idle moods; the island wears whatever it is wearing. Both
 * windows report their face to the main process, which relays it to the other,
 * so the two characters can never drift apart within one cycle.
 */
api.onFace((state) => {
  if (!state) return;
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('state', String(state));
  }
});

api.onDevices((value) => {
  if (!value || !Array.isArray(value.devices)) return;
  devicesState = value;
  /* Peripheral levels feed the rotating status line, not just the devices page. */
  renderSub();
  if (open && enabledPages()[pageIndex]?.key === 'devices') renderPage();
});

api.onQuota((value) => {
  if (!value) return;
  quotaState = value;
  if (open && enabledPages()[pageIndex]?.key === 'quota') renderPage();
  renderPillStatus();
});

api.onAgents((value) => {
  if (!Array.isArray(value)) return;
  agentsState = value;
  if (open && enabledPages()[pageIndex]?.key === 'quota') renderPage();
});

api.onMail((value) => {
  if (!value) return;
  mailState = value;
  if (open && enabledPages()[pageIndex]?.key === 'mail') renderPage();
});

api.onCalendar((value) => {
  if (!value) return;
  calendarState = value;
  if (open && enabledPages()[pageIndex]?.key === 'calendar') renderPage();
});

api.onPrefs((next) => {
  prefs = next ?? prefs;
  applyPrefs();
  renderPillStatus();
  // A page was switched on or reordered in settings: the dots and the current
  // page have to follow, otherwise the island keeps showing the old set.
  if (open) renderPage();
});

const boot = await api.bootstrap();
prefs = boot?.prefs ?? {};
if (boot?.cast) {
  for (const face of document.querySelectorAll('emojitot-ball')) {
    face.setAttribute('cast', String(boot.cast));
  }
}
battery = boot?.battery ?? null;
weather = boot?.weather ?? null;
media = boot?.media ?? media;
lyrics = boot?.lyrics ?? null;
applyLocal(boot);
quotaState = boot?.quota ?? quotaState;
agentsState = Array.isArray(boot?.agents) ? boot.agents : agentsState;
mailState = boot?.mail ?? mailState;
calendarState = boot?.calendar ?? calendarState;
document.body.dataset.playing = String(Boolean(media.active && media.playing));

applyPrefs();
renderPillStatus();
// "Follow the system" only matters while the OS theme actually changes.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((prefs.theme ?? 'dark') === 'system') applyPrefs();
});
// Land on the user's default page, not always the first one.
const bootPages = enabledPages();
const preferred = bootPages.findIndex((page) => page.key === prefs.defaultPage);
pageIndex = preferred >= 0 ? preferred : 0;
setOpen(false);
setInterval(renderPillStatus, 20000);
reportHit();
measure();
