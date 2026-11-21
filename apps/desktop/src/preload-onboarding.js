/**
 * The guide's door: ask what to preselect, post one closed answer.
 *
 * The page never receives the whole settings object and cannot write an
 * arbitrary preference: `finish` accepts the form, the skin or "skipped", and
 * the main process decides which of those become a patch (see
 * main/onboarding.js). Nothing else about the app is reachable from here.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onboardingAPI', {
  get: () => ipcRenderer.invoke('onboarding:get'),
  finish: (choice) => ipcRenderer.invoke('onboarding:finish', choice),
});
