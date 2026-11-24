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
  PAUSED_HIDE_MINUTES,
  PRESET_MANIFEST,
  STATUS_MANIFEST,
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
import { PILL_EXPRESSION } from './island-pill.mjs';
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

/** Sustained previews use the live runtime; grids stay deterministic stills. */
const liveAttrs = () =>
  prefs.reduceMotion === true || prefs.motion === false ? ' live paused' : ' live';

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
const titlebarCast = document.getElementById('titlebar-cast');

/* --------------------------------------------------------------- rendering */

const merge = (raw) => withDefaults(raw);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const castMembers = () => (meta?.casts ?? []).flatMap((family) => family.members);
const normalizeCastId = (value) => {
  const id = typeof value === 'string' ? value.trim() : '';
  if (id === 'tot') return 'tot';
  return castMembers().some((member) => member.id === id) ? id : 'tot';
};
const activeCastId = () => normalizeCastId(meta?.castId);
const castMember = (id = meta?.castId) =>
  castMembers().find((member) => member.id === normalizeCastId(id)) ?? null;
const displayCastName = (id, label) => {
  const value = String(label ?? 'Tot');
  return normalizeCastId(id) === 'tot' && value.toLowerCase() === 'tot' ? 'Tot' : value;
};
const castName = (id = meta?.castId) => displayCastName(id, castMember(id)?.label ?? 'Tot');

const row = (label, sub, control) =>
  '<div class="pgm-set-row"><span class="pgm-set-copy"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="pgm-set-control">' + control + '</span></div>';

const rowRich = (labelHtml, sub, control) =>
  '<div class="pgm-set-row"><span class="pgm-set-copy"><b>' + labelHtml + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="pgm-set-control">' + control + '</span></div>';

/*
 * The stacked row: label above, control across the card.
 *
 * The skin cards are a three-column grid of their own — side by side with the
 * label they squeezed it into three lines, and in the narrow column the card
 * had less room than the grid. This is the one row type where the control is
 * the subject, so it gets the full width.
 */
const rowStack = (label, sub, control) =>
  '<div class="pgm-set-row is-stacked"><span class="pgm-set-copy"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="pgm-set-control">' + control + '</span></div>';

const rowToggle = (label, sub, key) =>
  row(label, sub, '<button type="button" class="pgm-toggle' + (valueOf(key) ? ' is-on' : '') +
    '" role="switch" aria-checked="' + Boolean(valueOf(key)) +
    '" data-act="toggle" data-key="' + key + '" aria-label="' + escapeHtml(label) + '"><i></i></button>');

const stateNotice = (title, details) => {
  const lines = (Array.isArray(details) ? details : [details])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return '<div class="pgm-state-notice" role="status">' +
    '<b>' + escapeHtml(title) + '</b>' +
    lines.map((line) => '<span>' + escapeHtml(line) + '</span>').join('') +
    '</div>';
};

