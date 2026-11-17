/**
 * The renderer's only door to the main process.
 *
 * Nothing here exposes Node: the page gets four calls and three events, which
 * is everything a ball needs to be dragged, clicked and told what to feel.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  /** Start following the cursor. `point` is in screen coordinates. */
  dragStart: (point) => ipcRenderer.send('drag:start', point),
  dragEnd: () => ipcRenderer.send('drag:end'),
  /** Ask the main process to pop the context menu at the cursor. */
  openMenu: () => ipcRenderer.send('pet:menu'),
  /** A click that was not a drag: the pet does something by itself. */
  poke: () => ipcRenderer.send('pet:action'),

  /** Every message the host wants the character to play. */
  onState: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('state:apply', handler);
    return () => ipcRenderer.removeListener('state:apply', handler);
  },
  /** bounce | spin | burst */
  onAction: (listener) => {
    const handler = (_event, action) => listener(action);
    ipcRenderer.on('state:action', handler);
    return () => ipcRenderer.removeListener('state:action', handler);
  },
  onSize: (listener) => {
    const handler = (_event, px) => listener(px);
    ipcRenderer.on('size:changed', handler);
    return () => ipcRenderer.removeListener('size:changed', handler);
  },
});
