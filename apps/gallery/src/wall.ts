/**
 * The wall: every character, and every expression, as a grid you can click.
 *
 * Clicking a character adopts it in the console; clicking an expression opens
 * it enlarged, with its protocol id and the snippet that reproduces it, and
 * jumps to the console from there. The grid is a keyboard surface too: Tab
 * walks into it, the arrows move between cells and Enter opens one.
 *
 * Two rules shape the DOM here. The grid is rebuilt synchronously — the
 * acceptance script reads how many tiles it holds in the same task as the
 * click — so the filter animation is an overlaid copy that fades out
 * (`.wall-grid-ghost`) instead of a view transition, whose update callback
 * runs a task later and would leave the old count readable for a frame.
 */
import { CAST, FACE_META, FAMILIES, castMember, renderCast } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';
import { getLang, t } from './i18n';
import { onLookChange, selectCast } from './store';
import type { View } from './main';

function castTile(id: string): string {
  const member = castMember(id)!;
  return '<button type="button" class="tile" data-cast="' + id + '" data-motion="' + member.motion + '" title="' +
    member.desc + ' · ' + t('wall.hover.motion') + '">' +
    '<span class="tile-art">' + renderCast({ id, state: member.face, size: 96 }) + '</span>' +
    '<span class="tile-name">' + (getLang() === 'zh' ? member.name.zh : member.name.en) + '</span>' +
    '</button>';
}

/** The expression's own name, from the protocol — zh and en both live there. */
function faceLabel(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return state;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
}

/** The protocol id the docs page calls the public contract: 11, 42, … */
function faceId(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  return emotion ? String(emotion.id) : '';
}

function faceTile(id: string): string {
  return '<button type="button" class="tile" data-state="' + id + '" data-id="' + id +
    '" data-motion="pop" aria-haspopup="dialog" title="' + t('wall.hover.motionShort') + '">' +
    '<span class="tile-art">' + renderCast({ id: 'tot', state: id, size: 76 }) + '</span>' +
    '<span class="tile-name">' + faceLabel(id) + '</span>' +
    '</button>';
}

/** The snippet the lightbox copies: the expression, as the element takes it. */
function faceSnippet(state: string): string {
  return '<emojitot-ball state="' + state + '"></emojitot-ball>';
}

