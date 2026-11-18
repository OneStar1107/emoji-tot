/**
 * EmojiTot as a desktop pet.
 *
 * A frameless, transparent, always-on-top window holding one character, plus
 * a tray icon and a context menu. Three behaviours matter:
 *
 * 1. **Edge docking.** Drag it to a screen edge and it tucks away, leaving a
 *    sliver; hover the sliver and it comes back out.
 * 2. **Click-through.** The window is mostly transparent, so by default it
 *    lets clicks pass to whatever is underneath; hovering the ball itself
 *    restores normal input.
 * 3. **Agent linkage.** It can watch a coding agent's status file and react —
 *    the same file-watching contract the protocol already uses.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
// Vendored, not resolved: a workspace link does not survive packaging.
const { parseAgentMessage } = require('./vendor/protocol/index.js');
// Shared, because the island and the settings window write the same file.
const { userDir, statePath, prefsPath, readJson, writeJson, readPrefs, writePrefs } = require('./main/paths');
const island = require('./main/island');
const settings = require('./main/settings');
const battery = require('./main/services/battery');
const weather = require('./main/services/weather');
const media = require('./main/services/media');
const lyrics = require('./main/services/lyrics');
const focus = require('./main/services/focus');
const health = require('./main/services/health');
const todo = require('./main/services/todo');
const shelf = require('./main/services/shelf');
const quota = require('./main/services/quota');
const mail = require('./main/services/mail');
const calendar = require('./main/services/calendar');

/** Six steps, from a 64px dot to a 220px mascot. */
const SIZES = { xs: 64, sm: 88, md: 120, lg: 160, xl: 220 };
const SIZE_ORDER = Object.keys(SIZES);

/** Room above the ball for the speech bubble; the window is taller than the ball. */
const BUBBLE_SPACE = 46;

/**
 * Breathing room around the ball for its own animation.
 *
 * The ball hops, spins and squashes; drawn into a window exactly its own size,
 * any of those motions gets clipped by the window edge and the silhouette
 * stops being a circle. The margin is part of the window, not padding inside
 * it, so a docked ball is clipped by the *screen* — a clean arc — and never by
 * a box.
 */
const BALL_PAD = 16;

/**
 * Room on every side for the speech bubble.
 *
 * The bubble belongs beside the ball, and which side depends on where the
 * ball is docked: docked left, it goes on the three-o'clock side; docked
 * right, nine o'clock. A window exactly the ball's size could not show that,
 * so the window is padded on all four sides. It is transparent and
 * click-through, so the extra area is invisible and harmless.
 */
const BUBBLE_ROOM = 88;

/** How close to an edge counts as "dock here", and how much of the ball stays visible. */
const EDGE_SNAP = 8;
const PEEK_RATIO = 0.5;

/** Ids worth a menu entry. The full table lives in the protocol package. */
const DEMO_STATES = [
  ['02', '待机'],
  ['10', '开心'],
  ['30', '思考中'],
  ['32', '处理中'],
  ['33', '任务完成'],
  ['34', '出错'],
  ['50', '通知'],
];

/**
 * Agents whose status file can drive the pet.
 *
 * Each entry is a predicate plus a mapping from the file's own vocabulary to
 * a protocol id, so adding an agent is data, not code. The DeepSeek Harness
 * entry is live in this project's own development; Claude Code and Codex are
 * wired the same way for the files they publish.
 */
const AGENT_SOURCES = [
  {
    id: 'dsh',
    label: 'DeepSeek Harness',
    file: () => path.join(os.homedir(), '.dsh', 'dsh-progress.json'),
    map: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      if (raw.status === 'blocked') return '34';
      if (raw.status === 'done') return '33';
      if (raw.status === 'running') return raw.pct >= 100 ? '33' : '32';
      return null;
    },
  },
  {
    id: 'claude',
    label: 'Claude Code',
    file: () => path.join(os.homedir(), '.claude', 'emojitot-state.json'),
    map: (raw) => (raw && typeof raw.emotionId === 'string' ? raw.emotionId : null),
  },
  {
    id: 'codex',
    label: 'Codex',
    file: () => path.join(os.homedir(), '.codex', 'emojitot-state.json'),
    map: (raw) => (raw && typeof raw.emotionId === 'string' ? raw.emotionId : null),
  },
];

