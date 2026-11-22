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
const guard = require('./ipc-guard');
const { safeSend } = guard;
const { passThroughFor } = require('./window-state');

/**
 * Transparent margin around the island.
 *
 * 16px was not enough: the panel's 22px corners and its 50px shadow reached the
 * window edge, so Windows clipped them and the panel looked cut on both sides.
 * The margin is now larger than the corner radius and the shadow's near field.
 */
const PAD_X = 32;
/* Taller than the side: the panel's shadow is offset downwards, so the bottom
   needs blur + offset of room or the OS clips it into a straight edge. */
const PAD_Y = 36;

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
let clickThroughEnabled = true;
let cursorTimer = null;
/**
 * The window rectangle, kept here instead of read from the window each poll.
 *
 * `win.getBounds()` is a cross-process call; the rectangle only changes when
 * place() moves the window, so the pointer watch can read this instead.
 */
let windowRect = { x: 0, y: 0, width: 0, height: 0 };
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

/**
 * How far below the screen's top edge the island sits, in pixels.
 *
 * Eight is the default because a pill drawn flush against the edge reads as
 * clipped rather than anchored; zero keeps the old flush behaviour for anyone
 * who asks for it. The settings slider is the only writer, so the clamp here
 * guards against a hand-edited prefs.json.
 */
const TOP_GAP_DEFAULT = 8;
const TOP_GAP_MAX = 24;

function topGap(prefs) {
  const raw = Number(prefs.islandTopGap);
  if (!Number.isFinite(raw)) return TOP_GAP_DEFAULT;
  return Math.max(0, Math.min(TOP_GAP_MAX, Math.round(raw)));
}

/**
 * The window's top edge: the chosen display's top plus the user's gap.
 *
 * When avoidTopBar is false the island is deliberately allowed over a
 * top-docked taskbar, so the display's bounds anchor it then; the gap still
 * applies on top of whichever edge that switch picked.
 */
function topEdge(prefs) {
  const display = displayFor(prefs);
  const base = prefs.avoidTopBar === false ? display.bounds.y : (display.workArea ?? display.bounds).y;
  return Math.round(base + topGap(prefs));
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
   * docked taskbar, which is what that switch promises. Either way the top gap
   * applies: the window — and with it the pill, the panel, the collapsed strip
   * and the hover rectangle derived from this rectangle — starts that far below
   * the screen's top edge.
   */
  const y = topEdge(prefs);
  windowRect = { x, y, width, height };
  notifyBounds();
  const bounds = win.getBounds();
  if (bounds.x === x && bounds.y === y && bounds.width === width && bounds.height === height) return;
  win.setBounds({ x, y, width, height });
  /*
   * A moved window has a different desktop under it.
   *
   * The real-glass layer is positioned in *screen* coordinates, so the panel
   * sliding sideways by a few pixels (a display change, the OLED drift, the
   * window growing as the panel opens) leaves the blurred photograph behind.
   * The page re-shoots it after a short debounce; a move with no open panel
   * costs one message and nothing else.
   */
  safeSend(win, 'island:moved', null);
}

/**
 * The avoid script needs the pill's rectangle, not the padded window's.
 *
 * The window carries 32px of transparent margin per side and 36px above and
 * below; a window that only covers the margin is not covering the island, and
 * collapsing on that would be wrong.
 */
let boundsHook = null;

function setBoundsHook(fn) {
  boundsHook = typeof fn === 'function' ? fn : null;
}

function pillRect() {
  /*
   * Measured, not derived from the padding constants.
   *
   * The page centres the frame horizontally and pins it to the top, so the
   * padding is not symmetric in practice: the window carries the 32px side
   * margin but the 36px is all *below* the content. Subtracting PAD_Y from the
   * top put the avoid rectangle 36px lower than the pill, and a browser that
   * only covered that empty band collapsed the island for no reason.
   */
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  return {
    x: Math.round(windowRect.x + (windowRect.width - w) / 2),
    y: Math.round(windowRect.y),
    w,
    h,
  };
}

function notifyBounds() {
  if (!boundsHook) return;
  try {
    boundsHook(pillRect());
  } catch {
    // A broken hook must not stop placement.
  }
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
  safeSend(win, 'island:hover', !on);
}

