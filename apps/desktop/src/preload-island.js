/**
 * The island's only door to the main process.
 *
 * The page measures itself and reports the box; everything else is one-way
 * pushes from services that already know the answer.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');
/*
 * A sandboxed preload gets a cut-down process and does not see the
 * additionalArguments a webPreferences list sets, so the argv route read
 * none on a machine whose window really was acrylic. One synchronous IPC
 * call before the page runs is the reliable form: it blocks for a few
 * microseconds and the answer is final.
 */

/** Subscribe to one channel; returns the unsubscribe function. */
const on = (channel, listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
const windowMaterial = (() => {
  try {
    const value = ipcRenderer.sendSync('island:material');
    return typeof value === 'string' && value ? value : 'none';
  } catch (error) {
    return 'none';
  }
})();
contextBridge.exposeInMainWorld('islandAPI', {
  /** 'acrylic' (Windows 11 DWM blur) or 'none'. Read-only, decided at launch. */
  material: () => windowMaterial,
  /** Content size, measured by the page. The window follows it. */
  reportBox: (box) => ipcRenderer.send('island:box', box),
  /** Size of what is drawn right now (pill, panel or strip) — the hover target. */
  reportHit: (hit) => ipcRenderer.send('island:hit', hit),
  bootstrap: () => ipcRenderer.invoke('island:bootstrap'),
  /**
   * One screenshot of the desktop behind the panel, or null.
   *
   * `rect` is the panel's box in CSS pixels inside this window. The main
   * process answers with the frame, the display it belongs to and the offset to
   * paint it at — the page never guesses where the desktop is. A failed capture
   * is null, and the CSS material stays.
   */
  openSettings: (page) => ipcRenderer.invoke('settings:open', page),
  /**
   * The weather page's city switcher: one preference write, the same channel
   * settings uses. The main process merges it, tells every window and refreshes
   * the city through serviceChanges(), so the page does not own a second path.
   */
  patchPrefs: (patch) => ipcRenderer.invoke('settings:patch', patch),
  /** The devices page's Bluetooth row: open the system's own Bluetooth page. */
  openSystem: (target) => ipcRenderer.invoke('settings:openSystem', target),
  quit: () => ipcRenderer.invoke('app:quit').catch(() => {}),

  onBattery: (listener) => on('island:battery', listener),
  onWeather: (listener) => on('island:weather', listener),
  onMedia: (listener) => on('island:media', listener),
  onLyrics: (listener) => on('island:lyrics', listener),
  control: (kind, arg) => ipcRenderer.invoke('media:control', { kind, arg }),
  volumeGet: () => ipcRenderer.invoke('volume:get'),
  volumeSet: (level) => ipcRenderer.invoke('volume:set', level),
  volumeMute: (muted) => ipcRenderer.invoke('volume:mute', muted),
  onFocus: (listener) => on('island:focus', listener),
  onHealth: (listener) => on('island:health', listener),
  onTodos: (listener) => on('island:todos', listener),
  onShelf: (listener) => on('island:shelf', listener),
  onClipboard: (listener) => on('island:clipboard', listener),
  onMessenger: (listener) => on('island:messenger', listener),
  onDevices: (listener) => on('island:devices', listener),
  /**
   * The devices page opened or closed. Main probes the vendor HID channel once
   * as it opens and keeps it on a 30s clock while it stays visible.
   */
  devicesFocus: (active) => ipcRenderer.send('island:devices-focus', active),
  devicesRefresh: () => ipcRenderer.invoke('island:devices-refresh'),
  /**
   * Pin or unpin one device. Main owns the three-pin cap and replies with the
   * whole preference object, so the page renders the answer instead of
   * predicting it.
   */
  pinDevice: (name) => ipcRenderer.invoke('island:devices-pin', name),
  /* One face, one event: the same payload the ball window receives. */
  onFace: (listener) => on('face:apply', listener),
  onCast: (listener) => on('island:cast', listener),
  onQuotaAgent: (listener) => on('island:quota-agent', listener),
  quotaDo: (action, data) => ipcRenderer.invoke('quota:do', { action, data }),
  onMail: (listener) => on('island:mail', listener),
  onCalendar: (listener) => on('island:calendar', listener),
  mailDo: (action, data) => ipcRenderer.invoke('mail:do', { action, data }),
  calendarDo: (action, data) => ipcRenderer.invoke('calendar:do', { action, data }),
  localGet: () => ipcRenderer.invoke('local:get'),
  localDo: (service, action, data) => ipcRenderer.invoke('local:do', { service, action, data }),
  /** Electron 33 removed File.path; this is the supported replacement. */
  filePath: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  /** Fallback for a drag that yields bytes but no path (virtual files). */
  shelfAddBuffer: (name, bytes) => ipcRenderer.invoke('local:do', { service: 'shelf', action: 'addBuffer', data: { name, bytes } }),
  onHover: (listener) => on('island:hover', listener),
  /** The island window moved. */
  onMoved: (listener) => on('island:moved', listener),
  onAvoid: (listener) => on('island:avoid', listener),
  onPrefs: (listener) => on('settings:changed', listener),
});
