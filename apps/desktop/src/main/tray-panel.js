/**
 * The tray menu, drawn by the app instead of by the OS.
 *
 * A small frameless window with one header row (name and version) and three
 * 40px rows: settings, pin, quit. It is opened from the tray icon and closes on
 * an outside click or Escape, and it follows the same light/dark preference as
 * the settings window so the two windows never disagree about the theme.
 *
 * The window is created lazily on the first open and then reused: a menu that
 * is rebuilt every click loses its page state and pays the load cost again.
 */
const { BrowserWindow, nativeTheme, screen } = require('electron');
const path = require('node:path');
const guard = require('./ipc-guard');
const { placePanel } = require('./tray-menu');

/** 200 wide: header 32 + three 40px rows + 6px of padding either side. */
const WIDTH = 200;
const HEADER = 32;
const ROW = 40;
const PAD = 6;
const HEIGHT = HEADER + ROW * 3 + PAD * 2;

/** Actions the panel may ask for. Anything else is refused by the IPC guard. */
const ACTIONS = ['settings', 'pin', 'quit'];

/**
 * A click on the tray icon closes the panel through blur first, so the click
 * that arrives a moment later would immediately reopen it. Within this window
 * the click is read as "close", not "open".
 */
const REOPEN_GUARD_MS = 250;
/** Windows can fire blur while the panel is still coming up. */
const SHOW_GRACE_MS = 200;

let win = null;
let hooks = null;
let shownAt = 0;
let hiddenAt = 0;

/** Injected by boot: what the panel shows and what its rows do. */
function setHooks(next) {
  hooks = next;
}

function state() {
  try {
    return hooks?.state?.() ?? null;
  } catch {
    return null;
  }
}

function isOpen() {
  return Boolean(win && !win.isDestroyed() && win.isVisible());
}

/** True right after the panel closed itself — a tray click then means "close". */
function closedJustNow() {
  return Date.now() - hiddenAt < REOPEN_GUARD_MS;
}

/**
 * The work area the panel belongs to.
 *
 * The tray icon decides the display, not the primary one: a user with the
 * taskbar on a second monitor expects the menu on that monitor.
 */
function workAreaFor(anchor) {
  try {
    if (anchor && anchor.width > 0) return screen.getDisplayMatching(anchor).workArea;
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  } catch {
    return screen.getPrimaryDisplay().workArea;
  }
}

function place(anchor) {
  const area = workAreaFor(anchor);
  const pos = placePanel(anchor, { width: WIDTH, height: HEIGHT }, area);
  win.setBounds({ x: pos.x, y: pos.y, width: WIDTH, height: HEIGHT });
}

/** Push the current state to an open panel; harmless when it is closed. */
function refresh() {
  if (!win || win.isDestroyed()) return;
  guard.safeSend(win.webContents, 'tray:state', state());
}

function ensureWindow() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // The keyboard is the point: arrows move, Enter commits, Escape closes.
    focusable: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-tray.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  // Registered before the page loads, so its first message is attributed.
  guard.claim('tray', win.webContents);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'tray.html'));
  win.on('blur', () => {
    // The window is shown and then focused; the blur that Windows reports while
    // the activation is still settling is not the user leaving.
    if (Date.now() - shownAt < SHOW_GRACE_MS) return;
    hide();
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

/**
 * Show the panel against the tray icon, or in the work area's corner when the
 * platform does not report one. Focus follows, because a menu you cannot type
 * into is not accessible.
 */
function show(anchor) {
  const target = ensureWindow();
  if (!target || target.isDestroyed()) return;
  const present = () => {
    if (!win || win.isDestroyed()) return;
    place(anchor);
    refresh();
    shownAt = Date.now();
    win.show();
    win.focus();
  };
  if (target.webContents.isLoading()) target.once('ready-to-show', present);
  else present();
}

function hide() {
  if (!win || win.isDestroyed()) return;
  hiddenAt = Date.now();
  win.hide();
}

function registerIpc() {
  guard.guardedHandle('tray:state', ['tray'], () => state());
  guard.guardedHandle(
    'tray:act',
    ['tray'],
    (kind) => {
      hide();
      try {
        hooks?.act?.(kind);
      } catch (error) {
        console.warn('[tray] action failed', kind, error?.message ?? error);
      }
      return { ok: true };
    },
    { check: (kind) => (guard.oneOf(kind, ACTIONS) ? kind : undefined), maxBytes: 512 },
  );
  guard.guardedHandle('tray:close', ['tray'], () => {
    hide();
    return true;
  });
}

/*
 * The OS can flip between light and dark while the panel is open. Re-send the
 * resolved theme instead of letting the page re-decide: the preference may pin
 * one theme regardless of what the system reports.
 */
nativeTheme.on('updated', () => refresh());

module.exports = {
  WIDTH,
  HEIGHT,
  HEADER,
  ROW,
  PAD,
  setHooks,
  registerIpc,
  show,
  hide,
  refresh,
  isOpen,
  closedJustNow,
};