let win = null;
let tray = null;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let sizeKey = 'md';
let pinned = true;
let lastStateMtime = 0;
/**
 * Docking is three pieces of state, not a string.
 *
 * `side` is where it tucked; `open` is whether the ball has slid back out;
 * `armed` is whether the pointer has ever been away since the last dock. The
 * last one matters: a drop happens with the cursor on the edge, so without it
 * the hover watcher opens the ball again the instant it was put away —
 * which is exactly what the first version did.
 */
let dockSide = null;
let dockOpen = false;
let dockArmed = false;
let hoverTimer = null;
let pointerTimer = null;
let clickThrough = true;
let agentWatch = {};
/** The cast member the pet wears; persisted in prefs.json. */
let castId = 'tot';
/** The engine's cast table, loaded as ESM from the vendored copy. */
let CORE = null;

async function loadCore() {
  try {
    const { pathToFileURL } = require('url');
    const file = path.join(__dirname, 'renderer', 'vendor', 'core', 'index.js');
    CORE = await import(pathToFileURL(file).href);
  } catch (error) {
    CORE = null;
    console.error('[emojitot] cast table unavailable:', error.message);
  }
}

function setCast(id) {
  castId = id;
  writeJson(prefsPath(), { ...readJson(prefsPath(), {}), cast: id });
  if (win) win.webContents.send('cast:changed', id);
  refreshMenus();
}

/** Which form is on screen: the island, the ball, or both. */
let form = 'island';
let both = false;

const showBall = () => form === 'ball' || both;
const showIsland = () => form === 'island' || both;

function savePrefs() {
  const position = win && !win.isDestroyed() ? win.getPosition() : undefined;
  writePrefs({
    sizeKey,
    pinned,
    clickThrough,
    ...(position && !dockSide ? { position: { x: position[0], y: position[1] } } : {}),
  });
}

function workArea() {
  return screen.getPrimaryDisplay().workAreaSize;
}

function outerSize(dim) {
  return dim + (BALL_PAD + BUBBLE_ROOM) * 2;
}

function defaultPosition(dim) {
  const area = workArea();
  const outer = outerSize(dim);
  return { x: area.width - outer - 8, y: area.height - outer - 8 };
}

/* ---------------------------------------------------------------- window */

function createWindow() {
  const prefs = readJson(prefsPath(), {});
  sizeKey = SIZES[prefs.sizeKey] ? prefs.sizeKey : 'md';
  pinned = prefs.pinned !== false;
  clickThrough = prefs.clickThrough !== false;
  const dim = SIZES[sizeKey];
  const pos = prefs.position ?? defaultPosition(dim);

  win = new BrowserWindow({
    width: dim + (BALL_PAD + BUBBLE_ROOM) * 2,
    height: dim + (BALL_PAD + BUBBLE_ROOM) * 2,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: pinned,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(pinned, 'floating');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    // The ball may be the off-form: create the window, keep it hidden.
    if (showBall()) win.showInactive();
    // Start transparent to clicks: the window is mostly empty space.
    setClickThrough(clickThrough);
  });
  win.on('moved', () => {
    if (!dockSide) savePrefs();
  });
  win.on('closed', () => {
    win = null;
  });
}

/**
 * Clicks go through the window by default.
 *
 * The decision is made by polling the cursor, not by listening in the page.
 * `setIgnoreMouseEvents(true, { forward: true })}` promises to keep delivering
 * mousemove, but it did not deliver any here — the page never learned the
 * pointer was on the ball, so the ball could neither be clicked nor dragged.
 * Polling the cursor is one call every 60 ms and behaves the same on both
 * platforms.
 */
function setClickThrough(on) {
  if (!win || win.isDestroyed()) return;
  clickThrough = on;
  win.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
}

function startPointerWatch() {
  clearInterval(pointerTimer);
  pointerTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || dockOpen === undefined) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const dim = SIZES[sizeKey];
    // The ball sits at the centre of the window, with equal room all round.
    const cx = wx + outerSize(dim) / 2;
    const cy = wy + outerSize(dim) / 2;
    const onBall = Math.hypot(cursor.x - cx, cursor.y - cy) <= dim / 2;
    if (onBall === !clickThrough) return;
    setClickThrough(!onBall);
  }, 60);
}

function setSize(key) {
  if (!SIZES[key] || !win) return;
  sizeKey = key;
  const dim = SIZES[key];
  const [x, y] = win.getPosition();
  const outer = dim + (BALL_PAD + BUBBLE_ROOM) * 2;
  win.setBounds({ x, y, width: outer, height: outer });
  win.webContents.send('size:changed', dim);
  savePrefs();
  refreshMenus();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.showInactive();
    if (dockSide) undock();
  }
  refreshMenus();
}

