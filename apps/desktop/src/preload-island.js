/**
 * The island's only door to the main process.
 *
 * The page measures itself and reports the box; everything else is one-way
 * pushes from services that already know the answer.
 */
const { contextBridge, ipcRenderer } = require('electron');

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
  onHover: (listener) => on('island:hover', listener),
  onPrefs: (listener) => on('settings:changed', listener),
});
