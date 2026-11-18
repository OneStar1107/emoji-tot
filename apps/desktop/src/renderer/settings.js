/**
 * The settings page.
 *
 * One data source (prefs.json through IPC), one render pass, no local state
 * that can drift. Every control carries its own key, so adding a row is adding
 * one line — there is no handler to register.
 */
const api = window.settingsAPI;

/* ------------------------------------------------------------------- nav */

const NAV = [
  { group: '形态', items: [
    { key: 'general', label: '常规', icon: 'gear' },
    { key: 'appearance', label: '外观', icon: 'palette' },
    { key: 'layout', label: '尺寸与位置', icon: 'move' },
    { key: 'behavior', label: '隐藏与交互', icon: 'eye' },
    { key: 'pages', label: '页面管理', icon: 'grid' },
  ] },
  { group: '内容', items: [
    { key: 'music', label: '音乐与歌词', icon: 'music' },
    { key: 'focus', label: '专注与饮水', icon: 'timer' },
    { key: 'todo', label: '待办与置物', icon: 'check' },
    { key: 'comm', label: '通知、邮箱与日程', icon: 'mail' },
    { key: 'quota', label: 'AI 额度', icon: 'coin' },
    { key: 'weather', label: '天气', icon: 'sun' },
  ] },
  { group: '系统', items: [
    { key: 'plugins', label: '插件', icon: 'plug' },
    { key: 'about', label: '关于', icon: 'info' },
  ] },
];

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

const PAGES_TABLE = [
  { key: 'music', label: '音乐', stage: 1, sub: '播放控制与同步歌词' },
  { key: 'weather', label: '天气', stage: 1, sub: '当地天气与七日预报' },
  { key: 'quota', label: 'AI 额度', stage: 1, sub: '余额与账号切换' },
  { key: 'mail', label: '邮箱', stage: 1, sub: '摘要与验证码' },
  { key: 'focus', label: '专注', stage: 1, sub: '番茄钟与休息计时' },
  { key: 'todo', label: '待办', stage: 1, sub: '清单与到期提醒' },
  { key: 'health', label: '健康', stage: 1, sub: '喝水与久坐提醒' },
  { key: 'shelf', label: '置物架', stage: 1, sub: '临时收纳文件位置' },
  { key: 'calendar', label: '日程', stage: 3, sub: '月历、邮件邀请与工作日程' },
];

const STATUS_TABLE = [
  { key: 'battery', label: '电量' },
  { key: 'clock', label: '时间' },
  { key: 'weather', label: '温度' },
  { key: 'quota', label: '余额' },
  { key: 'volume', label: '音量' },
];

const DEFAULTS = {
  motion: true,
  form: 'island',
  formBoth: false,
  launchAtLogin: false,
  theme: 'dark',
  skin: 'frost',
  blur: true,
  uiScale: 100,
  radius: 22,
  font: 'system',
  weight: 400,
  fontSize: 0,
  islandWidth: 420,
  pillHeight: 34,
  displayId: null,
  avoidTopBar: true,
  timeFormat: '24h',
  clickThrough: true,
  hideFullscreen: true,
  trayIcon: true,
  hotkey: true,
  wheelPaging: true,
  blurCollapse: true,
  hoverOpenDelay: 0,
  statusItems: ['battery', 'clock', 'weather'],
  pages: { music: true, weather: true, quota: true, mail: true },
  pageOrder: ['music', 'weather', 'quota', 'mail'],
  defaultPage: 'music',
  weather: { city: '香港', unit: 'c', intervalMin: 15 },
  music: { lyrics: true, islandLyrics: true, offset: 0.35 },
  focus: { work: 25, rest: 5, enabled: false },
  health: { waterMin: 45, standMin: 60, enabled: false },
  todo: { enabled: true, notify: true },
  shelf: { enabled: true, dir: '' },
  calendar: { leadMin: 10, fromMail: true },
  quota: { provider: 'deepseek', intervalMin: 15, alert: true, threshold: 5 },
  notify: { system: true, body: true },
  mail: [],
};

let prefs = { ...DEFAULTS };
let page = 'general';
let displays = [];
let version = '0.0.0';
let quotaState = { accounts: [], current: null, last: null };
let mailState = { accounts: [], messages: [], error: '', lastSync: 0, syncing: false };
let calendarState = { events: [], upcoming: [] };

