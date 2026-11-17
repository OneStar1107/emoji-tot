/**
 * EmojiBot as a desktop pet.
 *
 * A frameless, transparent, always-on-top window holding one character, plus
 * a tray icon and a context menu. The part that matters is how it is driven:
 * anything on the machine can write a two-digit emotion id to
 *
 *   <userData>/state.json
 *
 * and the ball reacts — no socket, no SDK, no build step on the caller's side.
 * That file is the whole integration surface for a shell hook, a script or an
 * agent that only knows "I finished" or "I failed".
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { parseAgentMessage } = require('@emojibot-studio/protocol');

/** Six steps, from a 64px dot to a 220px mascot. */
const SIZES = { xs: 64, sm: 88, md: 120, lg: 160, xl: 220 };

/**
 * Vertical room kept above the ball for the speech bubble.
 *
 * The window is the only thing that can paint, so a bubble that hangs outside
 * it is a bubble nobody sees. The window is taller than the ball by exactly
 * this much and the ball sits at the bottom.
 */
const BUBBLE_SPACE = 46;
const SIZE_ORDER = Object.keys(SIZES);

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

let win = null;
let tray = null;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let sizeKey = 'md';
let pinned = true;
let lastStateMtime = 0;

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
  writeJson(prefsPath(), {
    sizeKey,
    pinned,
    ...(position ? { position: { x: position[0], y: position[1] } } : {}),
  });
}

function defaultPosition(dim) {
  const area = screen.getPrimaryDisplay().workAreaSize;
  return { x: area.width - dim - 48, y: area.height - dim - 96 };
}

function createWindow() {
  const prefs = readJson(prefsPath(), {});
  sizeKey = SIZES[prefs.sizeKey] ? prefs.sizeKey : 'md';
  pinned = prefs.pinned !== false;
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
  win.once('ready-to-show', () => win.showInactive());
  win.on('moved', savePrefs);
  win.on('closed', () => {
    win = null;
  });
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
  else win.showInactive();
  refreshMenus();
}

function applyStateFromFile() {
  if (!win || win.isDestroyed()) return;
  let stat;
  try {
    stat = fs.statSync(statePath());
  } catch {
    return;
  }
  // statSync runs every poll; only forward a real write, or each tick would
  // restart the expression and the face would never settle.
  if (stat.mtimeMs === lastStateMtime) return;
  lastStateMtime = stat.mtimeMs;
  let raw = '';
  try {
    raw = fs.readFileSync(statePath(), 'utf8');
  } catch {
    return;
  }
  // The file is the wire: a bare id, a JSON string or a JSON object all work,
  // and a malformed write is ignored rather than blanking the face.
  const message = parseAgentMessage(raw);
  if (message) win.webContents.send('state:apply', message);
}

function ensureStateFile() {
  fs.mkdirSync(userDir(), { recursive: true });
  if (!fs.existsSync(statePath())) {
    writeJson(statePath(), { emotionId: '02', tips: '把 emotionId 写进这个文件，球就会跟着变' });
  }
  fs.watchFile(statePath(), { interval: 400 }, applyStateFromFile);
  applyStateFromFile();
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: win && win.isVisible() ? '隐藏球球' : '显示球球',
      click: toggleVisible,
    },
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
        click: () => win && win.webContents.send('state:apply', { emotionId: id }),
      })),
    },
    { type: 'separator' },
    {
      label: '打开状态文件',
      click: () => shell.openPath(statePath()),
    },
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
  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.showInactive();
    refreshMenus();
  });
}

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
  savePrefs();
}

ipcMain.on('drag:start', (_event, point) => startDrag(point));
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

// Without this the profile folder is derived from the scoped package name,
// which turns into a nested path with a slash in it.
app.setName('EmojiBot');

// A transparent window over a software-composited desktop is fine; a failed
// GPU process is fatal, and it fails on machines without a usable GPU.
app.disableHardwareAcceleration();

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
  });

  app.on('window-all-closed', () => {
    // Deliberately no app.quit(): the tray keeps the pet alive, and quitting
    // is an explicit menu action.
  });

  app.on('before-quit', () => {
    endDrag();
    fs.unwatchFile(statePath());
  });
}