/* ------------------------------------------------------------ edge dock */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Tuck the window against one of four edges, leaving a sliver on screen.
 *
 * The ball always stays a whole circle: a docked window is clamped on the axis
 * it did not dock to, so the only thing that ever leaves the screen is the
 * half facing the edge. Without that clamp a ball parked near the bottom lost
 * its chin to the taskbar, which reads as a broken circle rather than a tucked
 * one.
 *
 * `peek` is how much of the ball stays grabbable. The window is wider than the
 * ball (the bubble's room), so the offset is measured from the ball's centre,
 * not the window's edge.
 */
function dock(side) {
  if (!win) return;
  const dim = SIZES[sizeKey];
  const outer = outerSize(dim);
  const peek = Math.round(dim * PEEK_RATIO);
  const area = workArea();
  const [wx, wy] = win.getPosition();
  const centred = (outer - dim) / 2;

  let x = wx;
  let y = wy;
  if (side === 'left') {
    x = peek - outer / 2 - dim / 2;
    y = clamp(wy, 0, Math.max(0, area.height - outer));
  } else if (side === 'right') {
    x = area.width - peek - outer / 2 + dim / 2;
    y = clamp(wy, 0, Math.max(0, area.height - outer));
  } else if (side === 'top') {
    y = peek - outer / 2 - dim / 2;
    x = clamp(wx, 0, Math.max(0, area.width - outer));
  } else {
    y = area.height - peek - outer / 2 + dim / 2;
    x = clamp(wx, 0, Math.max(0, area.width - outer));
  }
  void centred;

  dockSide = side;
  dockOpen = false;
  dockArmed = false;
  win.setPosition(Math.round(x), Math.round(y));
  startHoverWatch();
  notifyDock();
  refreshMenus();
}

/** Put the whole ball back on screen, centred on the docked axis. */
function undock() {
  if (!win || !dockSide) return;
  const dim = SIZES[sizeKey];
  const outer = outerSize(dim);
  const area = workArea();
  const [wx, wy] = win.getPosition();
  const side = dockSide;

  let x = wx;
  let y = wy;
  if (side === 'left') x = -(outer - dim) / 2;
  else if (side === 'right') x = area.width - (outer + dim) / 2;
  else if (side === 'top') y = -(outer - dim) / 2;
  else y = area.height - (outer + dim) / 2;

  /*
   * Deliberately NOT clamped to 0: the window is wider than the ball, so a
   * ball sitting exactly on the screen edge needs the window to start off
   * screen. Clamping to 0 pushed the pet 104px inward, which looked like it
   * had jumped away from the edge it was just tucked into.
   */
  x = Math.round(x);
  y = Math.round(y);

  dockSide = null;
  dockOpen = false;
  dockArmed = false;
  win.setPosition(Math.round(x), Math.round(y));
  stopHoverWatch();
  notifyDock();
  savePrefs();
  refreshMenus();
}

/** The sliver of ball left on screen, in screen coordinates. */
function sliverRect(dim) {
  const outer = outerSize(dim);
  const area = workArea();
  const [wx, wy] = win.getPosition();
  const peek = Math.round(dim * PEEK_RATIO);
  const ballLeft = wx + (outer - dim) / 2;
  const ballTop = wy + (outer - dim) / 2;
  if (dockSide === 'left') return { x: 0, y: ballTop, w: peek, h: dim };
  if (dockSide === 'right') return { x: area.width - peek, y: ballTop, w: peek, h: dim };
  if (dockSide === 'top') return { x: ballLeft, y: 0, w: dim, h: peek };
  return { x: ballLeft, y: area.height - peek, w: dim, h: peek };
}

/**
 * Where an open (fully visible) ball sits, given the docked side.
 *
 * Deliberately not clamped to 0 on the docked axis: the window is wider than
 * the ball, so a ball sitting exactly on the screen edge needs the window to
 * start off screen. Clamping it pushed the pet 104px inward the moment it
 * opened, which looked like it had jumped away from the edge.
 */
function openPosition(dim) {
  const outer = outerSize(dim);
  const area = workArea();
  const [wx, wy] = win.getPosition();
  const clampY = (v) => clamp(v, 0, Math.max(0, area.height - outer));
  const clampX = (v) => clamp(v, 0, Math.max(0, area.width - outer));
  if (dockSide === 'left') return { x: -(outer - dim) / 2, y: clampY(wy) };
  if (dockSide === 'right') return { x: area.width - (outer + dim) / 2, y: clampY(wy) };
  if (dockSide === 'top') return { x: clampX(wx), y: -(outer - dim) / 2 };
  return { x: clampX(wx), y: area.height - (outer + dim) / 2 };
}

/** Where a tucked ball sits: the same as the closed dock position. */
function closedPosition(dim) {
  const outer = outerSize(dim);
  const area = workArea();
  const peek = Math.round(dim * PEEK_RATIO);
  const [wx, wy] = win.getPosition();
  if (dockSide === 'left') return { x: peek - outer / 2 - dim / 2, y: clamp(wy, 0, Math.max(0, area.height - outer)) };
  if (dockSide === 'right') return { x: area.width - peek - outer / 2 + dim / 2, y: clamp(wy, 0, Math.max(0, area.height - outer)) };
  if (dockSide === 'top') return { x: clamp(wx, 0, Math.max(0, area.width - outer)), y: peek - outer / 2 - dim / 2 };
  return { x: clamp(wx, 0, Math.max(0, area.width - outer)), y: area.height - peek - outer / 2 + dim / 2 };
}

/**
 * Watch the cursor instead of the window.
 *
 * While docked the window is partly off-screen, and a window that ignores
 * mouse events receives no enter/leave to rely on. Polling the cursor is the
 * one approach that works the same on both platforms.
 */
function startHoverWatch() {
  stopHoverWatch();
  hoverTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !dockSide) return;
    const dim = SIZES[sizeKey];
    const cursor = screen.getCursorScreenPoint();
    const rect = sliverRect(dim);
    const overSliver =
      cursor.x >= rect.x &&
      cursor.x <= rect.x + rect.w &&
      cursor.y >= rect.y &&
      cursor.y <= rect.y + rect.h;

    if (!overSliver) {
      dockArmed = true;
      if (dockOpen) {
        dockOpen = false;
        const closed = closedPosition(dim);
        win.setPosition(Math.round(closed.x), Math.round(closed.y));
        notifyDock();
      }
      return;
    }
    if (!dockArmed) return;
    if (dockOpen) return;
    dockOpen = true;
    const open = openPosition(dim);
    win.setPosition(Math.round(open.x), Math.round(open.y));
    notifyDock();
  }, 140);
}

