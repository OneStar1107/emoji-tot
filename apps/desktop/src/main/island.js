/**
 * The island window: a pill at the top centre of the screen.
 *
 * The page decides how big the island is — collapse, expand, a taller page —
 * and reports its own measured box; this module only keeps the window equal to
 * that box, centred on the chosen display. Window size is therefore never
 * computed twice (once in CSS, once in main), which is how a notch ends up
 * clipped or floating away from its content.
 *
 * Clicks pass through by default. Electron's `forward: true` does not reliably
 * forward mousemove on Windows (the ball window learned this first), so the
 * cursor is polled instead: over the island, the window takes input.
 */
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { readPrefs } = require('./paths');

/**
 * Transparent margin around the island.
 *
 * 16px was not enough: the panel's 22px corners and its 50px shadow reached the
 * window edge, so Windows clipped them and the panel looked cut on both sides.
 * The margin is now larger than the corner radius and the shadow's near field.
 */
const PAD_X = 28;
const PAD_Y = 18;

/**
 * Anti-burn-in drift, off unless asked for.
 *
 * A static bright pill on an OLED screen ghosts its shape into the panel over
 * months. Moving the window a few pixels on a slow cycle spreads that wear;
 * three pixels is below what anyone notices and enough to avoid a hard edge.
 */
const OLED_SHIFT = 3;
const OLED_STEP_MS = 90000;
let oledDrift = 0;
let oledTimer = null;

let win = null;
/** Content size as the page measured it. */
let box = { w: 200, h: 36 };
let clickThrough = true;
let cursorTimer = null;
let ready = false;
/** Fired once per load: services push their first frame here, not before. */
const loadedHooks = new Set();

function displayFor(prefs) {
  const wanted = prefs.displayId;
  const all = screen.getAllDisplays();
  if (wanted != null) {
    const match = all.find((d) => String(d.id) === String(wanted));
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
}

/** Screen rectangle the island should sit in: the work area's top edge. */
function anchorRect(prefs) {
  const display = displayFor(prefs);
  const area = display.workArea ?? display.bounds;
  return area;
}

/** Keep the window glued to the page's measured box, centred on the display. */
function place() {
  if (!win || win.isDestroyed()) return;
  const prefs = readPrefs();
  const area = anchorRect(prefs);
  const width = Math.round(box.w + PAD_X * 2);
  const height = Math.round(box.h + PAD_Y * 2);
  const x = Math.round(area.x + (area.width - width) / 2 + oledDrift);
  /*
   * The work area already excludes the taskbar, so "avoid the top bar" is the
   * default for free. Turning it off means the island may sit over a top-0
   * docked taskbar, which is what that switch promises.
   */
  const display = displayFor(prefs);
  const y = Math.round(prefs.avoidTopBar === false ? display.bounds.y : area.y);
  const bounds = win.getBounds();
  if (bounds.x === x && bounds.y === y && bounds.width === width && bounds.height === height) return;
  win.setBounds({ x, y, width, height });
}

/**
 * Walk the drift slowly left and right. Off means zero — and a switch flipped
 * off must not leave the island parked three pixels away from centre.
 */
function startOledShift() {
  clearInterval(oledTimer);
  oledTimer = setInterval(() => {
    const prefs = readPrefs();
    if (prefs.oledShift !== true) {
      if (oledDrift !== 0) {
        oledDrift = 0;
        place();
      }
      return;
    }
    oledDrift += 1;
    if (oledDrift > OLED_SHIFT) oledDrift = -OLED_SHIFT;
    place();
  }, OLED_STEP_MS);
}

function stopOledShift() {
  clearInterval(oledTimer);
  oledTimer = null;
  oledDrift = 0;
}

function setClickThrough(on) {
  if (!win || win.isDestroyed() || clickThrough === on) return;
  clickThrough = on;
  win.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
  win.webContents.send('island:hover', !on);
}

/**
 * Poll the cursor while the window ignores the mouse.
 *
 * 60ms is four position reads a frame at 60Hz; cheap enough to be invisible in
 * a task manager, and it behaves the same on both platforms.
 */
function startCursorWatch() {
  clearInterval(cursorTimer);
  let wasInside = false;
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const bounds = win.getBounds();
    const cursor = screen.getCursorScreenPoint();
    /*
     * The whole window is the target, not the pill inside it. A 28px band of
     * "transparent" padding that swallows clicks reads as "it ignores me" —
     * and the window is only ever as big as the island needs anyway.
     */
    const inside =
      cursor.x >= bounds.x &&
      cursor.x <= bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y <= bounds.y + bounds.height;
    setClickThrough(!inside);
    if (inside !== wasInside) {
      wasInside = inside;
      win.webContents.send('island:hover', inside);
    }
  }, 40);
}

function create() {
  if (win && !win.isDestroyed()) return win;
  const prefs = readPrefs();
  const area = anchorRect(prefs);
  const width = box.w + PAD_X * 2;
  const height = box.h + PAD_Y * 2;

  win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: area.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-island.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Above normal floating windows, below nothing that matters: the island must
  // survive a full-screen-ish app without stealing the whole screen.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'island.html'));

  win.once('ready-to-show', () => {
    ready = true;
    win.showInactive();
    place();
  });
  win.webContents.on('did-finish-load', () => {
    // The page has run its own bootstrap by now; anything pushed before this
    // point had no listener and was dropped.
    for (const fn of loadedHooks) {
      try {
        fn();
      } catch {
        /* a bad hook must not stop the others */
      }
    }
  });
  // Alt+F4 must not delete the island while the app keeps running.
  win.on('close', (event) => {
    if (!globalThis.__emojitotQuitting) event.preventDefault();
  });
  win.on('closed', () => {
    win = null;
    ready = false;
  });

  screen.on('display-metrics-changed', place);
  screen.on('display-removed', place);
  screen.on('display-added', place);
  startCursorWatch();
  return win;
}

function show() {
  if (!win || win.isDestroyed()) create();
  if (win && !win.isDestroyed()) {
    win.showInactive();
    place();
  }
}

function hide() {
  if (win && !win.isDestroyed()) win.hide();
}

function isVisible() {
  return Boolean(win && !win.isDestroyed() && win.isVisible());
}

function setBox(next) {
  if (!next || !Number.isFinite(next.w) || !Number.isFinite(next.h)) return;
  const w = Math.max(120, Math.min(720, Math.round(next.w)));
  const h = Math.max(28, Math.min(640, Math.round(next.h)));
  if (w === box.w && h === box.h) return;
  box = { w, h };
  place();
}

function send(channel, payload) {
  // Every guard must be "is bad": the first version tested
  // !webContents.isDestroyed(), which is true for every healthy window, so
  // every push returned before sending and the pill only ever showed a clock.
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    win.webContents.send(channel, payload);
  } catch {
    // Between load and ready; dropping one frame beats throwing in a timer.
  }
}

function loadFile(file) {
  if (win && !win.isDestroyed()) win.loadFile(file);
}

function registerIpc() {
  ipcMain.on('island:box', (_event, payload) => setBox(payload));
  ipcMain.handle('island:visible', () => isVisible());
  ipcMain.handle('island:show', () => {
    show();
    return true;
  });
  ipcMain.handle('island:hide', () => {
    hide();
    return true;
  });
  ipcMain.handle('island:ready', () => ready);
}

function onLoaded(fn) {
  loadedHooks.add(fn);
  return () => loadedHooks.delete(fn);
}

module.exports = {
  create,
  show,
  hide,
  isVisible,
  send,
  setBox,
  registerIpc,
  place,
  loadFile,
  onLoaded,
  startOledShift,
  stopOledShift,
};