const rail = document.getElementById('rail');
const content = document.getElementById('content');

/* --------------------------------------------------------------- rendering */

function merge(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULTS,
    ...source,
    weather: { ...DEFAULTS.weather, ...(source.weather || {}) },
    music: { ...DEFAULTS.music, ...(source.music || {}) },
    focus: { ...DEFAULTS.focus, ...(source.focus || {}) },
    health: { ...DEFAULTS.health, ...(source.health || {}) },
    quota: { ...DEFAULTS.quota, ...(source.quota || {}) },
    todo: { ...DEFAULTS.todo, ...(source.todo || {}) },
    shelf: { ...DEFAULTS.shelf, ...(source.shelf || {}) },
    calendar: { ...DEFAULTS.calendar, ...(source.calendar || {}) },
    notify: { ...DEFAULTS.notify, ...(source.notify || {}) },
    pages: { ...DEFAULTS.pages, ...(source.pages || {}) },
    statusItems: Array.isArray(source.statusItems) ? source.statusItems : [...DEFAULTS.statusItems],
    pageOrder: Array.isArray(source.pageOrder) ? source.pageOrder : [...DEFAULTS.pageOrder],
  };
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const row = (label, sub, control) =>
  '<div class="row"><span class="row-label"><b>' + escapeHtml(label) + '</b>' +
  (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</span>' +
  '<span class="row-control">' + control + '</span></div>';

const rowToggle = (label, sub, key) =>
  row(label, sub, '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(prefs[key]) +
    '" data-act="toggle" data-key="' + key + '" aria-label="' + escapeHtml(label) + '"></button>');

const rowSeg = (label, sub, key, options) =>
  row(label, sub, '<span class="seg">' + options.map(([value, text]) =>
    '<button type="button" data-act="seg" data-key="' + key + '" data-value="' + value + '" aria-pressed="' +
    (String(prefs[key]) === String(value)) + '">' + escapeHtml(text) + '</button>').join('') + '</span>');

const rowSelect = (label, sub, key, options, selected) =>
  row(label, sub, '<select class="ctl" data-act="set" data-key="' + key + '">' + options.map(([value, text]) =>
    '<option value="' + value + '"' + (String(selected ?? prefs[key]) === String(value) ? ' selected' : '') + '>' +
    escapeHtml(text) + '</option>').join('') + '</select>');

const rowInput = (label, sub, key, value, placeholder) =>
  row(label, sub, '<input class="ctl" data-act="set" data-key="' + key + '" value="' + escapeHtml(value ?? '') +
    '" placeholder="' + escapeHtml(placeholder ?? '') + '" spellcheck="false" />');

const rowRange = (label, sub, key, min, max, step, suffix) =>
  row(label, sub, '<input class="ctl" type="range" min="' + min + '" max="' + max + '" step="' + step +
    '" value="' + Number(prefs[key] ?? min) + '" data-act="set" data-key="' + key + '" data-suffix="' +
    escapeHtml(suffix ?? '') + '" /><b style="min-width:44px;text-align:right;font-weight:400;color:var(--dim);font-size:11.5px">' +
    Number(prefs[key] ?? min) + escapeHtml(suffix ?? '') + '</b>');

const card = (rows) => '<div class="card">' + rows.filter(Boolean).join('') + '</div>';
const group = (title, body) => '<section class="group"><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
const head = (title, sub) =>
  '<div class="page-head"><h1>' + escapeHtml(title) + '</h1>' + (sub ? '<p>' + escapeHtml(sub) + '</p>' : '') + '</div>';

const emptyCard = (title, text, action, label) =>
  '<div class="card"><div class="empty-card"><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(text) + '</span>' +
  (action ? '<button type="button" class="btn primary" data-act="button" data-key="' + action + '">' + escapeHtml(label) + '</button>' : '') +
  '</div></div>';

/* ------------------------------------------------------------------ pages */

function pageGeneral() {
  return head('常规', '形态、启动与基础外观') +
    group('形态', card([
      rowSeg('默认形态', '开机时先显示哪一个', 'form', [['island', '灵动岛'], ['ball', '桌面球']]),
      rowToggle('同时显示两种', '岛贴屏幕顶部，球留在桌面', 'formBoth'),
    ])) +
    group('启动', card([
      rowToggle('开机启动', '登录系统时自动打开 EmojiTot', 'launchAtLogin'),
    ])) +
    group('外观', card([
      rowSeg('主题', '设置窗口的配色', 'theme', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]),
      rowSeg('皮肤', '岛表面的质感', 'skin', [['frost', '毛玻璃'], ['solid', '实色'], ['plain', '极简']]),
      rowToggle('背景模糊', '开启后岛背景半透明并模糊', 'blur'),
      rowRange('界面缩放', '岛与球按此比例绘制', 'uiScale', 80, 140, 5, '%'),
      rowToggle('避开顶栏', '顶部有系统栏时，岛放在它下方', 'avoidTopBar'),
      rowSeg('时间制式', '', 'timeFormat', [['24h', '24 小时'], ['12h', '12 小时']]),
    ]));
}

