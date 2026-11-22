/**
 * The one settings schema.
 *
 * Everything that knows a preference lives here: the default value, which
 * settings page owns it, and where it is actually consumed. Three things read
 * this file and nothing else keeps a second copy:
 *
 *   - the main process, through a dynamic import in main.js, so readPrefs()
 *     returns a fully-defaulted object instead of {};
 *   - the settings window, which renders one control per entry;
 *   - the island, which decides what to draw from the same defaults.
 *
 * The file is plain data plus pure functions on purpose: no electron, no node
 * built-ins, no DOM. That is what lets a unit test import it directly and
 * assert that every key has a consumer and a default.
 */

/* ------------------------------------------------------------------ pages */

/**
 * What the island can show, in order, and which service each page needs.
 *
 * `service` is the background worker a page owns; `alsoServices` are extra
 * workers that only make sense while the page is on. Switching a page off
 * stops them (see enabledServices) unless a pill status item still needs one.
 */
export const PAGE_MANIFEST = [
  { key: 'music', title: '媒体', sub: '系统正在播放', icon: 'music', service: 'media' },
  { key: 'weather', title: '天气', sub: '当地与七日', icon: 'sun', service: 'weather' },
  { key: 'quota', title: 'AI 工作台', sub: '余额与 Agent', icon: 'coin', service: 'quota' },
  { key: 'mail', title: '邮箱', sub: '摘要与验证码', icon: 'mail', service: 'mail' },
  { key: 'focus', title: '专注', sub: '番茄钟与休息', icon: 'timer', service: 'focus' },
  { key: 'todo', title: '待办', sub: '清单与到期', icon: 'check', service: 'todo' },
  { key: 'health', title: '健康', sub: '喝水与久坐', icon: 'drop', service: 'health' },
  // The shelf has no background loop — it is file operations only — so it
  // names no service of its own and the clipboard worker rides along with it.
  { key: 'shelf', title: '置物架', sub: '临时收纳', icon: 'tray', service: null, alsoServices: ['clipboard'] },
  { key: 'devices', title: '设备', sub: '蓝牙与电量', icon: 'tray', service: 'devices' },
  { key: 'calendar', title: '日程', sub: '月历与邀请', icon: 'calendar', service: 'calendar' },
  // One page for every message app. It starts the probe its rows are read from,
  // and the rows are switches, not a reader: Windows exposes no "mark read".
  { key: 'messenger', title: '消息', sub: '未读与切换', icon: 'mail', service: 'messenger' },
];

/**
 * The components that stay in the collapsed pill.
 *
 * A status item is not a page: it draws in 34px and keeps drawing while the
 * panel is closed, so the service behind it must keep running even when its
 * page is switched off. That is the one exception to "page off, service off".
 *
 * Every entry must be rendered in renderer/island.js renderPillStatus();
 * there is a test that walks this table and fails on a key nothing draws.
 */
/**
 * The settings window's left rail: three groups, fifteen pages.
 *
 * It lives here rather than in the renderer because the site's docs page
 * prints the page count, and two copies of a list like this is exactly how a
 * number goes stale — the docs said 13 while the window had 14.
 */
export const SETTINGS_NAV = [
  {
    id: 'look',
    title: '形态',
    items: [
      { key: 'general', label: '常规', icon: 'gear' },
      { key: 'appearance', label: '外观', icon: 'palette' },
      { key: 'layout', label: '尺寸与位置', icon: 'move' },
      { key: 'behavior', label: '隐藏与交互', icon: 'eye' },
      { key: 'cast', label: '角色与表情', icon: 'palette' },
      { key: 'pages', label: '页面管理', icon: 'grid' },
    ],
  },
  {
    id: 'content',
    title: '内容',
    items: [
      { key: 'music', label: '媒体与歌词', icon: 'music' },
      { key: 'focus', label: '专注与饮水', icon: 'timer' },
      { key: 'todo', label: '待办与置物', icon: 'check' },
      { key: 'comm', label: '通知、邮箱与日程', icon: 'mail' },
      { key: 'quota', label: 'AI 额度', icon: 'coin' },
      { key: 'weather', label: '天气', icon: 'sun' },
      /* The devices list used to have no page of its own: its two decisions
         (may a level be shown, which rows come first) were rows on 页面管理.
         It is a content page now — the rail's third group is the one that
         grows. The pages.devices switch on 页面管理 stays: it decides whether
         the island shows the page at all. */
      { key: 'devices', label: '设备', icon: 'tray' },
    ],
  },
  {
    id: 'system',
    title: '系统',
    items: [
      { key: 'plugins', label: '插件', icon: 'plug' },
      { key: 'about', label: '关于', icon: 'info' },
    ],
  },
];

/** Every settings page key, in rail order. */
export const SETTINGS_PAGE_KEYS = SETTINGS_NAV.flatMap((group) => group.items.map((item) => item.key));