/**
 * How far the pointer is from the window, in pixels (0 when inside it).
 *
 * The gap is measured to the rectangle, not to its centre, so a pointer just
 * above the island counts as near even though the centre is far away.
 */
/*
 * The rectangle the pointer has to be inside for the island to count as hovered.
 *
 * The page reports the size of what it actually draws (pill, panel or the 5px
 * auto-avoid strip); the window keeps its padding, so testing the window made
 * the whole 287x106 area a hover target and the island opened whenever the
 * pointer crossed empty space next to the pill.
 */
let hitRect = null;
let hitCollapsed = false;

function setHit(next) {
  if (!next || !Number.isFinite(next.w) || !Number.isFinite(next.h)) return;
  hitRect = { w: Math.round(next.w), h: Math.round(next.h) };
  hitCollapsed = next.collapsed === true;
}

function contentRect() {
  const width = hitRect ? Math.min(hitRect.w, windowRect.width || hitRect.w) : windowRect.width;
  const height = hitRect ? Math.min(hitRect.h, windowRect.height || hitRect.h) : windowRect.height;
  if (!width || !height) return windowRect;
  return {
    x: Math.round(windowRect.x + (windowRect.width - width) / 2),
    y: windowRect.y,
    width,
    height,
  };
}

function cursorGap(cursor, rect) {
  const dx = Math.max(rect.x - cursor.x, 0, cursor.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - cursor.y, 0, cursor.y - (rect.y + rect.height));
  return Math.round(Math.hypot(dx, dy));
}

/**
 * Poll the cursor while the window ignores the mouse.
 *
 * A fixed 25ms timer was two cross-process reads forty times a second even with
 * the pointer parked on the other monitor, which is most of the app's idle CPU.
 * The interval now follows the pointer: fast only where a miss would be felt —
 * on the window, or close enough that someone is about to use it — and slow
 * everywhere else. A pointer that has stopped still gets read within 120ms, and
 * one that sweeps past was not going to click anything anyway.
 */
const WATCH_NEAR_PX = 180;
const WATCH_FAR_PX = 700;
const WATCH_FAST_MS = 25;
const WATCH_MID_MS = 120;
/*
 * 250ms only once the pointer is a screen away (the island lives at the top
 * edge, so "far" is where someone is working in another window). A pointer that
 * travels back up is read long before it arrives: the crossing takes several
 * intervals at any human speed, and a miss costs one tick, not a click.
 */
const WATCH_FAR_MS = 250;

function startCursorWatch() {
  clearTimeout(cursorTimer);
  let wasInside = false;
  const tick = () => {
    if (!win || win.isDestroyed() || !win.isVisible()) {
      cursorTimer = setTimeout(tick, WATCH_FAR_MS);
      return;
    }
    const rect = windowRect;
    const cursor = screen.getCursorScreenPoint();
    /*
     * Hover is decided on the drawn content, not the window: the window carries
     * 32/36px of transparent padding and, while the island is collapsed to the
     * auto-avoid strip, the content is only 5px tall. Testing the window meant
     * anything inside that empty box (or brushing past it) opened the island.
     */
    const gap = cursorGap(cursor, contentRect());
    const inside = gap === 0;
    /*
     * The collapsed strip is a "stay out of the way" state: the window's
     * transparent padding must hand the pointer back to whatever is underneath
     * (browser tabs, an editor) even when the user turned clicking-through off
     * for the normal pill. Occupying that dead space made the browser's own
     * controls unclickable.
     */
    setClickThrough(passThroughFor(clickThroughEnabled, inside) || (hitCollapsed && !inside));
    if (inside !== wasInside) {
      wasInside = inside;
      safeSend(win, 'island:hover', inside);
    }
    const next = inside || gap <= WATCH_NEAR_PX ? WATCH_FAST_MS : gap <= WATCH_FAR_PX ? WATCH_MID_MS : WATCH_FAR_MS;
    cursorTimer = setTimeout(tick, next);
  };
  cursorTimer = setTimeout(tick, WATCH_FAST_MS);
}