function pageAppearance() {
  return head('外观', '岛的材质、字体与动画') +
    group('灵动岛样式', card([
      rowSeg('风格', '收起与展开共用的表面处理', 'skin', [['frost', '毛玻璃'], ['solid', '实色'], ['plain', '极简']]),
      rowToggle('背景模糊', '关掉后是纯色卡片', 'blur'),
      rowRange('圆角', '卡片的圆角半径', 'radius', 12, 30, 1, 'px'),
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

function pageBehavior() {
  return head('隐藏与交互', '什么情况下出现，什么情况下让开') +
    group('显示', card([
      rowToggle('全屏时隐藏', '看视频、演示时不挡住画面', 'hideFullscreen'),
      rowToggle('托盘图标', '关掉后只能从任务管理器退出', 'trayIcon'),
      rowRange('悬停展开延迟', '鼠标停在胶囊上多久才展开', 'hoverOpenDelay', 0, 500, 20, 'ms'),
    ])) +
    group('交互', card([
      rowToggle('滚轮换页', '在面板上横向滚动切换页面', 'wheelPaging'),
      rowToggle('失焦收起', '点到别的窗口时自动收起', 'blurCollapse'),
    ])) +
    group('快捷键', card([
      rowToggle('全局快捷键', 'Alt+Shift+T 展开或收起岛', 'hotkey'),
    ])) +
    '<p class="note">阶段 1 里，全屏隐藏、快捷键与滚轮开关只保存偏好；真正生效在阶段 2 接入窗口事件后。</p>';
}

function orderList(listId, items, enabledOf) {
  return '<div class="order" data-order-list="' + listId + '">' + items.map((item) =>
    '<div class="order-item" draggable="true" data-order="' + item.key + '">' +
      '<span class="order-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="order-name">' + escapeHtml(item.label) +
        (item.stage > 1 ? '<em>阶段 ' + item.stage + '</em>' : '') +
        (item.sub ? '<em>' + escapeHtml(item.sub) + '</em>' : '') +
      '</span>' +
      (enabledOf ? '<button type="button" class="switch" role="switch" aria-checked="' + Boolean(enabledOf(item.key)) +
        '" data-act="toggle-nested" data-key="pages.' + item.key + '" aria-label="' + escapeHtml(item.label) + '"></button>' : '') +
    '</div>').join('') + '</div>';
}

function pagePages() {
  const order = prefs.pageOrder.filter((key) => PAGES_TABLE.some((p) => p.key === key));
  for (const item of PAGES_TABLE) if (!order.includes(item.key)) order.push(item.key);
  const pageItems = order.map((key) => PAGES_TABLE.find((p) => p.key === key)).filter(Boolean);
  const statusItems = prefs.statusItems
    .map((key) => STATUS_TABLE.find((s) => s.key === key))
    .filter(Boolean);
  const missing = STATUS_TABLE.filter((s) => !prefs.statusItems.includes(s.key));

  return head('页面管理', '决定岛上有哪些页，以及它们出现的顺序') +
    group('状态组件 · 常驻胶囊', '<div class="card">' + orderList('status', statusItems.concat(missing), null) + '</div>') +
    group('功能页面 · 展开后左右翻', '<div class="card">' + orderList('pages', pageItems, (key) => prefs.pages[key] !== false) + '</div>') +
    '<p class="note">拖动排序；关掉的页面不在岛上出现，也不在后台运行。阶段 2、3 的页面会随对应功能一起上线。</p>';
}

function pageMusic() {
  return head('音乐与歌词', '跟随系统正在播放的媒体') +
    group('歌词', card([
      rowToggle('展开时显示歌词', '在播放器右侧同步滚动显示', 'music.lyrics'),
      rowToggle('岛上歌词', '收起时显示当前句', 'music.islandLyrics'),
      rowRange('时间偏移', '正数提前，负数延后', 'music.offset', -1, 2, 0.05, ' 秒'),
    ])) +
    '<p class="note">阶段 1 已完成 SMTC 桥的调研与协议设计；阶段 2 接入 PowerShell + WinRT，无需原生编译。</p>';
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
    '<p class="note">这一页的开关会写进偏好；计时与通知在阶段 2 接上。</p>';
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
    '<p class="note">阶段 2 实现：本地 JSON 存储，不联云。</p>';
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
    group('邮箱', '<div class="card">' + accountRows + mailStatus + '</div>') +
    group('添加邮箱', card([
      rowSelect('服务商', '163 / QQ 需要授权码，不是登录密码', 'mailProvider', [
        ['163', '163 邮箱'], ['qq', 'QQ 邮箱'], ['gmail', 'Gmail'], ['outlook', 'Outlook'], ['custom', '自定义 IMAP'],
      ], prefs.mailProvider ?? '163'),
      row('邮箱地址', '', '<input class="ctl" data-mail-input="address" placeholder="you@163.com" spellcheck="false" />'),
      row('授权码', '邮箱设置里生成的 IMAP 授权码', '<input class="ctl" type="password" data-mail-input="secret" placeholder="授权码" spellcheck="false" />'),
      row('IMAP 主机', '自定义服务商才需要填', '<input class="ctl" data-mail-input="host" placeholder="imap.example.com" spellcheck="false" />'),
      row('', '拉取最近 10 封，凭证用系统加密保存', '<button type="button" class="btn primary" data-act="button" data-key="mail-add">添加并同步</button>'),
    ])) +
    group('日程', '<div class="card">' + eventRows + '</div>') +
    group('添加日程', card([
      row('标题', '', '<input class="ctl" data-cal-input="title" placeholder="周会" spellcheck="false" />'),
      row('时间', '', '<input class="ctl" type="datetime-local" data-cal-input="start" />'),
      row('地点', '可留空', '<input class="ctl" data-cal-input="location" placeholder="会议室 / 线上" spellcheck="false" />'),
      row('', '邮件邀请里的 .ics 会自动导入', '<button type="button" class="btn primary" data-act="button" data-key="cal-add">添加日程</button>'),
    ])) +
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
      row('名称', '显示在岛上的名字，留空就是 DeepSeek', '<input class="ctl" data-quota-input="name" placeholder="可选" spellcheck="false" />'),
      row('API Key', 'DeepSeek 平台 → API Keys，只保存在本机', '<input class="ctl" type="password" data-quota-input="key" placeholder="sk-..." spellcheck="false" />'),
      row('', '密钥用系统凭据加密，不写进 prefs.json', '<button type="button" class="btn primary" data-act="button" data-key="quota-add">添加并查询</button>'),
    ])) +
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
      rowInput('城市', '中文或英文都行，例如 香港 / Tokyo', 'weather.city', prefs.weather.city, '香港'),
      rowSeg('单位', '', 'weather.unit', [['c', '摄氏'], ['f', '华氏']]),
    ])) +
    group('数据', card([
      rowRange('刷新间隔', 'Open-Meteo 免费额度足够', 'weather.intervalMin', 5, 60, 5, ' 分钟'),
      row('立即刷新', '重新拉一次当前城市', '<button type="button" class="btn" data-act="button" data-key="refresh-weather">刷新</button>'),
    ])) +
    '<p class="note">无需 API Key。城市解析用 Open-Meteo geocoding，失败时保留上一次结果。</p>';
}

