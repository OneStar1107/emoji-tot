/**
 * The tray panel's door: read what to draw, report one action, close.
 *
 * The page never sees Node or the rest of the IPC surface — three calls and one
 * subscription is everything a menu needs.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayAPI', {
  state: () => ipcRenderer.invoke('tray:state'),
  act: (kind) => ipcRenderer.invoke('tray:act', kind),
  close: () => ipcRenderer.invoke('tray:close'),
  onState: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('tray:state', handler);
    return () => ipcRenderer.removeListener('tray:state', handler);
  },
});
