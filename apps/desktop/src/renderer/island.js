/**
 * The island page: one pill that opens into a card.
 *
 * It owns nothing but presentation. Sizes come from the content (reported back
 * to the main process), states arrive from services, and every page has an
 * empty state with one action instead of a blank box.
 */
import { PAGES, STATUS_ITEMS, DEFAULT_PAGES } from './shared/pages.js';

const api = window.islandAPI;

const islandEl = document.getElementById('island');
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4a2 2 0 0 1 0 4H9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  drop: '<path d="M12 2.5S5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z"/>',
  tray: '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z"/>',
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
let open = false;
let pageIndex = 0;

const enabledPages = () => {
  const list = prefs.pageOrder?.length ? prefs.pageOrder : DEFAULT_PAGES;
  const on = prefs.pages ?? {};
  return list
    .map((key) => PAGES.find((p) => p.key === key))
    .filter((p) => p && on[p.key] !== false);
};

const hhmm = () => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

/* ------------------------------------------------------------- measurement */

let frame = 0;
function measure() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const rect = islandEl.getBoundingClientRect();
    api.reportBox({ w: Math.ceil(rect.width), h: Math.ceil(rect.height) });
  });
}
new ResizeObserver(measure).observe(islandEl);

/* ------------------------------------------------------------- pill status */

function renderPillStatus() {
  const items = prefs.statusItems ?? ['battery', 'clock', 'weather'];
  const parts = [];
  for (const key of items) {
    if (key === 'battery' && battery) {
      parts.push(`<span class="stat" title="电量 ${battery.level}%">${batterySvg(battery.level, battery.charging)}<b>${battery.level}%</b></span>`);
    } else if (key === 'clock') {
      parts.push(`<span class="stat" data-clock>${hhmm()}</span>`);
    } else if (key === 'weather' && weather) {
      parts.push(`<span class="stat dim">${weather.current.temp}°</span>`);
    }
  }
  pillStatus.innerHTML = parts.join('');
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

function musicPage() {
  return empty(
    ICON.music,
    '系统里没有正在播放的媒体',
    '打开任意播放器后，这里会显示封面、歌名和进度。',
    '查看设置',
    'settings:music',
  );
}

function weatherPage() {
  if (!weather) return empty(ICON.sun, '正在获取天气…', '第一次需要几秒钟。');
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
        <b>${day.max}°</b><i>${day.min}°</i>
      </div>`;
    })
    .join('');
  return `<div class="weather">
    <div class="weather-now">
      <div class="weather-temp">${now.temp}<sup>°</sup></div>
      <div class="weather-desc"><b>${now.text}</b><span>${weather.place.name}${weather.place.country ? ' · ' + weather.place.country : ''}</span></div>
      <span class="weather-icon">${svg(WEATHER_ICON[now.icon] ?? WEATHER_ICON.cloud)}</span>
    </div>
    <div class="weather-grid">
      <div class="weather-cell"><em>体感</em><b>${now.feels}°</b></div>
      <div class="weather-cell"><em>湿度</em><b>${now.humidity}%</b></div>
      <div class="weather-cell"><em>风速</em><b>${now.wind} km/h</b></div>
      <div class="weather-cell"><em>日出</em><b>${(now.sunrise || '').slice(11, 16) || '--'} / ${(now.sunset || '').slice(11, 16) || '--'}</b></div>
    </div>
    <div class="weather-days">${dayCells}</div>
  </div>`;
}

function quotaPage() {
  return empty(
    ICON.coin,
    '还没有连接账号',
    '在设置里填入 DeepSeek API Key，这里会显示余额和账号。',
    '去添加账号',
    'settings:quota',
  );
}

function mailPage() {
  return empty(
    ICON.mail,
    '还没有添加邮箱',
    '支持 163、QQ、Gmail。授权码只保存在本机。',
    '添加邮箱',
    'settings:mail',
  );
}

function fallbackPage(page) {
  return empty(
    ICON[page.icon] ?? ICON.check,
    page.title,
    `这一页在阶段 ${page.stage} 开放。`,
  );
}

const RENDERERS = { music: musicPage, weather: weatherPage, quota: quotaPage, mail: mailPage };

function renderPage() {
  const list = enabledPages();
  if (!list.length) {
    titleEl.textContent = '还没有页面';
    subEl.textContent = '去设置里打开';
    pagesEl.innerHTML = empty(ICON.check, '页面都是关的', '在设置 → 页面管理里打开至少一个。', '打开设置', 'settings:pages');
    dotsEl.innerHTML = '';
    measure();
    return;
  }
  pageIndex = Math.max(0, Math.min(list.length - 1, pageIndex));
  const page = list[pageIndex];
  titleEl.textContent = page.title;
  subEl.textContent = page.sub;
  pagesEl.innerHTML = (RENDERERS[page.key] ?? ((p) => fallbackPage(p)))(page);
  dotsEl.innerHTML = list
    .map((p, index) => `<button type="button" data-page="${index}" aria-current="${index === pageIndex}" aria-label="${p.title}"></button>`)
    .join('');
  measure();
}

function setOpen(next) {
  open = next;
  islandEl.dataset.open = String(open);
  pillEl.hidden = open;
  panelEl.hidden = !open;
  pillEl.setAttribute('aria-expanded', String(open));
  if (open) renderPage();
  measure();
}

/* ------------------------------------------------------------------- wiring */

pillEl.addEventListener('click', () => setOpen(true));
btnSettings.addEventListener('click', () => api.openSettings());

panelEl.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    const [kind, page] = action.split(':');
    if (kind === 'settings') api.openSettings(page);
    return;
  }
  const dot = event.target.closest('[data-page]');
  if (dot) {
    pageIndex = Number(dot.dataset.page);
    renderPage();
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && open) setOpen(false);
  if (!open) return;
  if (event.key === 'ArrowRight') { pageIndex += 1; renderPage(); }
  if (event.key === 'ArrowLeft') { pageIndex -= 1; renderPage(); }
});

panelEl.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaY) < 8) return;
  pageIndex += event.deltaY > 0 ? 1 : -1;
  renderPage();
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
  if (open) setOpen(false);
});

/* -------------------------------------------------------------------- boot */

api.onHover(() => {
  // The main process owns click-through by polling the cursor; the page has
  // nothing to do here yet. Kept so a future hover preview has a seam.
});

api.onBattery((value) => {
  battery = value;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'weather') return;
});

api.onWeather((value) => {
  if (!value) return;
  weather = value;
  renderPillStatus();
  if (open && enabledPages()[pageIndex]?.key === 'weather') renderPage();
});

api.onPrefs((next) => {
  prefs = next ?? prefs;
  renderPillStatus();
  if (open) renderPage();
});

const boot = await api.bootstrap();
prefs = boot?.prefs ?? {};
battery = boot?.battery ?? null;
weather = boot?.weather ?? null;
document.body.dataset.playing = 'false';

renderPillStatus();
setOpen(false);
setInterval(renderPillStatus, 20000);
measure();
