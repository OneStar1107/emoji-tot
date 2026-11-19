/**
 * The settings page.
 *
 * One data source (prefs.json through IPC), one render pass, no local state
 * that can drift. Every control carries its own key, so adding a row is adding
 * one line — there is no handler to register.
 */
import {
  DEFAULTS,
  PAGE_MANIFEST,
  PRESET_MANIFEST,
  STATUS_MANIFEST,
  withDefaults,
  orderedPageKeys,
  orderedStatusKeys,
  presetPatch,
  SETTINGS_NAV,
  setStatusItemEnabled,
} from '../shared/schema.js';

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
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};

/*
 * Page and status tables come from the shared schema — the one file the island
 * also reads. They used to be copied here, and the copy had drifted: devices
 * had no row in this table, so the page could not be switched on from the UI
 * even though the island knew how to draw it.
 */
const PAGES_TABLE = PAGE_MANIFEST.map((page) => ({
  key: page.key,
  label: page.title,
  sub: page.sub,
}));
const STATUS_TABLE = STATUS_MANIFEST.map((item) => ({ key: item.key, label: item.label }));

let prefs = { ...DEFAULTS };
let page = 'general';
/** Live state of the running app (cast, visibility, dock side, agents). */
let meta = null;
let displays = [];
let version = '0.0.0';
let quotaState = { accounts: [], current: null, last: null };
let mailState = { accounts: [], messages: [], error: '', lastSync: 0, syncing: false };
let calendarState = { events: [], upcoming: [] };

const rail = document.getElementById('rail');
const content = document.getElementById('content');

/* --------------------------------------------------------------- rendering */

const merge = (raw) => withDefaults(raw);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const row = (label, sub, control) =>
  '<div class="row"><span class="row-label"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="row-control">' + control + '</span></div>';

const rowToggle = (label, sub, key) =>
  row(label, sub, '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(valueOf(key)) +
    '" data-act="toggle" data-key="' + key + '" aria-label="' + escapeHtml(label) + '"></button>');

