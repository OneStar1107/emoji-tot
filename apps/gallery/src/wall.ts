/**
 * The gallery: the cast wall, and the expression wall.
 *
 * Two walls, because there are two things to browse. The cast wall answers
 * "what characters are there" — 134 members in fifteen bodies, filterable by
 * family. The expression wall answers "what does a character look like when it
 * feels something" — all forty-four states of one character, or one state
 * across the whole cast.
 *
 * Every tile is a real render from the engine, produced once and left as
 * static SVG: the wall never runs a frame loop, so 134 characters cost 134
 * paths, not 134 animations.
 */
import { CAST, FAMILIES, MOTION_ZH, castMember, renderCast, renderCharacter } from '@emojibot/core';
import { EMOTIONS, EMOTION_SEGMENTS, getEmotion, type SegmentId } from '@emojibot/protocol';
import { look, onLookChange, selectCast } from './store';
import { t } from './i18n';

const THUMB = 108;

function currentSvg(state: string, size = THUMB): string {
  return renderCharacter({
    body: look.body,
    color: look.color,
    traits: look.traits,
    state,
    size,
  });
}

function castSvg(id: string, state: string, size = THUMB): string {
  return renderCast({ id, state, size });
}

function castCard(id: string): string {
  const member = castMember(id)!;
  return `<button type="button" class="tile" data-cast="${id}" title="${member.desc}">
    ${castSvg(id, member.face, THUMB)}
    <span class="tile-name">${member.name.zh}</span>
    <span class="tile-sub">${MOTION_ZH[member.motion] ?? member.motion}</span>
  </button>`;
}

function stateCard(id: string, state: string, name: string): string {
  return `<button type="button" class="tile" data-state="${state}" data-id="${id}">
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
  let segment: 'all' | SegmentId = 'all';

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
      const options = [{ id: 'all', label: t('wall.all') }, ...EMOTION_SEGMENTS.map((s) => ({ id: s.id, label: s.name.zh }))];
      filters.innerHTML = options
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
    const list =
      segment === 'all'
        ? EMOTIONS
        : EMOTIONS.filter((d) => {
            const range = EMOTION_SEGMENTS.find((s) => s.id === segment)!.range;
            const n = Number(d.id);
            return n >= range[0] && n <= range[1];
          });
    count.textContent = `${list.length} / ${EMOTIONS.length} 个状态`;
    grid.innerHTML = list.map((d) => stateCard(d.id, d.state, d.name.zh)).join('');
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
      segment = segBtn.dataset.segment as 'all' | SegmentId;
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
      const emotion = getEmotion(state.dataset.id!);
      if (emotion) {
        location.hash = `#/console?state=${emotion.state}`;
      }
    }
  });

  paintAll();
  onLookChange(() => {
    if (tab === 'emotion') paintGrid();
  });
  return el;
}
