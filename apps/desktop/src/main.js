/**
 * EmojiBot as a desktop pet.
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
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
// Vendored, not resolved: a workspace link does not survive packaging.
const { parseAgentMessage } = require('./vendor/protocol/index.js');

/** Six steps, from a 64px dot to a 220px mascot. */
const SIZES = { xs: 64, sm: 88, md: 120, lg: 160, xl: 220 };
const SIZE_ORDER = Object.keys(SIZES);

/** Room above the ball for the speech bubble; the window is taller than the ball. */
const BUBBLE_SPACE = 46;

/** How close to an edge counts as "dock here", and how much of the ball stays visible. */
const EDGE_SNAP = 8;
const PEEK_RATIO = 0.3;

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
    file: () => path.join(os.homedir(), '.claude', 'emojibot-state.json'),
    map: (raw) => (raw && typeof raw.emotionId === 'string' ? raw.emotionId : null),
  },
  {
    id: 'codex',
    label: 'Codex',
    file: () => path.join(os.homedir(), '.codex', 'emojibot-state.json'),
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
let docked = null;
let hoverTimer = null;
let clickThrough = true;
let agentWatch = {};

const userDir = () => app.getPath('userData');
const statePath = () => path.join(userDir(), 'state.json');
const prefsPath = () => path.join(userDir(), 'prefs.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch {
    // A read-only profile is not worth crashing the pet over.
  }
}

function savePrefs() {
  const position = win && !win.isDestroyed() ? win.getPosition() : undefined;
  const prefs = readJson(prefsPath(), {});
  writeJson(prefsPath(), {
    ...prefs,
    sizeKey,
    pinned,
    clickThrough,
    ...(position && !docked ? { position: { x: position[0], y: position[1] } } : {}),
  });
}

function workArea() {
  return screen.getPrimaryDisplay().workAreaSize;
}

function defaultPosition(dim) {
  const area = workArea();
  return { x: area.width - dim - 48, y: area.height - dim - 96 };
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
    width: dim,
    height: dim + BUBBLE_SPACE,
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
    win.showInactive();
    // Start transparent to clicks: the window is mostly empty space.
    setClickThrough(clickThrough);
  });
  win.on('moved', () => {
    if (!docked) savePrefs();
  });
  win.on('closed', () => {
    win = null;
  });
}

/**
 * Clicks go through the window by default.
 *
 * `forward` keeps delivering mousemove to the page, which is the only way the
 * renderer can notice the pointer arriving on the ball and ask for real
 * input back.
 */
function setClickThrough(on) {
  if (!win || win.isDestroyed()) return;
  clickThrough = on;
  win.setIgnoreMouseEvents(on, { forward: true });
}

function setSize(key) {
  if (!SIZES[key] || !win) return;
  sizeKey = key;
  const dim = SIZES[key];
  const [x, y] = win.getPosition();
  win.setBounds({ x, y, width: dim, height: dim + BUBBLE_SPACE });
  win.webContents.send('size:changed', dim);
  savePrefs();
  refreshMenus();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.showInactive();
    if (docked) undock();
  }
  refreshMenus();
}

/* ------------------------------------------------------------ edge dock */

/**
 * Tuck the window against an edge, leaving a sliver on screen.
 *
 * The sliver is what the hover watcher looks for; anything more and the pet
 * covers desktop icons, anything less and it cannot be grabbed.
 */
function dock(side) {
  if (!win) return;
  const dim = SIZES[sizeKey];
  const [, y] = win.getPosition();
  const peek = Math.round(dim * PEEK_RATIO);
  const area = workArea();
  const x = side === 'left' ? -(dim - peek) : area.width - peek;
  docked = side;
  win.setPosition(x, y);
  startHoverWatch();
  refreshMenus();
}

function undock() {
  if (!win || !docked) return;
  const dim = SIZES[sizeKey];
  const area = workArea();
  const [, y] = win.getPosition();
  const x = docked === 'left' ? 0 : area.width - dim;
  docked = null;
  win.setPosition(x, y);
  stopHoverWatch();
  savePrefs();
  refreshMenus();
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
    if (!win || win.isDestroyed() || !docked) return;
    const cursor = screen.getCursorScreenPoint();
    const dim = SIZES[sizeKey];
    const area = workArea();
    const [wx, wy] = win.getPosition();
    const visibleLeft = docked === 'left' ? 0 : area.width - Math.round(dim * PEEK_RATIO);
    const visibleWidth = Math.round(dim * PEEK_RATIO);
    const overSliver =
      cursor.x >= visibleLeft &&
      cursor.x <= visibleLeft + visibleWidth &&
      cursor.y >= wy &&
      cursor.y <= wy + dim + BUBBLE_SPACE;
    // A docked sliver reopens on hover; the watcher is the only reliable
    // signal because a click-through window gets no enter/leave events.
    if (overSliver) {
      // Slide the whole ball back on screen, keeping it flush with the edge.
      const targetX = docked === 'left' ? 0 : area.width - dim;
      win.setPosition(targetX, wy);
      docked = `${docked}-open`;
    } else if (docked && docked.endsWith('-open')) {
      const side = docked.replace('-open', '');
      const backX = side === 'left' ? -(dim - Math.round(dim * PEEK_RATIO)) : area.width - Math.round(dim * PEEK_RATIO);
      win.setPosition(backX, wy);
      docked = side;
    }
  }, 140);
}

function stopHoverWatch() {
  clearInterval(hoverTimer);
  hoverTimer = null;
}

/* ----------------------------------------------------------------- drag */

function startDrag(point) {
  if (!win) return;
  const [wx, wy] = win.getPosition();
  dragOffset = { x: point.x - wx, y: point.y - wy };
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    win.setPosition(Math.round(cursor.x - dragOffset.x), Math.round(cursor.y - dragOffset.y));
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
    docked = null;
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
  if (message) win.webContents.send('state:apply', message);
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
      const id = source.map(readJson(file, null));
      if (id) emitState({ emotionId: id });
    }, 700);
  }
}

function stopAgentWatch() {
  for (const timer of Object.values(agentWatch)) clearInterval(timer);
  agentWatch = {};
}

/* ---------------------------------------------------------------- menus */

function buildMenu() {
  const prefs = readJson(prefsPath(), {});
  return Menu.buildFromTemplate([
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
      click: () => (docked ? undock() : dock('right')),
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
  tray.setToolTip('EmojiBot');
  tray.setContextMenu(buildMenu());
  tray.on('click', toggleVisible);
}

/* -------------------------------------------------------------- IPC glue */

ipcMain.on('drag:start', (_event, point) => {
  if (docked) undock();
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
ipcMain.on('pointer:over', (_event, over) => {
  if (!clickThrough && over) return;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!over, { forward: true });
  clickThrough = !over;
});

/* ------------------------------------------------------------------ boot */

app.setName('EmojiBot');

/*
 * Software rendering, deliberately. The window is one small SVG ball, so CPU
 * compositing costs nothing noticeable — while a GPU process that fails to
 * start is fatal before any window exists, which is common on remote sessions
 * and machines without a usable driver.
 */
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

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

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide();
    createWindow();
    createTray();
    ensureStateFile();
    startAgentWatch(readJson(prefsPath(), {}));
  });

  app.on('window-all-closed', () => {
    // The tray keeps the pet alive; quitting is an explicit menu action.
  });

  app.on('before-quit', () => {
    endDrag();
    stopHoverWatch();
    stopAgentWatch();
    fs.unwatchFile(statePath());
  });
}
