/**
 * The settings page.
 *
 * One data source (prefs.json through IPC), one render pass, no local state
 * that can drift. Every control carries its own key, so adding a row is adding
 * one line — there is no handler to register.
 */
import {
  DEFAULTS,
  DEVICE_PIN_LIMIT,
  PAGE_MANIFEST,
  PRESET_MANIFEST,
  STATUS_MANIFEST,
  deviceKind,
  withDefaults,
  defaultStatusItems,
  enabledStatusKeys,
  moveStatusKey,
  orderDevices,
  orderedPageKeys,
  orderedStatusKeys,
  presetPatch,
  SETTINGS_NAV,
  setStatusItemEnabled,
  statusPreviewRows,
} from '../shared/schema.js';
import {
  batteryGlyph,
  batteryText,
  clockText,
  quotaText,
  temperatureText,
} from '../shared/status-view.js';
import { LANGS, translate } from './i18n.js';

/** The rail, from the one manifest. */
const NAV = SETTINGS_NAV;

const api = window.settingsAPI;

/* ------------------------------------------------------------------- nav */



const ICON = {
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.4.44.73.85.94.27.13.57.2.87.2H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".8"/><circle cx="17.5" cy="10.5" r=".8"/><circle cx="8.5" cy="7.5" r=".8"/><circle cx="6.5" cy="12.5" r=".8"/><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2 2 2 0 0 1 2-2h2a2 2 0 0 0 2-2 10 10 0 0 0-8-12z"/>',
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4a2 2 0 0 1 0 4H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  tray: '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};

/*
 * Page and status tables come from the shared schema — the one file the island
 * also reads. They used to be copied here, and the copy had drifted: devices
 * had no row in this table, so the page could not be switched on from the UI
 * even though the island knew how to draw it.
 */
/*
 * 页面表与状态表在每次渲染时重建，不是模块常量。
 *
 * 它们要把 manifest 的中文标签换成当前语言；常量会在模块加载时求值一次，
 * 之后切到英文，这张表还停在中文。函数化以后「标签属于当前语言」是结构上
 * 的保证，而不是靠记得重载窗口。
 */
const pagesTable = () => PAGE_MANIFEST.map((page) => ({
  key: page.key,
  label: T('island.' + page.key + '.label', null, page.title),
  sub: T('island.' + page.key + '.sub', null, page.sub),
}));
const statusTable = () => STATUS_MANIFEST.map((item) => ({
  key: item.key,
  label: T('status.' + item.key, null, item.label),
}));

let prefs = { ...DEFAULTS };
let page = 'general';
/** Live state of the running app (cast, visibility, dock side, agents). */
let meta = null;
let displays = [];
let version = '0.0.0';
let quotaState = { accounts: [], current: null, last: null };
let mailState = { accounts: [], messages: [], error: '', lastSync: 0, syncing: false };
let calendarState = { events: [], upcoming: [] };
/**
 * The devices page's live rows: name, status, battery and source per device,
 * plus when the last probe finished. Empty until the page asks for a probe;
 * the main process pushes a new snapshot when one lands.
 */
let devicesState = { devices: [], withBattery: 0, probedAt: 0 };
/** Whether this window currently holds the devices probe open. */
let devicesWatching = false;
/** Where the device list was scrolled, so a repaint does not jump to the top. */
let devicesScrollTop = 0;

/* --------------------------------------------------------------- 文案 / copy */

/**
 * 本窗口正在用的语言 / The language this window is drawing in.
 *
 * prefs.lang 是唯一的开关：切换即写 prefs，回包触发重绘，重绘时每次 T() 都读
 * 一次当前值，所以不存在「语言变量和词典不同步」的第二份状态。
 */
const currentLang = () => (prefs.lang === 'en' ? 'en' : 'zh');

/**
 * 取一条文案：当前语言 → zh → 调用方给的兜底 → 键名。
 *
 * 第二、三层是给 schema 这类外部数据留的路：新增一条页面/状态条目、词典还没
 * 跟上时，宁可显示它的中文原名，也不显示一个 dot.path。
 */
const T = (key, vars, fallback) => translate(currentLang(), key, vars, fallback);

const rail = document.getElementById('rail');
const content = document.getElementById('content');
const preview = document.getElementById('preview');

/* --------------------------------------------------------------- rendering */

const merge = (raw) => withDefaults(raw);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const row = (label, sub, control) =>
  '<div class="row"><span class="row-label"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="row-control">' + control + '</span></div>';

/*
 * The stacked row: label above, control across the card.
 *
 * The skin cards are a five-column grid of their own — side by side with the
 * label they squeezed it into three lines, and in the narrow column the card
 * had less room than the grid. This is the one row type where the control is
 * the subject, so it gets the full width.
 */
const rowStack = (label, sub, control) =>
  '<div class="row stacked"><span class="row-label"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="row-control">' + control + '</span></div>';

const rowToggle = (label, sub, key) =>
  row(label, sub, '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(valueOf(key)) +
    '" data-act="toggle" data-key="' + key + '" aria-label="' + escapeHtml(label) + '"></button>');

const rowSeg = (label, sub, key, options) =>
  row(label, sub, '<span class="seg">' + options.map(([value, text]) =>
    '<button type="button" data-act="seg" data-key="' + key + '" data-value="' + value + '" aria-pressed="' +
    (String(valueOf(key)) === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

/*
 * 皮肤预览：五张迷你岛，和上面的文字段共用同一个 seg 动作。
 * 点击、Tab + Enter 和 aria-pressed 因此只有一条路径，两种控件不会各说各话。
 */
const SKIN_PREVIEWS = [
  ['frost', 'skin.frost.label', 'skin.frost.hint'],
  ['solid', 'skin.solid.label', 'skin.solid.hint'],
  ['plain', 'skin.plain.label', 'skin.plain.hint'],
  ['magazine', 'skin.magazine.label', 'skin.magazine.hint'],
  ['console', 'skin.console.label', 'skin.console.hint'],
];

const skinPreviewCards = () =>
  '<div class="skin-previews" role="group" aria-label="' + escapeHtml(T('appearance.skin.previews')) + '">' +
  SKIN_PREVIEWS.map(([value, labelKey, hintKey]) =>
    '<button type="button" class="skin-card" data-act="seg" data-key="skin" data-value="' + value +
      '" aria-pressed="' + (String(valueOf('skin')) === value) + '" title="' + escapeHtml(T(hintKey)) + '">' +
      '<span class="skin-thumb skin-thumb-' + value + '" aria-hidden="true"></span>' +
      '<span class="skin-card-name">' + escapeHtml(T(labelKey)) + '</span>' +
    '</button>').join('') +
  '</div>';

/*
 * 实时预览：96×64 的迷你岛，不是截图。
 *
 * 盒子带 data-skin-preview 和当前皮肤键，settings.css 把每套皮肤映射到岛自己
 * 的变量名（--card / --accent / --radius / --ui-font），所以换皮肤后本页重绘，
 * 盒子在下一帧就是新皮肤。用变量画而不是放图：皮肤一改，预览不会过期。
 */
const skinPreviewRow = () =>
  row(T('appearance.livePreview.label'), T('appearance.livePreview.sub'),
    '<span class="skin-preview" data-skin-preview="' + escapeHtml(prefs.skin ?? 'frost') +
      '" role="img" aria-label="' + escapeHtml(T('appearance.livePreview.aria')) + '">' +
      '<span class="sp-pill"><i class="sp-dot"></i></span>' +
      '<span class="sp-body"><span class="sp-title">EmojiTot</span><span class="sp-bar"></span></span>' +
    '</span>');

const rowSelect = (label, sub, key, options, selected) =>
  row(label, sub, '<select class="ctl" data-act="set" data-key="' + key + '">' + options.map(([value, text]) =>
    '<option value="' + value + '"' + (String(selected ?? valueOf(key)) === String(value) ? ' selected' : '') + '>' +
    escapeHtml(text) + '</option>').join('') + '</select>');

const rowInput = (label, sub, key, value, placeholder) =>
  row(label, sub, '<input class="ctl" data-act="set" data-key="' + key + '" value="' + escapeHtml(value ?? '') +
    '" placeholder="' + escapeHtml(placeholder ?? '') + '" spellcheck="false" />');

const rowRange = (label, sub, key, min, max, step, suffix) =>
  row(label, sub, '<input class="ctl" type="range" min="' + min + '" max="' + max + '" step="' + step +
    '" value="' + Number(valueOf(key) ?? min) + '" data-act="set" data-key="' + key + '" data-suffix="' +
    escapeHtml(suffix ?? '') + '" /><b style="min-width:44px;text-align:right;font-weight:400;color:var(--dim);font-size:11.5px">' +
    Number(valueOf(key) ?? min) + escapeHtml(suffix ?? '') + '</b>');

/**
 * Action controls. Unlike the preference rows above they do not write prefs —
 * they ask the main process to do something to the running app (show, hide,
 * dock, switch cast, play an expression) and the page repaints from the new
 * meta, so the switch reflects reality instead of an intention.
 */
const rowActionToggle = (label, sub, kind, checked, extra) =>
  row(label, sub, '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(checked) +
    '" data-act="action-toggle" data-kind="' + kind + '"' +
    (extra ? ' data-extra="' + escapeHtml(extra) + '"' : '') + ' aria-label="' + escapeHtml(label) + '"></button>');

const rowActionSeg = (label, sub, kind, options, current) =>
  row(label, sub, '<span class="seg">' + options.map(([value, text]) =>
    '<button type="button" data-act="action-seg" data-kind="' + kind + '" data-value="' + value + '" aria-pressed="' +
    (String(current ?? '') === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

const rowAction = (label, sub, kind, value, text) =>
  row(label, sub, '<button type="button" class="btn" data-act="action" data-kind="' + kind + '" data-value="' +
    escapeHtml(value ?? '') + '">' + escapeHtml(text) + '</button>');

/*
 * Direction B: a page is a grid of group cards, not one long column.
 *
 * card() no longer draws a surface — the group is the card now, so a heading
 * and its rows share one fill instead of every section repeating the same
 * rectangle. It survives as a row list because pages still read as
 * group(title, card([...])) and only the wrapper changes.
 */
const card = (rows) => rows.filter(Boolean).join('');

/** Rows in a group body, for the "N 项" count in the card head. */
const countRows = (body) => (String(body).match(/class="row[" ]/g) ?? []).length;

/*
 * `action` is the optional control in the card's top-right: one per card, and
 * only where the card has a single obvious verb. 常驻排列 uses it for 恢复默认,
 * so the reset sits with the thing it resets instead of inside its hint line.
 */
const group = (title, body, action = '') => {
  const count = countRows(body);
  return '<section class="group"><header class="ch"><h2>' + escapeHtml(title) + '</h2>' +
    (count ? '<span class="cnum">' + T('count.items', { n: count }) + '</span>' : '') +
    (action ? '<span class="ch-action">' + action + '</span>' : '') + '</header>' +
    '<div class="gbody">' + body + '</div></section>';
};

/*
 * The rail already knows which group and icon a page belongs to; the head reads
 * it back instead of every renderer carrying the same icon name around.
 */
const HEAD_META = new Map();
NAV.forEach((navGroup) => navGroup.items.forEach((item) =>
  HEAD_META.set(item.key, {
    icon: item.icon,
    group: navGroup.title,
    groupId: navGroup.id,
  })));

const head = (title, sub) => {
  const meta = HEAD_META.get(page) ?? { icon: 'gear', group: '', groupId: '' };
  const groupName = meta.groupId ? T('nav.' + meta.groupId, null, meta.group) : meta.group;
  return '<header class="page-head">' +
    '<span class="head-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICON[meta.icon] ?? ICON.gear) + '</svg></span>' +
    '<div class="head-text"><p class="crumb">' + escapeHtml(groupName) + ' · ' + escapeHtml(title) + '</p>' +
    '<h1>' + escapeHtml(title) + '</h1>' +
    (sub ? '<p class="sub">' + escapeHtml(sub) + '</p>' : '') + '</div></header>';
};

const emptyCard = (title, text, action, label) =>
  '<div class="card"><div class="empty-card"><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(text) + '</span>' +
  (action ? '<button type="button" class="btn primary" data-act="button" data-key="' + action + '">' + escapeHtml(label) + '</button>' : '') +
  '</div></div>';

const formError = (scope) =>
  '<p class="form-error" data-form-error="' + scope + '" hidden></p>';

function showFormError(scope, message) {
  const el = content.querySelector('[data-form-error="' + scope + '"]');
  if (!el) return;
  el.textContent = String(message || T('error.actionFailed'));
  el.hidden = false;
}

function clearFormError(scope) {
  const el = content.querySelector('[data-form-error="' + scope + '"]');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

/* ------------------------------------------------------------------ pages */

function pageGeneral() {
  return head(T('general.title'), T('general.lead')) +
    /* 语言开关放在最上面：它是这一页唯一一个「先看懂、再改别的」的选项，
       改完这一格，下面所有页立即用新语言重绘。 */
    group(T('general.language.title'), card([
      rowSeg(T('general.language.label'), T('general.language.sub'), 'lang', LANGS.map((code) => [code, code === 'zh' ? '中文' : 'English'])),
    ])) +
    group(T('general.presets.title'), '<div class="preset-grid">' +
      PRESET_MANIFEST.map((preset) =>
        '<button type="button" class="preset-card" data-act="preset" data-key="' + preset.key + '">' +
          '<b>' + escapeHtml(T('preset.' + preset.key + '.label', null, preset.label)) + '</b>' +
          '<span>' + escapeHtml(T('preset.' + preset.key + '.desc', null, preset.description)) + '</span>' +
        '</button>').join('') +
      '</div><p class="note">' + T('general.presets.note') + '</p>') +
    group(T('general.display.title'), card([
      rowSeg(T('general.displayMode.label'), T('general.displayMode.sub'), 'displayMode', [
        ['island', T('general.displayMode.island')],
        ['ball', T('general.displayMode.ball')],
        ['both', T('general.displayMode.both')],
      ]),
    ])) +
    group(T('general.window.title'), card([
      rowActionSeg(T('general.dock.label'), T('general.dock.sub'), 'dock',
        [['top', T('general.dock.top')], ['left', T('general.dock.left')], ['right', T('general.dock.right')], ['none', T('general.dock.none')]], meta?.dockSide ?? 'none'),
    ])) +
    group(T('general.startup.title'), card([
      rowToggle(T('general.launchAtLogin.label'), T('general.launchAtLogin.sub'), 'launchAtLogin'),
    ]));
}

function pageAppearance() {
  return head(T('appearance.title'), T('appearance.lead')) +
    group(T('appearance.theme.title'), card([
      rowSeg(T('appearance.colorMode.label'), T('appearance.colorMode.sub'), 'theme', [['system', T('appearance.colorMode.system')], ['light', T('appearance.colorMode.light')], ['dark', T('appearance.colorMode.dark')]]),
      rowSeg(T('appearance.timeFormat.label'), '', 'timeFormat', [['24h', T('appearance.timeFormat.h24')], ['12h', T('appearance.timeFormat.h12')]]),
    ])) +
    group(T('appearance.island.title'), card([
      /* The cards carry the name and the look of every skin; the text segment row
         above them repeated the same five labels, so it is gone. */
      rowStack(T('appearance.skin.label'), T('appearance.skin.sub'), skinPreviewCards()),
      skinPreviewRow(),
      rowToggle(T('appearance.blur.label'), T('appearance.blur.sub'), 'blur'),
      /* The one switch on this page that captures something: one screenshot of
         the desktop per open, in memory only. Its note says so, because a
         material this good is only acceptable if it says what it reads. */
      rowRange(T('appearance.radius.label'), T('appearance.radius.sub'), 'radius', 12, 30, 1, 'px'),
      rowRange(T('appearance.uiScale.label'), T('appearance.uiScale.sub'), 'uiScale', 80, 140, 5, '%'),
    ])) +
    group(T('appearance.position.title'), card([
      rowToggle(T('appearance.avoidTopBar.label'), T('appearance.avoidTopBar.sub'), 'avoidTopBar'),
      rowToggle(T('appearance.oledShift.label'), T('appearance.oledShift.sub'), 'oledShift'),
    ])) +
    group(T('appearance.type.title'), card([
      rowSelect(T('appearance.fontFamily.label'), T('appearance.fontFamily.sub'), 'font', [
        ['system', T('appearance.fontFamily.system')], ['pingfang', T('appearance.fontFamily.pingfang')], ['yahei', T('appearance.fontFamily.yahei')], ['mono', T('appearance.fontFamily.mono')],
      ]),
      rowSelect(T('appearance.weight.label'), '', 'weight', [['400', T('appearance.weight.400')], ['500', T('appearance.weight.500')], ['600', T('appearance.weight.600')]]),
      rowRange(T('appearance.fontSize.label'), T('appearance.fontSize.sub'), 'fontSize', 0, 20, 1, 'px'),
    ])) +
    group(T('appearance.animation.title'), card([
      rowToggle(T('appearance.motion.label'), T('appearance.motion.sub'), 'motion'),
      rowToggle(T('appearance.reduceMotion.label'), T('appearance.reduceMotion.sub'), 'reduceMotion'),
    ]));
}

/**
 * 屏幕名字 / A display's name.
 *
 * 主进程给的是 Electron 的 display.label，Windows 上常常是空的；空的时候主进程
 * 回退成「显示器 <id>」这个固定格式。这句回退也是给人看的文案，所以在渲染时
 * 换成当前语言；用户自己起的名字（display.label 有值）原样保留，不翻译。
 */
const displayLabel = (display) => {
  const label = String(display.label ?? '');
  const generated = label.match(/^显示器\s*(\d+)$/);
  if (generated) return T('layout.displayId.display', { n: generated[1] });
  return label || T('layout.displayId.display', { n: display.id });
};

function pageLayout() {
  const displayOptions = [['null', T('layout.displayId.followPrimary')]].concat(
    displays.map((d) => [String(d.id), displayLabel(d) + (d.primary ? T('layout.displayId.primarySuffix') : '')]),
  );
  return head(T('layout.title'), T('layout.lead')) +
    group(T('layout.island.title'), card([
      rowRange(T('layout.islandWidth.label'), T('layout.islandWidth.sub'), 'islandWidth', 360, 560, 10, 'px'),
      rowRange(T('layout.pillHeight.label'), T('layout.pillHeight.sub'), 'pillHeight', 30, 44, 1, 'px'),
      rowRange(T('layout.islandTopGap.label'), T('layout.islandTopGap.sub'), 'islandTopGap', 0, 24, 1, 'px'),
    ])) +
    group(T('layout.ball.title'), card([
      rowSeg(T('layout.size.label'), T('layout.size.sub'), 'sizeKey', [['xs', '64'], ['sm', '88'], ['md', '120'], ['lg', '160'], ['xl', '220']]),
      rowToggle(T('layout.pinned.label'), T('layout.pinned.sub'), 'pinned'),
      rowToggle(T('layout.clickThrough.label'), T('layout.clickThrough.sub'), 'clickThrough'),
    ])) +
    group(T('layout.display.title'), card([
      rowSelect(T('layout.displayId.label'), T('layout.displayId.sub'), 'displayId', displayOptions, String(prefs.displayId ?? 'null')),
    ]));
}

/* ------------------------------------------------------------- auto-avoid */

const AVOID_ICON_CACHE = new Map();

/*
 * The glyph shown when an exe's own icon cannot be read. A first letter is not
 * the app's icon — the user asked for the default application icon instead, so
 * the grid never falls back to an "e"-in-a-box again.
 */
const DEFAULT_APP_ICON =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect x="3" y="5" width="26" height="22" rx="5" fill="#2b2b34"/>' +
      '<path d="M3 10a5 5 0 0 1 5-5h16a5 5 0 0 1 5 5v1H3z" fill="#3c3c48"/>' +
      '<circle cx="7.4" cy="8.4" r="1.3" fill="#7b7b8a"/>' +
      '<circle cx="11.6" cy="8.4" r="1.3" fill="#7b7b8a"/>' +
      '<rect x="7" y="15" width="18" height="2.4" rx="1.2" fill="#5b5b6a"/>' +
      '<rect x="7" y="20" width="11" height="2.4" rx="1.2" fill="#4a4a58"/>' +
    '</svg>',
  );

function avoidIconHtml(path) {
  const icon = AVOID_ICON_CACHE.get(path);
  return '<img src="' + (icon || DEFAULT_APP_ICON) + '" alt="" draggable="false" />';
}

function avoidApps() {
  return Array.isArray(prefs.avoidApps)
    ? prefs.avoidApps.filter((app) => app && typeof app.path === 'string')
    : [];
}

function sameExe(a, b) {
  return String(a).replace(/\//g, '\\').toLowerCase() === String(b).replace(/\//g, '\\').toLowerCase();
}

function avoidAppsRow() {
  const apps = avoidApps();
  if (!apps.length) return '<div class="avoid-empty">' + T('behavior.customApps.empty') + '</div>';
  const cells = apps.map((app) => {
    const label = app.name || app.path;
    const face = avoidIconHtml(app.path);
    return '<div class="avoid-app" title="' + escapeHtml(T('avoid.app.tooltip', { name: label, path: app.path })) + '">' + face +
      '<button type="button" class="avoid-x" data-act="avoid-remove" data-path="' + escapeHtml(app.path) +
        '" aria-label="' + escapeHtml(T('avoid.app.remove', { name: label })) + '">×</button></div>';
  });
  return '<div class="avoid-grid">' + cells.join('') + '</div>';
}

let avoidIconsAt = 0;

/**
 * Read the icons the cache is missing.
 *
 * `force` re-reads paths that are already cached. A failed read used to be
 * remembered as "no icon" for the life of the settings window, so the grid kept
 * a letter until the window was reopened; the saved apps are now re-read on
 * every visit instead.
 */
function ensureAvoidIcons(paths, opts) {
  const force = !!(opts && opts.force);
  const wanted = [...new Set(paths)].filter(Boolean);
  const missing = force ? wanted : wanted.filter((p) => !AVOID_ICON_CACHE.has(p));
  if (!missing.length) return;
  api.avoidIcons(missing.slice(0, 120)).then((map) => {
    let changed = 0;
    for (const [key, value] of Object.entries(map || {})) {
      if (!value) continue;
      if (AVOID_ICON_CACHE.get(key) !== value) changed += 1;
      AVOID_ICON_CACHE.set(key, value);
    }
    if (changed && content.querySelector('.avoid-grid')) paint();
    if (changed && avoidDialog) paintAvoidDialog();
  }).catch(() => {});
}

let avoidDialog = null;
let avoidList = [];
let avoidQuery = '';
let avoidSelected = '';
let avoidLoading = false;
let avoidConfirmAll = false;

function closeAvoidDialog() {
  avoidDialog?.remove();
  avoidDialog = null;
  avoidConfirmAll = false;
}

function avoidCandidateReason(app) {
  if (prefs.avoidBrowsers !== false && app.browser === true) return T('avoid.reason.browser');
  if (avoidApps().some((item) => sameExe(item.path, app.path))) return T('avoid.reason.added');
  return '';
}

function avoidMatches() {
  const query = avoidQuery.trim().toLowerCase();
  return avoidList.filter((app) =>
    !query || String(app.name).toLowerCase().includes(query) || String(app.title).toLowerCase().includes(query));
}

function avoidListHtml(rows) {
  if (!rows.length) {
    return '<p class="avoid-none">' + (avoidLoading ? T('avoid.empty.loading') : T('avoid.empty.none')) + '</p>';
  }
  return rows.map((app) => {
    const reason = avoidCandidateReason(app);
    const picked = sameExe(avoidSelected || '', app.path);
    const face = avoidIconHtml(app.path);
    return '<button type="button" class="avoid-item' + (picked ? ' is-picked' : '') + (reason ? ' is-taken' : '') +
      '" data-act="avoid-pick" data-path="' + escapeHtml(app.path) + '"' + (reason ? ' disabled' : '') + '>' +
      '<span class="avoid-icon">' + face + '</span>' +
      '<span class="avoid-text"><b>' + escapeHtml(app.name) + '</b><em>' + escapeHtml(app.title || app.path) + '</em></span>' +
      (reason ? '<span class="avoid-reason">' + escapeHtml(reason) + '</span>' : '') +
      '</button>';
  }).join('');
}

function avoidConfirmHtml(addable) {
  if (!avoidConfirmAll) return '';
  return '<div class="avoid-confirm"><p>' + T('avoid.confirm.text', { n: addable.length }) + '</p>' +
    '<div class="avoid-confirm-actions"><button type="button" class="btn primary" data-act="avoid-confirm-all">' + T('avoid.confirm.yes') + '</button>' +
    '<button type="button" class="btn" data-act="avoid-cancel-all">' + T('avoid.confirm.cancel') + '</button></div></div>';
}

/** Re-render the list and footer without touching the search box. */
function updateAvoidDialog() {
  const rows = avoidMatches();
  const addable = rows.filter((app) => !avoidCandidateReason(app));
  const list = avoidDialog.querySelector('.avoid-list');
  if (list) list.innerHTML = avoidListHtml(rows);
  const all = avoidDialog.querySelector('[data-act="avoid-add-all"]');
  const one = avoidDialog.querySelector('[data-act="avoid-add-one"]');
  if (all) all.disabled = !addable.length || avoidConfirmAll;
  if (one) one.disabled = !avoidSelected;
  const oldConfirm = avoidDialog.querySelector('.avoid-confirm');
  if (oldConfirm) oldConfirm.remove();
  const modal = avoidDialog.querySelector('.avoid-modal');
  if (modal) modal.insertAdjacentHTML('beforeend', avoidConfirmHtml(addable));
  avoidDialog.querySelectorAll('.avoid-item').forEach((node) => {
    const path = node.dataset.path || '';
    const picked = sameExe(avoidSelected || '', path);
    node.classList.toggle('is-picked', picked);
  });
  ensureAvoidIcons(avoidList.map((app) => app.path));
}

function paintAvoidDialog() {
  if (!avoidDialog) return;
  if (avoidDialog.querySelector('.avoid-list')) {
    updateAvoidDialog();
    return;
  }
  const rows = avoidMatches();
  const addable = rows.filter((app) => !avoidCandidateReason(app));
  const list = rows.length
    ? rows.map((app) => {
        const reason = avoidCandidateReason(app);
        const picked = sameExe(avoidSelected || '', app.path);
        const face = avoidIconHtml(app.path);
        return '<button type="button" class="avoid-item' + (picked ? ' is-picked' : '') + (reason ? ' is-taken' : '') +
          '" data-act="avoid-pick" data-path="' + escapeHtml(app.path) + '"' + (reason ? ' disabled' : '') + '>' +
          '<span class="avoid-icon">' + face + '</span>' +
          '<span class="avoid-text"><b>' + escapeHtml(app.name) + '</b><em>' + escapeHtml(app.title || app.path) + '</em></span>' +
          (reason ? '<span class="avoid-reason">' + escapeHtml(reason) + '</span>' : '') +
          '</button>';
      }).join('')
    : '<p class="avoid-none">' + (avoidLoading ? T('avoid.empty.loading') : T('avoid.empty.none')) + '</p>';
  const confirm = avoidConfirmAll
    ? '<div class="avoid-confirm"><p>' + T('avoid.confirm.text', { n: addable.length }) + '</p>' +
      '<div class="avoid-confirm-actions"><button type="button" class="btn primary" data-act="avoid-confirm-all">' + T('avoid.confirm.yes') + '</button>' +
      '<button type="button" class="btn" data-act="avoid-cancel-all">' + T('avoid.confirm.cancel') + '</button></div></div>'
    : '';
  avoidDialog.innerHTML =
    '<div class="avoid-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(T('avoid.dialog.title')) + '">' +
      '<header class="avoid-head"><h2>' + escapeHtml(T('avoid.dialog.title')) + '</h2>' +
        '<button type="button" class="avoid-close" data-act="avoid-close" aria-label="' + escapeHtml(T('win.close')) + '">×</button></header>' +
      '<p class="avoid-sub">' + escapeHtml(T('avoid.dialog.sub')) + '</p>' +
      '<input class="ctl avoid-search" id="avoid-search" type="search" placeholder="' + escapeHtml(T('avoid.search.placeholder')) + '" value="' + escapeHtml(avoidQuery) + '" />' +
      '<div class="avoid-list">' + list + '</div>' +
      '<div class="avoid-foot"><span class="avoid-hint">' + escapeHtml(T('avoid.foot.hint')) + '</span>' +
        '<button type="button" class="btn" data-act="avoid-refresh">' + escapeHtml(T('avoid.foot.refresh')) + '</button>' +
      '</div>' +
      '<div class="avoid-actions">' +
        '<button type="button" class="btn" data-act="avoid-close">' + escapeHtml(T('action.cancel')) + '</button>' +
        '<button type="button" class="btn" data-act="avoid-add-all"' + (addable.length && !avoidConfirmAll ? '' : ' disabled') + '>' + escapeHtml(T('action.addAll')) + '</button>' +
        '<button type="button" class="btn primary" data-act="avoid-add-one"' + (avoidSelected ? '' : ' disabled') + '>' + escapeHtml(T('action.add')) + '</button>' +
      '</div>' + confirm +
    '</div>';
  const box = avoidDialog.querySelector('#avoid-search');
  if (box && document.activeElement !== box) {
    box.focus();
    box.setSelectionRange(avoidQuery.length, avoidQuery.length);
  }
  ensureAvoidIcons(avoidList.map((app) => app.path));
}

function openAvoidDialog() {
  if (avoidDialog) return;
  avoidQuery = '';
  avoidSelected = '';
  avoidConfirmAll = false;
  avoidLoading = true;
  avoidDialog = document.createElement('div');
  avoidDialog.className = 'avoid-backdrop';
  document.body.appendChild(avoidDialog);
  paintAvoidDialog();
  api.avoidApps().then((apps) => {
    avoidList = Array.isArray(apps) ? apps : [];
    avoidLoading = false;
    paintAvoidDialog();
  }).catch(() => {
    avoidList = [];
    avoidLoading = false;
    paintAvoidDialog();
  });
}

async function addAvoidApp(app) {
  const list = avoidApps().slice();
  if (list.some((item) => sameExe(item.path, app.path))) return;
  list.push({ path: app.path, name: app.name || app.path });
  await patch({ avoidApps: list });
  ensureAvoidIcons([app.path]);
}

function pageBehavior() {
  /*
   * Re-read the saved apps' icons each time the page is painted. The read is
   * cheap (one PowerShell pass for a handful of exes) and throttled so a burst
   * of preference repaints does not spawn one per keystroke.
   */
  ensureAvoidIcons(avoidApps().map((app) => app.path), { force: Date.now() - avoidIconsAt > 3000 });
  avoidIconsAt = Date.now();
  return head(T('behavior.title'), T('behavior.lead')) +
    group(T('behavior.show.title'), card([
      rowToggle(T('behavior.hideFullscreen.label'), T('behavior.hideFullscreen.sub'), 'hideFullscreen'),
      rowToggle(T('behavior.trayIcon.label'), T('behavior.trayIcon.sub'), 'trayIcon'),
      rowRange(T('behavior.hoverOpenDelay.label'), T('behavior.hoverOpenDelay.sub'), 'hoverOpenDelay', 0, 500, 20, 'ms'),
      rowToggle(T('behavior.hoverAutoHide.label'), T('behavior.hoverAutoHide.sub'), 'hoverAutoHide'),
      rowRange(T('behavior.hoverCloseDelay.label'), T('behavior.hoverCloseDelay.sub'), 'hoverCloseDelay', 60, 1200, 60, 'ms'),
    ])) +
    group(T('behavior.avoid.title'), card([
      rowToggle(T('behavior.avoidEnabled.label'), T('behavior.avoidEnabled.sub'), 'avoidEnabled'),
      rowToggle(T('behavior.avoidBrowsers.label'), T('behavior.avoidBrowsers.sub'), 'avoidBrowsers'),
      '<div class="row"><span class="row-label"><b>' + escapeHtml(T('behavior.customApps.label')) + '</b></span><span class="row-control">' +
        '<button type="button" class="btn" data-act="avoid-add">' + escapeHtml(T('behavior.customApps.add')) + '</button></span></div>',
      avoidAppsRow(),
      '<p class="hint">' + T('behavior.customApps.note') + '</p>',
    ])) +
    group(T('behavior.interaction.title'), card([
      rowToggle(T('behavior.wheelPaging.label'), T('behavior.wheelPaging.sub'), 'wheelPaging'),
      rowToggle(T('behavior.blurCollapse.label'), T('behavior.blurCollapse.sub'), 'blurCollapse'),
    ])) +
    group(T('behavior.hotkey.title'), card([
      rowToggle(T('behavior.hotkey.label'), T('behavior.hotkey.sub'), 'hotkey'),
    ])) +
    '';
}

function orderList(listId, items, enabledOf, toggleAction = 'toggle-nested') {
  return '<div class="order" role="list" data-order-list="' + listId + '">' + items.map((item, index) =>
    '<div class="order-item" role="listitem" tabindex="0" draggable="true" data-order="' + item.key +
      '" aria-label="' + escapeHtml(item.label) + '">' +
      '<span class="order-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="order-name">' + escapeHtml(item.label) +
        '' +
        (item.sub ? '<em>' + escapeHtml(item.sub) + '</em>' : '') +
      '</span>' +
      '<span class="order-move">' +
        '<button type="button" data-order-move="-1" aria-label="' + escapeHtml(T('pages.order.up', { name: item.label })) + '"' +
          (index === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button>' +
        '<button type="button" data-order-move="1" aria-label="' + escapeHtml(T('pages.order.down', { name: item.label })) + '"' +
          (index === items.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>' +
      '</span>' +
      (enabledOf ? '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(enabledOf(item.key)) +
        '" data-act="' + toggleAction + '" data-key="' +
        (toggleAction === 'toggle-status' ? item.key : 'pages.' + item.key) +
        '" aria-label="' + escapeHtml(item.label) + '"></button>' : '') +
    '</div>').join('') + '</div>';
}

/* ------------------------------------------------------- residency strip */

/*
 * 条上的示意电量与温度。
 *
 * 电池和天气归岛那边三个窗口的服务，设置窗口没有它们的实时快照，所以预览
 * 画一组固定读数：值不必是真的，格式必须是——两条路走的是同一组
 * status-view 函数。时间用真实当前时间，余额有真读数就用真读数。
 */
const RESIDENCY_BATTERY = 82;
const RESIDENCY_CELSIUS = 17;

/**
 * 「常驻排列」：岛折叠时那颗胶囊的预览条，拖动直接在条上换位。
 *
 * 条是胶囊的等比放大：同一个胶囊圆角、同一套内边距节奏、同一组读数函数。
 * 皮肤与主题跟随 prefs.skin 与 html[data-theme] —— .skin-preview 这个类把
 * 五套皮肤映射成岛自己的变量名（--card-solid / --accent / --ink / --ui-font），
 * 这里只借它的变量壳，尺寸由 .residency-pill 自己重写。
 *
 * 未启用的组件留在条上（虚线 + 降透明度）：位置看得见，只是它现在不画在
 * 胶囊里。开关仍在下方的「状态组件」卡里，两处读的是同一份 prefs.statusItems，
 * 所以任一处改完，这一条下一帧就是新顺序。
 */
function residencyCard() {
  const use24 = prefs.timeFormat !== '12h';
  const unit = prefs.weather?.unit === 'f' ? 'f' : 'c';
  const now = new Date();
  const balance = quotaText(quotaState.last);
  const chips = statusPreviewRows(prefs).map(({ key, enabled }) => {
    const label = T('status.' + key, null, key);
    const icon = key === 'battery' ? batteryGlyph(RESIDENCY_BATTERY, true) : '';
    const value = key === 'battery' ? batteryText(RESIDENCY_BATTERY)
      : key === 'clock' ? clockText(now, use24)
        : key === 'weather' ? temperatureText(RESIDENCY_CELSIUS, unit)
          : balance || '¥20.8';
    const off = T('pages.residency.off', { name: label });
    const aria = enabled ? T('pages.residency.chip', { name: label, value }) : off;
    return '<div class="residency-chip" role="listitem" tabindex="0" data-residency-key="' + key +
      '" data-on="' + enabled + '" aria-label="' + escapeHtml(aria) + '"' +
      (enabled ? '' : ' aria-disabled="true"') +
      ' title="' + escapeHtml(enabled ? T('pages.residency.drag') : off) + '">' +
      (icon ? '<span class="rc-icon" aria-hidden="true">' + icon + '</span>' : '') +
      '<b class="rc-value">' + escapeHtml(value) + '</b>' +
      '</div>';
  }).join('');
  return '<div class="residency" data-residency>' +
    '<div class="residency-pill skin-preview" data-skin-preview="' + escapeHtml(prefs.skin ?? 'frost') +
      '" role="list" aria-label="' + escapeHtml(T('pages.residency.preview')) + '">' +
      '<span class="residency-face" aria-hidden="true">' +
        '<emojitot-ball cast="' + escapeHtml(meta?.castId ?? 'tot') + '" size="30" state="' +
          escapeHtml(faceState || 'idle') + '"></emojitot-ball>' +
      '</span>' + chips +
    '</div>' +
    '<span class="residency-mark" data-residency-mark hidden aria-hidden="true"></span>' +
    '</div>' +
    '<p class="hint">' + escapeHtml(T('pages.residency.hint')) + '</p>' +
    '<p class="note">' + escapeHtml(T('pages.residency.note')) + '</p>';
}

function pagePages() {
  const pageTable = pagesTable();
  const statusTableRows = statusTable();
  const pageItems = orderedPageKeys(prefs)
    .map((key) => pageTable.find((p) => p.key === key))
    .filter(Boolean);
  const statusItems = orderedStatusKeys(prefs)
    .map((key) => statusTableRows.find((item) => item.key === key))
    .filter(Boolean);

  const defaultOptions = pageItems.map((item) => [item.key, item.label]);
  return head(T('pages.title'), T('pages.lead')) +
    group(T('pages.residency.title'), residencyCard(),
      '<button type="button" class="btn" data-act="status-reset" aria-label="' +
        escapeHtml(T('pages.residency.reset.aria')) + '">' +
        escapeHtml(T('pages.residency.reset')) + '</button>') +
    group(T('pages.status.title'), '<div class="card">' +
      orderList('status', statusItems, (key) => prefs.statusItems.includes(key), 'toggle-status') + '</div>') +
    group(T('pages.pages.title'), '<div class="card">' + orderList('pages', pageItems, (key) => prefs.pages[key] !== false) + '</div>') +
    group(T('pages.open.title'), card([
      rowSelect(T('pages.defaultPage.label'), T('pages.defaultPage.sub'), 'defaultPage', defaultOptions, prefs.defaultPage),
    ])) +
    '<p class="note">' + T('pages.note') + '</p>';
}

function pageMusic() {
  return head(T('music.title'), T('music.lead')) +
    group(T('music.lyrics.title'), card([
      rowToggle(T('music.lyrics.label'), T('music.lyrics.sub'), 'music.lyrics'),
      rowToggle(T('music.islandLyrics.label'), T('music.islandLyrics.sub'), 'music.islandLyrics'),
      rowRange(T('music.offset.label'), T('music.offset.sub'), 'music.offset', -1, 2, 0.05, T('unit.seconds')),
    ])) +
    '<p class="note">' + T('music.note') + '</p>';
}

function pageFocus() {
  return head(T('focus.title'), T('focus.lead')) +
    group(T('focus.focus.title'), card([
      rowToggle(T('focus.enabled.label'), T('focus.enabled.sub'), 'focus.enabled'),
      rowRange(T('focus.work.label'), '', 'focus.work', 10, 60, 5, T('unit.minutes')),
      rowRange(T('focus.rest.label'), '', 'focus.rest', 3, 20, 1, T('unit.minutes')),
    ])) +
    group(T('focus.health.title'), card([
      rowToggle(T('health.enabled.label'), T('health.enabled.sub'), 'health.enabled'),
      rowRange(T('health.waterMin.label'), '', 'health.waterMin', 20, 120, 5, T('unit.minutes')),
      rowRange(T('health.standMin.label'), '', 'health.standMin', 30, 180, 10, T('unit.minutes')),
    ])) +
    '<p class="note">' + T('focus.note') + '</p>';
}

function pageTodo() {
  return head(T('todo.title'), T('todo.lead')) +
    group(T('todo.todo.title'), card([
      rowToggle(T('todo.enabled.label'), T('todo.enabled.sub'), 'todo.enabled'),
      rowToggle(T('todo.notify.label'), T('todo.notify.sub'), 'todo.notify'),
    ])) +
    group(T('todo.shelf.title'), card([
      rowToggle(T('shelf.enabled.label'), T('shelf.enabled.sub'), 'shelf.enabled'),
      rowInput(T('shelf.dir.label'), T('shelf.dir.sub'), 'shelf.dir', prefs.shelf?.dir ?? '', T('shelf.dir.placeholder')),
    ])) +
    group(T('todo.clipboard.title'), card([
      rowToggle(T('shelf.clipboard.label'), T('shelf.clipboard.sub'), 'shelf.clipboard'),
      row(T('todo.clipboardWhere.label'), T('todo.clipboardWhere.sub'), '<span class="badge">' + T('badge.local') + '</span>'),
      row(T('todo.clipboardClear.label'), T('todo.clipboardClear.sub'), '<button type="button" class="btn" data-act="button" data-key="clipboard-clear">' + T('action.clear') + '</button>'),
    ])) +
    '<p class="note">' + T('todo.note') + '</p>';
}

function pageComm() {
  const mailAccounts = mailState.accounts ?? [];
  const accountRows = mailAccounts.length
    ? mailAccounts
        .map((account) =>
          row(
            account.address,
            `${account.provider} · ${account.enabled === false ? T('comm.mail.disabled') : T('comm.mail.connected')}`,
            `<button type="button" class="btn" data-act="button" data-key="mail-remove" data-id="${account.id}">${T('action.remove')}</button>`,
          ),
        )
        .join('')
    : '<div class="row"><span class="row-label"><b>' + T('comm.mail.empty.label') + '</b><span>' + T('comm.mail.empty.sub') + '</span></span></div>';

  const mailStatus =
    mailState.lastSync || mailState.error
      ? row(
          T('comm.mail.syncStatus.label'),
          mailState.error ? escapeHtml(mailState.error) : T('comm.mail.count', { n: mailState.messages.length, time: stamp(mailState.lastSync) }),
          '<button type="button" class="btn" data-act="button" data-key="mail-refresh">' + T('comm.mail.syncNow') + '</button>',
        )
      : '';

  const subscriptions = calendarState.subscriptions ?? [];
  const subscriptionRows = subscriptions.length
    ? subscriptions
        .map((sub) =>
          row(
            sub.name,
            sub.error ? T('comm.subs.failed', { error: sub.error }) : T('comm.subs.synced', { time: sub.lastSync ? stamp(sub.lastSync) : T('comm.subs.never') }),
            '<button type="button" class="btn" data-act="button" data-key="cal-unsubscribe" data-id="' + escapeHtml(sub.id) + '">' + T('action.remove') + '</button>',
          ),
        )
        .join('')
    : '<div class="row"><span class="row-label"><b>' + T('comm.subs.empty.label') + '</b><span>' + T('comm.subs.empty.sub') + '</span></span></div>';

  const events = (calendarState.events ?? []).slice(0, 6);
  const eventRows = events.length
    ? events
        .map((event) => {
          const date = new Date(event.start);
          const label = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          return row(event.title, label + (event.location ? ' · ' + event.location : ''),
            `<button type="button" class="btn" data-act="button" data-key="cal-remove" data-id="${event.id}">${T('action.remove')}</button>`);
        })
        .join('')
    : '<div class="row"><span class="row-label"><b>' + T('comm.calendar.empty.label') + '</b><span>' + T('comm.calendar.empty.sub') + '</span></span></div>';

  return head(T('comm.title'), T('comm.lead')) +
    group(T('comm.notify.title'), card([
      rowToggle(T('notify.system.label'), T('notify.system.sub'), 'notify.system'),
      rowToggle(T('notify.body.label'), T('notify.body.sub'), 'notify.body'),
    ])) +
    group(T('comm.messenger.title'), card([
      rowToggle(T('messenger.wechat.label'), T('messenger.wechat.sub'), 'messenger.wechat'),
      rowToggle(T('messenger.qq.label'), T('messenger.qq.sub'), 'messenger.qq'),
      rowToggle(T('messenger.wecom.label'), '', 'messenger.wecom'),
      rowToggle(T('messenger.feishu.label'), '', 'messenger.feishu'),
      rowToggle(T('messenger.dingtalk.label'), '', 'messenger.dingtalk'),
    ])) +
    group(T('comm.mail.title'), '<div class="card">' + accountRows + mailStatus + '</div>') +
    group(T('comm.mail.add.title'), card([
      rowSelect(T('comm.mail.provider.label'), T('comm.mail.provider.sub'), 'mailProvider', [
        ['163', T('comm.mail.provider.163')], ['qq', T('comm.mail.provider.qq')], ['gmail', 'Gmail'], ['outlook', 'Outlook'], ['custom', T('comm.mail.provider.custom')],
      ], prefs.mailProvider ?? '163'),
      row(T('comm.mail.address.label'), '', '<input class="ctl" data-mail-input="address" placeholder="you@163.com" spellcheck="false" />'),
      row(T('comm.mail.secret.label'), T('comm.mail.secret.sub'), '<input class="ctl" type="password" data-mail-input="secret" placeholder="' + T('comm.mail.secret.placeholder') + '" spellcheck="false" />'),
      row(T('comm.mail.host.label'), T('comm.mail.host.sub'), '<input class="ctl" data-mail-input="host" placeholder="imap.example.com" spellcheck="false" />'),
      row('', T('comm.mail.add.sub'), '<button type="button" class="btn primary" data-act="button" data-key="mail-add">' + T('comm.mail.add.action') + '</button>'),
    ]) + formError('mail-add')) +
    group(T('comm.calendar.title'), '<div class="card">' + eventRows + '</div>') +
    group(T('comm.subs.title'), '<div class="card">' + subscriptionRows + '</div>') +
    group(T('comm.subs.add.title'), card([
      row(T('comm.subs.name.label'), T('comm.subs.name.sub'), '<input class="ctl" data-cal-input="subName" placeholder="' + T('comm.subs.name.placeholder') + '" spellcheck="false" />'),
      row(T('comm.subs.url.label'), T('comm.subs.url.sub'), '<input class="ctl" data-cal-input="subUrl" placeholder="https://…/calendar.ics" spellcheck="false" />'),
      row('', T('comm.subs.add.sub'), '<button type="button" class="btn primary" data-act="button" data-key="cal-subscribe">' + T('comm.subs.add.action') + '</button>'),
    ]) + formError('calendar-subscribe')) +
    group(T('comm.event.add.title'), card([
      row(T('comm.event.title.label'), '', '<input class="ctl" data-cal-input="title" placeholder="' + T('comm.event.title.placeholder') + '" spellcheck="false" />'),
      row(T('comm.event.time.label'), '', '<input class="ctl" type="datetime-local" data-cal-input="start" />'),
      row(T('comm.event.place.label'), T('comm.event.place.sub'), '<input class="ctl" data-cal-input="location" placeholder="' + T('comm.event.place.placeholder') + '" spellcheck="false" />'),
      row('', T('comm.event.add.sub'), '<button type="button" class="btn primary" data-act="button" data-key="cal-add">' + T('comm.event.add.action') + '</button>'),
    ]) + formError('calendar-add')) +
    '<p class="note">' + T('comm.note') + '</p>';
}

const stamp = (ms) => {
  const date = new Date(Number(ms) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function pageQuota() {
  const state = quotaState ?? { accounts: [], last: null };
  const accounts = state.accounts
    .map((account) =>
      row(
        account.name,
        account.current ? T('quota.currentAccount') : account.provider,
        `<span class="row-control">
          <button type="button" class="btn" data-act="button" data-key="quota-select" data-id="${account.id}" ${account.current ? 'disabled' : ''}>${account.current ? T('action.inUse') : T('action.switch')}</button>
          <button type="button" class="btn" data-act="button" data-key="quota-remove" data-id="${account.id}">${T('action.remove')}</button>
        </span>`,
      ),
    )
    .join('');
  const last = state.last;
  const balance = last && !last.error && last.total !== undefined
    ? row(T('quota.balance.label'), T('quota.balance.updated', { time: stamp(last.at), state: last.available ? T('quota.balance.available') : T('quota.balance.unavailable') }), `<b>¥${escapeHtml(last.total)}</b>`)
    : row(T('quota.balance.label'), last?.error ? escapeHtml(last.error) : T('quota.notQueried'), `<button type="button" class="btn" data-act="button" data-key="quota-refresh">${T('action.query')}</button>`);

  const agents = meta?.agents ?? [];
  return head(T('quota.title'), T('quota.lead')) +
    group(T('quota.accounts.title'), '<div class="card">' + (accounts || emptyCardRow()) + balance + '</div>') +
    group(T('quota.add.title'), card([
      row(T('quota.provider.label'), T('quota.provider.sub'), '<select class="ctl" data-quota-input="provider">' +
        [['deepseek', 'DeepSeek'], ['moonshot', T('quota.provider.moonshot')], ['siliconflow', 'SiliconFlow'], ['openrouter', 'OpenRouter']]
          .map(([value, text]) => '<option value="' + value + '">' + text + '</option>').join('') + '</select>'),
      row(T('quota.name.label'), T('quota.name.sub'), '<input class="ctl" data-quota-input="name" placeholder="' + T('quota.name.placeholder') + '" spellcheck="false" />'),
      row('API Key', T('quota.key.sub'), '<input class="ctl" type="password" data-quota-input="key" placeholder="sk-..." spellcheck="false" />'),
      row('', T('quota.add.sub'), '<button type="button" class="btn primary" data-act="button" data-key="quota-add">' + T('quota.add.action') + '</button>'),
    ]) + formError('quota-add')) +
    group(T('quota.refresh.title'), card([
      rowRange(T('quota.intervalMin.label'), T('quota.intervalMin.sub'), 'quota.intervalMin', 5, 120, 5, T('unit.minutes')),
      rowToggle(T('quota.alert.label'), T('quota.alert.sub'), 'quota.alert'),
      rowRange(T('quota.threshold.label'), T('quota.threshold.sub'), 'quota.threshold', 1, 50, 1, T('unit.yuan')),
    ])) +
    /* The linkage used to have a page of its own. It is a second switch set on
       this page now: the island's workbench already draws both halves from one
       snapshot, and a separate page made a person hunt for the switches the
       workbench pointed at. The hairline is the group boundary. */
    '<div class="group-sep" role="separator"></div>' +
    group(T('quota.agents.title'), card(agents.length
      ? agents.map((agent) => rowActionToggle(agent.label, T('quota.agents.sub'), 'agent', agent.on, agent.id))
      : [row(T('quota.agents.missing.label'), T('quota.agents.missing.sub'), '<span class="badge">' + T('badge.notLoaded') + '</span>')])) +
    '<p class="note">' + T('quota.note') + '</p>';
}

function emptyCardRow() {
  return '<div class="row"><span class="row-label"><b>' + T('quota.empty.label') + '</b><span>' + T('quota.empty.sub') + '</span></span></div>';
}

function pageWeather() {
  return head(T('weather.title'), T('weather.lead')) +
    group(T('weather.location.title'), card([
      rowToggle(T('weather.autoLocate.label'), T('weather.autoLocate.sub'), 'weather.autoLocate'),
      rowInput(T('weather.city.label'), T('weather.city.sub'), 'weather.city', prefs.weather.city, T('weather.city.placeholder')),
      rowSeg(T('weather.unit.label'), '', 'weather.unit', [['c', T('weather.unit.c')], ['f', T('weather.unit.f')]]),
    ])) +
    '<p class="note">' + T('weather.privacy.note') + '</p>' +
    group(T('weather.data.title'), card([
      rowRange(T('weather.intervalMin.label'), T('weather.intervalMin.sub'), 'weather.intervalMin', 5, 60, 5, T('unit.minutes')),
      row(T('weather.refreshNow.label'), T('weather.refreshNow.sub'), '<button type="button" class="btn" data-act="button" data-key="refresh-weather">' + T('weather.refreshNow.action') + '</button>'),
    ])) +
    '<p class="note">' + T('weather.note') + '</p>';
}


/*
 * 设备：设置里的外设清单。
 *
 * 这一页和岛的设备页读同一份快照、写同一组偏好（showBattery / pinned /
 * hidden），区别在读写面：这里列出**全部**外设，包括被隐藏的——"藏起来"
 * 必须能在这里反悔；岛上则只画没被隐藏的。数据由主进程在页面打开时启动
 * 探测，探测结果通过 settings:devices 推过来，所以这一页不自己轮询。
 */
const DEVICE_GLYPHS = {
  /* 探针只给名字、状态、电量与来源，没有图标字段。按名字归到五类通用符号；
     归不到的设备用中性外设符号，绝不用首字母——那是替设备起的缩写。 */
  audio: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4.5" height="7" rx="2"/><rect x="17" y="13" width="4.5" height="7" rx="2"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M8.5 10h.01M11 10h.01M13.5 10h.01M16 10h.01M18.5 10h.01M8 14h8"/>',
  mouse: '<rect x="7" y="2.5" width="10" height="19" rx="5"/><path d="M12 6.5v4"/>',
  gamepad: '<path d="M7 7h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6l-1-1H10l-1 1A4 4 0 0 1 2 13v-1a5 5 0 0 1 5-5z"/><path d="M8 10v3M6.5 11.5h3"/><circle cx="16.5" cy="10.5" r=".6"/><circle cx="18.5" cy="12.5" r=".6"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  other: '<rect x="3" y="7" width="18" height="12" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/><circle cx="12" cy="13.4" r="1.4"/>',
};
/* 与岛设备页同一套来源文案，让两个窗口对同一行的解释一致；
   键在 i18n.js 的 devices.source.* 下，语言切换时两个窗口一起换。 */
const DEVICE_SOURCE_LABEL = {
  bluetooth: 'devices.source.bluetooth',
  'hid-wireless': 'devices.source.hid-wireless',
  hid: 'devices.source.hid',
  wmi: 'devices.source.wmi',
};
const STAR_ICON = '<path d="m12 3.4 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>';

function pageDevices() {
  const list = Array.isArray(devicesState?.devices) ? devicesState.devices : [];
  const hidden = Array.isArray(prefs.devices?.hidden) ? prefs.devices.hidden : [];
  const pinned = Array.isArray(prefs.devices?.pinned) ? prefs.devices.pinned : [];
  const showBattery = prefs.devices?.showBattery !== false;
  const probedAt = Number(devicesState?.probedAt) || 0;
  const pinFull = pinned.length >= DEVICE_PIN_LIMIT;
  const orderStored = Array.isArray(prefs.devices?.order) && prefs.devices.order.length > 0;
  const levelOf = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const level = Number(value);
    if (!Number.isFinite(level)) return null;
    return Math.max(0, Math.min(100, Math.round(level)));
  };

  /* The order the person dragged into place; pinned rows still lead. */
  const ordered = orderDevices(list, { pinned, order: prefs.devices?.order });
  const rows = ordered.map((device) => {
    const name = String(device.name ?? '');
    const shown = !hidden.includes(name);
    const isPinned = pinned.includes(name);
    const level = levelOf(device.battery);
    const tone = level === null ? '' : level < 20 ? ' bad' : level < 50 ? ' warn' : '';
    const state = device.status === 'OK' ? T('devices.row.connected') : String(device.status || T('devices.row.connected'));
    const source = DEVICE_SOURCE_LABEL[device.source] ? T(DEVICE_SOURCE_LABEL[device.source]) : '';
    const battery = showBattery
      ? level === null
        ? '<span class="dev-bat" title="' + escapeHtml(T('devices.row.noLevel')) + '">—</span>'
        : '<span class="dev-bat" title="' + escapeHtml(T('devices.row.level', { n: level })) + '"><span class="dev-meter' + tone + '" aria-hidden="true"><i style="width:' + level + '%"></i></span><b>' + level + '%</b></span>'
      : '<span class="dev-bat" title="' + escapeHtml(T('devices.row.levelOff')) + '">—</span>';
    const pinTitle = isPinned
      ? T('devices.row.unpinTitle')
      : pinFull ? T('devices.row.pinFull', { max: DEVICE_PIN_LIMIT }) : T('devices.row.pinTitle', { max: DEVICE_PIN_LIMIT });
    return '<div class="row dev-row" draggable="true" data-device="' + escapeHtml(name) + '"' + (shown ? '' : ' data-off="1"') + ' title="' + escapeHtml([name, state, source, level === null ? T('devices.row.unreadable') : T('devices.row.level', { n: level })].filter(Boolean).join(' · ')) + '">' +
      '<span class="dev-grip" aria-hidden="true" title="' + escapeHtml(T('devices.row.drag')) + '"><svg viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg></span>' +
      '<span class="dev-glyph" aria-hidden="true"><svg viewBox="0 0 24 24">' + (DEVICE_GLYPHS[deviceKind(name)] ?? DEVICE_GLYPHS.other) + '</svg></span>' +
      '<span class="dev-main"><b>' + escapeHtml(name) + '</b><span>' + escapeHtml(state) + (source ? ' · ' + escapeHtml(source) : '') + '</span></span>' +
      battery +
      '<button type="button" class="switch" role="switch" aria-checked="' + shown + '" data-act="device-show" data-name="' + escapeHtml(name) + '" aria-label="' + escapeHtml(T('devices.row.show', { name })) + '" title="' + (shown ? escapeHtml(T('devices.row.show', { name })) : escapeHtml(T('devices.row.hidden'))) + '"></button>' +
      '<button type="button" class="dev-star' + (isPinned ? ' on' : '') + '" data-act="device-pin" data-name="' + escapeHtml(name) + '" aria-pressed="' + isPinned + '" aria-label="' + (isPinned ? escapeHtml(T('devices.row.unpin', { name })) : escapeHtml(T('devices.row.pin', { name }))) + '" title="' + escapeHtml(pinTitle) + '"' + (!isPinned && pinFull ? ' disabled' : '') + '>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + STAR_ICON + '</svg></button>' +
      '</div>';
  }).join('');

  return head(T('devices.title'), T('devices.lead')) +
    group(T('devices.probe.title'), card([
      rowToggle(T('devices.showBattery.label'), T('devices.showBattery.sub'), 'devices.showBattery'),
      row(T('devices.refresh.label'), probedAt ? T('devices.refresh.sub', { time: stamp(probedAt) }) : T('devices.refresh.never'), '<button type="button" class="btn" data-act="button" data-key="devices-refresh">' + escapeHtml(T('devices.refresh.action')) + '</button>'),
      pinned.length
        ? row(T('devices.pin.title'), T('devices.pin.some', { n: pinned.length, max: DEVICE_PIN_LIMIT }), '<button type="button" class="btn" data-act="button" data-key="devices-unpin">' + escapeHtml(T('devices.pin.clear')) + '</button>')
        : null,
    ])) +
    (list.length
      ? group(T('devices.list.title'),
          '<div class="card dev-rows" data-device-order>' + rows + '</div>'
          + '<p class="hint dev-order-hint">' + T('devices.order.hint')
          + (orderStored ? ' · <button type="button" class="btn dev-order-reset" data-act="button" data-key="devices-order-reset">' + T('devices.order.reset') + '</button>' : '')
          + '</p>')
      : emptyCard(T('devices.empty.title'), T('devices.empty.sub'), 'devices-refresh', T('devices.refresh.action'))) +
    '<p class="note">' + T('devices.note', { max: DEVICE_PIN_LIMIT }) + '</p>';
}

function pagePlugins() {
  return head(T('plugins.title'), T('plugins.lead')) +
    emptyCard(T('plugins.empty.title'), T('plugins.empty.text'), null, null) +
    '<p class="note">' + T('plugins.note') + '</p>';
}

function pageAbout() {
  const caps = meta?.platform?.features ?? {};
  const missing = Object.entries(caps).filter(([, on]) => !on).map(([name]) => name);
  const platformRow = missing.length
    ? row(T('about.platform.label'), T('about.platform.missing', { list: missing.join(T('list.separator')) }), '<span class="badge">' + escapeHtml(meta?.platform?.id ?? '?') + '</span>')
    : row(T('about.platform.label'), T('about.platform.ok'), '<span class="badge">' + escapeHtml(meta?.platform?.id ?? '?') + '</span>');
  return head(T('about.title'), T('about.lead')) +
    group(T('about.version.title'), card([
      platformRow,
      row(T('about.currentVersion.label'), T('about.currentVersion.sub'), '<span class="badge">v' + escapeHtml(version) + '</span>'),
      row(T('about.dataDir.label'), T('about.dataDir.sub'), '<button type="button" class="btn" data-act="button" data-key="open-data">' + T('action.open') + '</button>'),
      row(T('about.stateFile.label'), T('about.stateFile.sub'), '<button type="button" class="btn" data-act="button" data-key="open-state">' + T('action.open') + '</button>'),
      row(T('about.repo.label'), T('about.repo.sub'), '<button type="button" class="btn" data-act="button" data-key="open-repo">GitHub</button>'),
    ])) +
    group(T('about.caps.title'), card([
      row(T('about.tray.label'), T('about.tray.sub'), '<span class="badge">' + T('badge.compact') + '</span>'),
      row(T('about.unread.label'), T('about.unread.sub'), '<span class="badge">' + T('badge.local') + '</span>'),
      row(T('about.clipboard.label'), T('about.clipboard.sub'), '<span class="badge">' + T('badge.local') + '</span>'),
      row(T('about.credit.label'), T('about.credit.sub'), '<span class="badge">' + T('badge.env') + '</span>'),
      row(T('about.feed.label'), T('about.feed.sub'), '<span class="badge">' + T('badge.readonly') + '</span>'),
    ])) +
    group(T('about.assets.title'), card([
      row(T('about.engine.label'), '@emojitot/core · MIT', '<span class="badge">' + T('badge.inhouse') + '</span>'),
      row(T('about.protocol.label'), '@emojitot/protocol · MIT', '<span class="badge">' + T('badge.inhouse') + '</span>'),
      row(T('about.weather.label'), T('about.weather.sub'), '<span class="badge">' + T('badge.external') + '</span>'),
      row(T('about.lyrics.label'), T('about.lyrics.sub'), '<span class="badge">' + T('badge.external') + '</span>'),
    ])) +
    '<p class="note">' + T('about.note') + '</p>';
}

function pageCast() {
  const casts = meta?.casts ?? [];
  const demos = meta?.demos ?? [];
  const currentCast = meta?.castId ?? 'tot';
  const members = casts.reduce((all, family) => all.concat(family.members), []);
  const castGrid = members.length
    ? '<div class="cast-grid">' + members.map((member) =>
        '<button type="button" class="cast-cell' + (member.id === currentCast ? ' on' : '') + '" data-act="action" data-kind="cast" data-value="' + escapeHtml(member.id) + '">' +
          '<emojitot-ball cast="' + escapeHtml(member.id) + '" size="46" state="idle"></emojitot-ball>' +
          '<span>' + escapeHtml(member.label) + '</span>' +
        '</button>').join('') + '</div>'
    : '<div class="row"><span class="row-label"><b>' + T('cast.missing.label') + '</b><span>' + T('cast.missing.sub') + '</span></span></div>';
  const faceGrid = demos.length
    ? '<div class="face-grid">' + demos.map((demo) =>
        '<button type="button" class="face-cell" data-act="action" data-kind="demo" data-value="' + escapeHtml(demo.id) + '" title="' + escapeHtml(demo.label) + '">' +
          '<emojitot-ball cast="' + escapeHtml(currentCast) + '" size="34" state="' + escapeHtml(demo.state || 'idle') + '"></emojitot-ball>' +
          '<span>' + escapeHtml(demo.label) + '</span>' +
        '</button>').join('') + '</div>'
    : '';
  return head(T('cast.title'), T('cast.lead')) +
    group(T('cast.roles.title'), castGrid) +
    group(T('cast.faces.title'), faceGrid) +
    group(T('cast.auto.title'), card([
      rowToggle(T('cast.mediaEmotion.label'), T('cast.mediaEmotion.sub'), 'mediaEmotion'),
      rowToggle(T('cast.idleMoods.label'), T('cast.idleMoods.sub'), 'idleMoods'),
    ]));
}

const RENDERERS = {
  general: pageGeneral,
  appearance: pageAppearance,
  layout: pageLayout,
  behavior: pageBehavior,
  cast: pageCast,
  pages: pagePages,
  music: pageMusic,
  focus: pageFocus,
  todo: pageTodo,
  comm: pageComm,
  quota: pageQuota,
  weather: pageWeather,
  devices: pageDevices,
  plugins: pagePlugins,
  about: pageAbout,
};

/* ------------------------------------------------------------------- paint */

/**
 * The face the main process says every window is wearing right now.
 *
 * Not computed here: the ball, the island and this preview all receive the
 * same face:apply payload, so a mood that plays on the desktop plays in the
 * settings rail at the same moment. The preview is a consumer, exactly like
 * the renderers in the other two windows.
 */
let faceState = 'idle';

/**
 * The rail opens with the live character.
 *
 * It used to open with a search box. Without a width of its own the icon was
 * laid out at the SVG default 300x150 — the black circle — and the box pushed
 * the page list 208px down. Fifteen rows fit any window, so the slot now
 * shows the cast instead: the same 46px renderer 角色与表情 uses, drawing the
 * state handed over by the main process. With no cast member there is no
 * preview — never an empty circle.
 */
function railCast() {
  const id = meta?.castId;
  if (!id) return '';
  const member = (meta.casts ?? []).flatMap((family) => family.members).find((item) => item.id === id);
  if (!member) return '';
  /*
   * The character as a portrait: the 56px ball on its own — no ring, no plate,
   * because a circle only flatters the round tot and crops every other body —
   * with the name underneath. It is a button, not a picture: clicking it opens
   * the page where the rest of the cast lives, which is also where a first-time
   * reader would look for "who is this". The ring and the ball share the same
   * face payload the island draws (face:apply), so the portrait is never a
   * still image of some earlier mood.
   */
  return '<div class="rail-cast">' +
    '<button type="button" class="rail-cast-btn" data-nav="cast" aria-label="' +
      escapeHtml(T('rail.castAria', { name: member.label })) + '">' +
      '<emojitot-ball cast="' + escapeHtml(id) + '" size="56" state="' + escapeHtml(faceState) + '"></emojitot-ball>' +
    '</button>' +
    '<b class="rail-cast-name">' + escapeHtml(member.label) + '</b></div>';
}

function paintRail() {
  let html = railCast();
  for (const navGroup of NAV) {
    html += '<div class="rail-group"><p class="rail-heading">' +
      escapeHtml(T('nav.' + navGroup.id, null, navGroup.title)) + '</p>';
    for (const item of navGroup.items) {
      html += '<button type="button" class="rail-item" data-nav="' + item.key + '" aria-current="' +
        (page === item.key) + '">' + '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[item.icon] + '</svg>' +
        '<span>' + escapeHtml(T(item.key + '.title', null, item.label)) + '</span></button>';
    }
    html += '</div>';
  }
  rail.innerHTML = html;
}

/**
 * Repaint the preview in place.
 *
 * A full paint() would rebuild the page under the pointer; one attribute is
 * what a face change is.
 */
function applyFace(payload) {
  const state = payload && typeof payload === 'object' ? payload.state : '';
  if (!state || state === faceState) return;
  faceState = state;
  const ball = rail.querySelector('.rail-cast emojitot-ball');
  if (ball) ball.setAttribute('state', state);
}

/* --------------------------------------------------------------- preview */

/**
 * The right-hand preview: mock C folded into the B skeleton.
 *
 * It is not a screenshot — the mini island is drawn from the same tokens the
 * real one reads. The skin picks the surface, --accent paints the dot, avatar
 * and bars, --pv-w follows the island width, --pv-radius the radius, and
 * --pv-opacity is how see-through the chosen skin is at rest (frost and plain
 * are translucent, the other three are opaque). Nothing here writes a
 * preference: it only mirrors them, so the pane cannot drift from the window
 * it describes, and a hidden pane costs nothing.
 */

/** 360–560 px of island maps onto 216–264 px of preview: same proportion, less glass. */
const previewIslandWidth = () => {
  const width = Math.min(560, Math.max(360, Number(prefs.islandWidth) || 420));
  return Math.round(216 + ((width - 360) / 200) * 48);
};

const previewOpacity = (skin) => (skin === 'frost' || skin === 'plain' ? 0.92 : 1);

function paintPreview() {
  if (!preview) return;
  const skin = String(prefs.skin ?? 'frost');
  const radius = Math.min(32, Math.max(8, Number(prefs.radius) || 22));
  const opacity = previewOpacity(skin);
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#9683ff';
  preview.innerHTML =
    '<div class="pv-head"><b>' + escapeHtml(T('preview.title')) + '</b><span>' +
      escapeHtml(T('preview.sameSource')) + '</span></div>' +
    '<div class="pv-stage"><div class="pv-island" data-skin="' + escapeHtml(skin) + '" style="--pv-w:' +
      previewIslandWidth() + 'px;--pv-radius:' + Math.round(radius * 0.68) + 'px;--pv-opacity:' + opacity + '">' +
      '<div class="pv-pill"><span class="pv-dot"></span><span class="pv-line"></span></div>' +
      '<div class="pv-main"><div class="pv-row"><span class="pv-ava">t</span><span class="pv-name">EmojiTot</span></div>' +
        '<p class="pv-big">' + escapeHtml(T('preview.island.big')) + '</p><p class="pv-sub">' +
          escapeHtml(T('preview.island.sub')) + '</p>' +
        '<div class="pv-bars"><i></i><i></i><i></i></div></div>' +
    '</div></div>' +
    '<dl class="pv-meta">' +
      '<div class="pv-mrow"><dt>' + escapeHtml(T('preview.meta.skin')) + '</dt><dd>' +
        escapeHtml(T('skin.' + skin + '.label', null, skin)) + '</dd></div>' +
      '<div class="pv-mrow"><dt>' + escapeHtml(T('preview.meta.radius')) + '</dt><dd>' + radius + ' px</dd></div>' +
      '<div class="pv-mrow"><dt title="' + escapeHtml(T('preview.meta.opacityTitle')) + '">' +
        escapeHtml(T('preview.meta.opacity')) + '</dt><dd>' + Math.round(opacity * 100) + ' %</dd></div>' +
      '<div class="pv-mrow"><dt>' + escapeHtml(T('preview.meta.accent')) + '</dt><dd><i class="pv-swatch"></i>' +
        escapeHtml(accent.toUpperCase()) + '</dd></div>' +
      '<div class="pv-mrow"><dt>' + escapeHtml(T('preview.meta.width')) + '</dt><dd>' +
        (Number(prefs.islandWidth) || 420) + ' px</dd></div>' +
    '</dl>' +
    '<p class="pv-note">' + T('preview.note') + '</p>';
}

/*
 * The font stacks, identical to the island's.
 *
 * The preference is one setting (设置 → 外观 → 字体), so it has to reach both
 * windows; before this the island switched to JetBrains Mono and the settings
 * window stayed on the system stack, which read as the setting not working.
 */
const FONT_STACKS = {
  system: 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  pingfang: '"PingFang SC", "Microsoft YaHei", sans-serif',
  yahei: '"Microsoft YaHei", "PingFang SC", sans-serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
};

/** Theme, scale and type are applied before the first paint, from prefs. */
/** 静态外壳：窗口标题、标题栏、三个窗口按钮、预览栏 aria。 */
function applyStaticLabels() {
  document.documentElement.lang = currentLang() === 'en' ? 'en' : 'zh-CN';
  document.title = T('app.title');
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = T(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.title = T(node.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', T(node.dataset.i18nAria));
  });
}

function applyChrome() {
  const html = document.documentElement;
  applyStaticLabels();
  const theme = prefs.theme ?? 'dark';
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const light = theme === 'light' || (theme === 'system' && prefersLight);
  html.dataset.theme = light ? 'light' : 'dark';
  html.style.setProperty('--ui-font', FONT_STACKS[prefs.font] ?? FONT_STACKS.system);
  html.style.setProperty('--ui-weight', String(prefs.weight || 400));
  const scale = Math.min(1.4, Math.max(0.8, (Number(prefs.uiScale) || 100) / 100));
  html.style.zoom = String(scale);
  /*
   * The preview pane is the one breakpoint the CSS cannot state exactly: media
   * queries are evaluated against the fractional layout width a 150% display
   * reports (1079.99 rounds up to 1280), so the pane would fold one pixel late.
   * innerWidth is the number the window is actually sized in, and 1280 is the
   * default width where the pane earns its place.
   */
  html.dataset.preview = window.innerWidth >= 1280 ? 'on' : 'off';
}

window.addEventListener('resize', () => applyChrome());

let paintedPage = '';

/**
 * Keep the devices probe open exactly while this page is on screen.
 *
 * The list is live data, not a preference: opening the page asks main for a
 * snapshot and starts the probe (the island page may be switched off), leaving
 * hands the demand back. Idempotent, so every repaint can call it.
 */
function syncDevicesWatch() {
  const want = page === 'devices' && typeof api.devicesWatch === 'function';
  if (want === devicesWatching) return;
  devicesWatching = want;
  api.devicesWatch?.(want);
  /* One snapshot on entry only. Re-reading it on every repaint would make the
     snapshot repaint schedule the next read — a loop, not a refresh. The probe
     pushes its own result through settings:devices after that. */
  if (want && typeof api.devices === 'function') {
    api.devices().then((value) => {
      if (!value || !Array.isArray(value.devices)) return;
      devicesState = value;
      if (page === 'devices') paintContent();
    }).catch(() => {});
  }
}

function paintContent() {
  const renderer = RENDERERS[page] ?? RENDERERS.general;
  const changedPage = paintedPage !== page;
  /* A repaint (a probe landing, a switch flipped) must not throw away where the
     device list was scrolled to: the rows below the fold are the point of the
     list scrolling at all. */
  const previous = content.querySelector('.dev-rows');
  if (previous) devicesScrollTop = previous.scrollTop;
  paintedPage = page;
  content.innerHTML = renderer();
  content.scrollTop = 0;
  syncDevicesWatch();
  const next = content.querySelector('.dev-rows');
  if (next) next.scrollTop = devicesScrollTop;
  if (changedPage) {
    content.classList.remove('page-swap');
    void content.offsetWidth;
    content.classList.add('page-swap');
  }
}

function paint() {
  applyChrome();
  paintRail();
  paintContent();
  paintPreview();
}

/* --------------------------------------------------------------- IPC glue */

async function load() {
  prefs = merge(await api.get());
  meta = (await api.meta?.()) ?? meta;
  version = (await api.version?.()) ?? version;
  displays = (await api.displays?.()) ?? [];
  quotaState = (await api.quota?.()) ?? quotaState;
  mailState = (await api.mail?.()) ?? mailState;
  calendarState = (await api.calendar?.()) ?? calendarState;
  paint();
}

async function patch(update) {
  prefs = merge(await api.patch(update));
  paint();
  // Rail focus is lost on repaint; keep the current page selected without
  // stealing focus back from a text input the user is still typing in.
  const active = content.querySelector('input:focus, select:focus');
  if (active && active.dataset.act === 'set') {
    const key = active.dataset.key;
    const again = content.querySelector('[data-act="set"][data-key="' + key + '"]');
    again?.focus();
  }
}

function setPath(path, value) {
  const parts = path.split('.');
  if (parts.length === 1) return { [path]: value };
  const head = parts[0];
  return { [head]: { ...(prefs[head] || {}), [parts.slice(1).join('.')]: value } };
}

function valueOf(path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), prefs);
}

function orderKeys(list) {
  return [...list.querySelectorAll('.order-item')].map((item) => item.dataset.order);
}

async function saveOrder(list) {
  const keys = orderKeys(list);
  if (list.dataset.orderList === 'pages') await patch({ pageOrder: keys });
  else await patch({ statusItems: keys.filter((key) => prefs.statusItems.includes(key)) });
}

async function moveOrder(item, delta) {
  const list = item.closest('[data-order-list]');
  if (!list) return;
  const items = [...list.querySelectorAll('.order-item')];
  const index = items.indexOf(item);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= items.length) return;
  const orderKey = item.dataset.order;
  if (delta < 0) list.insertBefore(item, items[next]);
  else list.insertBefore(items[next], item);
  await saveOrder(list);
  content.querySelector('[data-order="' + orderKey + '"] [data-order-move="' + delta + '"]')?.focus();
}

/* --------------------------------------------------------------- controls */

/* The picker is not inside the content tree: it is a modal appended to body, so
   its search box and Escape key are bound here rather than on content. */
document.addEventListener('input', (event) => {
  if (event.target && event.target.id === 'avoid-search') {
    avoidQuery = event.target.value;
    paintAvoidDialog();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && avoidDialog) closeAvoidDialog();
});

/*
 * The picker is appended to <body>, so its buttons never bubble through the
 * content listener. One listener here owns every action inside the dialog.
 */
document.addEventListener('click', async (event) => {
  if (!avoidDialog) return;
  if (event.target === avoidDialog) {
    closeAvoidDialog();
    return;
  }
  const target = event.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;
  if (!act.startsWith('avoid-')) return;
  if (act === 'avoid-close') {
    closeAvoidDialog();
    return;
  }
  if (act === 'avoid-refresh') {
    avoidLoading = true;
    avoidSelected = '';
    paintAvoidDialog();
    api.avoidApps().then((apps) => {
      avoidList = Array.isArray(apps) ? apps : [];
      avoidLoading = false;
      paintAvoidDialog();
    }).catch(() => {
      avoidLoading = false;
      paintAvoidDialog();
    });
    return;
  }
  if (act === 'avoid-pick') {
    avoidSelected = target.dataset.path || '';
    avoidConfirmAll = false;
    paintAvoidDialog();
    return;
  }
  if (act === 'avoid-add-one') {
    const picked = avoidList.find((app) => sameExe(app.path, avoidSelected || ''));
    if (picked) {
      await addAvoidApp(picked);
      closeAvoidDialog();
    }
    return;
  }
  if (act === 'avoid-add-all') {
    avoidConfirmAll = true;
    paintAvoidDialog();
    return;
  }
  if (act === 'avoid-cancel-all') {
    avoidConfirmAll = false;
    paintAvoidDialog();
    return;
  }
  if (act === 'avoid-confirm-all') {
    const wanted = avoidMatches().filter((app) => !avoidCandidateReason(app));
    const list = avoidApps().slice();
    for (const app of wanted) {
      if (!list.some((item) => sameExe(item.path, app.path))) list.push({ path: app.path, name: app.name || app.path });
    }
    avoidConfirmAll = false;
    await patch({ avoidApps: list });
    ensureAvoidIcons(wanted.map((app) => app.path));
    closeAvoidDialog();
    return;
  }

});

content.addEventListener('click', async (event) => {
  const move = event.target.closest('[data-order-move]');
  if (move) {
    const item = move.closest('.order-item');
    if (item) await moveOrder(item, Number(move.dataset.orderMove));
    return;
  }
  const target = event.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;
  const key = target.dataset.key;

  if (act === 'preset') {
    const next = presetPatch(key, prefs);
    if (next) await patch(next);
    return;
  }
  if (act === 'avoid-add') {
    openAvoidDialog();
    return;
  }
  if (act === 'avoid-remove') {
    const path = target.dataset.path;
    await patch({ avoidApps: avoidApps().filter((item) => !sameExe(item.path, path)) });
    return;
  }
  if (act === 'toggle') {
    // setPath, not { [key]: … }: a key like focus.enabled used to be written as
    // one literal property named "focus.enabled", which no reader ever found.
    await patch(setPath(key, !valueOf(key)));
    return;
  }
  if (act === 'action-toggle') {
    const kind = target.dataset.kind;
    const on = target.getAttribute('aria-checked') !== 'true';
    const value = kind === 'agent' ? { id: target.dataset.extra, on } : on;
    await api.action?.(kind, value);
    meta = (await api.meta?.()) ?? meta;
    paint();
    return;
  }
  if (act === 'action-seg') {
    await api.action?.(target.dataset.kind, target.dataset.value);
    meta = (await api.meta?.()) ?? meta;
    paint();
    return;
  }
  if (act === 'action') {
    await api.action?.(target.dataset.kind, target.dataset.value);
    meta = (await api.meta?.()) ?? meta;
    paint();
    return;
  }
  if (act === 'toggle-nested') {
    await patch(setPath(key, !valueOf(key)));
    return;
  }
  if (act === 'toggle-status') {
    const enabled = target.getAttribute('aria-checked') === 'true';
    await patch({ statusItems: setStatusItemEnabled(prefs, key, !enabled) });
    return;
  }
  if (act === 'status-reset') {
    /* 恢复默认是「回到新装那天」：电量、时间、温度，余额关掉，顺序也复原。 */
    await patch({ statusItems: defaultStatusItems() });
    return;
  }
  if (act === 'device-show') {
    /* The switch says whether the row is on the island, so flipping it from
       shown asks main to hide. Main writes the group from current prefs and
       replies with the merged object, like the pin star. */
    const name = target.dataset.name;
    const shown = target.getAttribute('aria-checked') === 'true';
    const next = await api.hideDevice?.(name, shown);
    if (next) prefs = merge(next);
    paint();
    return;
  }
  if (act === 'device-pin') {
    const next = await api.pinDevice?.(target.dataset.name);
    if (next) prefs = merge(next);
    paint();
    return;
  }
  if (act === 'seg') {
    const value = target.dataset.value;
    const numeric = ['uiScale', 'radius', 'fontSize', 'pillHeight', 'islandWidth', 'hoverOpenDelay', 'hoverCloseDelay'].includes(key);
    await patch(setPath(key, numeric ? Number(value) : value));
    // 重绘会换掉整棵 DOM；键盘按 Enter 选卡后把焦点送回同一张卡，
    // 否则 Tab 到这里就断了。
    if (key === 'skin' && target.classList.contains('skin-card')) {
      content.querySelector('.skin-card[data-value="' + value + '"]')?.focus();
    }
    return;
  }
  if (act === 'button') {
    if (key === 'devices-refresh') {
      /* The probe is a PowerShell sweep of PnP properties, seconds not frames.
         The button only asks for it and repaints from the snapshot at hand-off;
         the finished result arrives as a settings:devices push. */
      target.disabled = true;
      target.textContent = '探测中…';
      const snapshot = await api.devicesRefresh?.();
      if (snapshot && Array.isArray(snapshot.devices)) devicesState = snapshot;
      paint();
      return;
    }
    if (key === 'refresh-weather') {
      target.textContent = T('weather.refreshNow.busy');
      const result = await api.refreshWeather?.();
      target.textContent = result?.ok ? T('weather.refreshNow.done') : T('weather.refreshNow.failed');
      setTimeout(() => { target.textContent = T('weather.refreshNow.action'); }, 1600);
      return;
    }
    if (key === 'clipboard-clear') {
      // The only control that deletes data, so it asks first.
      if (!window.confirm(T('todo.clipboardClear.confirm'))) return;
      await api.clipboardClear?.();
      target.textContent = T('action.done');
      setTimeout(() => { target.textContent = T('action.clear'); }, 1600);
      return;
    }
    if (key === 'devices-unpin') {
      await patch({ devices: { ...(prefs.devices || {}), pinned: [] } });
      return;
    }
    if (key === 'devices-order-reset') {
      await patch({ devices: { ...(prefs.devices || {}), order: [] } });
      return;
    }
    if (key === 'open-data') { await api.openData?.(); return; }
    if (key === 'open-state') { await api.openState?.(); return; }
    if (key === 'cal-subscribe') {
      const name = content.querySelector('[data-cal-input="subName"]')?.value?.trim() ?? '';
      const url = content.querySelector('[data-cal-input="subUrl"]')?.value?.trim() ?? '';
      clearFormError('calendar-subscribe');
      const next = await api.calendarDo('subscribe', { name, url });
      if (!next.actionResult?.ok) {
        showFormError('calendar-subscribe', next.actionResult?.error);
        return;
      }
      calendarState = next;
      paint();
      return;
    }
    if (key === 'cal-unsubscribe') {
      calendarState = await api.calendarDo('unsubscribe', { id: target.dataset.id });
      paint();
      return;
    }
    if (key === 'open-repo') { await api.openRepo?.(); return; }
    if (key === 'add-mail') { page = 'comm'; return; }
    if (key === 'add-quota') { page = 'quota'; return; }
    if (key === 'quota-add') {
      const provider = content.querySelector('[data-quota-input="provider"]')?.value ?? 'deepseek';
      const name = content.querySelector('[data-quota-input="name"]')?.value?.trim() ?? '';
      const secret = content.querySelector('[data-quota-input="key"]')?.value?.trim() ?? '';
      if (!secret) {
        content.querySelector('[data-quota-input="key"]')?.focus();
        return;
      }
      clearFormError('quota-add');
      const next = await api.quotaDo('add', { name, key: secret, provider });
      if (!next.actionResult?.ok) {
        showFormError('quota-add', next.actionResult?.error);
        return;
      }
      quotaState = next;
      paint();
      return;
    }
    if (key === 'quota-refresh') {
      quotaState = await api.quotaDo('refresh');
      paint();
      return;
    }
    if (key === 'quota-remove') {
      quotaState = await api.quotaDo('remove', { id: target.dataset.id });
      paint();
      return;
    }
    if (key === 'quota-select') {
      quotaState = await api.quotaDo('select', { id: target.dataset.id });
      paint();
      return;
    }
    if (key === 'mail-add') {
      const provider = content.querySelector('[data-key="mailProvider"]')?.value
        ?? prefs.mailProvider
        ?? '163';
      const address = content.querySelector('[data-mail-input="address"]')?.value?.trim() ?? '';
      const secret = content.querySelector('[data-mail-input="secret"]')?.value?.trim() ?? '';
      const host = content.querySelector('[data-mail-input="host"]')?.value?.trim() ?? '';
      if (!address || !secret) {
        content.querySelector('[data-mail-input="address"]')?.focus();
        return;
      }
      clearFormError('mail-add');
      const added = await api.mailDo('add', { provider, address, user: address, secret, host });
      if (!added.actionResult?.ok) {
        showFormError('mail-add', added.actionResult?.error);
        return;
      }
      mailState = await api.mailDo('refresh');
      paint();
      return;
    }
    if (key === 'mail-remove') {
      mailState = await api.mailDo('remove', { id: target.dataset.id });
      paint();
      return;
    }
    if (key === 'mail-refresh') {
      mailState = await api.mailDo('refresh');
      paint();
      return;
    }
    if (key === 'cal-add') {
      const title = content.querySelector('[data-cal-input="title"]')?.value?.trim() ?? '';
      const startValue = content.querySelector('[data-cal-input="start"]')?.value ?? '';
      const location = content.querySelector('[data-cal-input="location"]')?.value?.trim() ?? '';
      if (!title || !startValue) return;
      clearFormError('calendar-add');
      const next = await api.calendarDo('add', {
        title,
        start: new Date(startValue).getTime(),
        location,
      });
      if (!next.actionResult?.ok) {
        showFormError('calendar-add', next.actionResult?.error);
        return;
      }
      calendarState = next;
      paint();
      return;
    }
    if (key === 'cal-remove') {
      calendarState = await api.calendarDo('remove', { id: target.dataset.id });
      paint();
      return;
    }
    return;
  }
});

content.addEventListener('change', async (event) => {
  const target = event.target.closest('[data-act="set"]');
  if (!target) return;
  const key = target.dataset.key;
  let value = target.value;
  if (target.type === 'range') value = Number(value);
  else if (target.type === 'number') value = Number(value);
  else if (key === 'displayId') value = target.value === 'null' ? null : target.value;
  /* A typed city is a manual choice, and a manual choice outranks the locator:
     leaving auto-locate on here would silently ignore what was just typed. */
  if (key === 'weather.city') {
    await patch({ weather: { ...(prefs.weather ?? {}), city: String(value).trim(), autoLocate: false } });
    return;
  }
  await patch(setPath(key, value));
});

content.addEventListener('input', (event) => {
  const target = event.target.closest('input[type="range"][data-act="set"]');
  if (!target) return;
  const label = target.nextElementSibling;
  if (label && target.dataset.suffix !== undefined) {
    label.textContent = target.value + target.dataset.suffix;
  }
});

/* -------------------------------------------------------------- drag order */

let dragging = null;
content.addEventListener('keydown', async (event) => {
  const item = event.target.closest('.order-item');
  if (!item) return;
  const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (!delta) return;
  event.preventDefault();
  await moveOrder(item, delta);
});
content.addEventListener('dragstart', (event) => {
  const item = event.target.closest('.order-item');
  if (!item) return;
  dragging = item;
  item.dataset.dragging = 'true';
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', item.dataset.order); } catch { /* older engines */ }
});
content.addEventListener('dragover', (event) => {
  const item = event.target.closest('.order-item');
  if (!item || !dragging || item === dragging || item.parentNode !== dragging.parentNode) return;
  event.preventDefault();
  const rect = item.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  item.parentNode.insertBefore(dragging, after ? item.nextSibling : item);
});
content.addEventListener('dragend', async () => {
  if (!dragging) return;
  const list = dragging.closest('[data-order-list]');
  dragging.dataset.dragging = 'false';
  dragging = null;
  if (!list) return;
  await saveOrder(list);
});


/* ------------------------------------------------------------ device rows */

/*
 * Devices drag like the page list does — HTML5 drag, so the OS draws the ghost
 * exactly as it does for 页面管理 — but the handler is separate because a device
 * row is not an .order-item: it carries a switch and a star, and dropping it
 * into the generic list would have made saveOrder() rewrite statusItems.
 *
 * Only the finished order is written; the DOM is what the person sees while
 * dragging, and one patch at dragend keeps "where it landed" and "what is
 * stored" the same number.
 */
let deviceDrag = null;

function deviceRows() {
  return [...content.querySelectorAll('[data-device-order] .dev-row[data-device]')];
}

async function saveDeviceOrder() {
  const names = deviceRows().map((row) => row.dataset.device).filter(Boolean);
  if (!names.length) return;
  /* A narrow channel, not a whole-group patch: the island can pin or hide a
     device while this drag is in flight, and a snapshot overwrite would put the
     old group back. Main merges the names into the group it currently holds. */
  if (api.orderDevices) {
    const next = await api.orderDevices(names);
    if (next) {
      prefs = merge({ prefs: next, ...prefs });
    }
    return;
  }
  await patch({ devices: { ...(prefs.devices ?? {}), order: names } });
}

content.addEventListener('dragstart', (event) => {
  const row = event.target.closest('[data-device-order] .dev-row[data-device]');
  if (!row) return;
  deviceDrag = row;
  row.dataset.dragging = 'true';
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', row.dataset.device); } catch { /* older engines */ }
});
content.addEventListener('dragover', (event) => {
  const row = event.target.closest('[data-device-order] .dev-row[data-device]');
  if (!row || !deviceDrag || row === deviceDrag) return;
  event.preventDefault();
  const rect = row.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  row.parentNode.insertBefore(deviceDrag, after ? row.nextSibling : row);
});
content.addEventListener('dragend', async () => {
  if (!deviceDrag) return;
  const row = deviceDrag;
  deviceDrag = null;
  row.dataset.dragging = 'false';
  await saveDeviceOrder();
});

/* -------------------------------------------------------- residency drag */

/*
 * 条上的拖动用 pointer 事件，不用 HTML5 drag。
 *
 * native drag 在 Electron 里要先过一层 OLE 拖放：起手有一次明显的延迟，
 * 拖动时给的坐标还是"放下"位置的近似值，而且整个拖动过程中指针样式由
 * 系统接管——条上排一排 26px 的小格子，这种手感没法用。pointer 事件是
 * 直接的：按下就拿到起点，4px 之后才算拖动（避免把点击当拖），落点用
 * 指针与每个格子中线的位置算。
 *
 * 拖动期间不改 prefs，也不动 DOM：只画一条插入位标记。松手才写一次
 * statusItems，于是「拖到哪」和「写什么」是同一个数字。
 */
let residencyDrag = null;

function residencyChips() {
  return [...content.querySelectorAll('.residency-chip')];
}

/** 指针落在别的格子之间的哪个位置：返回最终索引，被拖的那个不算。 */
function residencyIndexAt(clientX, dragged) {
  let index = 0;
  for (const chip of residencyChips()) {
    if (chip === dragged) continue;
    const rect = chip.getBoundingClientRect();
    if (clientX > rect.left + rect.width / 2) index += 1;
  }
  return index;
}

/** 插入位标记：一条 2px 的竖线，画在落点所在的缝里。 */
function residencyMark(dragged, index) {
  const wrap = content.querySelector('[data-residency]');
  const mark = content.querySelector('[data-residency-mark]');
  const pill = content.querySelector('.residency-pill');
  if (!wrap || !mark || !pill) return;
  const others = residencyChips().filter((chip) => chip !== dragged);
  const base = wrap.getBoundingClientRect();
  let x;
  if (!others.length) {
    x = pill.getBoundingClientRect().left - base.left + 18;
  } else if (index <= 0) {
    x = others[0].getBoundingClientRect().left - base.left - 5;
  } else if (index >= others.length) {
    x = others[others.length - 1].getBoundingClientRect().right - base.left + 5;
  } else {
    const left = others[index - 1].getBoundingClientRect().right;
    const right = others[index].getBoundingClientRect().left;
    x = (left + right) / 2 - base.left;
  }
  mark.style.left = Math.round(x) + 'px';
  mark.hidden = false;
}

function clearResidencyMark() {
  const mark = content.querySelector('[data-residency-mark]');
  if (mark) mark.hidden = true;
}

content.addEventListener('pointerdown', (event) => {
  const chip = event.target.closest('.residency-chip');
  /* 关掉的组件不在 statusItems 里，也就没有它自己的位置可写：拖它只会
     让下一帧跳回原位。让它按不动，比拖完弹回去诚实。 */
  if (!chip || event.button !== 0 || chip.dataset.on !== 'true') return;
  const from = enabledStatusKeys(prefs).indexOf(chip.dataset.residencyKey);
  if (from < 0) return;
  residencyDrag = { chip, key: chip.dataset.residencyKey, from, startX: event.clientX, index: from, active: false };
  chip.setPointerCapture?.(event.pointerId);
});

content.addEventListener('pointermove', (event) => {
  const drag = residencyDrag;
  if (!drag) return;
  if (!drag.active) {
    if (Math.abs(event.clientX - drag.startX) < 4) return;
    drag.active = true;
    drag.chip.dataset.dragging = 'true';
  }
  event.preventDefault();
  drag.index = residencyIndexAt(event.clientX, drag.chip);
  residencyMark(drag.chip, drag.index);
});

content.addEventListener('pointerup', async () => {
  const drag = residencyDrag;
  if (!drag) return;
  residencyDrag = null;
  drag.chip.dataset.dragging = 'false';
  clearResidencyMark();
  if (!drag.active || drag.index === drag.from) return;
  const next = moveStatusKey(prefs, drag.key, drag.index);
  if (next.join() === enabledStatusKeys(prefs).join()) return;
  /* 重绘会换掉整条 DOM：写完之后按 key 找回新格子，把焦点放回原处，
     键盘用户不会因为一次换位掉出条外。 */
  await patch({ statusItems: next });
  content.querySelector('[data-residency-key="' + drag.key + '"]')?.focus();
});

content.addEventListener('pointercancel', () => {
  if (!residencyDrag) return;
  residencyDrag.chip.dataset.dragging = 'false';
  residencyDrag = null;
  clearResidencyMark();
});

/* 键盘路径：Tab 到某个格子上，Alt + ← / → 换位。上下箭头仍归下面那张
   状态组件列表（它的 .order-item 有同样的移动按钮）。 */
content.addEventListener('keydown', async (event) => {
  const chip = event.target.closest('.residency-chip');
  if (!chip || !event.altKey) return;
  const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (!delta) return;
  event.preventDefault();
  const key = chip.dataset.residencyKey;
  const keys = enabledStatusKeys(prefs);
  const index = keys.indexOf(key);
  const to = index + delta;
  if (index < 0 || to < 0 || to >= keys.length) return;
  await patch({ statusItems: moveStatusKey(prefs, key, to) });
  content.querySelector('[data-residency-key="' + key + '"]')?.focus();
});

/* ------------------------------------------------------------------ shell */

rail.addEventListener('click', (event) => {
  const item = event.target.closest('[data-nav]');
  if (!item) return;
  page = item.dataset.nav;
  paint();
});

document.getElementById('btn-min').addEventListener('click', () => api.minimize());
document.getElementById('btn-max').addEventListener('click', () => api.maximize());
document.getElementById('btn-close').addEventListener('click', () => api.close());

/* Live device rows: a finished probe pushes its snapshot. Repainting only while
   this page is visible keeps a background probe from touching another page's
   DOM — and from stealing focus from a control the user is on. */
api.onDevices?.((value) => {
  if (!value || !Array.isArray(value.devices)) return;
  devicesState = value;
  /* A probe lands on its own clock; rebuilding the rows mid-drag would orphan
     the node under the pointer and the saved order would be the rebuilt one,
     not the one the person dragged. The snapshot is kept either way. */
  if (page === 'devices' && !deviceDrag) paintContent();
});

api.onChanged((next) => {
  const merged = merge(next);
  const changed = JSON.stringify(merged) !== JSON.stringify(prefs);
  prefs = merged;
  if (changed) paint();
});

api.onGoto((target) => {
  if (typeof target === 'string' && RENDERERS[target]) {
    page = target;
    paint();
  }
});

/* One face, one source: the main process sends the same payload the ball and
   the island receive, so the rail preview cannot show a mood the desktop is
   not wearing. It also re-sends the current value on load, so a reopened
   window starts on the live expression. */
api.onFace?.(applyFace);

load();