function stopHoverWatch() {
  clearInterval(hoverTimer);
  hoverTimer = null;
}

/* ----------------------------------------------------------------- drag */

function startDrag(point) {
  if (!win) return;
  // A second start while a drag is live would recompute the offset from a
  // window that has already moved, which makes the ball jump and, pressed
  // long enough, look like it keeps growing. One drag at a time.
  if (dragTimer) return;
  const [wx, wy] = win.getPosition();
  dragOffset = { x: point.x - wx, y: point.y - wy };
  clearInterval(dragTimer);
  /*
   * setBounds, not setPosition.
   *
   * A plain setPosition lets the OS pick the size when the window crosses a
   * monitor with a different scale factor, and a resize makes the renderer
   * recompute --ball-size from the new innerWidth — the ball then grows and
   * never shrinks back. Pinning the width and height on every tick keeps the
   * ball the size the user chose.
   */
  const outer = outerSize(SIZES[sizeKey]);
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    win.setBounds({
      x: Math.round(cursor.x - dragOffset.x),
      y: Math.round(cursor.y - dragOffset.y),
      width: outer,
      height: outer,
    });
  }, 16);
}

function endDrag() {
  clearInterval(dragTimer);
  dragTimer = null;
  if (!win) return;
  const [x] = win.getPosition();
  const dim = SIZES[sizeKey];
  const area = workArea();
  if (x <= EDGE_SNAP) dock('left');
  else if (x + dim >= area.width - EDGE_SNAP) dock('right');
  else {
    dockSide = null;
    dockOpen = false;
    dockArmed = false;
    stopHoverWatch();
    savePrefs();
  }
  refreshMenus();
}

/* -------------------------------------------------------------- linkage */

/**
 * The one way a state reaches the character.
 *
 * Everything that produces a state — the state file, the menu, an agent
 * source — goes through the protocol parser here, so the renderer only ever
 * receives a resolved `{ emotionId, state, tips? }`. Sending the raw
 * `{ emotionId }` left the face unchanged, because the renderer speaks in
 * states.
 */
