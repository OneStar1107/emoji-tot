/**
 * The update card: one 320x200 dark card that says a newer version exists.
 *
 * There is no release checker in this build. The card owns only the part after
 * the news arrives: a checker (or a future background task) calls
 * notifyAvailable({ version, notes }) once, and this module decides whether to
 * show, remembers that it did, and writes the "later" answer to prefs.json.
 * Keeping the two halves apart means a checker can be added or replaced
 * without touching the card, and no network request exists here to test around.
 *
 * Three rules, no more:
 *
 * 1. Once per app run. A second push in the same session is dropped.
 * 2. 「稍后」 writes updatePrompt.snoozeUntil and the card stays away for 24h.
 * 3. Escape or either button closes it; 打开下载页 goes to GitHub Releases.
 *
 * EMOJITOT_UPDATE_TEST=<n> pushes the same event n times shortly after boot so
 * the real window can be driven over CDP without a checker or a socket. With
 * the variable set, 打开下载页 logs the target instead of handing it to the
 * shell, so a verification run does not open a browser on the desktop.
 */
const { BrowserWindow, screen, shell } = require('electron');
const path = require('node:path');
const guard = require('./ipc-guard');
const { readPrefs, writePrefs } = require('./paths');

/** The card's own size. The window asks for this and the page centres the card. */
const CARD = { width: 320, height: 200, margin: 24 };

/** How long 「稍后」 keeps the card away. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Where 打开下载页 goes. Kept here, never taken from the event payload. */
const RELEASES_URL = 'https://github.com/OneStar1107/emoji-tot/releases';

/** What EMOJITOT_UPDATE_TEST pushes: a plausible next release, nothing more. */
const TEST_VERSION = '0.6.6';
const TEST_NOTES = [
  '设备页展示全部蓝牙电量，通话耳机单独读数',
  '岛在 140% 缩放下不再裁掉翻页箭头',
];

let win = null;
/** The payload the open card draws; kept so a slow load still gets its data. */
let payload = null;
/** Set the first time the card is shown, and never cleared: one push per run. */
let shownThisRun = false;
/** Test runs log the download target instead of asking the shell to open it. */
const testMode = Boolean(process.env.EMOJITOT_UPDATE_TEST);

function snoozeUntil() {
  const value = Number(readPrefs().updatePrompt?.snoozeUntil);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Normalise what a checker handed us.
 *
 * Only what the card draws is kept: a version and at most two lines. The URL
 * is not part of the payload at all — 打开下载页 always uses RELEASES_URL, so
 * a malformed or hostile event cannot turn the button into "open anything".
 */
function normalize(info) {
  if (!info || typeof info !== 'object') return null;
  const version = typeof info.version === 'string' ? info.version.trim().replace(/^v/i, '').slice(0, 32) : '';
  if (!version) return null;
  const notes = Array.isArray(info.notes)
    ? info.notes
        .filter((note) => typeof note === 'string' && note.trim())
        .slice(0, 2)
        .map((note) => note.trim().slice(0, 160))
    : [];
  return { version, notes };
}

function bounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.max(area.x, area.x + area.width - CARD.width - CARD.margin),
    y: Math.max(area.y, area.y + area.height - CARD.height - CARD.margin),
  };
}

function create() {
  const at = bounds();
  win = new BrowserWindow({
    width: CARD.width,
    height: CARD.height,
    x: at.x,
    y: at.y,
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
    title: 'EmojiTot 更新',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-update.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Registered before the page loads, so its first message is attributed.
  guard.claim('update', win.webContents);
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'update.html'));
  win.webContents.on('did-finish-load', () => guard.safeSend(win, 'update:show', payload));
  win.once('ready-to-show', () => {
    // Focused on purpose: Escape is one of the three ways out of the card.
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    win = null;
  });
}

/**
 * The one push a checker needs.
 *
 * Returns false when nothing was shown, which is also what a second call in
 * the same run gets — the card never stacks, and a background poll firing
 * every few minutes cannot turn into a dialog storm.
 */
function notifyAvailable(info) {
  const next = normalize(info);
  if (!next) return false;
  if (shownThisRun) {
    console.log('[update] already shown this run, dropping', next.version);
    return false;
  }
  const until = snoozeUntil();
  if (until > Date.now()) {
    console.log('[update] snoozed until', new Date(until).toISOString(), '— dropping', next.version);
    return false;
  }
  shownThisRun = true;
  payload = next;
  if (win && !win.isDestroyed()) guard.safeSend(win, 'update:show', payload);
  else create();
  console.log('[update] showing', next.version, next.notes.length + ' note(s)');
  return true;
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

/**
 * 「稍后」: one preference write, then close.
 *
 * The card is the only writer of this key, so the merge is only there to keep
 * a hand-edited prefs.json from losing anything else in the group.
 */
function snooze() {
  const until = Date.now() + SNOOZE_MS;
  writePrefs({ updatePrompt: { ...(readPrefs().updatePrompt ?? {}), snoozeUntil: until } });
  console.log('[update] snoozed until', new Date(until).toISOString());
  close();
  return until;
}

async function openDownload() {
  if (testMode) {
    console.log('[update] test mode: would open', RELEASES_URL);
    close();
    return { ok: true, url: RELEASES_URL, opened: false };
  }
  try {
    await shell.openExternal(RELEASES_URL);
    console.log('[update] opened', RELEASES_URL);
    close();
    return { ok: true, url: RELEASES_URL, opened: true };
  } catch (error) {
    console.log('[update] open failed', error?.message ?? String(error));
    return { ok: false, url: RELEASES_URL, error: String(error?.message ?? error) };
  }
}

/**
 * Fire the test push. No-op unless EMOJITOT_UPDATE_TEST is set.
 *
 * The first event waits for boot to settle; later ones are spaced so a second
 * push arrives while the card is already on screen — which is exactly the
 * "same session, no repeat" case a single shot cannot show.
 */
function startTestInjection() {
  if (!testMode) return false;
  const count = Math.min(Math.max(Number(process.env.EMOJITOT_UPDATE_TEST) || 1, 1), 5);
  const send = () => notifyAvailable({ version: TEST_VERSION, notes: TEST_NOTES });
  setTimeout(() => {
    send();
    for (let index = 1; index < count; index += 1) setTimeout(send, index * 900);
  }, 1500);
  return true;
}

function registerIpc() {
  guard.guardedHandle('update:snooze', ['update'], () => snooze());
  guard.guardedHandle('update:open', ['update'], () => openDownload());
  guard.guardedHandle('update:close', ['update'], () => {
    close();
    return true;
  });
}

module.exports = { registerIpc, notifyAvailable, startTestInjection };
