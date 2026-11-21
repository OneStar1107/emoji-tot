/**
 * The tray panel's page: paint the state, move focus, report one action.
 *
 * The page owns no state of its own — pinned and the theme are pushed from the
 * main process, which is the only thing that knows what the app is doing.
 */
const api = window.trayAPI;
const root = document.documentElement;
const versionEl = document.getElementById('version');
const items = Array.from(document.querySelectorAll('.item'));
const pinRow = document.querySelector('[data-act="pin"]');

function paint(state) {
  if (!state) return;
  root.dataset.theme = state.light ? 'light' : 'dark';
  versionEl.textContent = state.version ? 'v' + state.version : '';
  pinRow.setAttribute('aria-checked', state.pinned ? 'true' : 'false');
}

/** Focus a row by index, wrapping at both ends. */
function focusAt(index) {
  const item = items[(index + items.length) % items.length];
  if (item) item.focus();
}

function activeIndex() {
  const index = items.indexOf(document.activeElement);
  return index < 0 ? 0 : index;
}

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  switch (event.key) {
    case 'ArrowDown':
      focusAt(activeIndex() + 1);
      break;
    case 'ArrowUp':
      focusAt(activeIndex() - 1);
      break;
    case 'Home':
      focusAt(0);
      break;
    case 'End':
      focusAt(items.length - 1);
      break;
    case 'Escape':
      api.close();
      break;
    // Enter and Space are the button's own activation; Tab stays the browser's.
    default:
      return;
  }
  event.preventDefault();
});

for (const item of items) {
  item.addEventListener('click', () => api.act(item.dataset.act));
}

api.onState(paint);
api.state().then(paint);
// A menu opens with a choice under the keyboard, not on nothing.
items[0].focus();
