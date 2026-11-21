/**
 * The update card's only door to the main process.
 *
 * The card draws what it is handed and answers with one of three intents.
 * There is no channel to ask for a version or to fetch anything: the main
 * process owns the payload and the download URL.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  /** The payload for the card that is about to be drawn. */
  onShow: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('update:show', handler);
    return () => ipcRenderer.removeListener('update:show', handler);
  },
  /** 「稍后」: main writes the 24h snooze and closes this window. */
  snooze: () => ipcRenderer.invoke('update:snooze'),
  /** 打开下载页: main opens GitHub Releases and closes this window. */
  openDownload: () => ipcRenderer.invoke('update:open'),
  close: () => ipcRenderer.invoke('update:close'),
});