export const STATUS_MANIFEST = [
  { key: 'battery', label: '电量', service: 'battery' },
  { key: 'clock', label: '时间', service: null },
  { key: 'weather', label: '温度', service: 'weather' },
  { key: 'quota', label: '余额', service: 'quota' },
];

/**
 * Quick starting points for the pages a person actually uses.
 *
 * Presets are data, not onboarding state: applying one writes ordinary
 * preferences and can be adjusted afterwards.
 */
export const PRESET_MANIFEST = [
  {
    key: 'minimal',
    label: '极简',
    description: '天气一页，加上电量和时间。',
    pages: ['weather'],
    statusItems: ['battery', 'clock'],
    defaultPage: 'weather',
  },
  {
    key: 'work',
    label: '工作',
    description: '媒体、余额、待办、专注和日程。',
    pages: ['music', 'quota', 'todo', 'focus', 'calendar'],
    statusItems: ['battery', 'clock', 'quota'],
    defaultPage: 'todo',
    features: { focus: true, todo: true },
  },
  {
    key: 'life',
    label: '生活',
    description: '天气、待办、健康、置物架、设备和日程。',
    pages: ['weather', 'todo', 'health', 'shelf', 'devices', 'calendar'],
    statusItems: ['battery', 'clock', 'weather'],
    defaultPage: 'weather',
    features: { health: true, todo: true, shelf: true },
  },
  {
    key: 'full',
    label: '全部',
    description: '开启全部十一页，保留默认状态组件。',
    pages: PAGE_MANIFEST.map((page) => page.key),
    statusItems: ['battery', 'clock', 'weather'],
    defaultPage: 'music',
  },
];

/* --------------------------------------------------------------- defaults */

/**
 * Every preference, its default, and nothing else.
 *
 * Read this as the file format: a key that is not here is not a setting, and
 * writePrefs refuses it (see filterPatch) instead of letting a typo become a
 * silently dead key in prefs.json.
 *
 * `pinned`, `sizeKey`, `oledShift`, `weatherAutoLocate`, `reduceMotion` and
 * `shelf.clipboard` were previously missing here while the UI already wrote
 * them — which made the ball's always-on-top switch render as off while the
 * window was pinned.
 */
