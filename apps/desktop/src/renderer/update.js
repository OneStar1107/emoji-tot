/**
 * The update card's page.
 *
 * One payload in, three intents out. Everything is drawn with textContent, so
 * a release note containing markup stays text — the payload is written by the
 * main process, but the page does not need to trust it.
 */
const api = window.updateAPI;

const versionEl = document.getElementById('update-version');
const notesEl = document.getElementById('update-notes');
const laterEl = document.getElementById('later');
const downloadEl = document.getElementById('download');

/** Draw one {version, notes} payload. Missing pieces leave the card empty. */
function render(payload) {
  if (!payload || typeof payload !== 'object') return;
  versionEl.textContent = payload.version ? 'v' + String(payload.version) : '';
  const notes = Array.isArray(payload.notes) ? payload.notes.slice(0, 2) : [];
  notesEl.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement('li');
      item.textContent = String(note);
      return item;
    }),
  );
}

api?.onShow(render);

laterEl.addEventListener('click', () => api?.snooze());
downloadEl.addEventListener('click', () => api?.openDownload());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    api?.close();
  }
});

// No element takes focus on open: the window itself is focused by the main
// process, Escape works at document level, and a programmatic focus ring on
// 打开下载页 would read as "already chosen" before the person chose anything.