export function createWall(): View {
  const el = document.createElement('div');
  el.className = 'wall-view';

  let tab: 'cast' | 'emotion' = 'cast';
  let family = 'all';

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
    <div class="wall-grid-wrap" id="wallGridWrap">
      <div class="wall-grid" id="wallGrid"></div>
    </div>
    <p class="wall-count" id="wallCount"></p>
  `;

  const filters = el.querySelector<HTMLElement>('#wallFilters')!;
  const wrap = el.querySelector<HTMLElement>('#wallGridWrap')!;
  const grid = el.querySelector<HTMLElement>('#wallGrid')!;
  const count = el.querySelector<HTMLElement>('#wallCount')!;

  /* --- lightbox ------------------------------------------------------- */

  let lightbox: HTMLDialogElement | null = null;
  let lightboxList: string[] = [];
  let lightboxIndex = 0;
  let lightboxReturnFocus: HTMLElement | null = null;
  let copyTimer = 0;
  let ghostTimer = 0;

  /** The expressions the grid is showing right now, in grid order. */
  function visibleFaces(): string[] {
    return [...grid.querySelectorAll<HTMLElement>('[data-state]')].map((tile) => tile.dataset.state ?? '');
  }

  function lightboxMarkup(state: string): string {
    const id = faceId(state);
    return '<div class="card lightbox-body" data-lightbox-body>' +
      '<div class="lightbox-art">' + renderCast({ id: 'tot', state, size: 220 }) + '</div>' +
      '<b class="lightbox-name">' + faceLabel(state) + '</b>' +
      '<span class="lightbox-id">' + (id ? '#' + id + ' · ' : '') + '<code class="code">' + state + '</code></span>' +
      '<div class="lightbox-actions">' +
      '<button type="button" class="btn btn-primary" data-lightbox-copy>' + t('wall.copy') + '</button>' +
      '<a class="btn" href="#/console?state=' + state + '">' + t('nav.console') + '</a>' +
      '<button type="button" class="btn" data-lightbox-close>' + t('wall.close') + '</button>' +
      '</div></div>';
  }

  function teardownLightbox(): void {
    const dialog = lightbox;
    lightbox = null;
    lightboxList = [];
    document.removeEventListener('keydown', onLightboxKey);
    if (copyTimer) {
      window.clearTimeout(copyTimer);
      copyTimer = 0;
    }
    const back = lightboxReturnFocus;
    lightboxReturnFocus = null;
    if (!dialog) return;
    // Detach the close listener before closing: close() fires this same
    // teardown again, and a second pass would fight the first.
    dialog.removeEventListener('close', teardownLightbox);
    if (dialog.open) dialog.close();
    dialog.remove();
    // Give the keyboard back to the tile the dialog was opened from.
    if (back && back.isConnected) back.focus();
  }

  function closeLightbox(): void {
    const dialog = lightbox;
    if (!dialog) return;
    if (dialog.open) dialog.close();
    else teardownLightbox();
  }

  function stepLightbox(delta: number): void {
    const dialog = lightbox;
    if (!dialog || !lightboxList.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxList.length) % lightboxList.length;
    const state = lightboxList[lightboxIndex];
    dialog.innerHTML = lightboxMarkup(state);
    dialog.setAttribute('aria-label', faceLabel(state));
    const body = dialog.querySelector<HTMLElement>('[data-lightbox-body]');
    if (body) {
      body.removeAttribute('data-swap');
      void body.offsetWidth;
      body.setAttribute('data-swap', '');
    }
  }

  function onLightboxKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLightbox(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepLightbox(1);
    }
  }

  async function copyFromLightbox(button: HTMLButtonElement): Promise<void> {
    const state = lightboxList[lightboxIndex] ?? '';
    const label = button.textContent ?? '';
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(faceSnippet(state));
      button.textContent = t('console.copied');
      button.setAttribute('data-done', '');
    } catch (error) {
      button.textContent = t('console.copyFailed');
      console.warn('[wall] clipboard write failed', error);
    } finally {
      button.disabled = false;
      if (copyTimer) window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyTimer = 0;
        button.textContent = label;
        button.removeAttribute('data-done');
      }, 1200);
    }
  }

  function onLightboxClick(event: MouseEvent): void {
    const dialog = lightbox;
    if (!dialog) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-lightbox-close]')) {
      closeLightbox();
      return;
    }
    const copy = target.closest<HTMLElement>('[data-lightbox-copy]');
    if (copy) {
      void copyFromLightbox(copy as HTMLButtonElement);
      return;
    }
    // The card is made of child elements, so a click whose target is the
    // dialog itself is a click on the backdrop or on the dialog's padding.
    if (target === dialog) closeLightbox();
  }

  function openLightbox(state: string): void {
    // Never two dialogs at once: remove any open one synchronously rather
    // than closing it and waiting for the close event.
    teardownLightbox();
    const list = visibleFaces();
    if (!list.length) return;
    const at = list.indexOf(state);
    lightboxList = list;
    lightboxIndex = at < 0 ? 0 : at;
    lightboxReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('aria-label', faceLabel(state));
    dialog.innerHTML = lightboxMarkup(list[lightboxIndex]);
    dialog.addEventListener('close', teardownLightbox);
    dialog.addEventListener('click', onLightboxClick);
    document.body.append(dialog);
    lightbox = dialog;
    dialog.showModal();
    document.addEventListener('keydown', onLightboxKey);
  }

  /* --- filters and grid ----------------------------------------------- */

  function paintFilters(): void {
    const options = [
      { id: 'all', label: t('wall.all') },
      ...FAMILIES.map((item) => ({
        id: item.id,
        label: getLang() === 'zh' ? item.zh : item.en,
      })),
    ];
    filters.innerHTML = options.map(
      (item) =>
        '<button type="button" class="chip" data-family="' + item.id + '" aria-pressed="' +
        (item.id === family) + '">' + item.label + '</button>',
    ).join('');
  }

  function emptyMarkup(): string {
    const text = tab === 'cast'
      ? (getLang() === 'zh' ? '这个分类还没有角色' : 'No characters in this category yet.')
      : (getLang() === 'zh' ? '这个分类还没有表情' : 'No faces in this category yet.');
    return '<p class="wall-empty">' + text + '</p>';
  }

  function tileKey(tile: HTMLElement): string {
    return tile.dataset.cast ? 'c:' + tile.dataset.cast : 'f:' + (tile.dataset.state ?? '');
  }

  /**
   * A copy of the grid that is about to be replaced, laid over the new one.
   *
   * The copy is what fades: the real grid is swapped in the same task, so the
   * page never shows a stale count, while the removed cards still get their
   * exit. If the stylesheet does not make the copy an overlay there is nothing
   * to see, so it is dropped before it is ever painted.
   */
  function ghostLayer(): HTMLElement | null {
    if (!grid.childElementCount) return null;
    const layer = grid.cloneNode(true) as HTMLElement;
    layer.removeAttribute('id');
    layer.setAttribute('aria-hidden', 'true');
    layer.classList.add('wall-grid-ghost');
    wrap.append(layer);
    if (getComputedStyle(layer).position !== 'absolute') {
      layer.remove();
      return null;
    }
    return layer;
  }

  function scheduleGhostExit(layer: HTMLElement, keep: Set<string>): void {
    // Two frames: one so the pre-fade copy is painted, one so the change that
    // starts the fade is a change the browser can transition.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!layer.isConnected) return;
        for (const tile of layer.querySelectorAll<HTMLElement>('.tile')) {
          if (!keep.has(tileKey(tile))) tile.setAttribute('data-leaving', '');
        }
        layer.setAttribute('data-leaving', '');
      });
    });
    ghostTimer = window.setTimeout(() => {
      ghostTimer = 0;
      layer.remove();
    }, 240);
  }

  function paintGrid(animate = false): void {
    const keep = new Set<string>();
    let html = '';
    if (tab === 'cast') {
      const list = family === 'all' ? CAST : CAST.filter((member) => member.family === family);
      for (const member of list) keep.add('c:' + member.id);
      html = list.length ? list.map((member) => castTile(member.id)).join('') : emptyMarkup();
      count.textContent = t('wall.count.cast', { n: list.length, total: CAST.length });
    } else {
      const list = FACE_META.map((item) => item.id);
      for (const id of list) keep.add('f:' + id);
      html = list.length ? list.map((id) => faceTile(id)).join('') : emptyMarkup();
      count.textContent = t('wall.count.state', { n: list.length, total: FACE_META.length });
    }
    const ghost = animate ? ghostLayer() : null;
    grid.innerHTML = html;
    if (ghost) scheduleGhostExit(ghost, keep);
  }

  function paintTabs(): void {
    for (const button of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
    }
    // Family filters only make sense for characters.
    filters.hidden = tab !== 'cast';
  }

  /* --- keyboard ------------------------------------------------------- */

  /** How many tiles share the first row: the step for up and down. */
  function tileColumns(tiles: HTMLElement[]): number {
    const top = tiles[0].offsetTop;
    let columns = 0;
    for (const tile of tiles) {
      if (tile.offsetTop !== top) break;
      columns += 1;
    }
    return Math.max(1, columns);
  }

  function onGridKey(event: KeyboardEvent): void {
    const key = event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' &&
      key !== 'Home' && key !== 'End') {
      return;
    }
    const tiles = [...grid.querySelectorAll<HTMLElement>('.tile')];
    if (!tiles.length) return;
    const index = tiles.indexOf(document.activeElement as HTMLElement);
    // Only steer when a cell already has focus; the arrows stay the page's
    // scroll keys everywhere else.
    if (index < 0) return;
    const columns = tileColumns(tiles);
    let next = index;
    if (key === 'ArrowRight') next = Math.min(tiles.length - 1, index + 1);
    else if (key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (key === 'ArrowDown') next = Math.min(tiles.length - 1, index + columns);
    else if (key === 'ArrowUp') next = Math.max(0, index - columns);
    else if (key === 'Home') next = 0;
    else next = tiles.length - 1;
    event.preventDefault();
    tiles[next].focus();
  }

  grid.addEventListener('keydown', onGridKey);

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-tab], [data-family], [data-cast], [data-state]',
    );
    if (!target) return;
    if (target.dataset.tab) {
      const tabs = el.querySelector<HTMLElement>('.wall-tabs')!;
      const hadFocus = tabs.contains(document.activeElement);
      tab = target.dataset.tab as 'cast' | 'emotion';
      family = 'all';
      paintTabs();
      paintFilters();
      paintGrid(true);
      if (hadFocus) tabs.querySelector<HTMLElement>('[data-tab="' + tab + '"]')?.focus();
      return;
    }
    if (target.dataset.family) {
      const hadFocus = filters.contains(document.activeElement);
      family = target.dataset.family;
      paintFilters();
      if (hadFocus) filters.querySelector<HTMLElement>('[data-family="' + family + '"]')?.focus();
      paintGrid(true);
      return;
    }
    const cast = target.dataset.cast;
    if (cast) {
      selectCast(cast);
      location.hash = '#/console';
      return;
    }
    const state = target.dataset.state;
    if (state) openLightbox(state);
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
      grid.removeEventListener('keydown', onGridKey);
      if (ghostTimer) {
        window.clearTimeout(ghostTimer);
        ghostTimer = 0;
      }
      for (const layer of wrap.querySelectorAll('.wall-grid-ghost')) layer.remove();
      teardownLightbox();
    },
  };
}
