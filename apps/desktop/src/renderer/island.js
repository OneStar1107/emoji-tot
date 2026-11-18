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
const topMedia = document.getElementById('top-media');
const topMediaText = document.getElementById('top-media-text');
const btnSettings = document.getElementById('btn-settings');

await customElements.whenDefined('emojitot-ball');

/* ------------------------------------------------------------ small icons */

const svg = (body, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const ICON = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
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
let focusState = { phase: 'idle', running: false, remaining: 0, total: 0, cycles: 0 };
let healthState = { enabled: false, waterMin: 45, standMin: 60, sinceWater: 0, sinceStand: 0, waterDue: false, standDue: false, waterCount: 0, standCount: 0 };
let todos = [];
let shelfFiles = [];
let clipboardItems = [];
let messengerState = { apps: [], unread: 0 };
let devicesState = { devices: [] };
let quotaState = { accounts: [], current: null, last: null };
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
  const order = Array.isArray(prefs.pageOrder) && prefs.pageOrder.length
    ? prefs.pageOrder
    : PAGES.map((p) => p.key);
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
 * first paint must not animate from zero, so the very first measurement writes
 * the size with transitions off, then hands the transition back.
 */
let sized = false;
function syncSize() {
  const rect = frameEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (!sized) islandEl.style.transition = 'none';
  islandEl.style.width = `${Math.ceil(rect.width)}px`;
  islandEl.style.height = `${Math.ceil(rect.height)}px`;
  if (!sized) {
    sized = true;
    requestAnimationFrame(() => {
      islandEl.style.transition = '';
    });
  }
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

/* The page stays primary; now-playing is a secondary header slot. */
function renderTopMedia() {
  const page = enabledPages()[pageIndex];
  const state = islandHeaderState(page?.title ?? '', media);
  if (titleEl.textContent !== state.title) titleEl.textContent = state.title;
  titleEl.dataset.over = String(
    state.title.length > 0 && titleEl.scrollWidth > titleEl.clientWidth + 2,
  );
  topMedia.hidden = !state.media;
  if (topMediaText.textContent !== state.media) topMediaText.textContent = state.media;
  topMedia.dataset.over = String(
    state.media.length > 0 && topMedia.scrollWidth > topMedia.clientWidth + 2,
  );
  topMedia.classList.toggle('scrolling', topMedia.dataset.over === 'true');
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

function lyricSliceHtml(index) {
  if (!lyrics?.synced || !lyrics.lines.length) return '<span class="lyric-empty">这首歌没有同步歌词</span>';
  const start = Math.max(0, index - 1);
  return lyrics.lines
    .slice(start, start + 3)
    .map((line, offset) => `<p class="lyric-line${start + offset === index ? ' on' : ''}">${escapeHtml(line.text)}</p>`)
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
  return `<div class="music">
    <div class="music-row">
      ${art}
      <div class="music-meta">
        <b>${escapeHtml(media.title || '未命名')}</b>
        <span>${escapeHtml(media.artist || media.album || (browser ? '媒体 · ' + (media.source || '浏览器') : media.source || ''))}</span>
      </div>
      <!-- The state badge was removed on request: the header already says what is
           playing, and the progress row keeps the only 直播 marker that carries
           information (no duration). -->
    </div>
    ${prefs.music?.lyrics === false ? '' : `<div class="lyric-box" data-lyric-box>${lyricSliceHtml(lyricAt(media.position))}</div>`}
    ${live
      ? '<div class="music-bar live"><i></i></div><div class="music-times"><span data-pos>' + clock(media.position) + '</span><span>直播</span></div>'
      : '<div class="music-bar"><i data-progress style="width:' + pct.toFixed(1) + '%"></i></div><div class="music-times"><span data-pos>' + clock(media.position) + '</span><span data-dur>' + clock(media.duration) + '</span></div>'}
    <div class="music-controls">
      <button type="button" data-media="prev" aria-label="上一首">${svg(ICON.prev)}</button>
      <button type="button" class="main" data-media="toggle" aria-label="${media.playing ? '暂停' : '播放'}">${svg(media.playing ? ICON.pause : ICON.play)}</button>
      <button type="button" data-media="next" aria-label="下一首">${svg(ICON.next)}</button>
    </div>
  </div>`;
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
    if (box) box.innerHTML = lyricSliceHtml(index);
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
  if (!weather) return empty(ICON.sun, '正在获取天气…', '第一次需要几秒钟。');
  const fahrenheit = prefs.weather?.unit === 'f';
  const show = (celsius) => {
    const value = Number(celsius) || 0;
    return fahrenheit ? Math.round((value * 9) / 5 + 32) : Math.round(value);
  };
  const now = weather.current;
  const days = (weather.days ?? []).slice(0, 7);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'];
  const dayCells = days
    .map((day, index) => {
      const date = new Date(day.date);
      const label = index === 0 ? '今天' : `周${weekday[date.getDay()]}`;
      return `<div class="weather-day" data-today="${index === 0}">
        <em>${label}</em>
        ${svg(WEATHER_ICON[day.icon] ?? WEATHER_ICON.cloud)}
        <b>${show(day.max)}°</b><i>${show(day.min)}°</i>
      </div>`;
    })
    .join('');
  return `<div class="weather">
    <div class="weather-now">
      <div class="weather-temp">${show(now.temp)}<sup>°</sup></div>
      <div class="weather-desc"><b>${escapeHtml(now.text)}</b><span>${escapeHtml(placeZh(weather.place.name))}${weather.place.country ? ' · ' + escapeHtml(countryZh(weather.place.country)) : ''}</span></div>
      <span class="weather-icon">${svg(WEATHER_ICON[now.icon] ?? WEATHER_ICON.cloud)}</span>
    </div>
    <div class="weather-grid">
      <div class="weather-cell"><em>体感</em><b>${show(now.feels)}°</b></div>
      <div class="weather-cell"><em>湿度</em><b>${Number(now.humidity) || 0}%</b></div>
      <div class="weather-cell"><em>风速</em><b>${Number(now.wind) || 0} km/h</b></div>
      <div class="weather-cell"><em>日出</em><b>${escapeHtml((now.sunrise || '').slice(11, 16) || '--')} / ${escapeHtml((now.sunset || '').slice(11, 16) || '--')}</b></div>
    </div>
    <div class="weather-days">${dayCells}</div>
  </div>`;
}

const timeOf = (ms) => {
  const date = new Date(Number(ms) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function quotaPage() {
  const state = quotaState ?? { accounts: [], current: null, last: null };
  if (!state.accounts.length) {
    return empty(
      ICON.coin,
      '还没有连接账号',
      '在设置里填入 DeepSeek API Key，这里会显示余额和账号。',
      '去添加账号',
      'settings:quota',
    );
  }
  const current = state.accounts.find((account) => account.current);
  const last = state.last;
  const actions = `<div class="quota-actions">
    <button type="button" class="ghost" data-local="quota:refresh">刷新</button>
    ${state.accounts.length > 1 ? '<button type="button" class="ghost" data-local="quota:next">切换账号</button>' : ''}
  </div>`;
  if (!last || last.error) {
    return `<div class="quota">
      <div class="quota-head"><span class="quota-note">${escapeHtml(current?.name ?? '')}</span></div>
      <div class="quota-rows">
        <div class="quota-row"><span>状态</span><b>${escapeHtml(last?.error ?? '正在查询…')}</b></div>
      </div>
      ${actions}
    </div>`;
  }
  return `<div class="quota">
    <div class="quota-head">
      <span class="quota-amount"><small>¥</small>${escapeHtml(last.total)}</span>
      <span class="quota-note">${escapeHtml(current?.name ?? '')}${last.available ? '' : ' · 不可用'}</span>
    </div>
    <div class="quota-rows">
      <div class="quota-row"><span>充值余额</span><b>¥${escapeHtml(last.topped)}</b></div>
      <div class="quota-row"><span>赠送余额</span><b>¥${escapeHtml(last.granted)}</b></div>
      <div class="quota-row"><span>更新于</span><b>${timeOf(last.at)}</b></div>
    </div>
    ${actions}
  </div>`;
}

/**
 * Message apps: who is running, and how many unread the title admits.
 *
 * It lives above the mailbox because both answer "is anyone waiting for me?",
 * and a row's button brings that app's window forward — the island is a
 * switchboard, not a reader.
 */
function messengerBlock() {
  const apps = messengerState?.apps ?? [];
  if (!apps.length) return '';
  const rows = apps
    .map((app) => `<div class="msg-item">
      <span class="msg-dot${app.unread ? ' on' : ''}"></span>
      <span class="msg-name">${escapeHtml(app.label)}</span>
      <span class="msg-count">${app.unread ? app.unread + ' 条' : '运行中'}</span>
      <button type="button" class="msg-open" data-local="messenger:activate" data-id="${app.handle}">切过去</button>
    </div>`)
    .join('');
  const unread = apps.reduce((sum, app) => sum + (Number(app.unread) || 0), 0);
  return `<div class="msg">
    <div class="msg-head"><span>消息</span><span class="spacer"></span><span>${unread ? unread + ' 条未读' : '没有未读'}</span></div>
    ${rows}
  </div>`;
}

function mailPage() {
  const state = mailState ?? { accounts: [], messages: [] };
  if (!state.accounts.length) {
    return messengerBlock() + empty(
      ICON.mail,
      '还没有添加邮箱',
      '支持 163、QQ、Gmail。授权码只保存在本机。',
      '添加邮箱',
      // The settings page is called comm; a stale key opens the window on the
      // wrong page, which reads as "the button does nothing".
      'settings:comm',
    );
  }
  if (!state.messages.length) {
    const hint = state.syncing ? '正在同步…' : state.error ? state.error : '还没有拉取到邮件';
    return messengerBlock() + `<div class="mail">
      <div class="mail-head"><b>${state.accounts.length} 个邮箱</b><span class="spacer"></span><span>${escapeHtml(hint)}</span></div>
      <p class="todo-empty">${state.error ? '检查一下授权码或网络，然后在设置里点同步。' : '新邮件到达后会出现在这里。'}</p>
    </div>`;
  }
  const rows = state.messages
    .slice(0, 7)
    .map((message) => `<div class="mail-item" title="${escapeHtml(message.fromAddress || '')}">
        <span class="mail-dot" style="opacity:${message.seen ? 0.28 : 1}"></span>
        <b>${escapeHtml(message.subject)}</b>
        ${message.code ? `<em class="mail-code">${escapeHtml(message.code)}</em>` : ''}
        ${message.hasInvite ? '<em class="mail-invite">邀请</em>' : ''}
        <em>${timeOf(message.date)}</em>
      </div>`)
    .join('');
  return messengerBlock() + `<div class="mail">
    <div class="mail-head">
      <b>${state.accounts.length} 个邮箱</b>
      <span class="spacer"></span>
      <span>${state.syncing ? '同步中…' : state.error ? '部分失败' : timeOf(state.lastSync) + ' 更新'}</span>
    </div>
    ${rows}
    ${state.error ? `<p class="mail-error">${escapeHtml(state.error)}</p>` : ''}
  </div>`;
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
  const subErrorBar = failedSubs.length
    ? '<p class="cal-error">' + failedSubs.length + ' 个日历订阅拉取失败：'
      + escapeHtml(failedSubs.map((sub) => sub.name || sub.id).join('、'))
      + '。在设置 → 通知、邮箱与日程里检查链接。</p>'
    : '';
  const events = calendarState.events ?? [];
  const byDay = new Map();
  for (const event of events) {
    const key = dayKey(new Date(event.start));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  const first = new Date(calendarView.year, calendarView.month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(calendarView.year, calendarView.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const now = new Date();
  const isThisMonth = now.getFullYear() === calendarView.year && now.getMonth() === calendarView.month;
  const selectedDate = new Date(calendarView.year, calendarView.month, calendarView.selected);
  const selectedEvents = byDay.get(dayKey(selectedDate)) ?? [];

  const grid = cells
    .map((day) => {
      if (day === null) return '<span class="cal-cell empty"></span>';
      const key = `${calendarView.year}-${calendarView.month + 1}-${day}`;
      const list = byDay.get(key) ?? [];
      const classes = ['cal-cell'];
      if (isThisMonth && day === now.getDate()) classes.push('today');
      if (day === calendarView.selected) classes.push('picked');
      if (list.length) classes.push('has');
      return `<button type="button" class="${classes.join(' ')}" data-cal-day="${day}">
        <span>${day}</span>${list.length ? '<i class="cal-dot"></i>' : ''}
      </button>`;
    })
    .join('');

  const rows = selectedEvents.length
    ? selectedEvents
        .map((event) => {
          const start = new Date(event.start);
          const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
          return `<div class="cal-event">
            <span class="cal-time">${time}</span>
            <b>${escapeHtml(event.title)}</b>
            ${event.location ? `<em>${escapeHtml(event.location)}</em>` : ''}
          </div>`;
        })
        .join('')
    : '<p class="cal-empty">这一天没有安排。</p>';

  return `<div class="calendar">
    <div class="cal-left">
    <div class="cal-head">
      <button type="button" class="icon-btn" data-cal-nav="-1" aria-label="上个月"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
      <b>${calendarView.year} 年 ${calendarView.month + 1} 月</b>
      <button type="button" class="icon-btn" data-cal-nav="1" aria-label="下个月"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
    </div>
    <div class="cal-week">${WEEK_ZH.map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="cal-grid">${grid}</div>
    </div>
    <div class="cal-right">
      <div class="cal-day-title">${calendarView.month + 1} 月 ${calendarView.selected} 日</div>
      ${FESTIVALS[calendarView.month + 1 + '-' + calendarView.selected] ? `<div class="cal-festival">${FESTIVALS[calendarView.month + 1 + '-' + calendarView.selected]}</div>` : ''}
      <div class="cal-events">${rows}</div>
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
  const time = ring.querySelector('.focus-time');
  if (time) time.textContent = clock(focusState.remaining);
}

/* ------------------------------------------------------------ local pages */

function focusPage() {
  const state = focusState;
  const label = state.phase === 'idle' ? '准备开始' : state.phase === 'work' ? '专注中' : '休息中';
  const pct = state.total ? Math.min(100, ((state.total - state.remaining) / state.total) * 100) : 0;
  const running = state.running;
  const canAct = state.phase !== 'idle';
  const primary = !canAct
    ? '<button type="button" class="btn primary" data-local="focus:start">开始专注</button>'
    : running
      ? '<button type="button" class="btn primary" data-local="focus:pause">暂停</button>'
      : '<button type="button" class="btn primary" data-local="focus:resume">继续</button>';
  return `<div class="focus">
    <div class="focus-ring" style="--pct:${pct.toFixed(1)}">
      <span class="focus-time">${clock(state.remaining)}</span>
      <span class="focus-phase">${label}</span>
    </div>
    <div class="focus-row">
      ${primary}
      <button type="button" class="btn" data-local="focus:skip">${state.phase === 'work' ? '跳过本轮' : state.phase === 'rest' ? '跳过休息' : '跳过'}</button>
      ${canAct ? '<button type="button" class="btn" data-local="focus:stop">结束</button>' : ''}
    </div>
    <p class="focus-note">已完成 ${state.cycles} 轮专注</p>
  </div>`;
}

function healthPage() {
  const state = healthState;
  if (!state.enabled) {
    return empty(ICON.drop, '健康提醒还没有打开', '打开后会按你设的间隔提醒喝水与起身。', '去打开', 'settings:focus');
  }
  const waterPct = Math.min(100, (state.sinceWater / state.waterMin) * 100);
  const standPct = Math.min(100, (state.sinceStand / state.standMin) * 100);
  return `<div class="health">
    <div class="health-block">
      <div class="health-head"><b>喝水</b><span>距上次 ${state.sinceWater} 分钟 · 每 ${state.waterMin} 分钟</span></div>
      <div class="health-bar"><i style="width:${waterPct.toFixed(0)}%" data-due="${state.waterDue}"></i></div>
      <div class="health-actions">
        <button type="button" class="btn" data-local="health:drink">我喝过了</button>
        <button type="button" class="btn ghost" data-local="health:resetWater" aria-label="清除喝水记录">清除</button>
      </div>
    </div>
    <div class="health-block">
      <div class="health-head"><b>久坐</b><span>距上次 ${state.sinceStand} 分钟 · 每 ${state.standMin} 分钟</span></div>
      <div class="health-bar"><i style="width:${standPct.toFixed(0)}%" data-due="${state.standDue}"></i></div>
      <div class="health-actions">
        <button type="button" class="btn" data-local="health:stand">我起来了</button>
        <button type="button" class="btn ghost" data-local="health:resetStand" aria-label="清除久坐记录">清除</button>
      </div>
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
    return empty(ICON.check, '待办已关闭', '打开后岛上会显示清单与到期提醒。', '去打开', 'settings:todo');
  }
  const openItems = todos.filter((item) => !item.done);
  const doneItems = todos.filter((item) => item.done);
  const itemHtml = (item) => `<div class="todo-item${item.done ? ' done' : ''}" data-id="${item.id}">
      <button type="button" class="todo-check" data-local="todo:toggle" data-id="${item.id}" aria-label="完成">${item.done ? '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' : ''}</button>
      <span class="todo-text">${escapeHtml(item.text)}</span>
      ${item.repeat ? `<em class="todo-repeat">${item.repeat === 'daily' ? '每天' : '每周'}</em>` : ''}
      ${item.due ? `<em class="todo-due${item.due < Date.now() && !item.done ? ' late' : ''}">${item.done && item.nextDue ? '下次 ' + dueLabel(item.nextDue) : dueLabel(item.due)}</em>` : ''}
      <button type="button" class="todo-del" data-local="todo:remove" data-id="${item.id}" aria-label="删除">×</button>
    </div>`;
  return `<div class="todo">
    <div class="todo-add">
      <input type="text" placeholder="加一条待办，回车保存" data-todo-input maxlength="200" />
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
    </div>
    <div class="todo-list">
      ${openItems.length ? openItems.map(itemHtml).join('') : '<p class="todo-empty">还没有待办，上面写一条试试。</p>'}
      ${doneItems.length ? `<div class="todo-done-head">已完成 ${doneItems.length}<button type="button" class="todo-clear" data-local="todo:clearDone">清空</button></div>` : ''}
      ${doneItems.map(itemHtml).join('')}
    </div>
  </div>`;
}

const sizeLabel = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

function shelfPage() {
  if (prefs.shelf?.enabled === false) {
    return empty(ICON.tray, '置物架已关闭', '打开后可以把文件拖到岛上暂存。', '去打开', 'settings:todo');
  }
  const rows = shelfFiles.length
    ? shelfFiles
        .map((file) => `<div class="shelf-item" data-id="${escapeHtml(file.name)}">
            <button type="button" class="shelf-open" data-local="shelf:open" data-name="${escapeHtml(file.name)}" title="打开">${escapeHtml(file.name)}</button>
            <span class="shelf-size">${sizeLabel(file.size)}</span>
            <button type="button" class="shelf-del" data-local="shelf:remove" data-name="${escapeHtml(file.name)}" aria-label="删除">×</button>
          </div>`)
        .join('')
    : '<p class="todo-empty">置物架是空的。把文件拖到这块面板上就能放进来。</p>';
  const clips = clipboardItems.slice(0, 6).map((item) => `<div class="clip-item">
      <button type="button" class="clip-text" data-local="clipboard:copy" data-id="${escapeHtml(item.id)}" title="点击复制">${escapeHtml(clipLabel(item.text))}</button>
      <button type="button" class="clip-pin${item.pinned ? ' on' : ''}" data-local="clipboard:togglePin" data-id="${escapeHtml(item.id)}" aria-label="固定">★</button>
    </div>`).join('');
  const clipBlock = `<div class="clip">
    <div class="clip-head"><span>剪贴板</span>${clipboardItems.length ? '<button type="button" class="ghost" data-local="clipboard:clear">清空</button>' : ''}</div>
    <div class="clip-list">${clips || '<p class="todo-empty">复制文字后会出现在这里。</p>'}</div>
  </div>`;
  return `<div class="shelf" data-shelf-drop>
    <div class="shelf-hint">把文件拖到这里 · 复制到 <code>shelf</code> 文件夹</div>
    <div class="shelf-list">${rows}</div>
    ${clipBlock}
  </div>`;
}

/** One line of the clipboard list: a copy is text, not a document. */
function clipLabel(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > 42 ? flat.slice(0, 42) + '…' : flat;
}

/**
 * Paired Bluetooth devices. A device without a battery property still earns a
 * row: knowing the headset is connected is half the answer.
 */
function devicesPage() {
  const list = devicesState?.devices ?? [];
  if (!list.length) {
    return empty(ICON.tray, '没有蓝牙设备', '连接过的耳机、键盘、手柄会出现在这里。', '去设置', 'settings:general');
  }
  const rows = list
    .map((device) => {
      const battery = device.battery === null || device.battery === undefined ? '—' : device.battery + '%';
      const low = battery !== '—' && Number(device.battery) <= 20;
      return `<div class="dev-item">
      <span class="dev-name">${escapeHtml(device.name)}</span>
      <span class="dev-status">${device.status === 'OK' ? '已连接' : escapeHtml(device.status)}</span>
      <span class="dev-bat${low ? ' low' : ''}">${battery}</span>
    </div>`;
    })
    .join('');
  return `<div class="dev">
    <div class="dev-head"><span>${list.length} 个设备</span><span class="spacer"></span><span>每 5 分钟刷新</span></div>
    ${rows}
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
  document.body.dataset.skin = prefs.skin ?? 'frost';
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
  if (!list.length) {
    document.body.dataset.pages = '0';
    titleEl.textContent = '还没有页面';
    const subText = subEl.firstElementChild;
    if (subText) subText.textContent = '去设置里打开';
    subEl.dataset.muted = 'false';
    subEl.dataset.over = 'false';
    topMedia.hidden = true;
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
  /* Page identity owns the header; media is a secondary status. */
  const nameEl = document.getElementById('page-name');
  if (nameEl) nameEl.textContent = page.title;
  renderTopMedia();
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
 */
document.addEventListener(
  'wheel',
  (event) => {
    const list = event.target instanceof Element ? event.target.closest('.clip-list, .shelf-list') : null;
    if (list && list.scrollHeight > list.clientHeight + 1) event.stopPropagation();
  },
  { capture: true },
);

function setOpen(next) {
  open = next;
  islandEl.dataset.open = String(open);
  pillEl.hidden = open;
  panelEl.hidden = !open;
  pillEl.setAttribute('aria-expanded', String(open));
  if (open) renderPage();
  /*
   * Size the wrapper here instead of trusting the frame's ResizeObserver to
   * fire on time. Opening swaps a hidden pill for a visible panel; the observer
   * kept reporting the collapsed frame and the wrapper stayed at the collapsed
   * width, so the window never grew and the panel spilled outside it. Reading
   * the frame right after the swap forces the layout and gives the real box.
   */
  syncSize();
  reportBoxNow();
  measure();
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
  if (open) return;
  if (event && event.button !== 0) return;
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
          : api.quotaDo(action);
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

panelEl.addEventListener('keydown', (event) => {
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

document.documentElement.addEventListener('mouseenter', scheduleHoverOpen);
document.addEventListener('mousemove', scheduleHoverOpen);
document.documentElement.addEventListener('mouseleave', scheduleHoverClose);
/*
 * Leaving is also reported by the main process. Once the pointer is outside,
 * the window goes click-through within ~25ms and the page stops receiving
 * mouse events — so a mouseleave that lands after that moment never arrives.
 * The main process knows the cursor position regardless, and its "inside became
 * false" is the dependable close signal.
 */
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
  renderTopMedia();
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
  if (open && enabledPages()[pageIndex]?.key === 'mail') renderPage();
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
measure();
