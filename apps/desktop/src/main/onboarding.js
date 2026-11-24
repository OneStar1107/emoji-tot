/**
 * The first-launch guide: two pages, skippable.
 *
 * It exists because of the one decision a fresh profile cannot reach: the
 * settings window is the only place that owns form and skin, and a person who
 * has never run the app has no reason to find it. Page one says what the app
 * is; page two asks the two things that change how it looks — whether the
 * character lives in the island, as a free desktop ball, or both, and which of
 * the three skins it wears.
 *
 * It writes ordinary preferences through settings.applyPatch(), the same
 * function the settings window uses, so a choice made here is applied to the
 * running app exactly like a click there would be. The only extra key is
 * `onboardingDone`, which is what stops the guide from ever appearing again;
 * skipping writes that key alone, because "not now" must not choose a form for
 * someone.
 */
const { BrowserWindow, app, screen } = require('electron');
const path = require('node:path');
const { readPrefs } = require('./paths');
const settings = require('./settings');
const guard = require('./ipc-guard');
const { FRAME } = require('./ipc-frame');
const { loadBuildVersion } = require('./build-version');

/** The closed set of answers page two may send back. */
const DISPLAY_MODES = ['island', 'ball', 'both'];
const SKINS = ['frost', 'solid', 'plain'];

/*
 * This window's page joins the shared frame list (main/ipc-frame.js) here
 * rather than in that file: the list is only read by frameMatches(), and this
 * module is loaded before any window can message, so registering once at load
 * keeps the role and the page that uses it in one place.
 */
FRAME.onboarding = /^file:\/\/.*renderer[\\/]onboarding\.html$/i;

/** Fixed and centred: the guide is a real 780x630 window, matching the
 *  capture-ui.mjs emulation, so CJK headings and body copy have room to
 *  breathe without being broken across lines. */
const WIDTH = 780;
const HEIGHT = 630;

let win = null;

/**
 * Turn what the page sent into a preference patch.
 *
 * Skipping is the whole difference between the two endings: it records that
 * the guide is done and changes nothing else, so a skipped profile still
 * starts on the defaults. Unknown values are dropped here as well as in the
 * guard, so a malformed message cannot write a form the app does not have.
 */
function patchFor(choice) {
  const patch = { onboardingDone: true };
  if (!choice || choice.skipped === true) return patch;
  if (DISPLAY_MODES.includes(choice.displayMode)) patch.displayMode = choice.displayMode;
  if (SKINS.includes(choice.skin)) patch.skin = choice.skin;
  return patch;
}

/** Keep the payload to the three fields the page is allowed to send. */
function checkChoice(choice) {
  if (!guard.isPlainObject(choice)) return undefined;
  const next = {};
  if (choice.skipped === true) next.skipped = true;
  if (guard.oneOf(choice.displayMode, DISPLAY_MODES)) next.displayMode = choice.displayMode;
  if (guard.oneOf(choice.skin, SKINS)) next.skin = choice.skin;
  return next;
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

/** Keep an already-open guide on the same cast as the running desktop. */
function sendCast(cast) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('onboarding:cast', cast);
}

/** Apply the answer and close; returns the patch for the reply. */
function finish(choice) {
  const patch = patchFor(choice);
  settings.applyPatch(patch);
  // The reply goes back over IPC before the window it came from disappears.
  setTimeout(close, 0);
  return patch;
}

function create() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    /*
     * A frameless window still gets the WS_THICKFRAME border by default, which
     * inflates the page by two pixels. Turning it off makes 780×630 mean
     * exactly 780×630 CSS pixels; `center` is done after the window exists
     * because passing it here inflates both dimensions by two as well.
     */
    thickFrame: false,
    transparent: false,
    backgroundColor: '#101114',
    show: false,
    title: '欢迎使用 EmojiTot',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-onboarding.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  // Register before the page can call anything, so the first message is
  // already attributed to this window.
  guard.claim('onboarding', win.webContents);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'onboarding.html'));
  win.once('ready-to-show', () => {
    // 780×630 at the centre of the primary display; the buttons stay where the
    // eye found them instead of depending on where the last window was.
    const area = screen.getPrimaryDisplay().workArea;
    win.setBounds({
      x: Math.round(area.x + (area.width - WIDTH) / 2),
      y: Math.round(area.y + (area.height - HEIGHT) / 2),
      width: WIDTH,
      height: HEIGHT,
    });
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

/**
 * Show the guide only for a profile that has not finished it.
 *
 * Called once from boot, after the ball/island and their preference listener
 * exist: the guide must open over a working app, not instead of one.
 */
function maybeShow() {
  if (readPrefs().onboardingDone === true) return false;
  create();
  return true;
}

function registerIpc() {
  guard.guardedHandle('onboarding:get', ['onboarding'], () => {
    const prefs = readPrefs();
    return {
      cast: prefs.cast,
      displayMode: prefs.displayMode,
      skin: prefs.skin,
      theme: prefs.theme,
      version: loadBuildVersion(path.join(__dirname, '..', '..'), app.getVersion()),
    };
  });

  guard.guardedHandle(
    'onboarding:finish',
    ['onboarding'],
    (choice) => ({ ok: true, patch: finish(choice) }),
    { check: checkChoice, maxBytes: 1024 },
  );
}

module.exports = { registerIpc, maybeShow, sendCast };
