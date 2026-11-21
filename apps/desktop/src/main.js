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
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, session, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
// Vendored, not resolved: a workspace link does not survive packaging.
const { createArbiter, parseAgentMessage, stateForEmotion, EMOTIONS } = require('./vendor/protocol/index.js');
// Shared, because the island and the settings window write the same file.
const { userDir, statePath, prefsPath, readJson, writeJson, readPrefs, writePrefs, configureSettingsSchema } = require('./main/paths');
const island = require('./main/island');
const settings = require('./main/settings');
const { mailAction, quotaAction, calendarAction } = require('./main/data-actions');
const battery = require('./main/services/battery');
const weather = require('./main/services/weather');
const media = require('./main/services/media');
const games = require('./main/services/games');
const mediaEmotion = require('./main/media-emotion');
const volume = require('./main/services/volume');
const lyrics = require('./main/services/lyrics');
const focus = require('./main/services/focus');
const health = require('./main/services/health');
const todo = require('./main/services/todo');
const shelf = require('./main/services/shelf');
const clipboardHistory = require('./main/services/clipboard');
const messenger = require('./main/services/messenger');
const devices = require('./main/services/devices');
const quota = require('./main/services/quota');
const mail = require('./main/services/mail');
const calendar = require('./main/services/calendar');
const fullscreen = require('./main/services/fullscreen');
const avoidance = require('./main/services/avoidance');
const guard = require('./main/ipc-guard');
const { safeSend } = guard;
const platform = require('./main/platform');
const { passThroughWhileDragging, sameDisplayId } = require('./main/window-state');
const { nextAgentMtime } = require('./main/agent-file');

/** Six steps, from a 64px dot to a 220px mascot. */
const SIZES = { xs: 64, sm: 88, md: 120, lg: 160, xl: 220 };

/** Mirrors DEFAULTS.devices.pinned's documented cap (see shared/schema.js). */
const DEVICE_PIN_LIMIT = 3;
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
      // Running is Thinking, not Busy: the protocol has a face for "working
      // on it" and an agent that has started is doing exactly that.
      if (raw.status === 'running') return raw.pct >= 100 ? '33' : '30';
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
let clickThroughEnabled = true;
let agentWatch = {};
/**
 * One arbiter for the agents.
 *
 * Each agent is its own session. Before this, every poll wrote its emotion
 * straight to the state file and the last writer won: three sub-agents, one
 * error among them, and the ball showed whichever status file happened to be
 * touched last. Priority and dwell now decide, the same way the gallery's
 * scene page arbitrates a dozen sessions.
 */
let agentArbiter = null;
/**
 * The four-way priority gate: manual preview > agent > media > idle.
 *
 * The protocol arbiter still decides *which* agent wins between several agent
 * sessions; this sits one level up and decides whether the agent should be on
 * screen at all. Every emotion that reaches a character goes through here, so
 * "one emotion holds for at least 2000ms" is enforced in one place rather
 * than four.
 */
let emotionDirector = null;
/** The preview that is currently sitting above the agent/media states. */
let manualEmotionTimer = null;
/** Is the foreground-game watcher running? It costs a PowerShell child. */
let gamesRunning = false;

function emotions() {
  if (!emotionDirector) {
    emotionDirector = mediaEmotion.createEmotionDirector({
      minDisplayMs: 2000,
      onApply: (result) => {
        emitState({
          emotionId: result.emotionId,
          ...(result.tips ? { tips: result.tips } : {}),
        });
      },
    });
  }
  return emotionDirector;
}

/**
 * Recompute the media source from the three signals it is made of.
 *
 * Level-triggered on purpose: a track change, a pause, a new foreground game
 * and the setting being switched off all call this and it publishes whatever
 * the current truth is. The director drops duplicates.
 */
function applyMediaEmotion() {
  const prefs = readPrefs();
  const gate = emotions();
  if (prefs.mediaEmotion === false) {
    gate.clear('media');
    return;
  }
  const snapshot = media.current();
  const foreground = games.current();
  const emotionId = mediaEmotion.mediaEmotion({
    active: snapshot.active,
    playing: snapshot.playing,
    duration: snapshot.duration,
    error: snapshot.error,
    game: games.isGame(foreground) ? foreground : '',
  });
  if (emotionId) gate.set('media', emotionId);
  else gate.clear('media');
}

/** Start or stop the foreground watcher as the setting allows. */
function applyEmotionWatch() {
  const wanted = readPrefs().mediaEmotion !== false && platform.supports('media');
  if (wanted && !gamesRunning) {
    try {
      games.start(() => applyMediaEmotion());
      gamesRunning = true;
    } catch {
      // No shell available: the media emotion has two other signals still.
      gamesRunning = false;
    }
  } else if (!wanted && gamesRunning) {
    games.stop();
    gamesRunning = false;
  }
  applyMediaEmotion();
}

function agentsArbiter() {
  if (!agentArbiter) {
    agentArbiter = createArbiter({
      minDisplayMs: 900,
      onApply: (result) => {
        emotions().set('agent', result.emotionId, result.tips ?? '');
      },
    });
  }
  return agentArbiter;
}
/** The cast member the pet wears; persisted in prefs.json. */
let castId = 'tot';
/** The engine's cast table, loaded as ESM from the vendored copy. */
let CORE = null;
/**
 * The shared settings schema (src/shared/schema.js), loaded as ESM.
 *
 * Until it arrives readPrefs() returns the raw file, which is exactly the old
 * behaviour — so a broken import degrades instead of wiping every preference.
 */
let SCHEMA = null;

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

async function loadSchema() {
  try {
    const { pathToFileURL } = require('url');
    const file = path.join(__dirname, 'shared', 'schema.js');
    SCHEMA = await import(pathToFileURL(file).href);
    configureSettingsSchema(SCHEMA);
  } catch (error) {
    SCHEMA = null;
    console.error('[settings] schema unavailable:', error?.message ?? String(error));
  }
}