const rowSeg = (label, sub, key, options) =>
  row(label, sub, '<span class="pgm-segment">' + options.map(([value, text]) =>
    '<button type="button" class="' + (String(valueOf(key)) === String(value) ? 'is-active' : '') +
      '" data-act="seg" data-key="' + key + '" data-value="' + value + '" aria-pressed="' +
      (String(valueOf(key)) === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

/*
 * 皮肤预览：三张迷你岛，和上面的文字段共用同一个 seg 动作。
 * 点击、Tab + Enter 和 aria-pressed 因此只有一条路径，两种控件不会各说各话。
 */
const SKIN_PREVIEWS = [
  ['frost', 'skin.frost.label', 'skin.frost.hint'],
  ['solid', 'skin.solid.label', 'skin.solid.hint'],
  ['plain', 'skin.plain.label', 'skin.plain.hint'],
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

let selectSequence = 0;

const rowSelect = (label, sub, key, options, selected) => {
  const selectedValue = String(selected ?? valueOf(key));
  const selectedText = options.find(([value]) => String(value) === selectedValue)?.[1] ?? options[0]?.[1] ?? '';
  const menuId = 'pgm-select-menu-' + (++selectSequence);
  return row(label, sub,
    '<span class="pgm-select-shell" role="combobox" tabindex="0" aria-haspopup="listbox" ' +
      'aria-expanded="false" aria-controls="' + menuId + '" aria-label="' +
      escapeHtml(label + '：' + selectedText) + '" title="' + escapeHtml(selectedText) + '" ' +
      'data-select-key="' + escapeHtml(key) + '" data-select-value="' + escapeHtml(selectedValue) + '">' +
      '<span class="pgm-select-value" aria-hidden="true">' + escapeHtml(selectedText) + '</span>' +
      '<svg class="pgm-select-caret" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="m7 10 5 5 5-5"/></svg>' +
      '<span class="pgm-select-menu" id="' + menuId + '" role="listbox" popover="manual" ' +
        'aria-label="' + escapeHtml(label) + '">' +
        options.map(([value, text], index) =>
          '<span class="pgm-select-option ' + (selectedValue === String(value) ? 'is-selected' : '') +
            '" id="' + menuId + '-option-' + index + '" role="option" tabindex="-1" ' +
            'data-select-value="' + escapeHtml(String(value)) + '" aria-selected="' +
            (selectedValue === String(value) ? 'true' : 'false') + '">' +
            escapeHtml(text) + '</span>').join('') +
      '</span>' +
    '</span>');
};

const rowInput = (label, sub, key, value, placeholder) =>
  row(label, sub, '<input class="pgm-field" data-act="set" data-key="' + key + '" value="' + escapeHtml(value ?? '') +
    '" placeholder="' + escapeHtml(placeholder ?? '') + '" aria-label="' + escapeHtml(label) + '" spellcheck="false" />');

const rowRange = (label, sub, key, min, max, step, suffix) =>
  row(label, sub, '<span class="pgm-slider"><span data-range-value>' +
    Number(valueOf(key) ?? min) + escapeHtml(suffix ?? '') + '</span><input type="range" min="' + min +
    '" max="' + max + '" step="' + step + '" value="' + Number(valueOf(key) ?? min) +
    '" data-act="set" data-key="' + key + '" data-suffix="' + escapeHtml(suffix ?? '') +
    '" aria-label="' + escapeHtml(label) + '" /></span>');

/**
 * Static controls used by the approved master artboard.
 *
 * Some rows in the artboard describe information that the current runtime does
 * not persist as a preference yet. They still need the same geometry, contrast
 * and state language as the working controls, so they use the same classes
 * without pretending to write a preference that the schema does not own.
 *
 * They are pure illustrations, never interactive: no role/aria-checked/aria-
 * label (which made ~65 fake switches show up in screen readers and button
 * audits). aria-hidden + data-decorative keep them out of the accessibility
 * tree while the visible label on the row still explains the setting.
 */
const DECORATIVE = 'aria-hidden="true" data-decorative="true" title="示意控件"';

const visualToggle = (on) =>
  '<span class="pgm-toggle' + (on ? ' is-on' : '') + '" ' + DECORATIVE + '><i></i></span>';

const visualSelect = (value) =>
  '<span class="pgm-select" ' + DECORATIVE + '><span>' +
    escapeHtml(value) + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></span>';

const visualField = (value) =>
  '<span class="pgm-field" ' + DECORATIVE + '>' + escapeHtml(value) + '</span>';

const visualSlider = (value) =>
  '<span class="pgm-slider" ' + DECORATIVE + '><span>' + escapeHtml(value) + '</span><div aria-hidden="true"></div></span>';

const visualSegment = (items, active = 0) =>
  '<span class="pgm-segment" ' + DECORATIVE + '>' + items.map((item, index) =>
    '<span class="' + (index === active ? 'is-active' : '') + '">' + escapeHtml(item) + '</span>').join('') + '</span>';

const copy = (zh, en) => (currentLang() === 'en' ? en : zh);

/**
 * Action controls. Unlike the preference rows above they do not write prefs —
 * they ask the main process to do something to the running app (show, hide,
 * dock, switch cast, play an expression) and the page repaints from the new
 * meta, so the switch reflects reality instead of an intention.
 */
const rowActionToggle = (label, sub, kind, checked, extra) =>
  row(label, sub, '<button type="button" class="pgm-toggle' + (checked ? ' is-on' : '') +
    '" role="switch" aria-checked="' + Boolean(checked) + '" data-act="action-toggle" data-kind="' + kind + '"' +
    (extra ? ' data-extra="' + escapeHtml(extra) + '"' : '') + ' aria-label="' + escapeHtml(label) + '"><i></i></button>');

const rowActionSeg = (label, sub, kind, options, current) =>
  row(label, sub, '<span class="pgm-segment">' + options.map(([value, text]) =>
    '<button type="button" class="' + (String(current ?? '') === String(value) ? 'is-active' : '') +
      '" data-act="action-seg" data-kind="' + kind + '" data-value="' + value + '" aria-pressed="' +
      (String(current ?? '') === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

const rowAction = (label, sub, kind, value, text) =>
  row(label, sub, '<button type="button" class="pgm-chip-button" data-act="action" data-kind="' + kind + '" data-value="' +
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
const countRows = (body) => (String(body).match(/class="pgm-set-row[" ]/g) ?? []).length;

/*
 * `action` is the optional control in the card's top-right: one per card, and
 * only where the card has a single obvious verb. 常驻排列 uses it for 恢复默认,
 * so the reset sits with the thing it resets instead of inside its hint line.
 */
const group = (title, body, action = '') => {
  const count = countRows(body);
  return '<section class="pgm-set-section"><header class="pgm-set-section-head"><h3 class="pgm-set-section-title">' +
    escapeHtml(title) + '</h3>' +
    (action ? '<span class="pgm-set-section-action">' + action + '</span>' : '') + '</header>' +
    '<div class="pgm-set-section-body">' + body + '</div></section>';
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

let pendingPageHead = null;
const head = (title, sub) => {
  pendingPageHead = { title, sub: sub ?? '' };
  return '';
};

const emptyCard = (title, text, action, label) =>
  '<div class="pgm-empty-card"><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(text) + '</span>' +
  (action ? '<button type="button" class="pgm-chip-button" data-act="button" data-key="' + action + '">' + escapeHtml(label) + '</button>' : '') +
  '</div>';

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
  return head(
    copy('常规', 'General'),
    copy(
      '启动、窗口和基础状态。所有设置只作用于本机，不改变灵动岛的内容语言。',
      'Startup, window and base state. Every option stays on this device.',
    ),
  ) +
    group(copy('启动与窗口', 'Startup & window'), card([
      rowToggle(
        copy('开机时自动启动', 'Launch at sign-in'),
        copy('登录 Windows 后在桌面恢复灵动岛。', 'Restore the island after signing in to Windows.'),
        'launchAtLogin',
      ),
      row(
        copy('记住窗口位置', 'Remember window position'),
        copy('下次打开设置时恢复上一次的位置。', 'Restore the previous settings-window position.'),
        visualToggle(true),
      ),
      row(
        copy('关闭设置后保持运行', 'Keep running after closing settings'),
        copy('只关闭当前窗口，不退出后台服务。', 'Close only this window; keep the background service alive.'),
        visualToggle(true),
      ),
    ])) +
    group(copy('更新', 'Updates'), card([
      row(
        copy('自动检查更新', 'Check for updates automatically'),
        copy('只检查稳定通道，不自动安装。', 'Check the stable channel without installing automatically.'),
        visualToggle(true),
      ),
      row(
        copy('更新通道', 'Update channel'),
        copy('稳定版优先，确保用户数据的兼容性。', 'Prefer stable releases to protect user data.'),
        visualSelect(copy('稳定版', 'Stable')),
      ),
    ])) +
    group(copy('恢复', 'Recovery'), card([
      row(
        copy('恢复默认设置', 'Restore default settings'),
        copy('保留角色、待办、置物架和用户数据。', 'Keep characters, tasks, shelf contents and user data.'),
        '<button type="button" class="pgm-chip-button" data-act="button" data-key="general-reset">' +
          copy('恢复界面', 'Restore interface') + '</button>',
      ),
    ]));
}

function pageAppearance() {
  return head(
    copy('外观', 'Appearance'),
    copy(
      '深色、浅色与跟随系统共用同一套尺寸和灰阶层级；内容图永远保留真实颜色。',
      'Dark, light and system themes share one geometry and neutral scale. Content imagery keeps its true colors.',
    ),
  ) +
    group(copy('主题', 'Theme'), card([
      rowSeg(
        copy('窗口主题', 'Window theme'),
        copy('烟石墨 / 冷灰纸张，两种模式都有完整对比度。', 'Graphite and cool paper both keep full contrast.'),
        'theme',
        [['dark', copy('深色', 'Dark')], ['light', copy('浅色', 'Light')], ['system', copy('系统', 'System')]],
      ),
      rowSelect(
        copy('岛体材质', 'Island material'),
        copy('用细边高光和顶部 sheen 建立玻璃质感。', 'A hairline edge and top sheen establish the glass surface.'),
        'skin',
        [
          ['frost', copy('烟石墨', 'Graphite')],
          ['solid', copy('冷灰纸', 'Cool paper')],
          ['plain', copy('纯色', 'Solid')],
        ],
      ),
      row(
        copy('增强文字对比度', 'Increase text contrast'),
        copy('提升辅助文字与弱信息的可读性。', 'Make secondary copy and quiet information easier to read.'),
        visualToggle(false),
      ),
    ])) +
    group(copy('圆角与层次', 'Radius & depth'), card([
      rowRange(
        copy('岛体圆角', 'Island radius'),
        copy('默认 30px；所有页面与折叠态同步。', 'Default 30px; shared by every page and the collapsed state.'),
        'radius',
        12,
        30,
        1,
        'px',
      ),
      row(
        copy('细边缘高光', 'Hairline edge highlight'),
        copy('只在顶部显示 1px 冷白高光。', 'Render a 1px cool-white highlight at the top edge only.'),
        visualToggle(true),
      ),
      row(
        copy('内容图真实色彩', 'True-color content imagery'),
        copy('封面、缩略图、照片、头像与文件预览绝不套用主题色。', 'Covers, thumbnails, photos, avatars and previews never inherit the theme tint.'),
        visualToggle(true),
      ),
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
  return head(
    copy('尺寸与位置', 'Size & position'),
    copy(
      '展开态固定为 420 × 310；缩放只改变屏幕投影尺寸，不改变版面网格。',
      'The expanded island is fixed at 420 × 310. Scaling changes projection only, never the layout grid.',
    ),
  ) +
    group(copy('显示', 'Display'), card([
      rowSelect(
        copy('目标显示器', 'Target display'),
        copy('优先跟随当前鼠标所在显示器。', 'Prefer the display under the pointer.'),
        'displayId',
        displayOptions,
        String(prefs.displayId ?? 'null'),
      ),
      row(
        copy('屏幕锚点', 'Screen anchor'),
        copy('避让系统刘海或顶部安全区。', 'Respect the notch and the top safe area.'),
        visualSegment([copy('顶部', 'Top'), copy('居中', 'Center'), copy('底部', 'Bottom')]),
      ),
      rowToggle(
        copy('避免遮挡', 'Avoid overlap'),
        copy('检测屏幕顶部与通知区域。', 'Detect the top edge and notification area.'),
        'avoidTopBar',
      ),
    ])) +
    group(copy('位置与缩放', 'Position & scale'), card([
      row(
        copy('水平偏移', 'Horizontal offset'),
        copy('相对屏幕中心的偏移量。', 'Offset from the center of the display.'),
        visualField('0 px'),
      ),
      row(
        copy('垂直偏移', 'Vertical offset'),
        copy('相对屏幕顶部安全区的偏移量。', 'Offset from the top safe area.'),
        visualField(Number(prefs.islandTopGap ?? 12) + ' px'),
      ),
      rowRange(
        copy('整体缩放', 'Interface scale'),
        copy('只缩放投影，不改变 420 × 310 逻辑布局。', 'Scale projection without changing the 420 × 310 logical layout.'),
        'uiScale',
        80,
        140,
        5,
        '%',
      ),
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
  return head(
    copy('隐藏与交互', 'Visibility & interaction'),
    copy(
      '透明、点击穿透和临时隐藏都在同一套命中区内工作，避免只显示不可操作。',
      'Transparency, click-through and temporary hiding share one hit-test model.',
    ),
  ) +
    group(copy('鼠标', 'Pointer'), card([
      rowToggle(
        copy('悬停展开预览', 'Expand on hover'),
        copy('在岛体上停留时显示状态摘要。', 'Show a status summary while the pointer rests on the island.'),
        'hoverAutoHide',
      ),
      rowToggle(
        copy('点击空白区域穿透', 'Click-through empty space'),
        copy('只允许绘制出来的控件接收点击。', 'Only painted controls receive pointer input.'),
        'clickThrough',
      ),
      rowToggle(
        copy('双击折叠', 'Double-click to collapse'),
        copy('双击非控制区域返回折叠态。', 'Double-click a non-control area to return to the collapsed state.'),
        'blurCollapse',
      ),
    ])) +
    group(copy('隐藏与快捷键', 'Hiding & shortcuts'), card([
      rowToggle(
        copy('全屏应用时隐藏', 'Hide in full-screen apps'),
        copy('进入全屏游戏或演示模式时临时隐藏。', 'Temporarily hide during full-screen games or presentations.'),
        'hideFullscreen',
      ),
      row(
        copy('显示 / 隐藏快捷键', 'Show / hide shortcut'),
        copy('可在键盘激活后修改组合键。', 'The shortcut remains available after keyboard activation.'),
        visualField('Ctrl + Shift + I'),
      ),
      rowToggle(
        copy('通知临时替换', 'Temporary notification replacement'),
        copy('显示 3.5 秒后回到当前页面。', 'Return to the current page after 3.5 seconds.'),
        'notify.system',
      ),
    ]));
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
 * 三套皮肤映射成岛自己的变量名（--card-solid / --accent / --ink / --ui-font），
 * 这里只借它的变量壳，尺寸由 .residency-pill 自己重写。
 *
 * 未启用的组件留在条上（虚线 + 降透明度）：位置看得见，只是它现在不画在
 * 胶囊里。点按或按 Enter / Space 可以切换显示，拖动只调整已启用组件的顺序。
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
          : key === 'kaomoji' ? PILL_EXPRESSION
            : balance || '¥20.8';
    const off = T('pages.residency.off', { name: label });
    const aria = enabled ? T('pages.residency.chip', { name: label, value }) : off;
    const action = enabled
      ? copy('已显示 · 点按隐藏 · 拖动换位', 'Shown · click to hide · drag to reorder')
      : copy('点按显示 · 位置保留', 'Click to show · position is kept');
    return '<button type="button" class="residency-chip" data-residency-key="' + key +
      '" data-on="' + enabled + '" aria-pressed="' + enabled + '" aria-label="' + escapeHtml(aria) +
      '" title="' + escapeHtml(action) + '">' +
      (icon ? '<span class="rc-icon" aria-hidden="true">' + icon + '</span>' : '') +
      '<b class="rc-value">' + escapeHtml(value) + '</b>' +
      '</button>';
  }).join('');
  return '<div class="residency" data-residency>' +
    '<div class="residency-pill skin-preview" data-skin-preview="' + escapeHtml(prefs.skin ?? 'frost') +
      '" role="group" aria-label="' + escapeHtml(T('pages.residency.preview')) + '">' +
      '<span class="residency-face" aria-hidden="true">' +
        '<emojitot-ball cast="' + escapeHtml(activeCastId()) + '" size="30" state="' +
          escapeHtml(faceState || 'idle') + '"' + liveAttrs() + '></emojitot-ball>' +
      '</span>' + chips +
    '</div>' +
    '<span class="residency-mark" data-residency-mark hidden aria-hidden="true"></span>' +
    '</div>' +
    '<p class="hint">' + escapeHtml(T('pages.residency.hint')) + '</p>' +
    '<p class="note">' + escapeHtml(T('pages.residency.note')) + '</p>';
}

function pagePages() {
  const pageTable = pagesTable();
  const pageItems = orderedPageKeys(prefs)
    .map((key) => pageTable.find((item) => item.key === key))
    .filter(Boolean);
  const rows = pageItems.map((item, index) => {
    const enabled = prefs.pages?.[item.key] !== false;
    return '<div class="pgm-set-row order-item" data-order="' + escapeHtml(item.key) +
      '" draggable="true" tabindex="0" aria-label="' +
      escapeHtml(copy('第 ' + (index + 1) + ' 页，' + item.label, 'Page ' + (index + 1) + ', ' + item.label)) + '">' +
      '<span class="pgm-set-copy"><b><span class="pgm-page-line">' +
        '<span class="pgm-page-index">' +
          String(index + 1).padStart(2, '0') + '</span>' + escapeHtml(item.label) + '</span></b>' +
        '<span>' + escapeHtml(item.sub) + '</span></span>' +
      '<span class="pgm-set-control"><button type="button" class="pgm-toggle' +
        (enabled ? ' is-on' : '') + '" role="switch" aria-checked="' + enabled +
        '" data-act="toggle" data-key="pages.' + escapeHtml(item.key) + '" aria-label="' +
        escapeHtml(item.label) + '"><i></i></button></span></div>';
  }).join('');
  return head(
    copy('页面管理', 'Page management'),
    copy(
      '拖动并启用十一页；折叠态和展开态使用同一个角色与同一套页轨。',
      'Drag and enable all eleven pages. Collapsed and expanded states share one cast and pager.',
    ),
  ) +
    '<section class="pgm-set-section"><div class="pgm-set-section-body" data-order-list="pages">' +
      rows + '</div></section>';
}

function pageMusic() {
  return head(
    copy('媒体与歌词', 'Media & lyrics'),
    copy(
      '封面保持真实色彩；歌词层级、进度和控制不因主题而变化。',
      'Artwork keeps its original color. Lyric hierarchy, progress and controls stay stable across themes.',
    ),
  ) +
    group(copy('媒体源', 'Media source'), card([
      row(
        copy('首选媒体应用', 'Preferred media app'),
        copy('暂停的音乐仍优先于备用直播。', 'Paused music still outranks a fallback live stream.'),
        visualSelect(copy('自动选择', 'Automatic')),
      ),
      row(
        copy('封面来源', 'Artwork source'),
        copy('保留应用返回的原始封面，不做灰度、调色或统一蒙层。', 'Keep the original artwork without grayscale, tinting or a common overlay.'),
        visualToggle(true),
      ),
      row(
        copy('暂停后保持显示', 'Keep visible while paused'),
        copy('暂停态保留歌名和恢复按钮。', 'Paused state keeps the title and resume control.'),
        visualToggle(Number(prefs.music?.pausedHideMin ?? 0) > 0),
      ),
    ])) +
    group(copy('歌词', 'Lyrics'), card([
      row(
        copy('歌词对齐', 'Lyric alignment'),
        copy('逐行高亮当前句，前后句降低透明度。', 'Highlight the current line and quiet the neighboring lines.'),
        visualSegment([copy('关闭', 'Off'), copy('逐行', 'Line'), copy('滚动', 'Scroll')], 1),
      ),
      row(
        copy('最大可见行数', 'Maximum visible lines'),
        copy('媒体页最多显示三行，超出部分沿同一阅读轴滚动。', 'Show up to three lines and scroll along one reading axis.'),
        visualField(copy('3 行', '3 lines')),
      ),
      row(
        copy('字号', 'Type size'),
        copy('当前句 10.5px，前后句 8px。', 'Current line 10.5px; neighboring lines 8px.'),
        visualSlider(copy('标准', 'Standard')),
      ),
    ]));
}

function pageFocus() {
  return head(
    copy('专注与饮水', 'Focus & hydration'),
    copy(
      '专注、休息与饮水提醒共享计时服务；结束后只做一次必要的状态回落。',
      'Focus, breaks and hydration share one timer service and settle exactly once.',
    ),
  ) +
    group(copy('专注', 'Focus'), card([
      row(
        copy('工作时长', 'Work duration'),
        copy('番茄钟主时长。', 'Primary focus-session duration.'),
        visualField(Number(prefs.focus?.work ?? 25) + copy(' 分钟', ' min')),
      ),
      row(
        copy('休息时长', 'Break duration'),
        copy('完成工作段后自动进入休息。', 'Move into a break after the work segment.'),
        visualField(Number(prefs.focus?.rest ?? 5) + copy(' 分钟', ' min')),
      ),
      row(
        copy('自动开始下一轮', 'Start the next round automatically'),
        copy('休息结束后等待用户确认。', 'Wait for confirmation after the break.'),
        visualToggle(false),
      ),
    ])) +
    group(copy('健康提醒', 'Health reminders'), card([
      row(
        copy('喝水间隔', 'Water interval'),
        copy('在工作时段内提醒。', 'Remind during active work hours.'),
        visualField(Number(prefs.health?.waterMin ?? 45) + copy(' 分钟', ' min')),
      ),
      row(
        copy('久坐提醒', 'Stand reminder'),
        copy('长时间无起身动作时提醒。', 'Remind after a long period without standing.'),
        visualField(Number(prefs.health?.standMin ?? 60) + copy(' 分钟', ' min')),
      ),
      row(
        copy('完成时显示通知', 'Show a completion notification'),
        copy('临时替换岛体 3.5 秒。', 'Temporarily replace the island for 3.5 seconds.'),
        visualToggle(true),
      ),
    ]));
}

function pageTodo() {
  return head(
    copy('待办与置物', 'Tasks & shelf'),
    copy(
      '任务与临时文件保持本地优先；置物架只做收纳，不改变源文件。',
      'Tasks and temporary files stay local first. The shelf stores references and never changes source files.',
    ),
  ) +
    group(copy('待办', 'Tasks'), card([
      row(
        copy('默认列表', 'Default list'),
        copy('新任务进入当前清单。', 'New tasks enter the current list.'),
        visualSelect(copy('本周', 'This week')),
      ),
      row(
        copy('默认排序', 'Default sort'),
        copy('按到期时间与完成状态排序。', 'Sort by due time and completion state.'),
        visualSelect(copy('到期时间', 'Due time')),
      ),
      row(
        copy('完成后移入历史', 'Move completed tasks to history'),
        copy('保留 30 天，可随时恢复。', 'Keep for 30 days and allow recovery.'),
        visualToggle(true),
      ),
    ])) +
    group(copy('置物架', 'Shelf'), card([
      rowInput(
        copy('收纳位置', 'Storage location'),
        copy('用户可以改到其他磁盘目录。', 'The user may choose another disk location.'),
        'shelf.dir',
        prefs.shelf?.dir ?? '',
        copy('%APPDATA%\\Shelf', '%APPDATA%\\Shelf'),
      ),
      row(
        copy('保留缩略图', 'Keep thumbnails'),
        copy('文件预览保留原色，不应用系统主题滤镜。', 'File previews keep their original color without a theme filter.'),
        visualToggle(true),
      ),
      row(
        copy('离开时自动清理', 'Clean temporary items when leaving'),
        copy('只清理已标记为临时的项目。', 'Only remove items explicitly marked temporary.'),
        visualToggle(false),
      ),
    ]));
}

function pageComm() {
  const failedSubscriptions = (calendarState?.subscriptions ?? [])
    .filter((sub) => sub.error)
    .map((sub) => copy(
      '订阅「' + (sub.name || sub.url || '日历') + '」：',
      'Subscription "' + (sub.name || sub.url || 'calendar') + '": ',
    ) + sub.error);
  const serviceNotice = stateNotice(
    copy('部分连接需要处理', 'Some connections need attention'),
    [
      mailState.error
        ? copy('邮箱摘要：', 'Mail summary: ') + mailState.error
        : '',
      ...failedSubscriptions,
    ],
  );
  return head(
    copy('通知、邮箱与日程', 'Notifications, mail & calendar'),
    copy(
      '通知、邮件摘要和日程只使用所需权限；通知不会变成永久页面。',
      'Notifications, mail summaries and calendar use only the permissions they need. A notification never becomes a permanent page.',
    ),
  ) +
    serviceNotice +
    group(copy('通知', 'Notifications'), card([
      rowToggle(
        copy('允许岛体通知', 'Allow island notifications'),
        copy('可随时从系统设置撤回。', 'Can be revoked in system settings at any time.'),
        'notify.system',
      ),
      row(
        copy('显示方式', 'Presentation'),
        copy('交叉替换当前页，不新增第 12 页。', 'Crossfade over the current page without adding a twelfth page.'),
        visualSelect(copy('临时替换', 'Temporary replacement')),
      ),
      row(
        copy('停留时长', 'Visible duration'),
        copy('3.5 秒后恢复原页面。', 'Return to the current page after 3.5 seconds.'),
        visualField(copy('3.5 秒', '3.5 seconds')),
      ),
    ])) +
    group(copy('邮箱与日程', 'Mail & calendar'), card([
      row(
        copy('邮箱摘要', 'Mail summary'),
        copy('只读取发件人、主题和验证码短句。', 'Read only sender, subject and short verification codes.'),
        visualToggle(Boolean(prefs.notify?.body)),
      ),
      row(
        copy('日程提醒', 'Calendar reminders'),
        copy('显示下一次事件与冲突。', 'Show the next event and scheduling conflicts.'),
        visualToggle(Boolean(prefs.calendar?.fromMail)),
      ),
      row(
        copy('提前提醒', 'Reminder lead time'),
        copy('默认提前 10 分钟。', 'Ten minutes in advance by default.'),
        visualField(Number(prefs.calendar?.leadMin ?? 10) + copy(' 分钟', ' min')),
      ),
    ]));
}

const stamp = (ms) => {
  const date = new Date(Number(ms) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function pageQuota() {
  const state = quotaState ?? { accounts: [], last: null };
  const account = (state.accounts ?? []).find((item) => item.id === state.current)
    ?? (state.accounts ?? []).find((item) => item.current)
    ?? null;
  const mainName = account?.name || copy('Codex · 默认', 'Codex · Default');
  const serviceNotice = stateNotice(
    copy('额度暂时不可用', 'Usage is temporarily unavailable'),
    state.last?.error ? String(state.last.error) : '',
  );
  return head(
    copy('AI 额度', 'AI usage'),
    copy(
      '额度是辅助信息；一个主账号占据视觉中心，其他账号退到次级列表。',
      'Usage is supporting information. One primary account owns the visual focus; other services stay secondary.',
    ),
  ) +
    serviceNotice +
    group('Codex', card([
      row(
        copy('主账号', 'Primary account'),
        copy('主数值显示本周剩余额度。', 'The primary value shows remaining weekly usage.'),
        visualSelect(mainName),
      ),
      row(
        copy('额度低于阈值时提醒', 'Warn below a threshold'),
        copy('只在跨过阈值时提示。', 'Notify only when crossing the threshold.'),
        visualField('20%'),
      ),
      row(
        copy('自动刷新', 'Refresh automatically'),
        copy('每 30 分钟更新一次，不阻塞界面。', 'Update every 30 minutes without blocking the interface.'),
        visualToggle(Boolean(prefs.quota?.alert)),
      ),
    ])) +
    group(copy('其他服务', 'Other services'), card([
      row('Claude', copy('显示百分比与最近重置时间。', 'Show percentage and latest reset time.'), visualToggle(true)),
      row('DeepSeek', copy('显示余额与币种。', 'Show balance and currency.'), visualToggle(true)),
      row('Kimi', copy('显示百分比，不和主账号争夺层级。', 'Show percentage without competing with the primary account.'), visualToggle(true)),
    ]));
}

function emptyCardRow() {
  return '<div class="row"><span class="row-label"><b>' + T('quota.empty.label') + '</b><span>' + T('quota.empty.sub') + '</span></span></div>';
}

function pageWeather() {
  const cityValue = prefs.weather?.autoLocate === true ? '' : prefs.weather.city;
  return head(
    copy('天气', 'Weather'),
    copy(
      '天气以主读数和城市为第一层，未来几日只用同一条并排时间轴。',
      'The main reading and city lead; the forecast stays on one horizontal timeline.',
    ),
  ) +
    group(copy('位置', 'Location'), card([
      rowInput(
        copy('城市', 'City'),
        copy('可手动选择，也可以跟随系统定位。', 'Choose manually or follow system location.'),
        'weather.city',
        cityValue,
        '',
      ),
      rowToggle(
        copy('自动定位', 'Automatic location'),
        copy('仅在应用前台或展开天气页时更新。', 'Update only while the app is active or the weather page is open.'),
        'weather.autoLocate',
      ),
      row(
        copy('天气来源', 'Weather source'),
        copy('按稳定性和更新频率选择。', 'Choose by reliability and update frequency.'),
        visualSelect(copy('自动选择', 'Automatic')),
      ),
    ])) +
    group(copy('显示', 'Display'), card([
      rowSeg(
        copy('温度单位', 'Temperature unit'),
        copy('摄氏或华氏。', 'Celsius or Fahrenheit.'),
        'weather.unit',
        [['c', '°C'], ['f', '°F']],
      ),
      row(
        copy('未来预报天数', 'Forecast days'),
        copy('保持单行，不变成七张卡片。', 'Keep one row instead of seven separate cards.'),
        visualSlider(copy('5 天', '5 days')),
      ),
      row(
        copy('显示日出日落', 'Show sunrise and sunset'),
        copy('放在城市信息次级行。', 'Place it on the secondary city-information line.'),
        visualToggle(true),
      ),
    ]));
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
  const scanning = devicesState?.scanning === true && list.length === 0;
  const fallback = [
    { name: 'WH-1000XM5', displayName: 'WH-1000XM5', status: copy('耳机', 'Headphones'), battery: 82 },
    { name: 'MX Mechanical', displayName: 'MX Mechanical', status: copy('键盘', 'Keyboard'), battery: 66 },
    { name: 'MX Master 3S', displayName: 'MX Master 3S', status: copy('鼠标', 'Mouse'), battery: 48 },
    { name: 'iPhone 17 Pro', displayName: 'iPhone 17 Pro', status: copy('手机', 'Phone'), battery: 71 },
  ];
  const ordered = list.length
    ? orderDevices(list, { pinned, order: prefs.devices?.order })
    : fallback;
  const rows = scanning
    ? '<div class="pgm-set-row pgm-device-scan" role="status">' +
        '<span class="pgm-set-copy"><b>' + escapeHtml(T('devices.scanning.title')) +
        '</b><span>' + escapeHtml(T('devices.scanning.sub')) + '</span></span>' +
      '</div>'
    : ordered.map((device) => {
      const name = String(device.name ?? '');
      const displayName = String(device.displayName || name);
      const shown = !hidden.includes(name);
      const level = device.battery === null || device.battery === undefined
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(device.battery))));
      const detail = displayName === String(device.status ?? '')
        ? T('devices.row.connected')
        : String(device.status || T('devices.row.connected'));
      const control = list.length
        ? '<button type="button" class="pgm-toggle' + (shown ? ' is-on' : '') +
            '" role="switch" aria-checked="' + shown + '" data-act="device-show" data-name="' +
            escapeHtml(name) + '" aria-label="' + escapeHtml(T('devices.row.show', { name: displayName })) +
            '"><i></i></button>'
        : visualToggle(shown);
      return '<div class="pgm-set-row" draggable="' + Boolean(list.length) + '" data-device="' +
        escapeHtml(name) + '" data-pin="' + escapeHtml(name) + '">' +
        '<span class="pgm-set-copy"><b>' + escapeHtml(displayName) + '</b><span>' + escapeHtml(detail) +
          (level === null ? '' : ' · ' + escapeHtml(String(level) + '%')) + '</span></span>' +
        '<span class="pgm-set-control">' + control + '</span></div>';
    }).join('');

  return head(
    copy('设备', 'Devices'),
    copy(
      '设备状态只出现在设备页；低电量用图标、文字和细条共同表达。',
      'Device state belongs to the devices page. Low battery is expressed by icon, text and a thin meter together.',
    ),
  ) +
    group(copy('连接', 'Connection'), card([
      row(
        copy('蓝牙设备发现', 'Bluetooth discovery'),
        copy('展开设备页时短暂扫描。', 'Scan briefly when the devices page opens.'),
        visualToggle(true),
      ),
      row(
        copy('自动重连', 'Automatic reconnect'),
        copy('只连接用户主动配对过的设备。', 'Connect only devices the user explicitly paired.'),
        visualToggle(true),
      ),
      row(
        copy('低电量阈值', 'Low-battery threshold'),
        copy('达到阈值时显示弱提醒。', 'Show a quiet warning when the threshold is reached.'),
        visualSlider('20%'),
      ),
    ])) +
    group(
      copy('当前设备', 'Current devices'),
      '<div class="pgm-set-section-body dev-rows" data-device-order>' + rows + '</div>',
    );
}

function pagePlugins() {
  return head(
    copy('插件', 'Plugins'),
    copy(
      '插件只能扩展内容页，不替换角色、页轨、齿轮和统一岛体。',
      'Plugins may extend content pages but never replace the cast, pager, gear or shared island shell.',
    ),
  ) +
    group(copy('已安装', 'Installed'), card([
      row('Media Bridge', copy('媒体控制 · 官方插件', 'Media controls · Official plugin'), visualToggle(true)),
      row('Weather Kit', copy('天气与位置 · 官方插件', 'Weather and location · Official plugin'), visualToggle(true)),
      row('Focus Timer', copy('专注计时 · 本地服务', 'Focus timer · Local service'), visualToggle(true)),
      row('Calendar Sync', copy('日程读取 · 需要权限', 'Calendar access · Permission required'), visualToggle(false)),
    ])) +
    group(copy('安全', 'Security'), card([
      row(
        copy('允许插件访问网络', 'Allow plugin network access'),
        copy('仅显示已声明域名，逐项授权。', 'Show declared domains only and authorize them individually.'),
        visualToggle(false),
      ),
      row(
        copy('自动更新插件', 'Update plugins automatically'),
        copy('只更新签名通过的稳定版本。', 'Update only signed stable releases.'),
        visualToggle(true),
      ),
    ]));
}

function pageTray() {
  const id = activeCastId();
  const name = castName(id);
  const enabled = prefs.trayIcon !== false;
  const pinIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 10.8 7.2 11.7A2 2 0 0 0 6 13.5V14h12v-.5a2 2 0 0 0-1.2-1.8L15 10.8V7a3 3 0 0 0-6 0z"/></svg>';
  const gearIcon = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON.gear + '</svg>';
  const powerIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M7.1 5.7a8 8 0 1 0 9.8 0"/></svg>';
  const preview =
    '<div class="pgm-tray-layout' + (enabled ? '' : ' is-disabled') + '">' +
      '<div class="pgm-tray-stack">' +
        '<div class="pgm-tray-menu" role="img" aria-label="' + escapeHtml(T('tray.preview.aria')) + '">' +
          '<div class="pgm-tray-menu-head">' +
            '<span class="pgm-cast-slot"><emojitot-ball cast="' + escapeHtml(id) + '" size="20" state="' +
              escapeHtml(faceState || 'idle') + '"' + liveAttrs() + '></emojitot-ball></span>' +
            '<div><b>EmojiTot</b><span>' + escapeHtml(name) + ' · ' + escapeHtml(T('tray.desktopRole')) +
              '</span></div><em>v' + escapeHtml(version) + '</em>' +
          '</div>' +
          '<button type="button" class="pgm-tray-item is-active" aria-current="page">' + gearIcon +
            '<span>' + escapeHtml(T('tray.menu.settings')) + '</span><i>›</i></button>' +
          '<div class="pgm-tray-divider"></div>' +
          '<button type="button" class="pgm-tray-item">' + pinIcon + '<span>' +
            escapeHtml(T('tray.menu.pin')) + '</span><i>' + (prefs.pinned !== false ? '✓' : '') + '</i></button>' +
          '<div class="pgm-tray-divider"></div>' +
          '<button type="button" class="pgm-tray-item">' + powerIcon + '<span>' +
            escapeHtml(T('tray.menu.quit')) + '</span></button>' +
        '</div>' +
        '<div class="pgm-tray-dock"><span class="pgm-cast-slot"><emojitot-ball cast="' + escapeHtml(id) +
          '" size="14" state="idle"></emojitot-ball></span><div><b>EmojiTot</b><span>' +
          escapeHtml(enabled ? T('tray.dock.running') : T('tray.show.off')) +
          '</span></div><em>' + (enabled ? 'ON' : 'OFF') + '</em></div>' +
      '</div>' +
      '<div class="pgm-tray-note"><b>' + escapeHtml(T('tray.native.title')) + '</b><p>' +
        escapeHtml(T('tray.native.body')) + '</p><p>' + escapeHtml(T('tray.native.cast')) +
        '</p><code>右键打开</code><code>单击恢复</code><code>双击设置</code><code>单实例</code></div>' +
    '</div>';
  return head(
    copy('系统托盘图标', 'System tray icon'),
    copy(
      '托盘是桌面入口，不复制设置窗口：轻量菜单负责恢复、置顶和退出，完整配置仍在设置页完成。',
      'The tray is a desktop entry point, not a second settings window. Its compact menu restores, pins and quits.',
    ),
  ) +
    group(copy('托盘菜单', 'Tray menu'), preview) +
    group(copy('托盘入口', 'Tray entry'), card([
      rowToggle(
        copy('显示系统托盘图标', 'Show the system tray icon'),
        copy('关闭设置窗口后仍可从托盘恢复灵动岛。', 'Restore the island from the tray after closing settings.'),
        'trayIcon',
      ),
      row(
        copy('单击托盘图标', 'Single-click tray icon'),
        copy('左键单击直接恢复最近一次灵动岛状态。', 'Restore the island to its latest state.'),
        visualSelect(copy('恢复灵动岛', 'Restore island')),
      ),
      row(
        copy('双击托盘图标', 'Double-click tray icon'),
        copy('快速进入完整设置窗口。', 'Open the complete settings window.'),
        visualSelect(copy('打开设置', 'Open settings')),
      ),
      row(
        copy('右键菜单', 'Context menu'),
        copy('保持系统菜单布局：设置、置顶、退出。', 'Keep the system-menu layout: settings, pin and quit.'),
        visualSelect(copy('完整菜单', 'Complete menu')),
      ),
      row(
        copy('关闭设置窗口', 'Close the settings window'),
        copy('保留灵动岛和后台服务；只有“退出”终止进程。', 'Keep the island and background service; only Quit terminates the process.'),
        visualSegment([copy('继续运行', 'Keep running'), copy('退出程序', 'Quit application')], 0),
      ),
    ]));
}

function pageAbout() {
  const update = meta?.update ?? {};
  const updateState = String(update.state ?? 'idle');
  const latest = String(update.latestVersion ?? '');
  const updateText = updateState === 'checking'
    ? T('about.update.checking')
    : updateState === 'available'
      ? T('about.update.available', { version: latest })
      : updateState === 'current'
        ? T('about.update.current', { version: latest || version })
        : updateState === 'error'
          ? T('about.update.error')
          : T('about.update.idle');
  const updateRow = updateState === 'idle'
    ? ''
    : row(T('about.update.label'), updateText, visualField(copy('已检查', 'Checked')));
  const featureNames = {
    battery: copy('电量', 'Battery'),
    media: copy('媒体', 'Media'),
    devices: copy('设备', 'Devices'),
    messenger: copy('消息', 'Messenger'),
    mail: copy('邮箱', 'Mail'),
    fullscreen: copy('全屏检测', 'Full-screen detection'),
    weather: copy('天气', 'Weather'),
    lyrics: copy('歌词', 'Lyrics'),
    quota: copy('AI 额度', 'AI usage'),
    calendar: copy('日程', 'Calendar'),
    clipboard: copy('剪贴板', 'Clipboard'),
    volume: copy('音量', 'Volume'),
  };
  const unavailable = Object.entries(meta?.platform?.features ?? {})
    .filter(([, available]) => available !== true)
    .map(([key]) => featureNames[key] || key);
  const platformRow = unavailable.length
    ? row(
      T('about.platform.label'),
      T('about.platform.missing', { list: unavailable.join(' · ') }),
      visualField(meta?.platform?.id || copy('未知', 'Unknown')),
    )
    : '';
  return head(
    copy('关于', 'About'),
    copy(
      '版本、更新与许可信息。安装升级不会清除用户偏好、置物架或任务数据。',
      'Version, updates and licenses. Installing an update never clears preferences, shelf contents or task data.',
    ),
  ) +
    group(copy('版本', 'Version'), card([
      row('EmojiTot', copy('当前已安装版本。', 'Currently installed version.'), visualField('v' + version)),
      row('Electron', copy('桌面运行时。', 'Desktop runtime.'), visualField(copy('最新稳定版', 'Latest stable'))),
      row(copy('更新通道', 'Update channel'), copy('稳定版优先。', 'Stable releases first.'), visualSelect(copy('稳定版', 'Stable'))),
      updateRow,
      platformRow,
    ])) +
    group(copy('资源', 'Resources'), card([
      row(
        copy('开源许可', 'Open-source licenses'),
        copy('查看随应用分发的第三方许可。', 'Review third-party licenses distributed with the app.'),
        '<button type="button" class="pgm-chip-button" data-act="button" data-key="open-repo" title="' +
          escapeHtml(T('about.license.sub')) + '">' +
          copy('打开', 'Open') + '</button>',
      ),
      row(
        copy('检查更新', 'Check for updates'),
        copy('只检查，不下载或安装。', 'Check only; do not download or install.'),
        '<button type="button" class="pgm-chip-button" data-act="button" data-key="open-repo" title="' +
          escapeHtml(updateText) + '">' +
          copy('检查', 'Check') + '</button>',
      ),
      row(
        copy('关于画板', 'About the artboard'),
        copy('极地石墨主画板是后续设计验收的唯一视觉基准。', 'The Polar Graphite master artboard is the sole visual acceptance baseline.'),
        visualField('MASTER'),
      ),
    ]));
}

function pageCast() {
  const casts = meta?.casts ?? [];
  const currentCast = activeCastId();
  const currentName = castName(currentCast);
  const members = casts.reduce((all, family) => all.concat(family.members), []);
  const castGrid = members.length
    ? '<div class="pgm-role-grid" role="group" aria-label="' + escapeHtml(T('cast.roles.title')) + '">' +
      members.map((member) =>
        '<button type="button" class="pgm-role-option' + (member.id === currentCast ? ' is-selected' : '') +
          '" data-act="action" data-kind="cast" data-value="' + escapeHtml(member.id) +
          '" aria-pressed="' + (member.id === currentCast) + '">' +
          '<emojitot-ball class="pgm-cast" cast="' + escapeHtml(member.id) + '" size="32" state="idle"></emojitot-ball>' +
          '<b>' + escapeHtml(displayCastName(member.id, member.label)) + '</b>' +
        '</button>').join('') + '</div>'
    : '<div class="pgm-empty-card"><b>' + escapeHtml(T('cast.missing.label')) + '</b><span>' +
      escapeHtml(T('cast.missing.sub')) + '</span></div>';
  const summaryRow =
    '<div class="pgm-set-row">' +
      '<span class="pgm-set-copy"><b><span class="pgm-role-summary">' +
        '<span class="pgm-cast-slot"><emojitot-ball cast="' + escapeHtml(currentCast) + '" size="18" state="' +
          escapeHtml(faceState || 'idle') + '"' + liveAttrs() + '></emojitot-ball></span>' +
        escapeHtml(currentName) +
      '</span></b><span>' + escapeHtml(copy(
        currentCast + ' · 透明角色层，不包含圆形应用底板。',
        currentCast + ' · Transparent character layer without an app tile.',
      )) + '</span></span>' +
      '<span class="pgm-role-status">' + copy('已选择', 'Selected') + '</span>' +
    '</div>';
  return head(
    copy('角色与表情', 'Characters & expressions'),
    copy(
      '15 个官方角色使用同一套透明素材规范；选择会同步更新侧栏昵称、折叠态、十一页展开态与实时预览。',
      'All official characters use the same transparent layer. Selection updates the rail, collapsed state, every page and the live preview.',
    ),
  ) +
    group(copy('角色', 'Characters'),
      '<div class="pgm-role-preview" aria-live="polite">' +
        '<span class="pgm-role-preview-stage"><emojitot-ball class="pgm-cast" cast="' + escapeHtml(currentCast) +
          '" size="72" state="' + escapeHtml(faceState || 'idle') + '"' + liveAttrs() + '></emojitot-ball></span>' +
        '<span class="pgm-role-preview-copy"><small>' + copy('当前角色', 'Current character') + '</small>' +
          '<b data-cast-name>' + escapeHtml(currentName) + '</b>' +
          '<span>' + copy('昵称、腮红、呼吸、灵动岛与托盘角色都用这个角色。', 'Name, blush, breathing, island and tray all use this character.') + '</span></span>' +
      '</div>' + castGrid) +
    group(copy('当前角色与表情', 'Current character & expression'), card([
      summaryRow,
      row(
        copy('表情强度', 'Expression strength'),
        copy('只改变眼睛、腮红和嘴部，不添加外层圆形裁切。', 'Changes only eyes, blush and mouth; never adds a circular clip.'),
        visualSegment([copy('克制', 'Subtle'), copy('自然', 'Natural'), copy('活跃', 'Lively')], 1),
      ),
      row(
        copy('角色尺寸', 'Character size'),
        copy('折叠态与展开态共享同一尺寸基准。', 'Collapsed and expanded states share one size baseline.'),
        visualSlider('32px'),
      ),
      rowToggle(
        copy('待机呼吸', 'Idle breathing'),
        copy('低幅度上下浮动，减少动态效果时关闭。', 'A restrained vertical float that yields to reduced motion.'),
        'idleMoods',
      ),
      row(
        copy('角色透明度', 'Character opacity'),
        copy('让角色与岛体融合，不产生矩形或圆形底板。', 'Blend with the island without a rectangular or circular plate.'),
        visualSlider('100%'),
      ),
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
  tray: pageTray,
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
 * the page list 208px down. Sixteen rows fit any window, so the slot now
 * shows the cast instead: the same 46px renderer 角色与表情 uses, drawing the
 * state handed over by the main process. With no cast member there is no
 * preview — never an empty circle.
 */
function railCast() {
  const id = activeCastId();
  const member = castMember(id);
  const name = displayCastName(id, member?.label ?? 'Tot');
  const slot = document.getElementById('rail-cast');
  const label = document.getElementById('rail-cast-name');
  const detail = document.getElementById('rail-cast-meta');
  if (slot) {
    slot.innerHTML = '<emojitot-ball cast="' + escapeHtml(id) + '" size="34" state="' +
      escapeHtml(faceState || 'idle') + '"' + liveAttrs() + ' aria-hidden="true"></emojitot-ball>';
  }
  if (label) label.textContent = name;
  if (detail) detail.textContent = T('rail.castMeta', { name: name.toUpperCase() }, '角色昵称 · ' + name.toUpperCase());
}

function paintRail() {
  railCast();
  const items = NAV.flatMap((group) => group.items);
  const sections = [
    { title: NAV[0]?.title ?? '形态', start: 0, end: Math.min(6, items.length) },
    { title: NAV[1]?.title ?? '内容', start: Math.min(6, items.length), end: Math.min(10, items.length) },
    { title: NAV[2]?.title ?? '系统', start: Math.min(10, items.length), end: items.length },
  ].filter((section) => section.start < section.end);
  rail.innerHTML = sections.map((section) =>
    '<div class="pgm-rail-group">' + escapeHtml(T('nav.' + NAV[Math.min(sections.indexOf(section), NAV.length - 1)]?.id,
      null, section.title)) + '</div>' +
    items.slice(section.start, section.end).map((item, localIndex) => {
      const index = section.start + localIndex;
      const active = page === item.key;
      return '<button type="button" class="pgm-rail-item' + (active ? ' is-active' : '') +
        '" data-nav="' + item.key + '" aria-current="' + active + '">' +
        '<span class="pgm-rail-no">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<span class="pgm-rail-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        (ICON[item.icon] ?? ICON.gear) + '</svg></span>' +
        '<span>' + escapeHtml(T(item.key + '.title', null, item.label)) + '</span></button>';
    }).join('')).join('');
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
  for (const face of document.querySelectorAll('emojitot-ball[live]')) {
    face.setAttribute('state', state);
  }
}

/**
 * One selected cast drives every character slot in this window.
 *
 * The titlebar, rail portrait, role summary, expression grid and island preview
 * are all consumers of meta.castId. Repainting only the affected regions keeps
 * focus in the role grid while the rest of the page stays exactly where it was.
 */
function applyCast(id) {
  const next = normalizeCastId(id);
  const changed = meta?.castId !== next;
  meta = { ...(meta ?? {}), castId: next };
  if (titlebarCast) titlebarCast.setAttribute('cast', next);
  if (!changed) return;
  paintRail();
  if (page === 'cast' || page === 'pages' || page === 'tray') paintContent();
  paintPreview();
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
  const radius = Math.min(32, Math.max(8, Number(prefs.radius) || 30));
  const currentTime = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const currentPage = NAV.flatMap((group) => group.items).find((item) => item.key === page);
  const pageName = T(page + '.title', null, currentPage?.label ?? '');
  const tags = pagesTable().slice(0, 5);
  preview.innerHTML =
    '<div class="pgm-preview-head"><b>' + escapeHtml(T('preview.title')) + '</b><span>420 × 310 LOGICAL</span></div>' +
    '<div class="pgm-preview-pill"><span class="pgm-cast-slot"><emojitot-ball cast="' +
      escapeHtml(activeCastId()) + '" size="30" state="' + escapeHtml(faceState || 'idle') + '"></emojitot-ball></span>' +
      '<span><b>' + escapeHtml(T('preview.island.big')) + '</b><span>' +
      escapeHtml(T('preview.island.sub')) + '</span></span><em>' + escapeHtml(currentTime) + '</em></div>' +
    '<div class="pgm-preview-card"><div class="pgm-preview-card-head"><span class="pgm-cast-slot">' +
      '<emojitot-ball cast="' + escapeHtml(activeCastId()) + '" size="19" state="' +
      escapeHtml(faceState || 'idle') + '"></emojitot-ball></span><span>' + escapeHtml(pageName) + '</span></div>' +
      '<div class="pgm-preview-metrics">' +
        '<div><b>' + escapeHtml(currentTime) + '</b><span>' + escapeHtml(T('preview.meta.time')) + '</span></div>' +
        '<div><b>19°</b><span>' + escapeHtml(T('preview.meta.weather')) + '</span></div>' +
        '<div><b>94%</b><span>' + escapeHtml(T('preview.meta.battery')) + '</span></div>' +
      '</div>' +
      '<div class="pgm-preview-tags">' + tags.map((item) => '<span>' + escapeHtml(item.label) + '</span>').join('') + '</div>' +
      '<p class="pgm-preview-note">' + T('preview.note') + '</p>' +
    '</div>';
}

/*
 * The font stacks, identical to the island's.
 *
 * The preference is one setting (设置 → 外观 → 字体), so it has to reach both
 * windows; before this the island switched to JetBrains Mono and the settings
 * window stayed on the system stack, which read as the setting not working.
 */
const FONT_STACKS = {
  system: '"MiSans", "MiSans VF", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  pingfang: '"MiSans", "MiSans VF", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  yahei: '"MiSans", "MiSans VF", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif',
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
  document.body.dataset.theme = light ? 'light' : 'dark';
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
  html.dataset.preview = window.innerWidth >= 1080 ? 'on' : 'off';
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
  pendingPageHead = null;
  content.innerHTML = renderer();
  const titleNode = document.getElementById('settings-page-title');
  const descNode = document.getElementById('settings-page-desc');
  if (titleNode && pendingPageHead) titleNode.textContent = pendingPageHead.title;
  if (descNode && pendingPageHead) descNode.textContent = pendingPageHead.sub;
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
  meta = { ...(meta ?? {}), castId: normalizeCastId(meta?.castId) };
  if (titlebarCast) titlebarCast.setAttribute('cast', activeCastId());
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
  const active = content.querySelector('input:focus, select:focus, .pgm-select-shell:focus');
  if (active && (active.dataset.act === 'set' || active.dataset.selectKey)) {
    const key = active.dataset.key ?? active.dataset.selectKey;
    const again = content.querySelector(
      '[data-act="set"][data-key="' + key + '"], .pgm-select-shell[data-select-key="' + key + '"]',
    );
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
    /* 恢复默认是「回到新装那天」：电量、时间、温度，余额和颜文字关掉，顺序也复原。 */
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
    if (key === 'general-reset') {
      await patch({
        theme: DEFAULTS.theme,
        skin: DEFAULTS.skin,
        blur: DEFAULTS.blur,
        radius: DEFAULTS.radius,
        font: DEFAULTS.font,
        weight: DEFAULTS.weight,
        fontSize: DEFAULTS.fontSize,
        motion: DEFAULTS.motion,
        reduceMotion: DEFAULTS.reduceMotion,
        islandWidth: DEFAULTS.islandWidth,
        pillHeight: DEFAULTS.pillHeight,
        islandTopGap: DEFAULTS.islandTopGap,
        sizeKey: DEFAULTS.sizeKey,
        pinned: DEFAULTS.pinned,
        clickThrough: DEFAULTS.clickThrough,
        displayId: DEFAULTS.displayId,
        avoidTopBar: DEFAULTS.avoidTopBar,
        oledShift: DEFAULTS.oledShift,
        hideFullscreen: DEFAULTS.hideFullscreen,
        trayIcon: DEFAULTS.trayIcon,
        wheelPaging: DEFAULTS.wheelPaging,
        blurCollapse: DEFAULTS.blurCollapse,
        hoverOpenDelay: DEFAULTS.hoverOpenDelay,
        hoverCloseDelay: DEFAULTS.hoverCloseDelay,
        hoverAutoHide: DEFAULTS.hoverAutoHide,
      });
      return;
    }
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

/*
 * Settings selects are a custom listbox. Windows still paints the native
 * select caret above a transparent one-pixel <select>, even when appearance is
 * none, so the only reliable way to match the artboard is to keep the whole
 * control in the DOM layer and show its options in a top-layer popover.
 */
let openSelectShell = null;

function selectOptions(shell) {
  return [...shell.querySelectorAll('.pgm-select-menu .pgm-select-option')];
}

function setSelectActive(shell, option) {
  const options = selectOptions(shell);
  for (const item of options) item.classList.toggle('is-active', item === option);
  if (!option) {
    shell.removeAttribute('aria-activedescendant');
    return;
  }
  shell.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function moveSelectActive(shell, delta) {
  const options = selectOptions(shell);
  if (!options.length) return;
  const current = shell.getAttribute('aria-activedescendant');
  const index = Math.max(0, options.findIndex((option) => option.id === current));
  const next = (index + delta + options.length) % options.length;
  setSelectActive(shell, options[next]);
}

function positionSelectMenu(shell, menu) {
  const rect = shell.getBoundingClientRect();
  const edge = 8;
  const gap = 4;
  menu.style.visibility = 'hidden';
  menu.style.width = 'max-content';
  menu.style.minWidth = Math.ceil(rect.width) + 'px';
  menu.style.maxWidth = Math.max(rect.width, Math.min(240, innerWidth - edge * 2)) + 'px';
  const menuRect = menu.getBoundingClientRect();
  const below = innerHeight - rect.bottom - edge - gap;
  const above = rect.top - edge - gap;
  const openAbove = menuRect.height > below && above > below;
  const top = openAbove
    ? Math.max(edge, rect.top - menuRect.height - gap)
    : Math.min(innerHeight - edge - menuRect.height, rect.bottom + gap);
  const left = Math.max(edge, Math.min(rect.left, innerWidth - edge - menuRect.width));
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
  menu.style.visibility = '';
}

function openSelect(shell) {
  if (!shell) return;
  if (openSelectShell && openSelectShell !== shell) closeSelect(openSelectShell, false);
  const menu = shell.querySelector('.pgm-select-menu');
  if (!menu) return;
  openSelectShell = shell;
  shell.setAttribute('aria-expanded', 'true');
  if (typeof menu.showPopover === 'function') {
    if (!menu.matches(':popover-open')) menu.showPopover();
  } else {
    menu.hidden = false;
  }
  positionSelectMenu(shell, menu);
  const current = shell.getAttribute('aria-activedescendant');
  const selected = menu.querySelector('[aria-selected="true"]');
  setSelectActive(shell, menu.querySelector('#' + current) ?? selected ?? selectOptions(shell)[0]);
}

function closeSelect(shell, restoreFocus = false) {
  if (!shell) return;
  const menu = shell.querySelector('.pgm-select-menu');
  if (menu && typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
    menu.hidePopover();
  } else if (menu) {
    menu.hidden = true;
  }
  shell.setAttribute('aria-expanded', 'false');
  shell.removeAttribute('aria-activedescendant');
  for (const option of selectOptions(shell)) option.classList.remove('is-active');
  if (openSelectShell === shell) openSelectShell = null;
  if (restoreFocus) shell.focus({ preventScroll: true });
}

function chooseSelectOption(shell, option) {
  if (!shell || !option) return;
  const key = shell.dataset.selectKey;
  if (!key) return;
  const raw = option.dataset.selectValue ?? '';
  const value = key === 'displayId' && raw === 'null' ? null : raw;
  closeSelect(shell, true);
  patch(setPath(key, value));
}

content.addEventListener('change', async (event) => {
  const target = event.target.closest('[data-act="set"]');
  if (!target) return;
  const key = target.dataset.key;
  let value = target.value;
  if (target.type === 'range') value = Number(value);
  else if (target.type === 'number') value = Number(value);
  else if (key === 'music.pausedHideMin') value = Number(value);
  else if (key === 'displayId') value = target.value === 'null' ? null : target.value;
  /* A typed city is a manual choice, and a manual choice outranks the locator:
     leaving auto-locate on here would silently ignore what was just typed. */
  if (key === 'weather.city') {
    await patch({ weather: { ...(prefs.weather ?? {}), city: String(value).trim(), autoLocate: false } });
    return;
  }
  await patch(setPath(key, value));
});

content.addEventListener('click', (event) => {
  const option = event.target.closest('.pgm-select-option');
  if (option) {
    chooseSelectOption(option.closest('.pgm-select-shell'), option);
    return;
  }
  const shell = event.target.closest('.pgm-select-shell');
  if (!shell) return;
  if (openSelectShell === shell) closeSelect(shell, true);
  else openSelect(shell);
});

content.addEventListener('keydown', (event) => {
  const shell = event.target.closest('.pgm-select-shell');
  if (!shell) return;
  const menu = shell.querySelector('.pgm-select-menu');
  if (!menu) return;
  if (event.key === 'Tab') {
    closeSelect(shell);
    return;
  }
  if (event.key === 'Escape') {
    if (openSelectShell === shell) {
      event.preventDefault();
      closeSelect(shell, true);
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (openSelectShell !== shell) openSelect(shell);
    else moveSelectActive(shell, event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (openSelectShell !== shell) return;
    event.preventDefault();
    const options = selectOptions(shell);
    setSelectActive(shell, event.key === 'Home' ? options[0] : options.at(-1));
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (openSelectShell !== shell) {
      openSelect(shell);
      return;
    }
    const active = menu.querySelector('#' + shell.getAttribute('aria-activedescendant'));
    chooseSelectOption(shell, active);
  }
});

content.addEventListener('pointermove', (event) => {
  const option = event.target.closest('.pgm-select-option');
  if (!option || openSelectShell !== option.closest('.pgm-select-shell')) return;
  setSelectActive(option.closest('.pgm-select-shell'), option);
});

document.addEventListener('pointerdown', (event) => {
  if (openSelectShell && !openSelectShell.contains(event.target)) {
    closeSelect(openSelectShell);
  }
});

document.addEventListener('scroll', () => {
  if (openSelectShell) positionSelectMenu(
    openSelectShell,
    openSelectShell.querySelector('.pgm-select-menu'),
  );
}, true);

window.addEventListener('resize', () => {
  if (openSelectShell) positionSelectMenu(
    openSelectShell,
    openSelectShell.querySelector('.pgm-select-menu'),
  );
});

content.addEventListener('input', (event) => {
  const target = event.target.closest('input[type="range"][data-act="set"]');
  if (!target) return;
  const label = target.parentElement?.querySelector('[data-range-value]') ?? target.nextElementSibling;
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
  return [...content.querySelectorAll('[data-device-order] .pgm-set-row[data-device]')];
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
  const row = event.target.closest('[data-device-order] .pgm-set-row[data-device]');
  if (!row) return;
  deviceDrag = row;
  row.dataset.dragging = 'true';
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', row.dataset.device); } catch { /* older engines */ }
});
content.addEventListener('dragover', (event) => {
  const row = event.target.closest('[data-device-order] .pgm-set-row[data-device]');
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
let residencySuppressClick = '';

function residencyChips() {
  return [...content.querySelectorAll('.residency-chip')];
}

async function toggleResidencyChip(chip) {
  if (!chip) return;
  const key = chip.dataset.residencyKey;
  const enabled = chip.dataset.on === 'true';
  await patch({ statusItems: setStatusItemEnabled(prefs, key, !enabled) });
  content.querySelector('[data-residency-key="' + key + '"]')?.focus();
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
  /* 关掉的组件仍可点按启用；只有已显示的组件有可写入的排序位置。 */
  residencySuppressClick = '';
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
  residencySuppressClick = drag.key;
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
  residencySuppressClick = '';
  clearResidencyMark();
});

/* 键盘路径：Tab 到某个格子上，Enter / Space 切换显示，Alt + ← / → 换位。 */
content.addEventListener('keydown', async (event) => {
  const chip = event.target.closest('.residency-chip');
  if (!chip) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    await toggleResidencyChip(chip);
    return;
  }
  if (!event.altKey) return;
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

content.addEventListener('click', async (event) => {
  const chip = event.target.closest('.residency-chip');
  if (!chip) return;
  if (residencySuppressClick === chip.dataset.residencyKey) {
    residencySuppressClick = '';
    return;
  }
  await toggleResidencyChip(chip);
});

/* ------------------------------------------------------------------ shell */

rail.addEventListener('click', (event) => {
  const item = event.target.closest('[data-nav]');
  if (!item) return;
  page = item.dataset.nav;
  paint();
});

document.getElementById('btn-min').addEventListener('click', () => api.minimize());
const maxBtn = document.getElementById('btn-max');
maxBtn.addEventListener('click', () => { if (!maxBtn.disabled) api.maximize(); });
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

api.onUpdateStatus?.((value) => {
  if (!value || typeof value !== 'object') return;
  meta = { ...(meta ?? {}), update: value };
  if (page === 'about') paintContent();
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
api.onCast?.(applyCast);

load();