function pagePlugins() {
  return head('插件', '预留：用脚本扩展岛的内容') +
    emptyCard('插件系统还没开放', '计划支持一份 JSON 描述的自定义页面：数据源、刷新间隔、一个渲染函数。', null, null) +
    '<p class="note">先把内置页面做稳，再开放扩展点。</p>';
}

function pageAbout() {
  return head('关于', 'EmojiTot') +
    group('版本', card([
      row('当前版本', '一个两位数，一个会表达的角色', '<span class="badge">v' + escapeHtml(version) + '</span>'),
      row('数据目录', 'prefs.json、state.json 与缓存', '<button type="button" class="btn" data-act="button" data-key="open-data">打开</button>'),
      row('项目主页', 'MIT 许可，代码与美术全部自研', '<button type="button" class="btn" data-act="button" data-key="open-repo">GitHub</button>'),
    ])) +
    group('素材与许可', card([
      row('角色引擎', '@emojitot/core · MIT', '<span class="badge">自研</span>'),
      row('两位协议', '@emojitot/protocol · MIT', '<span class="badge">自研</span>'),
      row('天气', 'Open-Meteo · 免费 API', '<span class="badge">外部</span>'),
    ])) +
    '<p class="note">参考过 Islet、Istel、dsh-island、toki 的架构（均为 MIT），未复制其代码。</p>';
}