function setCast(id) {
  castId = id;
  writeJson(prefsPath(), { ...readJson(prefsPath(), {}), cast: id });
  island.send('island:cast', id);
  if (win) safeSend(win, 'cast:changed', id);
  refreshMenus();
}

/** Which surface set is on screen. This is the only display-state source. */
let displayMode = 'island';

const showBall = () => displayMode !== 'island';
const showIsland = () => displayMode !== 'ball';

function savePrefs() {
  const position = win && !win.isDestroyed() ? win.getPosition() : undefined;
  writePrefs({
    sizeKey,
    pinned,
    ...(position && !dockSide ? { position: { x: position[0], y: position[1] } } : {}),
  });
}

/**
 * The display the ball lives on.
 *
 * displayId used to be honoured by the island only, so a user who picked a
 * second screen got the panel there and the ball on the primary one. A
 * display that is no longer plugged in falls back to the primary instead of
 * leaving a window at coordinates that exist on no monitor.
 */
function displayForBall(prefs = readPrefs()) {
  const all = screen.getAllDisplays();
  const wanted = prefs.displayId;
  if (wanted != null) {
    const found = all.find((display) => sameDisplayId(display.id, wanted));
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

/**
 * The work area of that display, origin included.
 *
 * This used to return workAreaSize — width and height only. A secondary
 * monitor to the left of the primary starts at x = -1920, so anchoring a
 * docked ball at x = 0 put it on the wrong screen entirely.
 */
function workArea(prefs) {
  return displayForBall(prefs).workArea;
}

function outerSize(dim) {
  return dim + (BALL_PAD + BUBBLE_ROOM) * 2;
}

function defaultPosition(dim) {
  const area = workArea();
  const outer = outerSize(dim);
  return { x: area.x + area.width - outer - 8, y: area.y + area.height - outer - 8 };
}

/* ---------------------------------------------------------------- window */

function createWindow() {
  const prefs = readPrefs();
  sizeKey = SIZES[prefs.sizeKey] ? prefs.sizeKey : 'md';
  pinned = prefs.pinned !== false;
  clickThroughEnabled = prefs.clickThrough !== false;
  clickThrough = clickThroughEnabled;
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
      // The preload only uses contextBridge and ipcRenderer, so the renderer
      // has no reason to share a process with Node.
      sandbox: true,
    },
  });

  guard.claim('ball', win.webContents);

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
    /*
     * A drag owns the mouse until it ends.
     *
     * The follow loop moves the window towards the cursor every 16ms, so the
     * grab point lags a few pixels behind it — and this poll, reading the ball's
     * centre from the window's position, briefly decides the cursor is off the
     * ball and hands clicks back to the desktop. That takes the pointerup away
     * from the page, which then never reports drag:end, and the ball stays glued
     * to the cursor with no way to let go. While dragTimer is live the window is
     * opaque to the mouse, full stop.
     */
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const dim = SIZES[sizeKey];
    // The ball sits at the centre of the window, with equal room all round.
    const cx = wx + outerSize(dim) / 2;
    const cy = wy + outerSize(dim) / 2;
    const onBall = Math.hypot(cursor.x - cx, cursor.y - cy) <= dim / 2;
    const next = passThroughWhileDragging(Boolean(dragTimer), clickThroughEnabled, onBall);
    if (next === clickThrough) return;
    setClickThrough(next);
  }, 60);
}