export const DEFAULTS = {
  /* display */
  displayMode: 'island',
  /**
   * The two-page first-launch guide has been seen.
   *
   * Not a control: main/onboarding.js writes it once when the guide is
   * finished or skipped, and no settings row renders it. A profile that
   * predates the guide gets it once; skipping counts as seen.
   */
  onboardingDone: false,
  launchAtLogin: false,
  cast: 'tot',
  /** Last window position; written by the ball itself, not by a control. */
  position: null,

  /*
   * 设置窗口的界面语言 / The settings window's interface language.
   *
   * 这一批只有设置窗口读它：岛、托盘、更新卡与引导窗的文案还没接，所以切到
   * 英文不会让桌面上的岛半中半英。它是一个普通设置项，因此进了 DEFAULTS，
   * writePrefs 的 filterPatch 才认这条写请求。
   */
  lang: 'zh',

  /* appearance */
  theme: 'dark',
  skin: 'frost',
  blur: true,
  /*
   * Real frosted glass: photograph the desktop behind the panel once and blur
   * the photograph, because a transparent window has no desktop in its
   * compositing stack for `backdrop-filter` to sample. On by default — it is
   * the material the frost skin has always been pretending to be — and it needs
   * the frost skin with blur on to mean anything (island-glass.mjs checks all
   * three). The frame lives in memory only: never written, never uploaded.
   */
  glassBackdrop: true,
  uiScale: 100,
  radius: 22,
  font: 'system',
  weight: 400,
  fontSize: 0,
  motion: true,
  reduceMotion: false,

  /* layout */
  islandWidth: 420,
  /* The collapsed strip: 30 (the slider minimum) folds to 40px, 34 to 44.9px.
     Default sits at the minimum — the folded island should be a strip with a
     face in it, not a small card, and the user can grow it from the settings. */
  pillHeight: 30,
  /** Space between the island and the top edge of the work area, in px. */
  islandTopGap: 8,
  sizeKey: 'md',
  pinned: true,
  clickThrough: true,
  displayId: null,
  avoidTopBar: true,
  oledShift: false,

  /* behaviour */
  timeFormat: '24h',
  hideFullscreen: true,
  /*
   * Auto-avoid is on by default, and the scope is what makes that safe: it
   * only reacts to browsers (avoidBrowsers) plus whatever the user adds.
   *
   * The island lives at the top centre of the screen — a maximised browser's
   * tab strip. Left alone it would sit on top of those tabs permanently, which
   * is the first thing a new user would call broken; and the fix (find this
   * setting) is much harder to discover than the way back (hover the 5px strip
   * that stays exactly where the island was). The watcher measured 0.02% CPU,
   * so the cost of having it on is not a reason to make it off.
   */
  avoidEnabled: true,
  avoidBrowsers: true,
  avoidApps: [],
  /*
   * Media drives the face: playing, live, a foreground game, paused, a media
   * failure. On by default because it is the feature people notice; off is one
   * switch away, and the switch is on the page where the faces live.
   */
  mediaEmotion: true,
  /*
   * The idle mood clock: with nothing else happening the pet borrows one
   * resting expression every 7–16 seconds and gives it back 1.8–4.4 seconds
   * later. It is the lowest face priority (manual > agent > media > idle), so
   * this switch only mutes the clock — it can never cancel a face the user or
   * an agent asked for.
   */
  idleMoods: true,
  trayIcon: true,
  hotkey: true,
  wheelPaging: true,
  blurCollapse: true,
  hoverOpenDelay: 100,
  hoverCloseDelay: 120,
  hoverAutoHide: true,

  /* pages */
  statusItems: ['battery', 'clock', 'weather'],
  pages: {
    music: true,
    weather: true,
    quota: true,
    mail: true,
    focus: true,
    todo: true,
    health: true,
    shelf: true,
    devices: false,
    calendar: true,
    messenger: true,
  },
  pageOrder: ['music', 'weather', 'quota', 'mail', 'focus', 'todo', 'health', 'shelf', 'devices', 'calendar', 'messenger'],
  defaultPage: 'music',

  /*
   * The devices page is a list, and a list needs two decisions the old page
   * hard-coded: whether a level belongs to the row, and which rows come first.
   *
   *   showBattery  on  -> meter + percentage per row
   *                off -> name and connection state only, so the list reads as
   *                      "what is plugged in" rather than "how much is left"
   *   pinned       at most three device names, in the order they were pinned.
   *                The page shows five rows; pinning more than three would
   *                push the rest below the fold, so the fourth pin is ignored
   *                rather than silently reordering the page.
   *   hidden       device names the devices page leaves out. Hiding is not
   *                forgetting: the row keeps its pin, and the settings page
   *                still lists the device so it can be shown again.
   */
  /*
   *   order        the row order the person dragged into place. Pinned rows
   *                still come first (that is what pinning is for), and inside
   *                each group the stored order wins; a device the list has
   *                never seen falls to the end and keeps the probe's order.
   */
  devices: { showBattery: true, pinned: [], hidden: [], order: [] },

  /* grouped */
  /*
   * The place is the first thing the weather page needs, and asking every new
   * person to type a city was the one step between install and a reading. It
   * is on by default; the manual city stays as the fallback the locator falls
   * back to, and a person who picks a city (or switches this off) stores an
   * explicit false, which the merge below never overwrites.
   */
  weather: { city: '香港', unit: 'c', intervalMin: 15, autoLocate: true },
  music: { lyrics: true, islandLyrics: true, offset: 0.35 },
  focus: { work: 25, rest: 5, enabled: false },
  health: { waterMin: 45, standMin: 60, enabled: false },
  todo: { enabled: true, notify: true },
  shelf: { enabled: true, dir: '', clipboard: false },
  calendar: { leadMin: 10, fromMail: true },
  quota: { provider: 'deepseek', intervalMin: 15, alert: true, threshold: 5 },
  mailProvider: '163',
  notify: { system: true, body: true },
  /**
   * The update card's one piece of state. 「稍后」 stores an epoch-ms deadline
   * here; until it passes the card stays closed. Not a settings control — the
   * button is the only writer (main/update-prompt.js).
   */
  updatePrompt: { snoozeUntil: 0 },
  messenger: { wechat: true, qq: true, wecom: true, feishu: true, dingtalk: true },
};

/** The grouped defaults, so withDefaults knows what to merge one level down. */
const NESTED = Object.keys(DEFAULTS).filter((key) => {
  const value = DEFAULTS[key];
  return value && typeof value === 'object' && !Array.isArray(value);
});

/* ------------------------------------------------------------------ merge */

/**
 * Fill in every missing default, one level deep.
 *
 * Arrays are replaced wholesale, never merged: a page order is a list the user
 * owns, and merging `['music']` over the default would silently resurrect the
 * pages they removed.
 */
export function withDefaults(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const displayMode = ['island', 'ball', 'both'].includes(source.displayMode)
    ? source.displayMode
    : source.formBoth === true
      ? 'both'
      : source.form === 'ball'
        ? 'ball'
        : DEFAULTS.displayMode;
  const next = { ...DEFAULTS, ...source, displayMode };
  delete next.form;
  delete next.formBoth;
  for (const key of NESTED) {
    next[key] = { ...DEFAULTS[key], ...(source[key] && typeof source[key] === 'object' ? source[key] : {}) };
  }
  if (!Array.isArray(source.statusItems)) next.statusItems = [...DEFAULTS.statusItems];
  if (!Array.isArray(source.pageOrder)) next.pageOrder = [...DEFAULTS.pageOrder];
  if (!Array.isArray(source.avoidApps)) next.avoidApps = [...DEFAULTS.avoidApps];
  /* The devices group holds two lists, and both are copied on every call:
     merging a group copies its members shallowly, so without this the default
     object's arrays would be mutated by whichever window toggled first. */
  next.devices = {
    ...next.devices,
    pinned: [...(Array.isArray(next.devices.pinned) ? next.devices.pinned : DEFAULTS.devices.pinned)],
    hidden: [...(Array.isArray(next.devices.hidden) ? next.devices.hidden : DEFAULTS.devices.hidden)],
    order: [...(Array.isArray(next.devices.order) ? next.devices.order : DEFAULTS.devices.order)],
  };
  return next;
}

