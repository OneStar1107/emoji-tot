/**
 * The settings window's door: read prefs, patch prefs, close.
 *
 * Every control patches one key and gets the merged object back, so the page
 * never keeps a second copy of state that could drift from prefs.json.
 */
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  patch: (patch) => ipcRenderer.invoke('settings:patch', patch),
  open: (page) => ipcRenderer.invoke('settings:open', page),
  close: () => ipcRenderer.invoke('settings:close'),
  minimize: () => ipcRenderer.invoke('settings:minimize'),
  maximize: () => ipcRenderer.invoke('settings:maximize'),
  version: () => ipcRenderer.invoke('settings:version'),
  displays: () => ipcRenderer.invoke('settings:displays'),
  refreshWeather: () => ipcRenderer.invoke('settings:refresh-weather'),
  openData: () => ipcRenderer.invoke('settings:open-data'),
  openRepo: () => ipcRenderer.invoke('settings:open-repo'),
  onGoto: (listener) => on('settings:goto', listener),
  onChanged: (listener) => on('settings:changed', listener),
});
