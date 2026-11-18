/**
 * The wall: every character, and every expression, as a grid you can click.
 *
 * Clicking a character adopts it in the console; clicking an expression deep
 * links to `#/console?state=<id>` so a shared link opens on that face.
 */
import { CAST, FACE_META, castMember, renderCast } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';
import { getLang, t } from './i18n';
import { onLookChange, selectCast } from './store';
import type { View } from './main';

const SEGMENTS = [
  { id: 'all', label: 'wall.all' },
  { id: 'life', label: 'wall.group.life' },
  { id: 'emotion', label: 'wall.group.emotion' },
  { id: 'agent', label: 'wall.group.agent' },
] as const;

type Segment = (typeof SEGMENTS)[number]['id'];

function castTile(id: string): string {
  const member = castMember(id)!;
  return `<button type="button" class="tile" data-cast="${id}" data-motion="${member.motion}" title="${member.desc} · ${t('wall.hover.motion')}">
    <span class="tile-art">${renderCast({ id, state: member.face, size: 96 })}</span>
    <span class="tile-name">${getLang() === 'zh' ? member.name.zh : member.name.en}</span>
  </button>`;
}

/** The expression's own name, from the protocol — zh and en both live there. */
function faceLabel(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return state;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
}

function faceTile(id: string): string {
  return `<button type="button" class="tile" data-state="${id}" data-id="${id}" data-motion="pop" title="${t('wall.hover.motionShort')}">
    <span class="tile-art">${renderCast({ id: 'tot', state: id, size: 76 })}</span>
    <span class="tile-name">${faceLabel(id)}</span>
  </button>`;
}

export function createWall(): View {
  const el = document.createElement('div');
  el.className = 'wall-view';

  let tab: 'cast' | 'emotion' = 'cast';
  let segment: Segment = 'all';

  el.innerHTML = `
    <header class="wall-head">
      <h2>${t('wall.title')}</h2>
      <p>${t('wall.lead')}</p>
    </header>
    <div class="wall-tabs">
      <button type="button" data-tab="cast" aria-pressed="true">${t('wall.tab.cast')} <b id="castCount"></b></button>
      <button type="button" data-tab="emotion" aria-pressed="false">${t('wall.tab.emotion')} <b>${FACE_META.length}</b></button>
    </div>
    <div class="wall-filters" id="wallFilters"></div>
    <div class="wall-grid" id="wallGrid"></div>
    <p class="wall-count" id="wallCount"></p>
  `;

  const filters = el.querySelector<HTMLElement>('#wallFilters')!;
  const grid = el.querySelector<HTMLElement>('#wallGrid')!;
  const count = el.querySelector<HTMLElement>('#wallCount')!;

  function paintFilters(): void {
    filters.innerHTML = SEGMENTS.map(
      (item) =>
        `<button type="button" data-segment="${item.id}" aria-pressed="${item.id === segment}">${t(item.label)}</button>`,
    ).join('');
  }

  function paintGrid(): void {
    if (tab === 'cast') {
      grid.innerHTML = CAST.filter(() => segment === 'all' || segment === 'cast').map((m) => castTile(m.id)).join('');
      count.textContent = t('wall.count.cast', { n: CAST.length, total: CAST.length });
      return;
    }
    const list = FACE_META.map((item) => item.id);
    grid.innerHTML = list.map((id) => faceTile(id)).join('');
    count.textContent = t('wall.count.state', { n: list.length, total: FACE_META.length });
  }

  function paintTabs(): void {
    for (const button of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
    }
    // Family filters only make sense for characters.
    filters.hidden = tab !== 'cast';
  }

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-tab], [data-segment], [data-cast], [data-state]',
    );
    if (!target) return;
    if (target.dataset.tab) {
      tab = target.dataset.tab as 'cast' | 'emotion';
      segment = 'all';
      paintTabs();
      paintFilters();
      paintGrid();
      return;
    }
    if (target.dataset.segment) {
      segment = target.dataset.segment as Segment;
      paintFilters();
      paintGrid();
      return;
    }
    const cast = target.dataset.cast;
    if (cast) {
      selectCast(cast);
      location.hash = '#/console';
      return;
    }
    const state = target.dataset.state;
    if (state) location.hash = `#/console?state=${state}`;
  });

  paintTabs();
  paintFilters();
  paintGrid();
  const unsubscribe = onLookChange(() => {
    if (tab === 'emotion') paintGrid();
  });

  return {
    el,
    dispose(): void {
      unsubscribe();
    },
  };
}