/**
 * One complete preference patch for a preset.
 *
 * `current` is required to preserve nested values such as a custom focus
 * duration. writePrefs replaces a grouped object wholesale, so emitting only
 * `{ focus: { enabled: true } }` would silently reset the other timer values.
 */
export function presetPatch(key, current = {}) {
  const preset = PRESET_MANIFEST.find((item) => item.key === key);
  if (!preset) return null;
  const currentPrefs = withDefaults(current);
  const enabled = new Set(preset.pages);
  const patch = {
    displayMode: 'island',
    pages: Object.fromEntries(PAGE_MANIFEST.map((page) => [page.key, enabled.has(page.key)])),
    pageOrder: PAGE_MANIFEST.map((page) => page.key).filter((pageKey) => enabled.has(pageKey)),
    statusItems: preset.statusItems.slice(),
    defaultPage: preset.defaultPage,
  };
  for (const [group, value] of Object.entries(preset.features ?? {})) {
    patch[group] = { ...currentPrefs[group], enabled: value };
  }
  return patch;
}

/**
 * Every path a control may write, e.g. `focus.work`.
 *
 * `pages` stays whole: its members are page switches described by
 * PAGE_MANIFEST, so the audit covers the group once instead of repeating one
 * entry per page.
 */
export function knownPaths() {
  const paths = [];
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'pages') {
      paths.push(key);
    } else if (NESTED.includes(key)) {
      for (const leaf of Object.keys(DEFAULTS[key])) paths.push(key + '.' + leaf);
    } else {
      paths.push(key);
    }
  }
  return paths;
}

/**
 * Drop keys the schema does not know.
 *
 * A patch that writes an unknown key used to land in prefs.json and stay there
 * forever, invisible and unreadable. Refusing it keeps the file honest and
 * makes a typo in a control key fail loudly in tests instead of quietly.
 */
export function filterPatch(patch) {
  const accepted = {};
  const rejected = [];
  if (!patch || typeof patch !== 'object') return { accepted, rejected };
  for (const [key, value] of Object.entries(patch)) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      accepted[key] = value;
    } else {
      rejected.push(key);
    }
  }
  return { accepted, rejected };
}

/* ---------------------------------------------------------------- service */

/** Pages the user has switched on, in their stored order. */
export function enabledPageKeys(prefs) {
  const p = withDefaults(prefs);
  const order = p.pageOrder.filter((key) => PAGE_MANIFEST.some((page) => page.key === key));
  for (const page of PAGE_MANIFEST) if (!order.includes(page.key)) order.push(page.key);
  return order.filter((key) => p.pages[key] !== false);
}

/** Status components the user has switched on, in their stored order. */
export function enabledStatusKeys(prefs) {
  const p = withDefaults(prefs);
  return p.statusItems.filter((key) => STATUS_MANIFEST.some((item) => item.key === key));
}

/**
 * Every status component, switched-on ones first in the user's order.
 *
 * The settings page needs the switched-off ones too — that is the whole point
 * of a page manager — while the island only ever wants enabledStatusKeys().
 */
export function orderedStatusKeys(prefs) {
  const p = withDefaults(prefs);
  const on = p.statusItems.filter((key) => STATUS_MANIFEST.some((item) => item.key === key));
  const off = STATUS_MANIFEST.map((item) => item.key).filter((key) => !on.includes(key));
  return on.concat(off);
}

/** Enable or disable one status item, returning the next ordered list. */
export function setStatusItemEnabled(prefs, key, enabled) {
  const p = withDefaults(prefs);
  if (!STATUS_MANIFEST.some((item) => item.key === key)) return p.statusItems.slice();
  const next = p.statusItems.filter((item) => STATUS_MANIFEST.some((entry) => entry.key === item));
  const index = next.indexOf(key);
  if (enabled && index < 0) next.push(key);
  else if (!enabled && index >= 0) next.splice(index, 1);
  return next;
}

/**
 * The default status row, in the default order.
 *
 * The reset button's whole value is being exactly the fresh-install list —
 * battery, clock, weather — with the balance switched off, not "some sensible
 * order". A copy is returned so no caller can edit DEFAULTS by accident.
 */
export function defaultStatusItems() {
  return [...DEFAULTS.statusItems];
}

