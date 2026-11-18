/**
 * The gallery: the cast wall, and the expression wall.
 *
 * Two walls, because there are two things to browse. The cast wall answers
 * "what characters are there" — fifteen, one per hand-written outline. The
 * expression wall answers "what does a character look like when it feels
 * something" — all forty-four states, grouped by whether the ball is alive,
 * feeling, or working.
 *
 * Every tile is a real render from the engine, produced once and left as
 * static SVG: the wall never runs a frame loop.
 */
import { CAST, FACE_META, FAMILIES, MOTION_ZH, castMember, facesInGroup, renderCast } from '@emojitot/core';
import { look, onLookChange, selectCast } from './store';
import { t } from './i18n';

const THUMB = 108;

function currentSvg(state: string, size = THUMB): string {
  return renderCast({ id: look.cast || CAST[0].id, state, size, style: look.finish });
}

function castSvg(id: string, state: string, size = THUMB): string {
  return renderCast({ id, state, size, style: look.finish });
}

function castCard(id: string): string {
  const member = castMember(id)!;
  return `<button type="button" class="tile" data-cast="${id}" data-motion="${member.motion}" title="${member.desc} · 悬停看动作">
    ${castSvg(id, member.face, THUMB)}
    <span class="tile-name">${member.name.zh}</span>
    <span class="tile-sub">${MOTION_ZH[member.motion] ?? member.motion}</span>
  </button>`;
}

function stateCard(id: string, state: string, name: string): string {
  return `<button type="button" class="tile" data-state="${state}" data-id="${id}" data-motion="pop" title="悬停看动作">
    ${currentSvg(state, THUMB)}
    <span class="tile-name">${name}</span>
    <span class="tile-sub">#${id}</span>
  </button>`;
}

export function createWall(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wall-view';

  let tab: 'cast' | 'emotion' = 'cast';
  let family = 'all';
  let segment: 'all' | 'life' | 'emotion' | 'agent' = 'all';

  el.innerHTML = `
    <section class="wall-head">
      <div class="tabs" id="tabs">
        <button type="button" data-tab="cast" aria-pressed="true">角色 <b id="castCount"></b></button>
        <button type="button" data-tab="emotion" aria-pressed="false">表情 <b>44</b></button>
      </div>
      <span class="count" id="count"></span>
    </section>
    <section class="filters" id="filters"></section>
    <section class="grid" id="grid"></section>
  `;

  const grid = el.querySelector<HTMLElement>('#grid')!;
  const filters = el.querySelector<HTMLElement>('#filters')!;
  const count = el.querySelector<HTMLElement>('#count')!;
  el.querySelector('#castCount')!.textContent = String(CAST.length);

  function paintFilters(): void {
    if (tab === 'cast') {
      const options = [{ id: 'all', label: t('wall.all') }, ...FAMILIES.map((f) => ({ id: f.id, label: f.zh }))];
      filters.innerHTML = options
        .map((o) => `<button type="button" data-family="${o.id}" aria-pressed="${o.id === family}">${o.label}</button>`)
        .join('');
    } else {
      const groups = [
        { id: 'all', label: t('wall.all') },
        { id: 'life', label: '生命周期' },
        { id: 'emotion', label: '情绪反应' },
        { id: 'agent', label: '代理工作' },
      ];
      filters.innerHTML = groups
        .map((o) => `<button type="button" data-segment="${o.id}" aria-pressed="${o.id === segment}">${o.label}</button>`)
        .join('');
    }
  }

  function paintGrid(): void {
    if (tab === 'cast') {
      const list = family === 'all' ? CAST : CAST.filter((m) => m.family === family);
      count.textContent = `${list.length} / ${CAST.length} 个角色`;
      grid.innerHTML = list.map((m) => castCard(m.id)).join('');
      return;
    }
    const list = segment === 'all' ? FACE_META : facesInGroup(segment);
    count.textContent = `${list.length} / ${FACE_META.length} 个状态`;
    grid.innerHTML = list.map((m) => stateCard(m.id, m.id, m.name)).join('');
  }

  function paintTabs(): void {
    for (const b of el.querySelectorAll<HTMLElement>('#tabs button')) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    }
  }

  function paintAll(): void {
    paintTabs();
    paintFilters();
    paintGrid();
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const tabBtn = target.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab as 'cast' | 'emotion';
      paintAll();
      return;
    }
    const famBtn = target.closest<HTMLElement>('[data-family]');
    if (famBtn) {
      family = famBtn.dataset.family!;
      paintFilters();
      paintGrid();
      return;
    }
    const segBtn = target.closest<HTMLElement>('[data-segment]');
    if (segBtn) {
      segment = segBtn.dataset.segment as 'all' | 'life' | 'emotion' | 'agent';
      paintFilters();
      paintGrid();
      return;
    }
    const cast = target.closest<HTMLElement>('[data-cast]');
    if (cast) {
      selectCast(cast.dataset.cast!);
      location.hash = '#/console';
      return;
    }
    const state = target.closest<HTMLElement>('[data-state]');
    if (state) {
      location.hash = `#/console?state=${state.dataset.state}`;
    }
  });

  paintAll();
  onLookChange(() => {
    if (tab === 'emotion') paintGrid();
  });
  return el;
}