function setSize(key) {
  if (!SIZES[key] || !win) return;
  sizeKey = key;
  const dim = SIZES[key];
  const [x, y] = win.getPosition();
  const outer = dim + (BALL_PAD + BUBBLE_ROOM) * 2;
  win.setBounds({ x, y, width: outer, height: outer });
  safeSend(win, 'size:changed', dim);
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

/**
 * Show or hide the desktop ball.
 *
 * "Visible" is not the same as "findable": a ball can be visible and still be
 * parked half off-screen or docked to an edge where it reads as invisible. So
 * a click that is meant to bring it back also checks that it is on a screen
 * and, if not, re-centres it before showing.
 */
function toggleBall() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const onScreen = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x + bounds.width > area.x &&
      bounds.x < area.x + area.width &&
      bounds.y + bounds.height > area.y &&
      bounds.y < area.y + area.height
    );
  });
  if (win.isVisible() && onScreen && !dockSide) {
    win.hide();
  } else {
    if (!onScreen) {
      const area = screen.getPrimaryDisplay().workArea;
      win.setPosition(
        Math.round(area.x + (area.width - bounds.width) / 2),
        Math.round(area.y + (area.height - bounds.height) / 2),
      );
    }
    if (dockSide) undock();
    win.show();
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
  const minY = area.y;
  const maxY = area.y + Math.max(0, area.height - outer);
  const minX = area.x;
  const maxX = area.x + Math.max(0, area.width - outer);
  if (side === 'left') {
    x = area.x + peek - outer / 2 - dim / 2;
    y = clamp(wy, minY, maxY);
  } else if (side === 'right') {
    x = area.x + area.width - peek - outer / 2 + dim / 2;
    y = clamp(wy, minY, maxY);
  } else if (side === 'top') {
    y = area.y + peek - outer / 2 - dim / 2;
    x = clamp(wx, minX, maxX);
  } else {
    y = area.y + area.height - peek - outer / 2 + dim / 2;
    x = clamp(wx, minX, maxX);
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
  if (side === 'left') x = area.x - (outer - dim) / 2;
  else if (side === 'right') x = area.x + area.width - (outer + dim) / 2;
  else if (side === 'top') y = area.y - (outer - dim) / 2;
  else y = area.y + area.height - (outer + dim) / 2;

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
  if (dockSide === 'left') return { x: area.x, y: ballTop, w: peek, h: dim };
  if (dockSide === 'right') return { x: area.x + area.width - peek, y: ballTop, w: peek, h: dim };
  if (dockSide === 'top') return { x: ballLeft, y: area.y, w: dim, h: peek };
  return { x: ballLeft, y: area.y + area.height - peek, w: dim, h: peek };
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
  const clampY = (v) => clamp(v, area.y, area.y + Math.max(0, area.height - outer));
  const clampX = (v) => clamp(v, area.x, area.x + Math.max(0, area.width - outer));
  if (dockSide === 'left') return { x: area.x - (outer - dim) / 2, y: clampY(wy) };
  if (dockSide === 'right') return { x: area.x + area.width - (outer + dim) / 2, y: clampY(wy) };
  if (dockSide === 'top') return { x: clampX(wx), y: area.y - (outer - dim) / 2 };
  return { x: clampX(wx), y: area.y + area.height - (outer + dim) / 2 };
}

/** Where a tucked ball sits: the same as the closed dock position. */
function closedPosition(dim) {
  const outer = outerSize(dim);
  const area = workArea();
  const peek = Math.round(dim * PEEK_RATIO);
  const [wx, wy] = win.getPosition();
  const minY = area.y;
  const maxY = area.y + Math.max(0, area.height - outer);
  const minX = area.x;
  const maxX = area.x + Math.max(0, area.width - outer);
  if (dockSide === 'left') return { x: area.x + peek - outer / 2 - dim / 2, y: clamp(wy, minY, maxY) };
  if (dockSide === 'right') return { x: area.x + area.width - peek - outer / 2 + dim / 2, y: clamp(wy, minY, maxY) };
  if (dockSide === 'top') return { x: clamp(wx, minX, maxX), y: area.y + peek - outer / 2 - dim / 2 };
  return { x: clamp(wx, minX, maxX), y: area.y + area.height - peek - outer / 2 + dim / 2 };
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
  if (x <= area.x + EDGE_SNAP) dock('left');
  else if (x + dim >= area.x + area.width - EDGE_SNAP) dock('right');
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
  // The island shows the same character: one state, two windows.
  island.send('island:state', message);
  try {
    safeSend(win, 'state:apply', message);
  } catch {
    // The window can be between load and ready; dropping one frame beats
    // throwing inside a polling timer, which would stop the poll for good.
  }
}

/** Tell the renderer which edge the ball is on, so the bubble grows inward. */
function notifyDock() {
  if (!win || win.isDestroyed()) return;
  try {
    safeSend(win, 'dock:changed', dockSide ? (dockOpen ? `${dockSide}-open` : dockSide) : null);
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
 * What the island's agent row draws.
 *
 * The sources already map their own status files into protocol ids, so the row
 * reuses that vocabulary instead of starting a second state machine: one
 * enabled source is one session, and that session runs while its file maps
 * into the agent-work segment (30–49). A source that is off or has no file is
 * idle; nothing here invents a measured zero for a missing snapshot.
 */
const AGENT_WORK = [30, 49];

/** Last running flag and the moment it changed, written by the poll below. */
const agentRunning = {};
const agentSince = {};

function agentSnapshot() {
  const prefs = readPrefs();
  return AGENT_SOURCES.map((source) => {
    const on = Boolean(prefs[`agent_${source.id}`]);
    const running = on && Boolean(agentRunning[source.id]);
    return {
      id: source.id,
      label: source.label,
      on,
      running,
      /* When this state began. A source with no readable file has never been
         observed, so it reports null instead of a made-up zero. */
      since: on ? (agentSince[source.id] ?? null) : null,
    };
  });
}

/**
 * One snapshot for the AI page.
 *
 * The balance and the agent list are one screen, so they travel in one event
 * and the island paints them in one pass. The 350ms agent poll and the quota
 * service both call this; the JSON comparison keeps the channel quiet until
 * either half actually changes.
 */
function quotaAgentSnapshot() {
  return { quota: quota.snapshot(), agents: agentSnapshot() };
}

let quotaAgentPush = '';
function pushQuotaAgent() {
  const snapshot = quotaAgentSnapshot();
  const next = JSON.stringify(snapshot);
  if (next === quotaAgentPush) return;
  quotaAgentPush = next;
  island.send('island:quota-agent', snapshot);
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
    const tick = () => {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        return;
      }
      if (stat.mtimeMs === last) return;
      // A file caught mid-write parses as null; leave `last` alone so the next
      // tick retries instead of waiting for the writer to touch it again.
      const raw = readJson(file, null);
      if (raw == null) return;
      last = nextAgentMtime(last, stat.mtimeMs, raw);
      const id = source.map(raw);
      const work = Number(id);
      const running = Number.isInteger(work) && work >= AGENT_WORK[0] && work <= AGENT_WORK[1];
      /* The duration the page shows is the age of this transition, not a timer
         that restarts whenever the island repaints. */
      if (!(source.id in agentSince) || running !== Boolean(agentRunning[source.id])) {
        agentSince[source.id] = Date.now();
      }
      agentRunning[source.id] = running;
      if (id) agentsArbiter().update({ sessionId: 'agent:' + source.id, emotionId: id });
      pushQuotaAgent();
    };
    tick();
    agentWatch[source.id] = setInterval(tick, 350);
  }
}

function stopAgentWatch() {
  for (const timer of Object.values(agentWatch)) clearInterval(timer);
  agentWatch = {};
  for (const id of Object.keys(agentRunning)) delete agentRunning[id];
  for (const id of Object.keys(agentSince)) delete agentSince[id];
  if (agentArbiter) {
    for (const source of AGENT_SOURCES) agentArbiter.remove('agent:' + source.id);
  }
  // A source switched off in settings is still shown as a session that is off;
  // pushing here keeps the row from claiming it runs until the next app start.
  pushQuotaAgent();
}

/* ------------------------------------------------------------- forms */

/**
 * Apply the one canonical three-state display mode.
 */
function applyForm() {
  if (showIsland()) island.show();
  else island.hide();
  if (!win || win.isDestroyed()) return;
  if (showBall()) win.showInactive();
  else win.hide();
  refreshMenus();
}

/* ---------------------------------------------------------------- menus */

/**
 * The tray menu is deliberately three entries.
 *
 * Everything that used to live here — form, show/hide, click-through, docking,
 * size, cast, demo expressions, agent hooks, file locations — is a persistent
 * setting now, and persistent settings belong in the settings window. A tray
 * menu that mirrors the whole app is a second UI to keep in sync; this one only
 * carries the things you reach for without opening anything.
 */
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '设置…', click: () => settings.create('general') },
    { type: 'separator' },
    {
      label: '置顶',
      type: 'checkbox',
      checked: pinned,
      click: (item) => {
        pinned = item.checked;
        if (win) win.setAlwaysOnTop(pinned, 'floating');
        savePrefs();
        refreshMenus();
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

/**
 * One channel for everything the settings window can do to the running app.
 *
 * `meta` is the read half: the cast table, the demo list, the agent sources and
 * the live visibility of both surfaces. The rest are the writes the tray menu
 * used to own, now driven from the settings page instead.
 */
function handleSettingsAction({ kind, value } = {}) {
  switch (kind) {
    case 'meta': {
      const prefs = readPrefs();
      return {
      platform: { id: platform.id, supported: platform.supported, features: platform.capabilities() },
        displayMode,
        pinned,
        clickThrough,
        dockSide,
        sizeKey,
        castId,
        islandVisible: Boolean(island.isVisible()),
        ballVisible: Boolean(win && win.isVisible()),
        casts: CORE
          ? CORE.FAMILIES.map((family) => ({
              id: family.id,
              label: `${family.zh} · ${family.en}`,
              members: CORE.CAST.filter((member) => member.family === family.id).map((member) => ({
                id: member.id,
                label: member.name.zh,
              })),
            }))
          : [],
        /*
         * Every expression, not a shortlist: the settings page draws them as
         * live characters, so a person picks by looking. Each emotion already
         * carries its state name and Chinese label.
         */
        demos: EMOTIONS.map((emotion) => ({
          id: emotion.id,
          label: emotion.name.zh,
          state: emotion.state,
        })),
        agents: agentSnapshot(),
      };
    }
    case 'dock': {
      if (value === 'none') undock();
      else dock(value);
      refreshMenus();
      return { ok: true, side: dockSide };
    }
    case 'demo': {
      /*
       * A preview is the strongest source, but not a permanent one: four
       * seconds is long enough to read the face and short enough that the
       * pet goes back to what it was actually doing on its own.
       */
      const gate = emotions();
      gate.set('manual', String(value));
      clearTimeout(manualEmotionTimer);
      manualEmotionTimer = setTimeout(() => gate.clear('manual'), 4000);
      return { ok: true };
    }
    case 'cast': {
      setCast(String(value));
      refreshMenus();
      return { ok: true, cast: castId };
    }
    case 'agent': {
      const id = String(value?.id ?? '');
      if (!id) return { ok: false };
      const next = { ...readJson(prefsPath(), {}), [`agent_${id}`]: Boolean(value.on) };
      writeJson(prefsPath(), next);
      startAgentWatch(next);
      refreshMenus();
      return { ok: true };
    }
    case 'settings': {
      settings.create(value || 'general');
      return { ok: true };
    }
    default:
      return null;
  }
}

function refreshMenus() {
  if (tray) tray.setContextMenu(buildMenu());
}

/**
 * Preferences that only exist in the main process: tray presence, the global
 * shortcut, and the full-screen watcher. All three are idempotent, so the prefs
 * listener can just call them again.
 */
let hiddenByFullscreen = false;

function applyTrayPreference() {
  const prefs = readPrefs();
  const wanted = prefs.trayIcon !== false;
  if (wanted && !tray) createTray();
  else if (!wanted && tray) {
    tray.destroy();
    tray = null;
  }
}

function applyHotkey() {
  const prefs = readPrefs();
  try {
    globalShortcut.unregisterAll();
    if (prefs.hotkey === false) return;
    globalShortcut.register('Alt+Shift+T', () => {
      if (island.isVisible()) island.hide();
      else island.show();
      refreshMenus();
    });
  } catch {
    // A taken shortcut is not a reason to fail startup.
  }
}

/**
 * Start or stop the auto-avoid watcher.
 *
 * The rules live in a resident PowerShell child; this only decides whether it
 * runs and pushes the three inputs it cannot read itself: the switch, the
 * browser switch and the custom app list.
 */
let avoiding = false;
function pushAvoid() {
  island.send('island:avoid', avoiding);
}
function applyAvoidanceWatch() {
  const prefs = readPrefs();
  if (prefs.avoidEnabled !== true || !platform.supports('fullscreen')) {
    avoidance.stop();
    if (avoiding) {
      avoiding = false;
      pushAvoid();
    }
    return;
  }
  avoidance.setIslandRect(island.pillRect());
  avoidance.update({
    enabled: true,
    browsers: prefs.avoidBrowsers !== false,
    apps: Array.isArray(prefs.avoidApps) ? prefs.avoidApps : [],
  });
  avoidance.start((on) => {
    avoiding = on;
    pushAvoid();
  });
}

function applyFullscreenWatch() {
  const prefs = readPrefs();
  if (prefs.hideFullscreen === false) {
    fullscreen.stop();
    if (hiddenByFullscreen) {
      hiddenByFullscreen = false;
      if (showIsland()) island.show();
    }
    return;
  }
  fullscreen.start((full) => {
    if (full && showIsland()) {
      hiddenByFullscreen = true;
      island.hide();
    } else if (!full && hiddenByFullscreen) {
      hiddenByFullscreen = false;
      if (showIsland()) island.show();
    }
  });
}

/**
 * Always-on-top and click-through are window flags, not chrome.
 *
 * Both used to be read once in createWindow(), so flipping them in settings
 * wrote prefs.json and changed nothing until the next launch. They are applied
 * here instead, and applyMainPrefs() runs on every preference change.
 */
function applyWindowFlags() {
  const prefs = readPrefs();
  const wantPinned = prefs.pinned !== false;
  if (win && !win.isDestroyed() && win.isAlwaysOnTop() !== wantPinned) {
    win.setAlwaysOnTop(wantPinned, 'screen-saver');
  }
  pinned = wantPinned;
  const wantThrough = prefs.clickThrough !== false;
  clickThroughEnabled = wantThrough;
  setClickThrough(wantThrough);
}

/**
 * Keep the ball on a display that exists.
 *
 * Two ways it stops being true: the user picks another screen in settings, or
 * the screen it was on is unplugged. Both end the same way — if the window is
 * not fully inside the chosen display's work area, move it to that display's
 * default corner. Coordinates are absolute, so a display to the left of the
 * primary (negative x) is handled by the same comparison.
 */
function applyDisplayPreference() {
  if (!win || win.isDestroyed()) return;
  const dim = SIZES[sizeKey];
  const outer = outerSize(dim);
  const area = workArea();
  const [x, y] = win.getPosition();
  const inside =
    x + outer > area.x &&
    x < area.x + area.width &&
    y + outer > area.y &&
    y < area.y + area.height;
  if (inside) return;
  const pos = defaultPosition(dim);
  dockSide = null;
  dockOpen = false;
  dockArmed = false;
  win.setPosition(pos.x, pos.y);
  savePrefs();
  notifyDock();
}

function handleDisplayChange() {
  applyDisplayPreference();
  // The island owns its own placement; ask it to re-run it.
  island.refreshPosition?.();
}

function applyMainPrefs() {
  applyTrayPreference();
  applyHotkey();
  applyFullscreenWatch();
  applyAvoidanceWatch();
  applyEmotionWatch();
  applyWindowFlags();
  applyDisplayPreference();
  island.refreshPrefs?.();
  // The ball's size is a window size, so a prefs change has to reach the
  // browser window — the tray used to be the only path that did.
  const prefs = readPrefs();
  if (SIZES[prefs.sizeKey] && prefs.sizeKey !== sizeKey) setSize(prefs.sizeKey);
}

function createTray() {
  // Pre-rendered at the tray's own size: scaling 512 down to 16 in the OS
  // produced stepped edges, which is exactly what the icon rework removed.
  const trayName = process.platform === 'win32' ? 'tray-32.png' : 'tray-16.png';
  const iconPath = path.join(__dirname, '..', 'assets', trayName);
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('EmojiTot');
  tray.setContextMenu(buildMenu());
  // Left click intentionally does nothing: the tray is a menu here, and a
  // click that silently toggles a window reads as an accident.
}

/* -------------------------------------------------------------- IPC glue */

/*
 * What each channel accepts.
 *
 * The renderer is untrusted by construction: it renders mail bodies, calendar
 * titles and clipboard text, any of which could carry markup that tries to
 * drive the main process. A handler that destructures whatever it is given
 * turns that into an arbitrary call, so every channel states its shape here
 * and anything else is refused before the handler runs.
 */
const checkMail = guard.actionPayload(['add', 'remove', 'markRead', 'delete', 'refresh']);
const checkCalendar = guard.actionPayload([
  'add', 'remove', 'import', 'subscribe', 'unsubscribe', 'refresh-subscriptions',
]);
const checkQuota = guard.actionPayload(['add', 'remove', 'select', 'refresh']);
const checkMedia = (payload) => {
  if (!guard.isPlainObject(payload)) return undefined;
  if (!guard.oneOf(payload.kind, ['toggle', 'next', 'prev', 'seek'])) return undefined;
  if (payload.arg !== undefined && !guard.isNumber(payload.arg, -1e9, 1e9)) return undefined;
  return payload;
};
/** A slider position is a whole percent; anything else is not a volume. */
const checkVolumeLevel = (level) => (guard.isNumber(level, 0, 100) ? Math.round(level) : undefined);
const checkVolumeMute = (muted) => (guard.isBool(muted) ? muted : undefined);
const checkPoint = (point) => {
  if (!guard.isPlainObject(point)) return undefined;
  if (!guard.isNumber(point.x, -100000, 100000) || !guard.isNumber(point.y, -100000, 100000)) return undefined;
  return { x: point.x, y: point.y };
};
const checkDockSide = (side) => (side === undefined || side === null ? null : guard.oneOf(side, ['top', 'left', 'right']) ? side : undefined);

/** `local:do` is a service bus; the switch below is its allowlist. */
const LOCAL_ACTIONS = {
  focus: ['start', 'pause', 'resume', 'stop', 'skip', 'restart'],
  health: ['drink', 'stand', 'reset', 'resetWater', 'resetStand'],
  todo: ['add', 'toggle', 'remove', 'update', 'clearDone'],
  shelf: ['add', 'addBuffer', 'open', 'reveal', 'remove'],
  clipboard: ['copy', 'togglePin', 'remove', 'clear', 'clearUnpinned'],
  messenger: ['activate'],
};
const SHELF_BUFFER_LIMIT = 8 * 1024 * 1024;
const BUS_LIMIT = 64 * 1024;

const checkLocal = (payload) => {
  if (!guard.isPlainObject(payload)) return undefined;
  const allowed = LOCAL_ACTIONS[payload.service];
  if (!allowed || !guard.oneOf(payload.action, allowed)) return undefined;
  if (payload.data !== undefined && !guard.isPlainObject(payload.data)) return undefined;
  const data = payload.data ?? {};
  if (payload.action === 'addBuffer') {
    // The one channel that carries bytes: a dragged-in file image. Bounded
    // here as well as in the guard, because the outer limit has to cover it.
    if (guard.byteSize(data.bytes) > SHELF_BUFFER_LIMIT) return undefined;
    if (!guard.isString(data.name, 255)) return undefined;
  } else if (guard.byteSize(payload) > BUS_LIMIT) {
    return undefined;
  }
  return { service: payload.service, action: payload.action, data };
};


/**
 * Read-only state, for tests only.
 *
 * Edge docking and click-through are invisible in the DOM: they are window
 * behaviour. Without a way to ask the main process what it actually did,
 * "verified" would mean "looks plausible". One handler, always registered —
 * it used to be declared twice (once unconditionally, once under --dev), and
 * the second registration crashed the whole app on `electron . --dev`.
 */
guard.guardedHandle('debug:state', ['ball', 'island', 'settings'], () => {
  if (!win || win.isDestroyed()) return null;
  return {
    clickThrough,
    pinned,
    docked: dockSide ? (dockOpen ? `${dockSide}-open` : dockSide) : null,
    dockOpen,
    cast: castId,
    size: SIZES[sizeKey],
    sizeKey,
    displayMode,
    bounds: win.getBounds(),
    visible: win.isVisible(),
    workArea: workArea(),
    islandVisible: island.isVisible(),
  };
});
guard.guardedHandle('debug:dock', ['ball'], (side) => {
  if (side) dock(side);
  else undock();
  return { docked: dockSide, dockOpen };
}, { check: checkDockSide, maxBytes: 256 });

guard.guardedSend('drag:start', ['ball'], (point) => {
  if (dockSide) undock();
  startDrag(point);
}, { check: checkPoint, maxBytes: 256 });
guard.guardedSend('drag:end', ['ball'], endDrag, { maxBytes: 64 });
guard.guardedSend('pet:menu', ['ball'], () => {
  if (!win) return;
  buildMenu().popup({ window: win });
}, { maxBytes: 64 });
guard.guardedSend('pet:action', ['ball'], () => {
  const actions = ['bounce', 'spin', 'burst'];
  const action = actions[Math.floor(Math.random() * actions.length)];
  if (win) safeSend(win, 'state:action', action);
}, { maxBytes: 64 });

/*
 * One face, two windows.
 *
 * The ball runs its own idle moods — a pet that only rests is a screensaver —
 * and the island wears the same character. Without this relay the island sat
 * on the task state while the ball borrowed an expression every few seconds,
 * so the two faces drifted apart within one cycle. Both windows report what
 * they are showing; both receive what the other one reported.
 */
function relayFace(state) {
  const next = typeof state === 'string' ? state.slice(0, 32) : '';
  if (!next) return;
  island.send('island:face', next);
  safeSend(win, 'face:apply', next);
}
guard.guardedSend('face:report', ['ball', 'island'], relayFace, {
  check: (value) => (typeof value === 'string' && value.length > 0 ? value : undefined),
  maxBytes: 256,
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
  const autoLocate = prefs.weather?.autoLocate === true;
  try {
    const data = await weather.load(city, autoLocate);
    island.send('island:weather', data);
  } catch (error) {
    // Offline: the island keeps the last reading rather than an empty card.
    console.error('[weather] failed', city, error?.message ?? String(error));
  }
}

/** Weather cadence comes from settings; changing it takes effect at once. */
function scheduleWeather() {
  clearInterval(weatherTimer);
  const minutes = Math.max(5, Number(readPrefs().weather?.intervalMin) || 15);
  weatherTimer = setInterval(refreshWeather, minutes * 60 * 1000);
}

/**
 * What each background worker is, and how to start and stop it.
 *
 * One entry per service named by the shared schema's PAGE_MANIFEST or
 * STATUS_MANIFEST. applyServicePlan() diffs the wanted set against what is
 * running, so boot and every later preference change take the same path.
 */
const SERVICE_PLAN = {
  battery: { feature: 'battery',
    start: () => {
      pushBattery();
      clearInterval(batteryTimer);
      batteryTimer = setInterval(pushBattery, 30000);
    },
    stop: () => {
      clearInterval(batteryTimer);
      batteryTimer = null;
    },
  },
  weather: {
    feature: 'weather',
    start: () => {
      refreshWeather();
      scheduleWeather();
    },
    stop: () => {
      clearInterval(weatherTimer);
      weatherTimer = null;
    },
  },
  media: { feature: 'media', start: () => media.start(), stop: () => media.stop() },
  focus: { start: () => focus.startService(), stop: () => focus.stopService() },
  health: { start: () => health.startService(), stop: () => health.stopService() },
  todo: { start: () => todo.startService(), stop: () => todo.stopService() },
  quota: { feature: 'quota', start: () => quota.startService(), stop: () => quota.stopService() },
  mail: { feature: 'mail', start: () => mail.startService(), stop: () => mail.stopService() },
  calendar: { feature: 'calendar', start: () => calendar.startService(), stop: () => calendar.stopService() },
  clipboard: { feature: 'clipboard', start: () => clipboardHistory.start(), stop: () => clipboardHistory.stop() },
  devices: { feature: 'devices', start: () => devices.start(), stop: () => devices.stop() },
  messenger: { feature: 'messenger', start: () => messenger.start(), stop: () => messenger.stop() },
};

const runningServices = new Set();

/**
 * Start what should run, stop what should not.
 *
 * A page switched off in settings stops its worker here. The one exception is
 * a pill status item that still needs the same worker: switching the weather
 * page off must not blank the temperature in the collapsed pill, so
 * enabledServices() unions the two sets.
 *
 * Idempotent, so the prefs listener calls it on every change.
 */
function applyServicePlan() {
  let wanted;
  if (SCHEMA) {
    wanted = SCHEMA.enabledServices(readPrefs());
  } else {
    wanted = new Set(Object.keys(SERVICE_PLAN));
  }

  for (const [name, control] of Object.entries(SERVICE_PLAN)) {
    const shouldRun = wanted.has(name) && (!control.feature || platform.supports(control.feature));
    const isRunning = runningServices.has(name);
    if (wanted.has(name) && !shouldRun && !isRunning) {
      // Enabled in settings, unsupported here: skip once, do not retry.
      continue;
    }
    if (shouldRun && !isRunning) {
      try {
        control.start();
        runningServices.add(name);
      } catch (error) {
        console.error('[services] start', name, error?.message ?? String(error));
      }
    } else if (!shouldRun && isRunning) {
      try {
        control.stop();
      } catch (error) {
        console.error('[services] stop', name, error?.message ?? String(error));
      }
      runningServices.delete(name);
    }
  }
}

function startServices() {
  /*
   * Listeners are registered once and outlive any single worker: a service
   * switched off and back on must not stack a second copy of its listener.
   */
  media.onChange(() => applyMediaEmotion());
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

  focus.onChange((value) => island.send('island:focus', value));
  health.onChange((value) => island.send('island:health', value));
  todo.onChange((value) => island.send('island:todos', value));
  shelf.onChange((value) => island.send('island:shelf', value));
  clipboardHistory.onChange((value) => island.send('island:clipboard', value));
  messenger.setPrefsReader(readPrefs);
  messenger.onChange((value) => island.send('island:messenger', value));
  devices.onChange((value) => island.send('island:devices', value));
  quota.onChange(pushQuotaAgent);
  mail.onChange((value) => island.send('island:mail', value));
  // Same shape as the bootstrap payload: the page reads .events, and a bare
  // array here made every pushed update render as "nothing scheduled".
  calendar.onChange(() => island.send('island:calendar', {
    events: calendar.list(),
    upcoming: calendar.upcoming(),
    subscriptions: calendar.subscriptionList(),
  }));

  applyServicePlan();

  guard.guardedHandle('mail:get', ['settings', 'island'], () => mail.snapshot());
  guard.guardedHandle('mail:do', ['settings', 'island'], async (payload) => {
    return mailAction(mail, payload);
  }, { check: checkMail, maxBytes: 16 * 1024 });

  guard.guardedHandle('calendar:get', ['settings', 'island'], () => ({
    events: calendar.list(),
    upcoming: calendar.upcoming(),
    subscriptions: calendar.subscriptionList(),
  }));
  guard.guardedHandle('calendar:do', ['settings'], async (payload) => {
    return calendarAction(calendar, payload);
  }, { check: checkCalendar, maxBytes: 64 * 1024 });

  guard.guardedHandle('quota:get', ['settings'], () => quota.snapshot());
  guard.guardedHandle('quota:do', ['settings', 'island'], async (payload) => {
    return quotaAction(quota, payload);
  }, { check: checkQuota, maxBytes: 16 * 1024 });

  guard.guardedHandle('local:get', ['island'], () => ({
    focus: focus.snapshot(),
    health: health.snapshot(),
    todos: todo.list(),
    shelf: shelf.list(),
    clipboard: clipboardHistory.list(),
    messenger: messenger.snapshot(),
    devices: devices.snapshot(),
  }));

  guard.guardedHandle('local:do', ['island', 'settings'], async (payload) => {
    const { service, action, data } = payload;
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
      else if (action === 'reset') health.reset();
      else if (action === 'resetWater') health.resetWater();
      else if (action === 'resetStand') health.resetStand();
    } else if (service === 'todo') {
      if (action === 'add') todo.add(data?.text, data?.due, data?.repeat);
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
    } else if (service === 'clipboard') {
      if (action === 'copy') clipboardHistory.copy(data?.id);
      else if (action === 'togglePin') clipboardHistory.togglePin(data?.id);
      else if (action === 'remove') clipboardHistory.remove(data?.id);
      else if (action === 'clear') clipboardHistory.clear();
      else if (action === 'clearUnpinned') clipboardHistory.clearUnpinned();
    } else if (service === 'messenger') {
      /* The island sends a row's window handle as `id` (its one generic data
         shape), so accepting only `handle` made every switch a no-op. */
      if (action === 'activate') messenger.activate(data?.handle ?? data?.id);
    }
    return {
      focus: focus.snapshot(),
      health: health.snapshot(),
      todos: todo.list(),
      shelf: shelf.list(),
      clipboard: clipboardHistory.list(),
      messenger: messenger.snapshot(),
      devices: devices.snapshot(),
    };
  }, { check: checkLocal, maxBytes: SHELF_BUFFER_LIMIT + 1024 });

  // The island asks once after it loads: pushing into a window that is still
  // parsing its page would drop the first frame.
  guard.guardedHandle('island:bootstrap', ['island'], () => ({
    battery: lastBattery,
    /* The AI page boots from one snapshot: the balance and the sources the pet
       watches, so its first paint cannot show half a page. */
    quotaAgent: quotaAgentSnapshot(),
    weather: weather.cached(),
    media: media.current(),
    lyrics: lastLyrics,
    focus: focus.snapshot(),
    health: health.snapshot(),
    todos: todo.list(),
    shelf: shelf.list(),
    clipboard: clipboardHistory.list(),
    messenger: messenger.snapshot(),
    devices: devices.snapshot(),
    mail: mail.snapshot(),
    calendar: {
      events: calendar.list(),
      upcoming: calendar.upcoming(),
      subscriptions: calendar.subscriptionList(),
    },
    // Read the file rather than the variable: the island can load before the
    // startup code has restored castId, and then it would boot on whatever
    // cast the HTML was written with.
    cast: readPrefs().cast || castId,
    prefs: readPrefs(),
  }));

  /*
   * The devices page's star: one device name in, the merged prefs out.
   *
   * The cap is enforced here, not in the renderer: a page that could write
   * devices.pinned directly could also pin ten rows, or a name that is not a
   * device. Reading current prefs and rebuilding the group also keeps the
   * other members of the group (showBattery) from being dropped by the write.
   */
  guard.guardedHandle('island:devices-pin', ['island'], (name) => {
    const current = readPrefs().devices ?? {};
    const pinned = Array.isArray(current.pinned) ? current.pinned : [];
    const nextPinned = pinned.includes(name)
      ? pinned.filter((item) => item !== name)
      : pinned.length >= DEVICE_PIN_LIMIT ? pinned : pinned.concat(name);
    return settings.applyPatch({ devices: { ...current, pinned: nextPinned } });
  }, {
    check: (name) => (typeof name === 'string' && name.length > 0 && name.length <= 120 ? name : undefined),
    maxBytes: 512,
  });

  guard.guardedHandle('media:control', ['island'], (payload) => {
    media.command(payload.kind, Number(payload.arg) || 0);
    return media.current();
  }, { check: checkMedia, maxBytes: 1024 });

  // Master volume: a read is cheap once the watcher is warm, and the set path
  // returns the new state so the panel never shows a value it did not apply.
  guard.guardedHandle('volume:get', ['island'], () => volume.get());
  guard.guardedHandle('volume:set', ['island'], (level) => volume.set(level), { check: checkVolumeLevel, maxBytes: 256 });
  guard.guardedHandle('volume:mute', ['island'], (muted) => volume.mute(muted), { check: checkVolumeMute, maxBytes: 256 });
}

/* --------------------------------------------------------------- hardening */

/*
 * Every page this app creates renders something a stranger wrote: a mail
 * subject, a calendar title, a clipboard line, a song name. None of them has
 * any reason to navigate, open a window, embed a webview or ask for the
 * camera, so all four capabilities are refused once, globally, instead of
 * being re-decided at each call site.
 */
const LOCAL_PAGE = /^file:\/\/.*\/renderer\/[a-z-]+\.html$/i;

function isLocalPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && LOCAL_PAGE.test(url.split('?')[0]);
  } catch {
    return false;
  }
}

