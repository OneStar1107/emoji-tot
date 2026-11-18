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
const { readPrefs, writePrefs, userDir } = require('./paths');

let win = null;
const listeners = new Set();
/** Injected by boot: refreshing weather belongs to main.js, not this module. */
let refreshWeatherHook = null;

function setWeatherRefresher(fn) {
  refreshWeatherHook = fn;
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
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
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

function registerIpc() {
  ipcMain.handle('settings:get', () => readPrefs());
  ipcMain.handle('settings:patch', (_event, patch) => {
    if (!patch || typeof patch !== 'object') return readPrefs();
    const next = writePrefs(patch);
    // Applying the OS login item is the one patch with a side effect outside
    // prefs.json; doing it here keeps every entry point (tray, settings, future
    // onboarding) consistent.
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
  });

  ipcMain.handle('settings:version', () => app.getVersion());

  ipcMain.handle('settings:displays', () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      label: display.label || `显示器 ${display.id}`,
      primary: display.id === primaryId,
      width: display.size.width,
      height: display.size.height,
    }));
  });

  ipcMain.handle('settings:refresh-weather', async () => {
    try {
      await refreshWeatherHook?.();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });

  ipcMain.handle('settings:open-data', () => shell.openPath(userDir()));
  ipcMain.handle('settings:open-repo', () => shell.openExternal('https://github.com/OneStar1107/emoji-tot'));
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('settings:open', (_event, page) => {
    create(page);
    return true;
  });
  ipcMain.handle('settings:close', () => {
    if (win && !win.isDestroyed()) win.close();
    return true;
  });
  ipcMain.handle('settings:minimize', () => {
    if (win && !win.isDestroyed()) win.minimize();
    return true;
  });
  ipcMain.handle('settings:maximize', () => {
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

module.exports = { create, registerIpc, isOpen, onPrefs, setWeatherRefresher };