/**
 * Move one switched-on status item to a new position, returning the next
 * statusItems array.
 *
 * `index` is the item's FINAL position, not the gap it was dropped before:
 * dragging the last item to the front asks for 0, and that one number describes
 * both the preview strip and the row list underneath it, so the two controls
 * cannot disagree about where the drop landed.
 *
 * Only switched-on keys are stored: an item that is off has no custom slot,
 * because the island never draws it. Moving one is a no-op rather than an
 * error — the preview keeps off items in the strip, and a drag that starts on
 * one must not invent an order nothing reads.
 */
export function moveStatusKey(prefs, key, index) {
  const on = enabledStatusKeys(prefs);
  const from = on.indexOf(key);
  if (from < 0) return on;
  const to = Math.max(0, Math.min(on.length - 1, Math.trunc(Number(index)) || 0));
  if (to === from) return on;
  const next = on.slice();
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/**
 * The preview strip's rows: every status component in pill order, each one
 * saying whether it is switched on.
 *
 * Switched-off components keep their slot in the strip. That is what lets the
 * preview show where a component WILL sit once it is switched on, and what the
 * card's note promises when it says the position is kept.
 */
export function statusPreviewRows(prefs) {
  const on = enabledStatusKeys(prefs);
  return orderedStatusKeys(prefs).map((key) => ({ key, enabled: on.includes(key) }));
}

/** Every page, switched-on ones first in the user's order. */
export function orderedPageKeys(prefs) {
  const p = withDefaults(prefs);
  const order = p.pageOrder.filter((key) => PAGE_MANIFEST.some((page) => page.key === key));
  for (const page of PAGE_MANIFEST) if (!order.includes(page.key)) order.push(page.key);
  return order;
}

/**
 * Which background services should be running right now.
 *
 * A service runs when its page is on, or when a pill status item needs it —
 * that second clause is why switching the weather page off does not blank the
 * temperature in the pill. Anything not returned here is stopped, so a page
 * the user turned off costs nothing in the background.
 */
export function enabledServices(prefs) {
  const p = withDefaults(prefs);
  const running = new Set();

  for (const page of PAGE_MANIFEST) {
    if (p.pages[page.key] === false) continue;
    if (page.service) running.add(page.service);
    for (const extra of page.alsoServices ?? []) running.add(extra);
  }

  const status = enabledStatusKeys(p);
  for (const item of STATUS_MANIFEST) {
    if (status.includes(item.key) && item.service) running.add(item.service);
  }

  /*
   * A page can be visible while its own feature is switched off — a focus page
   * you can look at without a timer running. Those switches live inside the
   * group, so they subtract here rather than replacing the page switch.
   */
  if (p.focus.enabled === false) running.delete('focus');
  if (p.health.enabled === false) running.delete('health');
  if (p.todo.enabled === false) running.delete('todo');
  if (p.shelf.enabled === false) running.delete('shelf');
  if (p.shelf.clipboard === false) running.delete('clipboard');

  return running;
}

/** Which live workers need refresh/reschedule work after a preference change. */
export function serviceChanges(before, after) {
  const previous = withDefaults(before);
  const next = withDefaults(after);
  const was = enabledServices(previous);
  const now = enabledServices(next);
  const weatherWas = was.has('weather');
  const weatherIs = now.has('weather');
  const quotaWas = was.has('quota');
  const quotaIs = now.has('quota');
  return {
    weatherRefresh:
      weatherWas &&
      weatherIs &&
      (previous.weather.city !== next.weather.city ||
        previous.weather.autoLocate !== next.weather.autoLocate),
    weatherReschedule:
      weatherWas &&
      weatherIs &&
      Number(previous.weather.intervalMin) !== Number(next.weather.intervalMin),
    quotaReschedule:
      quotaWas &&
      quotaIs &&
      Number(previous.quota.intervalMin) !== Number(next.quota.intervalMin),
  };
}

/* --------------------------------------------------------------- devices */

/**
 * How many device names 置顶 can hold.
 *
 * Main enforces the cap, the island and the settings page both draw it, so the
 * number lives here once instead of being copied into three renderers.
 */
export const DEVICE_PIN_LIMIT = 3;

/**
 * Toggle one device in the pin list, never past the cap.
 *
 * Pinning a fourth device is a no-op, not a silent eviction of the first: the
 * user asked for one more row, and reordering rows they did not touch is the
 * same failure as ignoring the click, only harder to notice.
 */
export function togglePinnedDevice(pinned, name, limit = DEVICE_PIN_LIMIT) {
  const list = (Array.isArray(pinned) ? pinned : []).filter((item) => typeof item === 'string' && item);
  const key = typeof name === 'string' ? name : '';
  if (!key) return list;
  if (list.includes(key)) return list.filter((item) => item !== key);
  if (list.length >= limit) return list;
  return list.concat(key);
}

/**
 * The rows in the order a person dragged them, pinned first.
 *
 * Pinning and ordering answer two different questions ("always show this one on
 * top" vs "this is the order I like"), so they compose instead of competing: a
 * pin lifts a row above the rest, and inside each block the dragged order is
 * what decides. A name the stored order has never seen falls to the end and
 * keeps the probe's own order, so a new device appears where it was found
 * rather than jumping to the top of a list nobody has touched.
 */
export function orderDevices(list, { pinned = [], order = [] } = {}) {
  const rows = (Array.isArray(list) ? list : []).filter((device) => device && typeof device.name === 'string' && device.name);
  const pinnedList = (Array.isArray(pinned) ? pinned : []).filter((name) => typeof name === 'string' && name);
  const pinRank = new Map(pinnedList.map((name, index) => [name, index]));
  const rank = new Map();
  for (const name of Array.isArray(order) ? order : []) {
    if (typeof name === 'string' && name && !rank.has(name)) rank.set(name, rank.size);
  }
  const probeRank = new Map(rows.map((device, index) => [device.name, index]));
  return rows.slice().sort((a, b) => {
    const aPinned = pinRank.has(a.name);
    const bPinned = pinRank.has(b.name);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned) return pinRank.get(a.name) - pinRank.get(b.name);
    const aRank = rank.has(a.name) ? rank.get(a.name) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b.name) ? rank.get(b.name) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return probeRank.get(a.name) - probeRank.get(b.name);
  });
}