const RENDERERS = {
  general: pageGeneral,
  appearance: pageAppearance,
  layout: pageLayout,
  behavior: pageBehavior,
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

function paintRail() {
  let html = '<div class="rail-search">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input id="rail-filter" placeholder="搜索" spellcheck="false" /></div>';
  for (const group of NAV) {
    for (const item of group.items) {
      html += '<button type="button" class="rail-item" data-nav="' + item.key + '" aria-current="' +
        (page === item.key) + '">' + '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[item.icon] + '</svg>' +
        '<span>' + escapeHtml(item.label) + '</span></button>';
    }
    html += '<div class="rail-sep"></div>';
  }
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

/* --------------------------------------------------------------- controls */

content.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;
  const key = target.dataset.key;

  if (act === 'toggle') {
    await patch({ [key]: !prefs[key] });
    return;
  }
  if (act === 'toggle-nested') {
    const current = valueOf(key);
    await patch(setPath(key, current === false));
    return;
  }
  if (act === 'seg') {
    const value = target.dataset.value;
    const numeric = ['uiScale', 'radius', 'fontSize', 'pillHeight', 'islandWidth', 'hoverOpenDelay'].includes(key);
    await patch({ [key]: numeric ? Number(value) : value });
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
    if (key === 'open-data') { await api.openData?.(); return; }
    if (key === 'open-repo') { await api.openRepo?.(); return; }
    if (key === 'add-mail') { page = 'comm'; return; }
    if (key === 'add-quota') { page = 'quota'; return; }
    if (key === 'quota-add') {
      const name = content.querySelector('[data-quota-input="name"]')?.value?.trim() ?? '';
      const secret = content.querySelector('[data-quota-input="key"]')?.value?.trim() ?? '';
      if (!secret) {
        content.querySelector('[data-quota-input="key"]')?.focus();
        return;
      }
      quotaState = await api.quotaDo('add', { name, key: secret });
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
      const address = content.querySelector('[data-mail-input="address"]')?.value?.trim() ?? '';
      const secret = content.querySelector('[data-mail-input="secret"]')?.value?.trim() ?? '';
      const host = content.querySelector('[data-mail-input="host"]')?.value?.trim() ?? '';
      if (!address || !secret) {
        content.querySelector('[data-mail-input="address"]')?.focus();
        return;
      }
      await patch({ mailProvider: prefs.mailProvider });
      await api.mailDo('add', { provider: prefs.mailProvider, address, user: address, secret, host });
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
      calendarState = await api.calendarDo('add', {
        title,
        start: new Date(startValue).getTime(),
        location,
      });
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
  const keys = [...list.querySelectorAll('.order-item')].map((el) => el.dataset.order);
  if (list.dataset.orderList === 'pages') await patch({ pageOrder: keys });
  else await patch({ statusItems: keys });
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
  const term = event.target.value.trim().toLowerCase();
  for (const item of rail.querySelectorAll('[data-nav]')) {
    const label = item.querySelector('span')?.textContent?.toLowerCase() ?? '';
    item.hidden = Boolean(term) && !label.includes(term);
  }
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