function emitState(payload) {
  if (!win || win.isDestroyed()) return;
  const message = parseAgentMessage(payload);
  if (!message) return;
  try {
    win.webContents.send('state:apply', message);
  } catch {
    // The window can be between load and ready; dropping one frame beats
    // throwing inside a polling timer, which would stop the poll for good.
  }
}

/** Tell the renderer which edge the ball is on, so the bubble grows inward. */
function notifyDock() {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('dock:changed', dockSide ? (dockOpen ? `${dockSide}-open` : dockSide) : null);
  } catch {
    /* same as above */
  }
}

function applyStateFile() {
  if (!win || win.isDestroyed()) return;
  let stat;
  try {
    stat = fs.statSync(statePath());
  } catch {
    return;
  }
  if (stat.mtimeMs === lastStateMtime) return;
  lastStateMtime = stat.mtimeMs;
  let raw = '';
  try {
    raw = fs.readFileSync(statePath(), 'utf8');
  } catch {
    return;
  }
  // The file is the wire: a bare id, a JSON string or a JSON object all work.
  emitState(raw);
}

function ensureStateFile() {
  fs.mkdirSync(userDir(), { recursive: true });
  if (!fs.existsSync(statePath())) {
    writeJson(statePath(), { emotionId: '02', tips: '把 emotionId 写进这个文件，球就会跟着变' });
  }
  fs.watchFile(statePath(), { interval: 400 }, applyStateFile);
  applyStateFile();
}

/**
 * Follow coding agents.
 *
 * Each source is polled (cheaply: the OS caches the stat) and its own status
 * vocabulary is translated into a protocol id. Only enabled sources are
 * watched, and a source that never appears costs nothing.
 */
function startAgentWatch(prefs) {
  stopAgentWatch();
  for (const source of AGENT_SOURCES) {
    if (!prefs[`agent_${source.id}`]) continue;
    const file = source.file();
    let last = 0;
    agentWatch[source.id] = setInterval(() => {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        return;
      }
      if (stat.mtimeMs === last) return;
      last = stat.mtimeMs;
      // A file caught mid-write parses as null; leave `last` alone so the next
      // tick retries instead of waiting for the writer to touch it again.
      const raw = readJson(file, null);
      if (raw == null) return;
      const id = source.map(raw);
      if (id) emitState({ emotionId: id });
    }, 350);
  }
}

function stopAgentWatch() {
  for (const timer of Object.values(agentWatch)) clearInterval(timer);
  agentWatch = {};
}

/* ------------------------------------------------------------- forms */

/**
 * Switch the visible form, or both.
 *
 * The two windows are both created and only shown or hidden: a window that is
 * created on every switch would reload its page and lose the island's open
 * page, and creating both is cheaper than a stale state machine.
 */
function applyForm() {
  if (showIsland()) island.show();
  else island.hide();
  if (!win || win.isDestroyed()) return;
  if (showBall()) win.showInactive();
  else win.hide();
  refreshMenus();
}

function setForm(next) {
  form = next === 'ball' ? 'ball' : 'island';
  writePrefs({ form });
  applyForm();
}

function setBoth(on) {
  both = Boolean(on);
  writePrefs({ formBoth: both });
  applyForm();
}

/* ---------------------------------------------------------------- menus */