/**
 * The rows an island may draw: every probed device the user did not hide.
 *
 * The probe keeps returning a hidden device (it is still paired); filtering is
 * a display decision made here, so un-hiding one puts its row back with its
 * pin and its level intact.
 */
export function visibleDevices(list, hidden) {
  const hide = new Set((Array.isArray(hidden) ? hidden : []).filter((name) => typeof name === 'string'));
  return (Array.isArray(list) ? list : []).filter(
    (device) => device && typeof device.name === 'string' && device.name && !hide.has(device.name),
  );
}

/**
 * A device's category, for the row's generic glyph.
 *
 * The probe reports a name, a status, a level and a source — no icon, no form
 * factor. The row therefore draws one of a handful of category marks. The name
 * decides the category; a name that matches nothing gets the neutral mark
 * rather than its first letter, which reads as an abbreviation nobody chose.
 */
const DEVICE_KIND_RULES = [
  ['audio', /耳机|耳麦|音箱|扬声器|麦克风|headset|headphone|earbud|airpod|buds|speaker|audio|hands[- ]?free|hfp/i],
  ['keyboard', /键盘|keyboard|kbd/i],
  ['mouse', /鼠标|mouse|trackball|trackpad/i],
  ['gamepad', /手柄|gamepad|controller|joystick|dualsense|dualshock|xbox/i],
  ['phone', /手机|phone|iphone|android|pixel|galaxy|xiaomi|redmi|huawei|honor|oppo|vivo|oneplus/i],
];

export function deviceKind(name) {
  const text = String(name ?? '');
  for (const [kind, pattern] of DEVICE_KIND_RULES) if (pattern.test(text)) return kind;
  return 'other';
}

/** The page a preference path belongs to, for grouping an audit. */
export function pageOfPath(path) {
  const head = String(path).split('.')[0];
  const map = {
    displayMode: 'general',
    launchAtLogin: 'general',
    theme: 'appearance',
    skin: 'appearance',
    blur: 'appearance',
    glassBackdrop: 'appearance',
    uiScale: 'appearance',
    radius: 'appearance',
    font: 'appearance',
    weight: 'appearance',
    fontSize: 'appearance',
    motion: 'appearance',
    reduceMotion: 'appearance',
    islandWidth: 'layout',
    pillHeight: 'layout',
    islandTopGap: 'layout',
    sizeKey: 'layout',
    pinned: 'layout',
    clickThrough: 'layout',
    displayId: 'layout',
    avoidTopBar: 'appearance',
    oledShift: 'appearance',
    timeFormat: 'appearance',
    hideFullscreen: 'behavior',
    idleMoods: 'cast',
    avoidEnabled: 'behavior',
    avoidBrowsers: 'behavior',
    avoidApps: 'behavior',
    trayIcon: 'behavior',
    hotkey: 'behavior',
    wheelPaging: 'behavior',
    blurCollapse: 'behavior',
    hoverOpenDelay: 'behavior',
    hoverCloseDelay: 'behavior',
    hoverAutoHide: 'behavior',
    statusItems: 'pages',
    pages: 'pages',
    pageOrder: 'pages',
    defaultPage: 'pages',
    weather: 'weather',
    music: 'music',
    focus: 'focus',
    health: 'focus',
    todo: 'todo',
    shelf: 'todo',
    calendar: 'comm',
    quota: 'quota',
    devices: 'devices',
    notify: 'comm',
    updatePrompt: 'general',
    messenger: 'comm',
    mailProvider: 'comm',
    mail: 'comm',
  };
  return map[head] ?? 'general';
}

/* ----------------------------------------------------------------- audit */

