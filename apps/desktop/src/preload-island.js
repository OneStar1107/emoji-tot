/**
 * The island's only door to the main process.
 *
 * The page measures itself and reports the box; everything else is one-way
 * pushes from services that already know the answer.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('islandAPI', {
  /** Content size, measured by the page. The window follows it. */
  reportBox: (box) => ipcRenderer.send('island:box', box),
  bootstrap: () => ipcRenderer.invoke('island:bootstrap'),
  openSettings: (page) => ipcRenderer.invoke('settings:open', page),
  quit: () => ipcRenderer.invoke('app:quit').catch(() => {}),

  onBattery: (listener) => on('island:battery', listener),
  onWeather: (listener) => on('island:weather', listener),
  onMedia: (listener) => on('island:media', listener),
  onLyrics: (listener) => on('island:lyrics', listener),
  control: (kind, arg) => ipcRenderer.invoke('media:control', { kind, arg }),
  onFocus: (listener) => on('island:focus', listener),
  onHealth: (listener) => on('island:health', listener),
  onTodos: (listener) => on('island:todos', listener),
  onShelf: (listener) => on('island:shelf', listener),
  onClipboard: (listener) => on('island:clipboard', listener),
  onMessenger: (listener) => on('island:messenger', listener),
  onDevices: (listener) => on('island:devices', listener),
  onQuota: (listener) => on('island:quota', listener),
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
  onPrefs: (listener) => on('settings:changed', listener),
});