app.on('web-contents-created', (_event, contents) => {
  // No window.open, no target=_blank, no popup that inherits our preload.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isLocalPage(url)) {
      event.preventDefault();
      console.warn('[security] blocked navigation to', String(url).slice(0, 120));
    }
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

/**
 * Permission requests, answered without asking the user.
 *
 * The app needs no camera, microphone, geolocation, notification relay or
 * clipboard-read permission from Chromium: it reads the clipboard from the
 * main process and draws notifications there too. A granted permission would
 * only ever be used by injected markup.
 */
function hardenSession(target) {
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
  if (typeof target.setDevicePermissionHandler === 'function') {
    target.setDevicePermissionHandler(() => false);
  }
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
    hardenSession(session.defaultSession);
    await loadCore();
    await loadSchema();
    const stored = readPrefs();
    castId = typeof stored.cast === 'string' && stored.cast ? stored.cast : 'tot';
    displayMode = stored.displayMode;
    createWindow();
    if (win) win.webContents.on('did-finish-load', () => safeSend(win, 'cast:changed', castId));
    settings.registerIpc();
    island.registerIpc();
    // The island page cannot hold data that was pushed before it listened.
    island.onLoaded(() => {
      if (runningServices.has('battery')) pushBattery();
      if (runningServices.has('weather')) refreshWeather();
      island.send('settings:changed', readPrefs());
      pushAvoid();
    });
    createTray();
    screen.on('display-removed', handleDisplayChange);
    screen.on('display-added', handleDisplayChange);
    screen.on('display-metrics-changed', handleDisplayChange);
    ensureStateFile();
    startPointerWatch();
    startAgentWatch(stored);
    startServices();
    applyForm();
    applyMainPrefs();
    // Any window may change prefs; the tray and the visible form follow.
    settings.setWeatherRefresher(refreshWeather);
    settings.setActionHook(handleSettingsAction);
    island.startOledShift();
    island.setBoundsHook((rect) => avoidance.setIslandRect(rect));
    // The window was placed before this hook existed, so hand over the current
    // rectangle now: without it the script has no island and never collapses.
    avoidance.setIslandRect(island.pillRect());
    let previousPrefs = readPrefs();
    settings.onPrefs(() => {
      const next = readPrefs();
      const changes = SCHEMA?.serviceChanges(previousPrefs, next) ?? {};
      displayMode = next.displayMode;
      applyForm();
      applyMainPrefs();
      applyServicePlan();
      if (changes.weatherReschedule) scheduleWeather();
      if (changes.weatherRefresh) refreshWeather();
      if (changes.quotaReschedule) quota.reschedule();
      messenger.refresh();
      island.send('settings:changed', next);
      previousPrefs = next;
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
    try {
      globalShortcut.unregisterAll();
    } catch {
      // shutting down anyway
    }
    fullscreen.stop();
    volume.stop();
    games.stop();
    // Anything a service spawned but did not stop (a watcher whose kill raced the
    // quit) must not survive us: an orphan PowerShell keeps polling with a console
    // of its own and nothing on screen says where it came from.
    try {
      platform.killWatchers();
    } catch {
      // shutting down anyway
    }
    for (const name of runningServices) {
      try {
        SERVICE_PLAN[name]?.stop();
      } catch {
        // shutting down anyway
      }
    }
    runningServices.clear();
    stopAgentWatch();
    fs.unwatchFile(statePath());
  });
}