/**
 * Where each preference is actually read, and what happens when it changes.
 *
 * This table is the audit: a key with no entry here is a switch that writes a
 * file and changes nothing, which is exactly what this file exists to stop.
 * `scope` says which process acts on it — 'main' means a window, a service or
 * the tray reads it in the main process; 'renderer' means the island or the
 * settings window reads it through prefs. A key that only ever appears in a
 * settings row has neither and must be deleted.
 *
 * `live` records whether an already-running window picks the new value up
 * without a restart.
 */
export const CONSUMERS = {
  lang: { scope: 'renderer', at: 'settings.js applyChrome() → documentElement.lang · T()', live: true, note: '设置窗口界面语言；本批只影响设置窗口' },
  cast: { scope: 'main', at: 'main.js setCast() · island:cast · cast:changed', live: true, note: '当前角色' },
  position: { scope: 'main', at: 'main.js createWindow() / savePrefs()', live: true, note: '非控件：球拖拽后自动写入' },
  displayMode: { scope: 'main', at: 'main.js applyForm()', live: true, note: '岛 / 球 / 双形态' },
  onboardingDone: { scope: 'main', at: 'main/onboarding.js maybeShow() · finish()', live: true, note: '非控件：首次启动引导完成或跳过后写入' },
  launchAtLogin: { scope: 'main', at: 'main/settings.js app.setLoginItemSettings', live: true },

  theme: { scope: 'renderer', at: 'island.js resolveTheme() · settings.js applyChrome()', live: true },
  skin: { scope: 'renderer', at: 'island.js applyPrefs() → body[data-skin]', live: true },
  blur: { scope: 'renderer', at: 'island.js applyPrefs() → body[data-blur]', live: true },
  glassBackdrop: { scope: 'renderer', at: 'island.js requestGlass() → island:backdrop · main.js 关闭时拒抓', live: true, note: '抓一次屏幕作模糊背景，只在本机内存' },
  uiScale: { scope: 'renderer', at: 'island.js --ui-scale · settings.js zoom', live: true },
  radius: { scope: 'renderer', at: 'island.js --radius', live: true },
  font: { scope: 'renderer', at: 'island.js --ui-font / settings.js applyChrome', live: true },
  weight: { scope: 'renderer', at: 'island.js --ui-weight / settings.js applyChrome', live: true },
  fontSize: { scope: 'renderer', at: 'island.js --ui-size', live: true },
  motion: { scope: 'renderer', at: 'island.js applyPrefs() → body[data-motion]', live: true },
  reduceMotion: { scope: 'renderer', at: 'island.js applyPrefs() → body[data-reduce-motion]', live: true, note: '关掉呼吸与跳动，保留状态变化' },

  islandWidth: { scope: 'renderer', at: 'island.js --island-w', live: true },
  pillHeight: { scope: 'renderer', at: 'island.js --pill-h', live: true },
  islandTopGap: { scope: 'main', at: 'main/island.js place() · topEdge()', live: true },
  sizeKey: { scope: 'main', at: 'main.js createWindow() SIZES[sizeKey]', live: false, note: '改尺寸需要重开球窗口' },
  pinned: { scope: 'main', at: 'main.js createWindow() alwaysOnTop · applyMainPrefs()', live: true },
  clickThrough: { scope: 'main', at: 'main/island.js · main.js setIgnoreMouseEvents', live: true },
  displayId: { scope: 'main', at: 'main/island.js place()', live: true },
  avoidTopBar: { scope: 'main', at: 'main/island.js place()', live: true },
  oledShift: { scope: 'main', at: 'main/island.js startOledShift()', live: true },

  timeFormat: { scope: 'renderer', at: 'island.js applyPrefs() → timeFormat24', live: true },
  hideFullscreen: { scope: 'main', at: 'main.js applyMainPrefs() fullscreen.start/stop', live: true },
  avoidEnabled: { scope: 'main', at: 'main.js applyAvoidanceWatch() avoidance.start/stop', live: true },
  avoidBrowsers: { scope: 'main', at: 'main/services/avoidance.js update() → avoidance.ps1 浏览器名单', live: true },
  avoidApps: { scope: 'main', at: 'main/services/avoidance.js update() → avoidance.ps1 owner 链匹配', live: true, note: '按 exe 完整路径匹配' },
  mediaEmotion: { scope: 'main', at: 'main.js applyEmotionWatch() → main/media-emotion.js', live: true, note: '媒体情绪映射总开关' },
  idleMoods: { scope: 'main', at: 'main.js createIdleMoods() · main/idle-mood.js', live: true, note: '空闲小动作：待机时借表情的时钟' },
  trayIcon: { scope: 'main', at: 'main.js createTray()', live: true },
  hotkey: { scope: 'main', at: 'main.js applyMainPrefs() globalShortcut', live: true },
  wheelPaging: { scope: 'renderer', at: 'island.js wheel handler', live: true },
  blurCollapse: { scope: 'renderer', at: 'island.js blur handler', live: true },
  hoverOpenDelay: { scope: 'renderer', at: 'island.js hover watcher', live: true },
  hoverCloseDelay: { scope: 'renderer', at: 'island.js hover watcher', live: true },
  hoverAutoHide: { scope: 'renderer', at: 'island.js hover watcher', live: true },

  statusItems: { scope: 'renderer', at: 'island.js renderPillStatus() / settings.js residencyCard()', live: true },
  pages: { scope: 'main', at: 'main.js applyServicePlan() · island.js enabledPages()', live: true, note: '同时控制渲染入口与后台服务' },
  pageOrder: { scope: 'renderer', at: 'island.js enabledPages()', live: true },
  defaultPage: { scope: 'renderer', at: 'island.js initial page selection', live: false, note: '下次打开生效' },

  'weather.city': { scope: 'main', at: 'main.js refreshWeather()', live: true },
  'weather.unit': { scope: 'renderer', at: 'island.js renderPillStatus() / weather card', live: true },
  'weather.intervalMin': { scope: 'main', at: 'main.js scheduleWeather()', live: true },
  'weather.autoLocate': { scope: 'main', at: 'main.js refreshWeather()', live: true },

  'music.lyrics': { scope: 'renderer', at: 'island.js music page', live: true },
  'music.islandLyrics': { scope: 'renderer', at: 'island.js renderPillStatus()', live: true },
  'music.offset': { scope: 'renderer', at: 'island.js lyric sync', live: true },

  'focus.enabled': { scope: 'main', at: 'services/focus.js prefs().enabled', live: true },
  'focus.work': { scope: 'main', at: 'services/focus.js prefs().work', live: true },
  'focus.rest': { scope: 'main', at: 'services/focus.js prefs().rest', live: true },
  'health.enabled': { scope: 'main', at: 'services/health.js', live: true },
  'health.waterMin': { scope: 'main', at: 'services/health.js', live: true },
  'health.standMin': { scope: 'main', at: 'services/health.js', live: true },

  'todo.enabled': { scope: 'main', at: 'services/todo.js', live: true },
  'todo.notify': { scope: 'main', at: 'services/todo.js', live: true },
  'shelf.enabled': { scope: 'renderer', at: 'island.js shelf page', live: true },
  'shelf.dir': { scope: 'main', at: 'services/shelf.js dir()', live: true, note: '留空用默认的资料库/shelf' },
  'shelf.clipboard': { scope: 'main', at: 'main.js applyServicePlan() clipboardHistory', live: true, note: '默认关；关闭时清掉未固定条目' },

  'devices.showBattery': { scope: 'renderer', at: 'island.js devicesPage() · settings.js pageDevices() → 电量条与百分比', live: true, note: '关掉后只画名称与连接状态' },
  'devices.pinned': { scope: 'renderer', at: 'island.js devicesPage() · settings.js pageDevices() · main.js island:devices-pin / settings:devices-pin', live: true, note: '最多 3 台；岛设备页行尾或设置·设备页星标切换' },
  'devices.order': { scope: 'renderer', at: 'island.js devicesPage() → orderDevices() · settings.js pageDevices() 拖动', live: true, note: '设置·设备页拖动出来的整表顺序；置顶的行仍排在最前' },
  'devices.hidden': { scope: 'renderer', at: 'island.js devicesPage() → visibleDevices() · settings.js pageDevices() 行的显示开关', live: true, note: '隐藏的设备不在岛设备页出现，设置页仍列出' },

  'calendar.leadMin': { scope: 'main', at: 'services/calendar.js lead time', live: true },
  'calendar.fromMail': { scope: 'main', at: 'services/calendar.js ics import', live: true },

  'quota.provider': { scope: 'renderer', at: 'settings.js add-account form default', live: true },
  'quota.intervalMin': { scope: 'main', at: 'services/quota.js reschedule', live: true },
  'quota.alert': { scope: 'main', at: 'services/quota.js low-balance check', live: true },
  'quota.threshold': { scope: 'main', at: 'services/quota.js low-balance check', live: true },
  mailProvider: { scope: 'renderer', at: 'settings.js mail add form', live: true },

  'notify.system': { scope: 'main', at: 'services/notify.js', live: true },
  'notify.body': { scope: 'main', at: 'services/notify.js', live: true },
  'updatePrompt.snoozeUntil': { scope: 'main', at: 'main/update-prompt.js snoozeUntil() · snooze()', live: true, note: '「稍后」写入：24 小时内不再弹更新卡' },

  'messenger.wechat': { scope: 'main', at: 'services/messenger.js', live: true },
  'messenger.qq': { scope: 'main', at: 'services/messenger.js', live: true },
  'messenger.wecom': { scope: 'main', at: 'services/messenger.js', live: true },
  'messenger.feishu': { scope: 'main', at: 'services/messenger.js', live: true },
  'messenger.dingtalk': { scope: 'main', at: 'services/messenger.js', live: true },
};