const rowSeg = (label, sub, key, options) =>
  row(label, sub, '<span class="seg">' + options.map(([value, text]) =>
    '<button type="button" data-act="seg" data-key="' + key + '" data-value="' + value + '" aria-pressed="' +
    (String(valueOf(key)) === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

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

const card = (rows) => '<div class="card">' + rows.filter(Boolean).join('') + '</div>';
const group = (title, body) => '<section class="group"><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
const head = (title, sub) =>
  '<div class="page-head"><h1>' + escapeHtml(title) + '</h1>' + (sub ? '<p>' + escapeHtml(sub) + '</p>' : '') + '</div>';

const emptyCard = (title, text, action, label) =>
  '<div class="card"><div class="empty-card"><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(text) + '</span>' +
  (action ? '<button type="button" class="btn primary" data-act="button" data-key="' + action + '">' + escapeHtml(label) + '</button>' : '') +
  '</div></div>';

const formError = (scope) =>
  '<p class="form-error" data-form-error="' + scope + '" hidden></p>';

function showFormError(scope, message) {
  const el = content.querySelector('[data-form-error="' + scope + '"]');
  if (!el) return;
  el.textContent = String(message || '操作失败');
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
  return head('常规', '形态、启动与基础外观') +
    group('快速方案', '<div class="preset-grid">' +
      PRESET_MANIFEST.map((preset) =>
        '<button type="button" class="preset-card" data-act="preset" data-key="' + preset.key + '">' +
          '<b>' + escapeHtml(preset.label) + '</b>' +
          '<span>' + escapeHtml(preset.description) + '</span>' +
        '</button>').join('') +
      '</div><p class="note">只调整页面、状态组件和桌面形态，不改账号、密钥或隐私选项。</p>') +
    group('显示方式', card([
      rowSeg('桌面形态', '同时决定当前显示和下次启动', 'displayMode', [
        ['island', '灵动岛'],
        ['ball', '桌面球'],
        ['both', '两者'],
      ]),
    ])) +
    group('窗口', card([
      rowActionSeg('贴边收起', '把球收到屏幕边缘，移到边缘就贴上去', 'dock',
        [['top', '顶部'], ['left', '左侧'], ['right', '右侧'], ['none', '不收']], meta?.dockSide ?? 'none'),
    ])) +
    group('启动', card([
      rowToggle('开机启动', '登录系统时自动打开 EmojiTot', 'launchAtLogin'),
    ]));
}

function pageAppearance() {
  return head('外观', '主题、材质、字体与动画') +
    group('主题', card([
      rowSeg('配色', '跟随系统时随桌面主题切换', 'theme', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]),
      rowSeg('时间制式', '', 'timeFormat', [['24h', '24 小时'], ['12h', '12 小时']]),
    ])) +
    group('灵动岛样式', card([
      rowSeg('皮肤', '毛玻璃半透明、实色卡片、极简收成一条线', 'skin', [['frost', '毛玻璃'], ['solid', '实色'], ['plain', '极简']]),
      rowToggle('背景模糊', '关掉后是纯色卡片', 'blur'),
      rowRange('圆角', '卡片的圆角半径', 'radius', 12, 30, 1, 'px'),
      rowRange('界面缩放', '岛与球按此比例绘制', 'uiScale', 80, 140, 5, '%'),
    ])) +
    group('位置行为', card([
      rowToggle('避开顶栏', '顶部有系统栏时，岛放在它下方', 'avoidTopBar'),
      rowToggle('OLED 防烧屏', '收起静止时缓慢左右移动几个像素，减少静态痕迹', 'oledShift'),
    ])) +
    group('字体', card([
      rowSelect('字体', '影响岛与设置窗口', 'font', [
        ['system', '系统默认'], ['pingfang', '苹方'], ['yahei', '微软雅黑'], ['mono', '等宽'],
      ]),
      rowSelect('字重', '', 'weight', [['400', '标准'], ['500', '中黑'], ['600', '粗体']]),
      rowRange('字号', '0 表示跟随系统', 'fontSize', 0, 20, 1, 'px'),
    ])) +
    group('动画', card([
      rowToggle('界面动画', '展开、切页与悬停的过渡', 'motion'),
      rowToggle('减少动态效果', '关掉呼吸与跳动，保留状态变化', 'reduceMotion'),
    ]));
}

function pageLayout() {
  const displayOptions = [['null', '跟随主屏']].concat(
    displays.map((d) => [String(d.id), d.label + (d.primary ? '（主屏）' : '')]),
  );
  return head('尺寸与位置', '岛和球各自多大、放在哪') +
    group('灵动岛', card([
      rowRange('面板宽度', '展开状态的宽度', 'islandWidth', 360, 560, 10, 'px'),
      rowRange('收起高度', '胶囊的高度', 'pillHeight', 30, 44, 1, 'px'),
    ])) +
    group('桌面球', card([
      rowSeg('尺寸', '球的直径', 'sizeKey', [['xs', '64'], ['sm', '88'], ['md', '120'], ['lg', '160'], ['xl', '220']]),
      rowToggle('始终置顶', '飘在所有窗口之上', 'pinned'),
      rowToggle('点击穿透', '点到球以外的位置交给桌面', 'clickThrough'),
    ])) +
    group('显示屏', card([
      rowSelect('显示在哪块屏', '拔掉外接屏时自动回到主屏', 'displayId', displayOptions, String(prefs.displayId ?? 'null')),
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
  if (!apps.length) return '<div class="avoid-empty">添加需要自动避让的其他应用</div>';
  const cells = apps.map((app) => {
    const label = app.name || app.path;
    const face = avoidIconHtml(app.path);
    return '<div class="avoid-app" title="' + escapeHtml(label + '\n所有窗口\n' + app.path) + '">' + face +
      '<button type="button" class="avoid-x" data-act="avoid-remove" data-path="' + escapeHtml(app.path) +
        '" aria-label="移除 ' + escapeHtml(label) + '">×</button></div>';
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
  if (prefs.avoidBrowsers !== false && app.browser === true) return '浏览器规则已覆盖';
  if (avoidApps().some((item) => sameExe(item.path, app.path))) return '已添加';
  return '';
}

function avoidMatches() {
  const query = avoidQuery.trim().toLowerCase();
  return avoidList.filter((app) =>
    !query || String(app.name).toLowerCase().includes(query) || String(app.title).toLowerCase().includes(query));
}

function avoidListHtml(rows) {
  if (!rows.length) {
    return '<p class="avoid-none">' + (avoidLoading ? '正在读取应用…' : '未找到匹配的应用，请先打开应用后刷新。') + '</p>';
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
  return '<div class="avoid-confirm"><p>将把当前列表中 ' + addable.length + ' 个应用全部加入自动避让，确定吗？</p>' +
    '<div class="avoid-confirm-actions"><button type="button" class="btn primary" data-act="avoid-confirm-all">确定添加</button>' +
    '<button type="button" class="btn" data-act="avoid-cancel-all">再想想</button></div></div>';
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
    : '<p class="avoid-none">' + (avoidLoading ? '正在读取应用…' : '未找到匹配的应用，请先打开应用后刷新。') + '</p>';
  const confirm = avoidConfirmAll
    ? '<div class="avoid-confirm"><p>将把当前列表中 ' + addable.length + ' 个应用全部加入自动避让，确定吗？</p>' +
      '<div class="avoid-confirm-actions"><button type="button" class="btn primary" data-act="avoid-confirm-all">确定添加</button>' +
      '<button type="button" class="btn" data-act="avoid-cancel-all">再想想</button></div></div>'
    : '';
  avoidDialog.innerHTML =
    '<div class="avoid-modal" role="dialog" aria-modal="true" aria-label="添加应用">' +
      '<header class="avoid-head"><h2>添加应用</h2>' +
        '<button type="button" class="avoid-close" data-act="avoid-close" aria-label="关闭">×</button></header>' +
      '<p class="avoid-sub">选择正在运行的应用，添加后自动记住。</p>' +
      '<input class="ctl avoid-search" id="avoid-search" type="search" placeholder="搜索应用或窗口标题" value="' + escapeHtml(avoidQuery) + '" />' +
      '<div class="avoid-list">' + list + '</div>' +
      '<div class="avoid-foot"><span class="avoid-hint">没有找到？先打开应用，再</span>' +
        '<button type="button" class="btn" data-act="avoid-refresh">刷新列表</button>' +
      '</div>' +
      '<div class="avoid-actions">' +
        '<button type="button" class="btn" data-act="avoid-close">取消</button>' +
        '<button type="button" class="btn" data-act="avoid-add-all"' + (addable.length && !avoidConfirmAll ? '' : ' disabled') + '>全部添加</button>' +
        '<button type="button" class="btn primary" data-act="avoid-add-one"' + (avoidSelected ? '' : ' disabled') + '>添加</button>' +
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
  return head('隐藏与交互', '什么情况下出现，什么情况下让开') +
    group('显示', card([
      rowToggle('全屏时隐藏', '看视频、演示时不挡住画面', 'hideFullscreen'),
      rowToggle('托盘图标', '关掉后只能从任务管理器退出', 'trayIcon'),
      rowRange('悬停展开延迟', '鼠标进入后多久展开，0 为关闭悬停', 'hoverOpenDelay', 0, 500, 20, 'ms'),
      rowToggle('移开自动收起', '鼠标离开岛后收成胶囊', 'hoverAutoHide'),
      rowRange('收起延迟', '离开后多久收起，越接近 0 越干脆', 'hoverCloseDelay', 60, 1200, 60, 'ms'),
    ])) +
    group('自动避让', card([
      rowToggle('自动避让', '下列应用遮住岛时，岛会收成细线', 'avoidEnabled'),
      rowToggle('常用浏览器', '前台浏览器窗口遮住岛时避让', 'avoidBrowsers'),
      '<div class="row"><span class="row-label"><b>自定义应用</b></span><span class="row-control">' +
        '<button type="button" class="btn" data-act="avoid-add">＋ 添加应用</button></span></div>',
      avoidAppsRow(),
      '<p class="hint">切到插件浮窗时，宿主窗口仍遮住岛就会继续避让。</p>',
    ])) +
    group('交互', card([
      rowToggle('滚轮换页', '在面板上横向滚动切换页面', 'wheelPaging'),
      rowToggle('失焦收起', '点到别的窗口时自动收起', 'blurCollapse'),
    ])) +
    group('快捷键', card([
      rowToggle('全局快捷键', 'Alt+Shift+T 展开或收起岛', 'hotkey'),
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
        '<button type="button" data-order-move="-1" aria-label="上移 ' + escapeHtml(item.label) + '"' +
          (index === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button>' +
        '<button type="button" data-order-move="1" aria-label="下移 ' + escapeHtml(item.label) + '"' +
          (index === items.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>' +
      '</span>' +
      (enabledOf ? '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(enabledOf(item.key)) +
        '" data-act="' + toggleAction + '" data-key="' +
        (toggleAction === 'toggle-status' ? item.key : 'pages.' + item.key) +
        '" aria-label="' + escapeHtml(item.label) + '"></button>' : '') +
    '</div>').join('') + '</div>';
}

function pagePages() {
  const pageItems = orderedPageKeys(prefs)
    .map((key) => PAGES_TABLE.find((p) => p.key === key))
    .filter(Boolean);
  const statusItems = orderedStatusKeys(prefs)
    .map((key) => STATUS_TABLE.find((item) => item.key === key))
    .filter(Boolean);

  const defaultOptions = pageItems.map((item) => [item.key, item.label]);
  return head('页面管理', '决定岛上有哪些页，以及它们出现的顺序') +
    group('状态组件 · 常驻胶囊', '<div class="card">' +
      orderList('status', statusItems, (key) => prefs.statusItems.includes(key), 'toggle-status') + '</div>') +
    group('功能页面 · 展开后左右翻', '<div class="card">' + orderList('pages', pageItems, (key) => prefs.pages[key] !== false) + '</div>') +
    group('打开时', card([
      rowSelect('默认页', '每次打开面板先停在这一页', 'defaultPage', defaultOptions, prefs.defaultPage),
    ])) +
    '<p class="note">拖动排序。关掉的页面既不在岛上出现，也不再在后台运行——它的服务会一起停掉，除非胶囊里有状态组件还要用它。</p>';
}

function pageMusic() {
  return head('音乐与歌词', '跟随系统正在播放的媒体') +
    group('歌词', card([
      rowToggle('展开时显示歌词', '在播放器右侧同步滚动显示', 'music.lyrics'),
      rowToggle('岛上歌词', '收起时显示当前句', 'music.islandLyrics'),
      rowRange('时间偏移', '正数提前，负数延后', 'music.offset', -1, 2, 0.05, ' 秒'),
    ])) +
    '<p class="note">歌词按时间轴滚动；时间偏移用来校正平台之间的延迟。</p>';
}

function pageFocus() {
  return head('专注与饮水', '番茄钟、休息与提醒') +
    group('专注', card([
      rowToggle('启用专注', '开启后可以在岛上开始番茄钟', 'focus.enabled'),
      rowRange('专注时长', '', 'focus.work', 10, 60, 5, ' 分钟'),
      rowRange('休息时长', '', 'focus.rest', 3, 20, 1, ' 分钟'),
    ])) +
    group('健康提醒', card([
      rowToggle('启用提醒', '喝水与久坐', 'health.enabled'),
      rowRange('喝水间隔', '', 'health.waterMin', 20, 120, 5, ' 分钟'),
      rowRange('久坐提醒', '', 'health.standMin', 30, 180, 10, ' 分钟'),
    ])) +
    '<p class="note">计时以「结束时间戳」存盘，关掉设置窗口或重启应用都还在走。</p>';
}

function pageTodo() {
  return head('待办与置物', '清单、到期提醒与临时收纳') +
    group('待办', card([
      rowToggle('启用待办', '岛上显示下一条到期任务', 'todo.enabled'),
      rowToggle('到期提醒', '到时间弹出通知', 'todo.notify'),
    ])) +
    group('置物架', card([
      rowToggle('启用置物架', '把文件拖到岛上暂存', 'shelf.enabled'),
      rowInput('收纳目录', '留空使用默认目录', 'shelf.dir', prefs.shelf?.dir ?? '', '默认：资料库/EmojiTot/shelf'),
    ])) +
    group('文字剪贴板', card([
      rowToggle('记录剪贴板', '默认关。开启后保留最近复制的文字；关掉时清空未固定的记录', 'shelf.clipboard'),
      row('保存位置', 'clipboard.json，只在本机', '<span class="badge">本机</span>'),
      row('清除全部记录', '删除所有剪贴板历史，包括已固定的条目', '<button type="button" class="btn" data-act="button" data-key="clipboard-clear">清除</button>'),
    ])) +
    '<p class="note">数据只写在本机 JSON 文件里，不联云。剪贴板历史默认关闭；关掉开关会清掉未固定的记录，固定项要在这里手动清除。</p>';
}

function pageComm() {
  const mailAccounts = mailState.accounts ?? [];
  const accountRows = mailAccounts.length
    ? mailAccounts
        .map((account) =>
          row(
            account.address,
            `${account.provider} · ${account.enabled === false ? '已停用' : '已连接'}`,
            `<button type="button" class="btn" data-act="button" data-key="mail-remove" data-id="${account.id}">删除</button>`,
          ),
        )
        .join('')
    : '<div class="row"><span class="row-label"><b>还没有添加邮箱</b><span>支持 163、QQ、Gmail 与自定义 IMAP</span></span></div>';

  const mailStatus =
    mailState.lastSync || mailState.error
      ? row(
          '同步状态',
          mailState.error ? escapeHtml(mailState.error) : `${mailState.messages.length} 封邮件 · 最近更新 ${stamp(mailState.lastSync)}`,
          '<button type="button" class="btn" data-act="button" data-key="mail-refresh">立即同步</button>',
        )
      : '';

  const subscriptions = calendarState.subscriptions ?? [];
  const subscriptionRows = subscriptions.length
    ? subscriptions
        .map((sub) =>
          row(
            sub.name,
            sub.error ? '拉取失败：' + sub.error : '已同步 ' + (sub.lastSync ? stamp(sub.lastSync) : '尚未'),
            '<button type="button" class="btn" data-act="button" data-key="cal-unsubscribe" data-id="' + escapeHtml(sub.id) + '">删除</button>',
          ),
        )
        .join('')
    : '<div class="row"><span class="row-label"><b>还没有订阅</b><span>添加一个 ICS 链接，日程会自动合并进岛上</span></span></div>';

  const events = (calendarState.events ?? []).slice(0, 6);
  const eventRows = events.length
    ? events
        .map((event) => {
          const date = new Date(event.start);
          const label = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          return row(event.title, label + (event.location ? ' · ' + event.location : ''),
            `<button type="button" class="btn" data-act="button" data-key="cal-remove" data-id="${event.id}">删除</button>`);
        })
        .join('')
    : '<div class="row"><span class="row-label"><b>还没有日程</b><span>手动添加，或从邮件邀请里自动导入</span></span></div>';

  return head('通知、邮箱与日程', '什么要提醒你，提醒到什么程度') +
    group('通知', card([
      rowToggle('系统通知', '任务完成、提醒到点时发通知', 'notify.system'),
      rowToggle('通知显示正文', '关闭后只显示来源', 'notify.body'),
    ])) +
    group('消息应用', card([
      rowToggle('微信', '未读数读自窗口标题，不读聊天内容', 'messenger.wechat'),
      rowToggle('QQ', 'QQ 不在标题里显示未读数，只显示是否在运行', 'messenger.qq'),
      rowToggle('企业微信', '', 'messenger.wecom'),
      rowToggle('飞书', '', 'messenger.feishu'),
      rowToggle('钉钉', '', 'messenger.dingtalk'),
    ])) +
    group('邮箱', '<div class="card">' + accountRows + mailStatus + '</div>') +
    group('添加邮箱', card([
      rowSelect('服务商', '163 / QQ 需要授权码，不是登录密码', 'mailProvider', [
        ['163', '163 邮箱'], ['qq', 'QQ 邮箱'], ['gmail', 'Gmail'], ['outlook', 'Outlook'], ['custom', '自定义 IMAP'],
      ], prefs.mailProvider ?? '163'),
      row('邮箱地址', '', '<input class="ctl" data-mail-input="address" placeholder="you@163.com" spellcheck="false" />'),
      row('授权码', '邮箱设置里生成的 IMAP 授权码', '<input class="ctl" type="password" data-mail-input="secret" placeholder="授权码" spellcheck="false" />'),
      row('IMAP 主机', '自定义服务商才需要填', '<input class="ctl" data-mail-input="host" placeholder="imap.example.com" spellcheck="false" />'),
      row('', '拉取最近 10 封，凭证用系统加密保存', '<button type="button" class="btn primary" data-act="button" data-key="mail-add">添加并同步</button>'),
    ]) + formError('mail-add')) +
    group('日程', '<div class="card">' + eventRows + '</div>') +
    group('日历订阅', '<div class="card">' + subscriptionRows + '</div>') +
    group('添加订阅', card([
      row('名称', '显示在岛上的来源名', '<input class="ctl" data-cal-input="subName" placeholder="飞书 / iCloud" spellcheck="false" />'),
      row('ICS 链接', '飞书、钉钉、企业微信、Outlook、iCloud 都能导出订阅地址', '<input class="ctl" data-cal-input="subUrl" placeholder="https://…/calendar.ics" spellcheck="false" />'),
      row('', '只读同步，每 30 分钟拉取一次', '<button type="button" class="btn primary" data-act="button" data-key="cal-subscribe">添加订阅</button>'),
    ]) + formError('calendar-subscribe')) +
    group('添加日程', card([
      row('标题', '', '<input class="ctl" data-cal-input="title" placeholder="周会" spellcheck="false" />'),
      row('时间', '', '<input class="ctl" type="datetime-local" data-cal-input="start" />'),
      row('地点', '可留空', '<input class="ctl" data-cal-input="location" placeholder="会议室 / 线上" spellcheck="false" />'),
      row('', '邮件邀请里的 .ics 会自动导入', '<button type="button" class="btn primary" data-act="button" data-key="cal-add">添加日程</button>'),
    ]) + formError('calendar-add')) +
    '<p class="note">邮箱每 5 分钟同步一次；验证码会从邮件正文里识别出来，在岛上直接显示。</p>';
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
        account.current ? '当前账号' : account.provider,
        `<span class="row-control">
          <button type="button" class="btn" data-act="button" data-key="quota-select" data-id="${account.id}" ${account.current ? 'disabled' : ''}>${account.current ? '使用中' : '切换'}</button>
          <button type="button" class="btn" data-act="button" data-key="quota-remove" data-id="${account.id}">删除</button>
        </span>`,
      ),
    )
    .join('');
  const last = state.last;
  const balance = last && !last.error && last.total !== undefined
    ? row('当前余额', `更新于 ${stamp(last.at)} · ${last.available ? '可用' : '不可用'}`, `<b>¥${escapeHtml(last.total)}</b>`)
    : row('当前余额', last?.error ? escapeHtml(last.error) : '还没有查询', `<button type="button" class="btn" data-act="button" data-key="quota-refresh">查询</button>`);

  return head('AI 额度', 'Agent 余额与账号切换') +
    group('账号', '<div class="card">' + (accounts || emptyCardRow()) + balance + '</div>') +
    group('添加账号', card([
      row('服务商', '余额接口各不相同，选错会查询失败', '<select class="ctl" data-quota-input="provider">' +
        [['deepseek', 'DeepSeek'], ['moonshot', 'Kimi（Moonshot）'], ['siliconflow', 'SiliconFlow'], ['openrouter', 'OpenRouter']]
          .map(([value, text]) => '<option value="' + value + '">' + text + '</option>').join('') + '</select>'),
      row('名称', '显示在岛上的名字，留空用服务商名字', '<input class="ctl" data-quota-input="name" placeholder="可选" spellcheck="false" />'),
      row('API Key', '在对应平台的 API Keys 页面生成，只保存在本机', '<input class="ctl" type="password" data-quota-input="key" placeholder="sk-..." spellcheck="false" />'),
      row('', '密钥用系统凭据加密，不写进 prefs.json', '<button type="button" class="btn primary" data-act="button" data-key="quota-add">添加并查询</button>'),
    ]) + formError('quota-add')) +
    group('刷新', card([
      rowRange('刷新间隔', '两次余额查询之间', 'quota.intervalMin', 5, 120, 5, ' 分钟'),
      rowToggle('低余额提醒', '低于阈值时在岛上提示', 'quota.alert'),
      rowRange('提醒阈值', '余额低于这个数就提醒一次', 'quota.threshold', 1, 50, 1, ' 元'),
    ])) +
    '<p class="note">余额来自 DeepSeek <code>/user/balance</code>；子进程携带密钥，命令参数里看不到它。</p>';
}

function emptyCardRow() {
  return '<div class="row"><span class="row-label"><b>还没有连接账号</b><span>在下面填入 API Key 就能看到余额</span></span></div>';
}

function pageWeather() {
  return head('天气', '城市、单位与刷新') +
    group('位置', card([
      rowToggle('自动定位', '按网络位置识别城市，比手填更接近你所在的地方', 'weather.autoLocate'),
      rowInput('城市', '关掉自动定位时使用；中文或英文都行', 'weather.city', prefs.weather.city, '香港'),
      rowSeg('单位', '', 'weather.unit', [['c', '摄氏'], ['f', '华氏']]),
    ])) +
    group('数据', card([
      rowRange('刷新间隔', 'Open-Meteo 免费额度足够', 'weather.intervalMin', 5, 60, 5, ' 分钟'),
      row('立即刷新', '重新拉一次当前城市', '<button type="button" class="btn" data-act="button" data-key="refresh-weather">刷新</button>'),
    ])) +
    '<p class="note">无需 API Key。自动定位走 IP 归属地（ipapi / ipinfo），失败时回落到手填城市；城市解析用 Open-Meteo geocoding，两者都失败时保留上一次结果。</p>';
}

function pagePlugins() {
  return head('插件', '预留：用脚本扩展岛的内容') +
    emptyCard('插件系统还没开放', '计划支持一份 JSON 描述的自定义页面：数据源、刷新间隔、一个渲染函数。', null, null) +
    '<p class="note">先把内置页面做稳，再开放扩展点。</p>';
}

function pageAbout() {
  const caps = meta?.platform?.features ?? {};
  const missing = Object.entries(caps).filter(([, on]) => !on).map(([name]) => name);
  const platformRow = missing.length
    ? row('平台', '部分功能在当前系统不可用：' + escapeHtml(missing.join('、')), '<span class="badge">' + escapeHtml(meta?.platform?.id ?? '?') + '</span>')
    : row('平台', '全部功能可用', '<span class="badge">' + escapeHtml(meta?.platform?.id ?? '?') + '</span>');
  return head('关于', 'EmojiTot') +
    group('版本', card([
      platformRow,
      row('当前版本', '双形态、十个功能页、设置十四个分区', '<span class="badge">v' + escapeHtml(version) + '</span>'),
      row('数据目录', 'prefs.json、state.json 与缓存', '<button type="button" class="btn" data-act="button" data-key="open-data">打开</button>'),
      row('状态文件', '当前表情与状态，可给别的工具读', '<button type="button" class="btn" data-act="button" data-key="open-state">打开</button>'),
      row('项目主页', 'MIT 许可，代码与美术全部自研', '<button type="button" class="btn" data-act="button" data-key="open-repo">GitHub</button>'),
    ])) +
    group('能力与数据', card([
      row('托盘', '只有设置 / 置顶 / 退出，其余在设置里', '<span class="badge">精简</span>'),
      row('消息未读', '读窗口标题，不读聊天内容', '<span class="badge">本机</span>'),
      row('剪贴板', '最近 60 条，存在 clipboard.json', '<span class="badge">本机</span>'),
      row('AI 余额', 'DeepSeek / Kimi / SiliconFlow / OpenRouter', '<span class="badge">环境变量</span>'),
      row('日历订阅', 'ICS 链接，按来源整体替换', '<span class="badge">只读</span>'),
    ])) +
    group('素材与许可', card([
      row('角色引擎', '@emojitot/core · MIT', '<span class="badge">自研</span>'),
      row('两位协议', '@emojitot/protocol · MIT', '<span class="badge">自研</span>'),
      row('天气', 'Open-Meteo · 免费 API', '<span class="badge">外部</span>'),
      row('歌词', 'LRCLIB · 公开曲库', '<span class="badge">外部</span>'),
    ])) +
    '<p class="note">架构参考过 Islet、Istel、dsh-island、toki、岛仔（均为 MIT），代码按本项目风格重写，未复制。</p>';
}

function pageCast() {
  const casts = meta?.casts ?? [];
  const demos = meta?.demos ?? [];
  const agents = meta?.agents ?? [];
  const currentCast = meta?.castId ?? 'tot';
  const members = casts.reduce((all, family) => all.concat(family.members), []);
  const castGrid = members.length
    ? '<div class="cast-grid">' + members.map((member) =>
        '<button type="button" class="cast-cell' + (member.id === currentCast ? ' on' : '') + '" data-act="action" data-kind="cast" data-value="' + escapeHtml(member.id) + '">' +
          '<emojitot-ball cast="' + escapeHtml(member.id) + '" size="46" state="idle"></emojitot-ball>' +
          '<span>' + escapeHtml(member.label) + '</span>' +
        '</button>').join('') + '</div>'
    : '<div class="row"><span class="row-label"><b>角色表还没加载</b><span>主进程没有提供角色清单</span></span></div>';
  const faceGrid = demos.length
    ? '<div class="face-grid">' + demos.map((demo) =>
        '<button type="button" class="face-cell" data-act="action" data-kind="demo" data-value="' + escapeHtml(demo.id) + '" title="' + escapeHtml(demo.label) + '">' +
          '<emojitot-ball cast="' + escapeHtml(currentCast) + '" size="34" state="' + escapeHtml(demo.state || 'idle') + '"></emojitot-ball>' +
          '<span>' + escapeHtml(demo.label) + '</span>' +
        '</button>').join('') + '</div>'
    : '';
  return head('角色与表情', '点一个就换，表情会直接播放') +
    group('角色', castGrid) +
    group('表情', faceGrid) +
    group('Agent 联动', card(agents.map((agent) =>
      rowActionToggle(agent.label, '读取它的状态文件来驱动表情', 'agent', agent.on, agent.id),
    )));
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
  plugins: pagePlugins,
  about: pageAbout,
};

/* ------------------------------------------------------------------- paint */

let railQuery = '';
const searchTextCache = new Map();

function pageSearchText(key) {
  if (searchTextCache.has(key)) return searchTextCache.get(key);
  const renderer = RENDERERS[key] ?? RENDERERS.general;
  const host = document.createElement('div');
  host.innerHTML = renderer();
  const text = (host.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  searchTextCache.set(key, text);
  return text;
}

function paintRail() {
  const term = railQuery.trim().toLowerCase();
  let html = '<div class="rail-search">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input id="rail-filter" type="search" aria-label="搜索设置" placeholder="搜索设置" ' +
      'value="' + escapeHtml(railQuery) + '" spellcheck="false" /></div>';
  let shown = 0;
  for (const group of NAV) {
    const items = group.items.filter((item) => {
      if (!term) return true;
      return item.label.toLowerCase().includes(term) || pageSearchText(item.key).includes(term);
    });
    for (const item of items) {
      shown += 1;
      html += '<button type="button" class="rail-item" data-nav="' + item.key + '" aria-current="' +
        (page === item.key) + '">' + '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[item.icon] + '</svg>' +
        '<span>' + escapeHtml(item.label) + '</span></button>';
    }
    if (items.length) html += '<div class="rail-sep"></div>';
  }
  if (!shown) html += '<div class="rail-empty">没有匹配的设置</div>';
  rail.innerHTML = html;
}

/** Theme and scale are applied before the first paint, from prefs. */
function applyChrome() {
  const html = document.documentElement;
  const theme = prefs.theme ?? 'dark';
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const light = theme === 'light' || (theme === 'system' && prefersLight);
  html.dataset.theme = light ? 'light' : 'dark';
  const scale = Math.min(1.4, Math.max(0.8, (Number(prefs.uiScale) || 100) / 100));
  html.style.zoom = String(scale);
}

let paintedPage = '';

function paintContent() {
  const renderer = RENDERERS[page] ?? RENDERERS.general;
  const changedPage = paintedPage !== page;
  paintedPage = page;
  content.innerHTML = renderer();
  content.scrollTop = 0;
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
  searchTextCache.clear();
  paint();
}

async function patch(update) {
  prefs = merge(await api.patch(update));
  searchTextCache.clear();
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
  if (act === 'seg') {
    const value = target.dataset.value;
    const numeric = ['uiScale', 'radius', 'fontSize', 'pillHeight', 'islandWidth', 'hoverOpenDelay', 'hoverCloseDelay'].includes(key);
    await patch(setPath(key, numeric ? Number(value) : value));
    return;
  }
  if (act === 'button') {
    if (key === 'refresh-weather') {
      target.textContent = '刷新中…';
      const result = await api.refreshWeather?.();
      target.textContent = result?.ok ? '已刷新' : '失败';
      setTimeout(() => { target.textContent = '刷新'; }, 1600);
      return;
    }
    if (key === 'clipboard-clear') {
      // The only control that deletes data, so it asks first.
      if (!window.confirm('删除全部剪贴板历史（包括固定的条目）？')) return;
      await api.clipboardClear?.();
      target.textContent = '已清除';
      setTimeout(() => { target.textContent = '清除'; }, 1600);
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

/* ------------------------------------------------------------------ shell */

rail.addEventListener('click', (event) => {
  const item = event.target.closest('[data-nav]');
  if (!item) return;
  page = item.dataset.nav;
  paint();
});

rail.addEventListener('input', (event) => {
  if (event.target.id !== 'rail-filter') return;
  railQuery = event.target.value;
  paintRail();
  const input = rail.querySelector('#rail-filter');
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
});

document.getElementById('btn-min').addEventListener('click', () => api.minimize());
document.getElementById('btn-max').addEventListener('click', () => api.maximize());
document.getElementById('btn-close').addEventListener('click', () => api.close());

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

load();
