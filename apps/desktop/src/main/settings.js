/**
 * The settings window: one page, left rail, grouped cards.
 *
 * It is a normal resizable window, not an overlay: settings are the one place
 * the user is allowed to stop and read. Every control writes straight to
 * prefs.json and tells the other windows — there is no apply button, and no
 * second copy of the state.
 */
const { BrowserWindow, ipcMain, screen, shell, app } = require('electron');
const path = require('node:path');
const { readPrefs, writePrefs, userDir, statePath } = require('./paths');
const guard = require('./ipc-guard');

let win = null;
const listeners = new Set();
/** Injected by boot: refreshing weather belongs to main.js, not this module. */
let refreshWeatherHook = null;
/**
 * Injected by boot: showing, hiding, docking, switching cast and demoing an
 * expression all own state in main.js. The settings window reaches them
 * through one channel instead of four, so a new action is one case there.
 */
let actionHook = null;

function setWeatherRefresher(fn) {
  refreshWeatherHook = fn;
}

function setActionHook(fn) {
  actionHook = fn;
}

function create(page) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    if (page) win.webContents.send('settings:goto', page);
    return win;
  }
  win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    transparent: false,
    backgroundColor: '#111114',
    show: false,
    title: 'EmojiTot 设置',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  // Register before the page can call anything, so the first message is
  // already attributed to this window.
  guard.claim('settings', win.webContents);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (page) win.webContents.send('settings:goto', page);
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

function broadcastPrefs(next) {
  for (const fn of listeners) fn(next);
}

/* ----------------------------------------------------------------- guard */

/** Action kinds the settings page may ask for, and nothing else. */
const ACTION_KINDS = ['meta', 'island', 'ball', 'dock', 'demo', 'cast', 'agent', 'settings'];
const SIDES = ['top', 'left', 'right', 'none'];
const PATCH_LIMIT = 32 * 1024;

/** A preference patch: a plain object of known keys, bounded in size. */
const checkPatch = (patch) => (guard.isPlainObject(patch) ? patch : undefined);

/**
 * One action message.
 *
 * `kind` is a closed set — without it a page could reach any branch that
 * happened to be added later. `value` is bounded because the cast grid sends
 * ids and the settings page sends booleans; neither needs more than a few
 * hundred bytes.
 */
const checkAction = (message) => {
  if (!guard.isPlainObject(message)) return undefined;
  if (!guard.oneOf(message.kind, ACTION_KINDS)) return undefined;
  if (message.value !== undefined && guard.byteSize(message.value) > 8 * 1024) return undefined;
  if (message.kind === 'dock' && message.value !== undefined && !guard.oneOf(message.value, SIDES)) return undefined;
  if (message.kind === 'settings' && message.value !== undefined && !guard.isString(message.value, 32)) return undefined;
  if (message.kind === 'agent' && message.value !== undefined) {
    if (!guard.isPlainObject(message.value)) return undefined;
    if (!guard.isId(message.value.id)) return undefined;
  }
  return message;
};

const checkPage = (page) => {
  if (page === undefined || page === null) return null;
  return typeof page === 'string' && /^[a-z-]{1,32}$/.test(page) ? page : undefined;
};

function registerIpc() {
  guard.guardedHandle('settings:get', ['settings'], () => readPrefs());

  guard.guardedHandle(
    'settings:patch',
    ['settings'],
    (patch) => {
      const next = writePrefs(patch);
      // Applying the OS login item is the one patch with a side effect outside
      // prefs.json; doing it here keeps every entry point (tray, settings,
      // future onboarding) consistent.
      if ('launchAtLogin' in patch) {
        try {
          app.setLoginItemSettings({ openAtLogin: Boolean(patch.launchAtLogin) });
        } catch {
          // Unsupported on some Linux desktops; prefs still records the intent.
        }
      }
      // The window that made the change also gets the merged object, so a
      // control can be changed by the tray or by another window and still repaint.
      if (win && !win.isDestroyed()) win.webContents.send('settings:changed', next);
      broadcastPrefs(next);
      return next;
    },
    { check: checkPatch, maxBytes: PATCH_LIMIT },
  );

  guard.guardedHandle('settings:version', ['settings'], () => app.getVersion());

  guard.guardedHandle('settings:displays', ['settings'], () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      label: display.label || `显示器 ${display.id}`,
      primary: display.id === primaryId,
      width: display.size.width,
      height: display.size.height,
    }));
  });

  guard.guardedHandle('settings:refresh-weather', ['settings'], async () => {
    try {
      await refreshWeatherHook?.();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });

  guard.guardedHandle(
    'settings:action',
    ['settings'],
    async (message) => {
      try {
        return (await actionHook?.(message)) ?? null;
      } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
      }
    },
    { check: checkAction, maxBytes: 16 * 1024 },
  );

  guard.guardedHandle('settings:meta', ['settings'], async () => {
    try {
      return (await actionHook?.({ kind: 'meta' })) ?? null;
    } catch {
      return null;
    }
  });

  guard.guardedHandle('settings:open-state', ['settings'], () => shell.openPath(statePath()));
  guard.guardedHandle('settings:open-data', ['settings'], () => shell.openPath(userDir()));
  guard.guardedHandle('settings:open-repo', ['settings'], () =>
    shell.openExternal('https://github.com/OneStar1107/emoji-tot'));

  guard.guardedHandle('app:quit', ['settings', 'island'], () => app.quit());

  guard.guardedHandle('settings:open', ['settings', 'island'], (page) => {
    create(page);
    return true;
  }, { check: checkPage, maxBytes: 512 });

  guard.guardedHandle('settings:close', ['settings'], () => {
    if (win && !win.isDestroyed()) win.close();
    return true;
  });

  guard.guardedHandle('settings:minimize', ['settings'], () => {
    if (win && !win.isDestroyed()) win.minimize();
    return true;
  });

  guard.guardedHandle('settings:maximize', ['settings'], () => {
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    return true;
  });
}

/** Register a callback the tray can use to mirror form changes. */
function onPrefs(fn) {
  listeners.add(fn);
}

function isOpen() {
  return Boolean(win && !win.isDestroyed());
}

module.exports = { create, registerIpc, isOpen, onPrefs, setWeatherRefresher, setActionHook };