function create() {
  if (win && !win.isDestroyed()) return win;
  const prefs = readPrefs();
  clickThroughEnabled = prefs.clickThrough !== false;
  clickThrough = clickThroughEnabled;
  const area = anchorRect(prefs);
  const width = box.w + PAD_X * 2;
  const height = box.h + PAD_Y * 2;

  // Registered before the page loads, so its first message is attributed.
  win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: topEdge(prefs),
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
      sandbox: true,
    },
  });

  // Above normal floating windows, below nothing that matters: the island must
  // survive a full-screen-ish app without stealing the whole screen.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(
    clickThroughEnabled,
    clickThroughEnabled ? { forward: true } : undefined,
  );
  win.loadFile(path.join(__dirname, '..', 'renderer', 'island.html'));

  guard.claim('island', win.webContents);
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
  /*
   * Re-place even when the size did not change.
   *
   * `box` is what the page asked for, not what the window actually is. If one
   * setBounds lands while the window is busy (a resize during the open/close
   * animation, a display change) the two drift apart, and skipping the equal
   * size meant nothing ever corrected it again: the window stayed at the
   * expanded size around a collapsed pill until the app restarted. place()
   * compares against the real bounds, so an unchanged window still costs
   * nothing.
   */
  box = { w, h };
  place();
}

function send(channel, payload) {
  // Every guard must be "is bad": the first version tested
  // !webContents.isDestroyed(), which is true for every healthy window, so
  // every push returned before sending and the pill only ever showed a clock.
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    safeSend(win, channel, payload);
  } catch {
    // Between load and ready; dropping one frame beats throwing in a timer.
  }
}

function loadFile(file) {
  if (win && !win.isDestroyed()) win.loadFile(file);
}

function registerIpc() {
  guard.guardedSend('island:box', ['island'], (box) => setBox(box), {
    maxBytes: 512,
    check: (box) => {
      // The page reports its own content size; the window follows it. A NaN or
      // a negative size would leave the window at zero and the panel invisible.
      if (!guard.isPlainObject(box)) return undefined;
      if (!guard.isNumber(box.w, 1, 10000) || !guard.isNumber(box.h, 1, 10000)) return undefined;
      return { w: Math.round(box.w), h: Math.round(box.h) };
    },
  });
  guard.guardedSend('island:hit', ['island'], (hit) => setHit(hit), {
    maxBytes: 256,
    check: (hit) => {
      // The page reports the size of what it draws; the window stays padded.
      if (!guard.isPlainObject(hit)) return undefined;
      if (!guard.isNumber(hit.w, 1, 10000) || !guard.isNumber(hit.h, 1, 10000)) return undefined;
      return { w: Math.round(hit.w), h: Math.round(hit.h), collapsed: hit.collapsed === true };
    },
  });
  guard.guardedHandle('island:visible', ['island'], () => isVisible());
  guard.guardedHandle('island:show', ['island'], () => {
    show();
    return true;
  });
  guard.guardedHandle('island:hide', ['island'], () => {
    hide();
    return true;
  });
  guard.guardedHandle('island:ready', ['island'], () => ready);
}

function onLoaded(fn) {
  loadedHooks.add(fn);
  return () => loadedHooks.delete(fn);
}

/**
 * Re-run placement against the current prefs.
 *
 * Called when the chosen display disappears or the preference changes; the
 * next setBox/place cycle would do it anyway, but only after the page
 * measures itself again, which may not happen while the panel is closed.
 */
function refreshPosition() {
  if (!win || win.isDestroyed()) return;
  place();
}

function refreshPrefs() {
  if (!win || win.isDestroyed()) return;
  const prefs = readPrefs();
  clickThroughEnabled = prefs.clickThrough !== false;
  place();
  const gap = cursorGap(screen.getCursorScreenPoint(), contentRect());
  const inside = gap === 0;
  setClickThrough(passThroughFor(clickThroughEnabled, inside) || (hitCollapsed && !inside));
}

module.exports = {
  refreshPosition,
  refreshPrefs,
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
  setBoundsHook,
  setHit,
  contentRect,
  pillRect,
};
