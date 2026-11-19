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

  /*
   * The face the ball is showing right now, so the island can wear it too.
   * Idle moods are invented here, one window or the other has to say them out
   * loud for the two characters to stay the same.
   */
  reportFace: (state) => ipcRenderer.send('face:report', state),
  /** What the other window is wearing. */
  onFace: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('face:apply', handler);
    return () => ipcRenderer.removeListener('face:apply', handler);
  },

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
