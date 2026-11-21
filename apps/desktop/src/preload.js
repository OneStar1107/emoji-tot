/**
 * The renderer's only door to the main process.
 *
 * Nothing here exposes Node: the page gets a handful of calls and events, which
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

  /*
   * The face the main process says both windows are wearing right now.
   *
   * One-way on purpose: the renderer paints what it is handed and has no call
   * to report an expression back. Two producers is exactly how the ball and
   * the island drifted apart.
   */
  onFace: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('face:apply', handler);
    return () => ipcRenderer.removeListener('face:apply', handler);
  },
  /** bounce | spin | burst */
  onAction: (listener) => {
    const handler = (_event, action) => listener(action);
    ipcRenderer.on('state:action', handler);
    return () => ipcRenderer.removeListener('state:action', handler);
  },
  /** The cast member the pet should wear. */
  onCast: (listener) => {
    const handler = (_event, id) => listener(id);
    ipcRenderer.on('cast:changed', handler);
    return () => ipcRenderer.removeListener('cast:changed', handler);
  },
  /** Which edge the ball is docked to, or null. */
  onDock: (listener) => {
    const handler = (_event, side) => listener(side);
    ipcRenderer.on('dock:changed', handler);
    return () => ipcRenderer.removeListener('dock:changed', handler);
  },

  /** Present only when the main process runs with --dev. */
  debugState: () => ipcRenderer.invoke('debug:state'),
  /** Dev-only: drive the dock so edge behaviour is testable. */
  debugDock: (side) => ipcRenderer.invoke('debug:dock', side),

  onSize: (listener) => {
    const handler = (_event, px) => listener(px);
    ipcRenderer.on('size:changed', handler);
    return () => ipcRenderer.removeListener('size:changed', handler);
  },
});