function buildMenu() {
  const prefs = readPrefs();
  return Menu.buildFromTemplate([
    {
      label: '形态',
      submenu: [
        { label: '灵动岛', type: 'radio', checked: form === 'island', click: () => setForm('island') },
        { label: '桌面球', type: 'radio', checked: form === 'ball', click: () => setForm('ball') },
        { type: 'separator' },
        { label: '两种同时显示', type: 'checkbox', checked: both, click: (item) => setBoth(item.checked) },
      ],
    },
    { label: '打开设置…', click: () => settings.create() },
    { label: island.isVisible() ? '隐藏灵动岛' : '显示灵动岛', click: () => { if (island.isVisible()) island.hide(); else island.show(); refreshMenus(); } },
    { type: 'separator' },
    { label: win && win.isVisible() ? '隐藏球球' : '显示球球', click: toggleVisible },
    { type: 'separator' },
    {
      label: '置顶',
      type: 'checkbox',
      checked: pinned,
      click: (item) => {
        pinned = item.checked;
        if (win) win.setAlwaysOnTop(pinned, 'floating');
        savePrefs();
      },
    },
    {
      label: '点击穿透',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => {
        setClickThrough(item.checked);
        savePrefs();
      },
    },
    {
      label: '贴边收起',
      submenu: [
        { label: '贴左边', click: () => dock('left') },
        { label: '贴右边', click: () => dock('right') },
        { label: '贴上边', click: () => dock('top') },
        { label: '贴下边', click: () => dock('bottom') },
        { type: 'separator' },
        { label: dockSide ? '收回桌面' : '收起', click: () => (dockSide ? undock() : dock('right')) },
      ],
    },
    {
      label: '尺寸',
      submenu: SIZE_ORDER.map((key) => ({
        label: `${key} · ${SIZES[key]}px`,
        type: 'radio',
        checked: key === sizeKey,
        click: () => setSize(key),
      })),
    },
    {
      label: '角色',
      submenu: CORE
        ? CORE.FAMILIES.map((family) => ({
            label: `${family.zh} · ${family.en}`,
            submenu: CORE.CAST.filter((member) => member.family === family.id).map((member) => ({
              label: member.name.zh,
              type: 'radio',
              checked: member.id === castId,
              click: () => setCast(member.id),
            })),
          }))
        : [{ label: '（角色表未加载）', enabled: false }],
    },
    {
      label: '试一个表情',
      submenu: DEMO_STATES.map(([id, label]) => ({
        label: `${id} · ${label}`,
        click: () => emitState({ emotionId: id }),
      })),
    },
    {
      label: 'Agent 联动',
      submenu: AGENT_SOURCES.map((source) => ({
        label: source.label,
        type: 'checkbox',
        checked: Boolean(prefs[`agent_${source.id}`]),
        click: (item) => {
          const next = { ...readJson(prefsPath(), {}), [`agent_${source.id}`]: item.checked };
          writeJson(prefsPath(), next);
          startAgentWatch(next);
          refreshMenus();
        },
      })),
    },
    { type: 'separator' },
    { label: '打开状态文件', click: () => shell.openPath(statePath()) },
    { label: '打开配置目录', click: () => shell.openPath(userDir()) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

function refreshMenus() {
  if (tray) tray.setContextMenu(buildMenu());
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('EmojiTot');
  tray.setContextMenu(buildMenu());
  tray.on('click', toggleVisible);
}

/* -------------------------------------------------------------- IPC glue */


/**
 * Read-only state, for tests only.
 *
 * Edge docking and click-through are invisible in the DOM: they are window
 * behaviour. Without a way to ask the main process what it actually did,
 * "verified" would mean "looks plausible". One handler, always registered —
 * it used to be declared twice (once unconditionally, once under --dev), and
 * the second registration crashed the whole app on `electron . --dev`.
 */
ipcMain.handle('debug:state', () => {
  if (!win || win.isDestroyed()) return null;
  return {
    clickThrough,
    pinned,
    docked: dockSide ? (dockOpen ? `${dockSide}-open` : dockSide) : null,
    dockOpen,
    cast: castId,
    size: SIZES[sizeKey],
    sizeKey,
    form,
    both,
    bounds: win.getBounds(),
    visible: win.isVisible(),
    workArea: workArea(),
    islandVisible: island.isVisible(),
  };
});
ipcMain.handle('debug:dock', (_event, side) => {
  if (side) dock(side);
  else undock();
  return { docked: dockSide, dockOpen };
});

ipcMain.on('drag:start', (_event, point) => {
  if (dockSide) undock();
  startDrag(point);
});
ipcMain.on('drag:end', endDrag);
ipcMain.on('pet:menu', () => {
  if (!win) return;
  buildMenu().popup({ window: win });
});
ipcMain.on('pet:action', () => {
  const actions = ['bounce', 'spin', 'burst'];
  const action = actions[Math.floor(Math.random() * actions.length)];
  if (win) win.webContents.send('state:action', action);
});
/** The renderer saw the pointer on the ball, or leave it. */




/* -------------------------------------------------------------- services */

let batteryTimer = null;
let weatherTimer = null;
let lastBattery = null;
let lastLyricTrack = '';
let lastLyrics = null;

/**
 * Battery is polled every 30s instead of watched: Windows has no push event
 * for charge level, and a 30s lag is invisible on a component that moves one
 * pixel per percent.
 */
function pushBattery() {
  battery.read((value) => {
    lastBattery = value;
    island.send('island:battery', value);
  });
}

async function refreshWeather() {
  const prefs = readPrefs();
  const city = (prefs.weather && prefs.weather.city) || '香港';
  try {
    const data = await weather.load(city);
    island.send('island:weather', data);
  } catch (error) {
    // Offline: the island keeps the last reading rather than an empty card.
    console.error('[weather] failed', city, error?.message ?? String(error));
  }
}

function startServices() {
  pushBattery();
  clearInterval(batteryTimer);
  batteryTimer = setInterval(pushBattery, 30000);
  refreshWeather();
  clearInterval(weatherTimer);
  weatherTimer = setInterval(refreshWeather, 15 * 60 * 1000);

  /*
   * Media: the bridge streams a line per second. The island only needs a frame
   * when something changed, and lyrics only when the track changed — a song
   * that is merely playing does not re-query LRCLIB every second.
   */
  media.onChange((state) => {
    island.send('island:media', state);
    const key = state.active ? state.title + '|' + state.artist : '';
    if (key === lastLyricTrack) return;
    lastLyricTrack = key;
    if (!state.active) {
      lastLyrics = null;
      island.send('island:lyrics', null);
      return;
    }
    lyrics.get(state).then((value) => {
      lastLyrics = value;
      island.send('island:lyrics', value);
    });
  });
  media.start();

  /*
   * Local services: focus, health, todos, shelf. Each one owns its own file,
   * and each pushes its snapshot on change — the island never polls.
   */
  focus.startService();
  health.startService();
  todo.startService();
  quota.startService();
  calendar.startService();
  mail.startService();
  focus.onChange((value) => island.send('island:focus', value));
  health.onChange((value) => island.send('island:health', value));
  todo.onChange((value) => island.send('island:todos', value));
  shelf.onChange((value) => island.send('island:shelf', value));
  quota.onChange((value) => island.send('island:quota', value));
  mail.onChange((value) => island.send('island:mail', value));
  // Same shape as the bootstrap payload: the page reads .events, and a bare
  // array here made every pushed update render as "nothing scheduled".
  calendar.onChange(() => island.send('island:calendar', { events: calendar.list(), upcoming: calendar.upcoming() }));

  ipcMain.handle('mail:get', () => mail.snapshot());
  ipcMain.handle('mail:do', async (_event, payload) => {
    const { action, data } = payload ?? {};
    if (action === 'add') mail.add(data);
    else if (action === 'remove') mail.remove(data?.id);
    else if (action === 'refresh') await mail.refresh(true);
    return mail.snapshot();
  });

  ipcMain.handle('calendar:get', () => ({ events: calendar.list(), upcoming: calendar.upcoming() }));
  ipcMain.handle('calendar:do', async (_event, payload) => {
    const { action, data } = payload ?? {};
    if (action === 'add') calendar.add(data);
    else if (action === 'remove') calendar.remove(data?.id);
    else if (action === 'import') calendar.importIcs(data?.ics);
    return { events: calendar.list(), upcoming: calendar.upcoming() };
  });

  ipcMain.handle('quota:get', () => quota.snapshot());
  ipcMain.handle('quota:do', async (_event, payload) => {
    const { action, data } = payload ?? {};
    if (action === 'add') quota.add(data?.name, data?.key);
    else if (action === 'remove') quota.remove(data?.id);
    else if (action === 'select') quota.select(data?.id);
    else if (action === 'refresh') await quota.refresh();
    return quota.snapshot();
  });

  ipcMain.handle('local:get', () => ({
    focus: focus.snapshot(),
    health: health.snapshot(),
    todos: todo.list(),
    shelf: shelf.list(),
  }));

  ipcMain.handle('local:do', async (_event, payload) => {
    const { service, action, data } = payload ?? {};
    if (service === 'focus') {
      if (action === 'start') focus.start();
      else if (action === 'pause') focus.pause();
      else if (action === 'resume') focus.resume();
      else if (action === 'stop') focus.stop();
      else if (action === 'skip') focus.skip();
      else if (action === 'restart') focus.restart();
    } else if (service === 'health') {
      if (action === 'drink') health.drink();
      else if (action === 'stand') health.stand();
    } else if (service === 'todo') {
      if (action === 'add') todo.add(data?.text, data?.due);
      else if (action === 'toggle') todo.toggle(data?.id);
      else if (action === 'remove') todo.remove(data?.id);
      else if (action === 'update') todo.update(data?.id, data ?? {});
      else if (action === 'clearDone') todo.clearDone();
    } else if (service === 'shelf') {
      if (action === 'add') shelf.add(data?.paths);
      else if (action === 'addBuffer') shelf.addBuffer(data?.name, data?.bytes);
      else if (action === 'open') await shelf.open(data?.name);
      else if (action === 'reveal') shelf.reveal(data?.name);
      else if (action === 'remove') shelf.remove(data?.name);
    }
    return {
      focus: focus.snapshot(),
      health: health.snapshot(),
      todos: todo.list(),
      shelf: shelf.list(),
    };
  });

  // The island asks once after it loads: pushing into a window that is still
  // parsing its page would drop the first frame.
  ipcMain.handle('island:bootstrap', () => ({
    battery: lastBattery,
    weather: weather.cached(),
    media: media.current(),
    lyrics: lastLyrics,
    focus: focus.snapshot(),
    health: health.snapshot(),
    todos: todo.list(),
    shelf: shelf.list(),
    quota: quota.snapshot(),
    mail: mail.snapshot(),
    calendar: { events: calendar.list(), upcoming: calendar.upcoming() },
    prefs: readPrefs(),
  }));

  ipcMain.handle('media:control', (_event, payload) => {
    if (payload && typeof payload === 'object') media.command(payload.kind, Number(payload.arg) || 0);
    return media.current();
  });
}

/* ------------------------------------------------------------------ boot */

app.setName('EmojiTot');

/*
 * Software rendering, deliberately. The window is one small SVG ball, so CPU
 * compositing costs nothing noticeable — while a GPU process that fails to
 * start is fatal before any window exists, which is common on remote sessions
 * and machines without a usable driver.
 */
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
/*
 * Chromium still spawns a GPU child process even with the two lines above, and
 * on Windows that child can fail to launch (error_code=18). After six attempts
 * it declares the GPU unusable and aborts before any window exists — the app
 * "does not open", with no error the user can act on. Running the GPU inside
 * the main process removes the child instead of hoping it starts, and keeps the
 * renderer sandbox intact, which `--no-sandbox` would not.
 */
app.commandLine.appendSwitch('in-process-gpu');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.showInactive();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide();
    /*
     * Direct network, no system proxy.
     *
     * Electron's main process shares Chromium's network stack, so a system
     * proxy that is set but not running makes every request time out — plain
     * Node reached the weather host instantly while the app could not. This
     * app talks to three known HTTPS hosts and no intranet, so bypassing the
     * proxy is both faster and independent of whatever VPN software is running.
     */
    try {
      await session.defaultSession.setProxy({ mode: 'direct' });
      console.log('[net] direct');
    } catch (error) {
      console.error('[net] proxy bypass failed', error?.message ?? error);
    }
    await loadCore();
    const stored = readPrefs();
    castId = typeof stored.cast === 'string' && stored.cast ? stored.cast : 'tot';
    form = stored.form === 'ball' ? 'ball' : 'island';
    both = Boolean(stored.formBoth);
    createWindow();
    if (win) win.webContents.on('did-finish-load', () => win.webContents.send('cast:changed', castId));
    settings.registerIpc();
    island.registerIpc();
    // The island page cannot hold data that was pushed before it listened.
    island.onLoaded(() => {
      pushBattery();
      refreshWeather();
      island.send('settings:changed', readPrefs());
    });
    createTray();
    ensureStateFile();
    startPointerWatch();
    startAgentWatch(stored);
    startServices();
    applyForm();
    // Any window may change prefs; the tray and the visible form follow.
    settings.setWeatherRefresher(refreshWeather);
    settings.onPrefs(() => {
      const next = readPrefs();
      form = next.form === 'ball' ? 'ball' : 'island';
      both = Boolean(next.formBoth);
      applyForm();
      island.send('settings:changed', next);
      refreshWeather();
    });
  });

  app.on('window-all-closed', () => {
    // The tray keeps the pet alive; quitting is an explicit menu action.
  });

  app.on('before-quit', () => {
    // The island and the settings window refuse close events; this is the one
    // flag that lets them go when the app is really quitting.
    globalThis.__emojitotQuitting = true;
    endDrag();
    stopHoverWatch();
    clearInterval(pointerTimer);
    clearInterval(batteryTimer);
    clearInterval(weatherTimer);
    media.stop();
    focus.stopService();
    health.stopService();
    todo.stopService();
    quota.stopService();
    mail.stopService();
    calendar.stopService();
    stopAgentWatch();
    fs.unwatchFile(statePath());
  });
}
