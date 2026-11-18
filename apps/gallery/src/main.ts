/**
 * The site shell: four views, one hash router, one switch for the page colour.
 *
 * A view returns its element and a dispose function. The router disposes the
 * outgoing view before building the next one — that is what keeps a page
 * change from leaving an interval behind: the scene runs two timers plus a
 * per-actor loop, and switching back and forth twenty times used to stack
 * twenty of each.
 */
import { defineBall } from '@emojitot/core/element';
import { createConsole } from './console';
import { createWall } from './wall';
import { createScene } from './scene';
import { createDocs } from './docs';
import { getLang, onLangChange, setLang, t, type MessageKey } from './i18n';
import './style.css';

defineBall();

/**
 * What a view hands back.
 *
 * `dispose` must clear every timer, subscription and global listener the view
 * created. Forgetting one leaks for the rest of the session, and a user who
 * flips between Scene and Console twenty times will not notice until the
 * animation stutters.
 */
export interface View {
  el: HTMLElement;
  dispose?: () => void;
}

export interface RouteContext {
  /** The route name, e.g. `console`. */
  route: string;
  /** `?state=happy` on `#/console?state=happy`. */
  state?: string;
}

const view = document.getElementById('view')!;

const routes: Record<string, (ctx: RouteContext) => View> = {
  console: createConsole,
  gallery: createWall,
  scene: createScene,
  docs: createDocs,
};

/** Parse `#/console?state=happy` into a route plus its parameters. */
export function parseHash(hash = location.hash): { route: string; ctx: RouteContext } {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const route = path in routes ? path : 'console';
  const params = new URLSearchParams(query);
  const state = params.get('state');
  return { route, ctx: { route, state: state || undefined } };
}

/** Static chrome that is not rebuilt with the view. */
function applyStaticText(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as MessageKey);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle as MessageKey));
  }
  for (const button of document.querySelectorAll<HTMLElement>('#lang button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === getLang()));
  }
}

let active: View | null = null;

function render(): void {
  const { route, ctx } = parseHash();
  // Dispose first: the outgoing view may be holding intervals that would keep
  // mutating a detached DOM node.
  if (active) {
    try {
      active.dispose?.();
    } catch (error) {
      console.error('[view] dispose failed', error);
    }
    active = null;
  }
  applyStaticText();
  const next = routes[route](ctx);
  active = next;
  view.replaceChildren(next.el);
  for (const link of document.querySelectorAll<HTMLAnchorElement>('#nav a')) {
    link.setAttribute('aria-current', String(link.dataset.route === route));
  }
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);

document.getElementById('lang')!.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-lang]');
  if (!button) return;
  setLang(button.dataset.lang as 'zh' | 'en', false);
});

/*
 * Language is a route-level concern: re-render rather than patch text nodes,
 * so a view's own strings are regenerated from the same dictionary.
 */
onLangChange(render);

/*
 * The ball is always white, so the switch only changes what is behind it.
 * Kept separate from the console's own background control on purpose: this
 * one is about the page, that one is about the stage.
 */
const root = document.documentElement;
const mono = document.getElementById('mono') as HTMLInputElement;

function setMono(on: boolean): void {
  root.dataset.mono = on ? 'dark' : 'light';
  try {
    localStorage.setItem('es.mono', on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

let saved = false;
try {
  saved = localStorage.getItem('es.mono') === '1';
} catch {
  saved = false;
}
mono.checked = saved;
setMono(saved);
mono.addEventListener('change', () => setMono(mono.checked));

render();
