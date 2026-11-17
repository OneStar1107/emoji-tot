/**
 * The site shell: four views, one hash router, one switch for the page colour.
 *
 * No framework: the views return DOM, and swapping them is `replaceChildren`.
 * That is enough for four pages and keeps the bundle to the engine alone.
 */
import { defineAoraBot } from '@aora-bot/element';
import { createConsole } from './console';
import { createWall } from './wall';
import { createThemes } from './themes';
import { createDocs } from './docs';
import './style.css';

defineAoraBot();

const view = document.getElementById('view')!;
const routes = {
  console: createConsole,
  gallery: createWall,
  themes: createThemes,
  docs: createDocs,
};
type Route = keyof typeof routes;

function currentRoute(): Route {
  const key = location.hash.replace(/^#\/?/, '') as Route;
  return key in routes ? key : 'console';
}

function render(): void {
  const route = currentRoute();
  view.replaceChildren(routes[route]());
  for (const link of document.querySelectorAll<HTMLAnchorElement>('#nav a')) {
    link.setAttribute('aria-current', String(link.dataset.route === route));
  }
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);

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
