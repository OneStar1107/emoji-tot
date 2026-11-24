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
  action: (kind, value) => ipcRenderer.invoke('settings:action', { kind, value }),
  meta: () => ipcRenderer.invoke('settings:meta'),
  openState: () => ipcRenderer.invoke('settings:open-state'),
  openData: () => ipcRenderer.invoke('settings:open-data'),
  openRepo: () => ipcRenderer.invoke('settings:open-repo'),
  /** The devices page's live rows: the same snapshot the island devices page gets. */
  devices: () => ipcRenderer.invoke('settings:devices'),
  devicesRefresh: () => ipcRenderer.invoke('settings:devices-refresh'),
  /** The devices page is on screen: start the probe it reads, and stop on leave. */
  devicesWatch: (active) => ipcRenderer.invoke('settings:devices-watch', active === true),
  /** Main owns the three-pin cap; it replies with the merged prefs. */
  pinDevice: (name) => ipcRenderer.invoke('settings:devices-pin', name),
  /* Names only: main rebuilds the devices group from its own copy, so a drag
     that raced a pin from the island cannot undo it. */
  orderDevices: (names) => ipcRenderer.invoke('settings:devices-order', names),
  /** Show or hide one device on the island, by name; replies with merged prefs. */
  hideDevice: (name, hidden) => ipcRenderer.invoke('settings:devices-hidden', { name, hidden: hidden === true }),
  onDevices: (listener) => on('settings:devices', listener),
  onUpdateStatus: (listener) => on('settings:update-status', listener),
  quota: () => ipcRenderer.invoke('quota:get'),
  quotaDo: (action, data) => ipcRenderer.invoke('quota:do', { action, data }),
  mail: () => ipcRenderer.invoke('mail:get'),
  mailDo: (action, data) => ipcRenderer.invoke('mail:do', { action, data }),
  calendar: () => ipcRenderer.invoke('calendar:get'),
  /** "Forget the clipboard history" — the one action that deletes user data. */
  clipboardClear: () => ipcRenderer.invoke('local:do', { service: 'clipboard', action: 'clear' }),
  calendarDo: (action, data) => ipcRenderer.invoke('calendar:do', { action, data }),
  /** Running apps with a visible window, for the auto-avoid picker. */
  avoidApps: () => ipcRenderer.invoke('settings:avoid-apps'),
  /** PNG data URLs keyed by executable path. */
  avoidIcons: (paths) => ipcRenderer.invoke('settings:avoid-icons', paths),
  onGoto: (listener) => on('settings:goto', listener),
  onChanged: (listener) => on('settings:changed', listener),
  /** The same selected cast the ball, island, onboarding and tray receive. */
  onCast: (listener) => on('settings:cast', listener),
  /**
   * The face the main process owns — the same payload the ball and the island
   * receive. One-way on purpose: this window draws the character in its rail,
   * it never decides what that character is feeling.
   */
  onFace: (listener) => on('face:apply', listener),
});
