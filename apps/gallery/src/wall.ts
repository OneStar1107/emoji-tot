/**
 * The wall: every character, and every expression, as a grid you can click.
 *
 * Clicking a character adopts it in the console; clicking an expression opens
 * it enlarged, with its protocol id and the snippet that reproduces it, and
 * jumps to the console from there. The grid is a keyboard surface too: Tab
 * walks into it, the arrows move between cells and Enter opens one.
 *
 * The grid is deliberately not a uniform tiling: the first character is a
 * feature card four cells wide, the rest are plates around it. A wall of
 * identical thumbnails reads as a file list; one big face plus a rhythm of
 * small ones reads as a catalogue.
 *
 * Two rules shape the DOM here. The grid is rebuilt synchronously — the
 * acceptance script reads how many tiles it holds in the same task as the
 * click — so the filter animation is an overlaid copy that fades out
 * ('.wall-grid-ghost') instead of a view transition, whose update callback
 * runs a task later and would leave the old count readable for a frame.
 */
import { CAST, FACE_META, FAMILIES, castMember, faceMeta, renderCast } from '@emojitot/core';
import { createCharacterRuntime, type CharacterRuntime } from '@emojitot/core/runtime';
import { faceId, faceLabel } from './faces';
import { getLang, t } from './i18n';
import { look, onLookChange, selectCast } from './store';
import type { View } from './main';

function castTile(id: string, index: number, feature: boolean): string {
  const member = castMember(id)!;
  const zh = getLang() === 'zh';
  const name = zh ? member.name.zh : member.name.en;
  const family = FAMILIES.find((item) => item.id === member.family);
  const sub = (zh ? family?.zh : family?.en) ?? member.family;
  if (feature) {
    return '<button type="button" class="tile is-feature" data-cast="' + id + '" data-motion="' + member.motion +
      '" title="' + member.desc + '">' +
      '<span class="tile-id">' + String(index + 1).padStart(2, '0') + ' / ' + String(CAST.length).padStart(2, '0') + '</span>' +
      '<span class="tile-art">' + renderCast({ id, state: member.face, size: 220, motion: 'demo' }) + '</span>' +
      '<span class="tile-name">' + name + '</span>' +
      '<span class="tile-sub">' + sub + ' · ' + member.body + '</span>' +
      '</button>';
  }
  return '<button type="button" class="tile" data-cast="' + id + '" data-motion="' + member.motion + '" title="' +
    member.desc + '">' +
    '<span class="tile-id">' + String(index + 1).padStart(2, '0') + '</span>' +
    '<span class="tile-art">' + renderCast({ id, state: member.face, size: 96, motion: 'demo' }) + '</span>' +
    '<span class="tile-name">' + name + '</span>' +
    '</button>';
}

let faceTileIndex = 0;

function faceTile(id: string): string {
  const index = faceTileIndex++;
  const fid = faceId(id);
  const group = faceMeta(id).group;
  return '<button type="button" class="tile" data-state="' + id + '" data-id="' + id +
    '" data-state-group="' + group + '" data-motion="pop" aria-haspopup="dialog" title="' +
    faceLabel(id) + (fid ? ' · #' + fid : '') + '">' +
    '<span class="tile-id">' + (fid ? '#' + fid : '') + '</span>' +
    '<span class="tile-art">' + renderCast({ id: 'tot', state: id, size: 76, motion: 'demo' }) + '</span>' +
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
  let filter = 'all';

  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="eyebrow"><b>02</b><i></i>Gallery<i></i>Every path</div>
        <h1 class="page-title">${t('wall.title')}<span>a catalogue of closed paths</span></h1>
      </div>
      <div>
        <p class="page-lead">${t('wall.lead')}</p>
        <div class="page-stats">
          <div class="stat"><b>${CAST.length}</b><span>cast</span></div>
          <div class="stat"><b>${FACE_META.length}</b><span>faces</span></div>
          <div class="stat"><b>2</b><span>finishes</span></div>
        </div>
      </div>
    </header>

    <div class="wall-bar">
      <div class="wall-tabs">
        <button type="button" data-tab="cast" aria-pressed="true">${t('wall.tab.cast')} <b id="castCount"></b></button>
        <button type="button" data-tab="emotion" aria-pressed="false">${t('wall.tab.emotion')} <b>${FACE_META.length}</b></button>
      </div>
      <div class="wall-filters" id="wallFilters"></div>
      <span class="wall-count" id="wallCount"></span>
    </div>

    <div class="wall-grid-wrap" id="wallGridWrap">
      <div class="wall-grid" id="wallGrid"></div>
    </div>
  `;

  const filters = el.querySelector<HTMLElement>('#wallFilters')!;
  const wrap = el.querySelector<HTMLElement>('#wallGridWrap')!;
  const grid = el.querySelector<HTMLElement>('#wallGrid')!;
  const count = el.querySelector<HTMLElement>('#wallCount')!;
  const castCount = el.querySelector<HTMLElement>('#castCount')!;
  castCount.textContent = String(CAST.length);

  /* --- lightbox ------------------------------------------------------- */

  let lightbox: HTMLDialogElement | null = null;
  let lightboxList: string[] = [];
  let lightboxIndex = 0;
  let lightboxReturnFocus: HTMLElement | null = null;
  let copyTimer = 0;
  let ghostTimer = 0;
  let featureRuntime: CharacterRuntime | null = null;
  let lightboxRuntime: CharacterRuntime | null = null;

  /** The expressions the grid is showing right now, in grid order. */
  function visibleFaces(): string[] {
    return [...grid.querySelectorAll<HTMLElement>('[data-state]')].map((tile) => tile.dataset.state ?? '');
  }

  function lightboxMarkup(state: string): string {
    const id = faceId(state);
    return '<div class="lightbox-body" data-lightbox-body>' +
      '<button type="button" class="lb-arrow lb-prev" data-lightbox-prev aria-label="previous">‹</button>' +
      '<button type="button" class="lb-arrow lb-next" data-lightbox-next aria-label="next">›</button>' +
      '<div class="lightbox-art">' + renderCast({ id: 'tot', state, size: 220, motion: 'demo' }) + '</div>' +
      '<b class="lightbox-name">' + faceLabel(state) + '</b>' +
      '<span class="lightbox-id">' + (id ? '#' + id + ' · ' : '') + '<code>' + state + '</code>' +
      '<span>' + String(lightboxIndex + 1) + ' / ' + String(lightboxList.length) + '</span></span>' +
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
    lightboxRuntime?.destroy();
    lightboxRuntime = null;
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
    dialog.removeEventListener('cancel', onLightboxCancel);
    if (dialog.open) dialog.close();
    dialog.remove();
    // Give the keyboard back to the tile the dialog was opened from.
    if (back && back.isConnected) back.focus();
    if (back) {
      window.setTimeout(() => {
        if (!lightbox && back.isConnected && document.activeElement === document.body) {
          back.focus({ preventScroll: true });
        }
      }, 0);
    }
  }

  function closeLightbox(): void {
    const dialog = lightbox;
    if (!dialog) return;
    teardownLightbox();
  }

  function mountLightboxRuntime(state: string): void {
    if (!lightbox) return;
    const host = lightbox.querySelector<HTMLElement>('.lightbox-art');
    if (!host) return;
    lightboxRuntime?.destroy();
    lightboxRuntime = createCharacterRuntime(host, {
      cast: look.cast || 'tot',
      state,
      size: 220,
      style: look.finish,
      followPointer: false,
    });
  }

  function stepLightbox(delta: number): void {
    const dialog = lightbox;
    if (!dialog || !lightboxList.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxList.length) % lightboxList.length;
    const state = lightboxList[lightboxIndex];
    lightboxRuntime?.destroy();
    lightboxRuntime = null;
    dialog.innerHTML = lightboxMarkup(state);
    mountLightboxRuntime(state);
    dialog.setAttribute('aria-label', faceLabel(state));
    const body = dialog.querySelector<HTMLElement>('[data-lightbox-body]');
    if (body) {
      body.removeAttribute('data-swap');
      void body.offsetWidth;
      body.setAttribute('data-swap', '');
    }
    // Replacing the dialog body removes the focused arrow. Move focus with
    // the expression so keyboard users stay inside the top-layer dialog.
    dialog
      .querySelector<HTMLButtonElement>(delta < 0 ? '[data-lightbox-prev]' : '[data-lightbox-next]')
      ?.focus({ preventScroll: true });
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

  function onLightboxCancel(event: Event): void {
    event.preventDefault();
    closeLightbox();
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
    if (target.closest('[data-lightbox-prev]')) {
      stepLightbox(-1);
      return;
    }
    if (target.closest('[data-lightbox-next]')) {
      stepLightbox(1);
      return;
    }
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
    dialog.addEventListener('cancel', onLightboxCancel);
    dialog.addEventListener('click', onLightboxClick);
    document.body.append(dialog);
    lightbox = dialog;
    dialog.showModal();
    mountLightboxRuntime(list[lightboxIndex]);
    document.addEventListener('keydown', onLightboxKey);
  }

  /* --- filters and grid ----------------------------------------------- */

  function paintFilters(): void {
    const options = tab === 'cast'
      ? [
          { id: 'all', label: t('wall.all') },
          ...FAMILIES.map((item) => ({
            id: item.id,
            label: getLang() === 'zh' ? item.zh : item.en,
          })),
        ]
      : [
          { id: 'all', label: t('wall.all') },
          { id: 'life', label: t('wall.group.life') },
          { id: 'emotion', label: t('wall.group.emotion') },
          { id: 'agent', label: t('wall.group.agent') },
        ];
    filters.innerHTML = options.map(
      (item) =>
        '<button type="button" class="chip" data-family="' + item.id + '" aria-pressed="' +
        (item.id === filter) + '">' + item.label + '</button>',
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
    }, 260);
  }

  /*
   * Only the cards on screen animate.
   *
   * Sixty-one idle loops is sixty-one SVG groups animating at once, and most
   * of them are below the fold. An IntersectionObserver is the one thing that
   * decides which cards play: a card that scrolls away is paused rather than
   * merely skipped at paint. The phase offset starts each card partway through
   * its cycle, so the wall does not breathe in unison.
   */
  const live = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const tile = entry.target as HTMLElement;
      if (entry.isIntersecting) tile.setAttribute('data-live', '');
      else tile.removeAttribute('data-live');
    }
  }, { rootMargin: '140px 0px' });

  function markLiveTiles(): void {
    grid.querySelectorAll<HTMLElement>('.tile').forEach((tile, index) => {
      tile.style.setProperty('--phase', String(index % 12));
      live.observe(tile);
    });
  }

  function teardownFeatureRuntime(): void {
    featureRuntime?.destroy();
    featureRuntime = null;
  }

  function mountFeatureRuntime(): void {
    const tile = grid.querySelector<HTMLElement>('.tile.is-feature');
    const host = tile?.querySelector<HTMLElement>('.tile-art');
    const id = tile?.dataset.cast;
    if (!host || !id) return;
    const member = castMember(id);
    if (!member) return;
    host.querySelector('svg')?.remove();
    const runtimeHost = document.createElement('span');
    runtimeHost.className = 'feature-runtime';
    host.append(runtimeHost);
    featureRuntime = createCharacterRuntime(runtimeHost, {
      cast: id,
      state: member.face,
      size: 220,
      style: look.finish,
      followPointer: false,
    });
  }

  function paintGrid(animate = false, stagger = false): void {
    const keep = new Set<string>();
    let html = '';
    faceTileIndex = 0;
    if (tab === 'cast') {
      const all = filter === 'all';
      const list = all ? CAST : CAST.filter((member) => member.family === filter);
      list.forEach((member, index) => {
        keep.add('c:' + member.id);
        const feature = all && index === 0;
        const tile = castTile(member.id, index, feature);
        html += stagger ? tile.replace('class="tile', 'data-enter style="--i:' + index + '" class="tile') : tile;
      });
      if (!list.length) html = emptyMarkup();
      count.textContent = t('wall.count.cast', { n: list.length, total: CAST.length });
    } else {
      const list = FACE_META
        .filter((item) => filter === 'all' || item.group === filter)
        .map((item) => item.id);
      for (const id of list) keep.add('f:' + id);
      html = list.length
        ? list.map((id, index) => {
          const tile = faceTile(id);
          return stagger ? tile.replace('class="tile', 'data-enter style="--i:' + index + '" class="tile') : tile;
        }).join('')
        : emptyMarkup();
      count.textContent = t('wall.count.state', { n: list.length, total: FACE_META.length });
    }
    const ghost = animate ? ghostLayer() : null;
    teardownFeatureRuntime();
    grid.innerHTML = html;
    markLiveTiles();
    mountFeatureRuntime();
    if (ghost) scheduleGhostExit(ghost, keep);
  }

  function paintTabs(): void {
    for (const button of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
    }
    filters.hidden = false;
  }

  /* --- pointer light --------------------------------------------------- */

  /*
   * The tile under the pointer lights up where the pointer is. One rAF
   * coalesces the writes; the value is a percentage, so the CSS radial
   * gradient does the rest without a repaint of the SVG.
   */
  let spotFrame = 0;
  let spotTile: HTMLElement | null = null;
  let spotX = 50;
  let spotY = 0;

  function paintSpot(): void {
    spotFrame = 0;
    if (!spotTile) return;
    spotTile.style.setProperty('--mx', spotX.toFixed(1) + '%');
    spotTile.style.setProperty('--my', spotY.toFixed(1) + '%');
  }

  grid.addEventListener('pointermove', (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('.tile');
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    spotTile = tile;
    spotX = ((event.clientX - rect.left) / rect.width) * 100;
    spotY = ((event.clientY - rect.top) / rect.height) * 100;
    if (!spotFrame) spotFrame = window.requestAnimationFrame(paintSpot);
  });

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
      filter = 'all';
      paintTabs();
      paintFilters();
      paintGrid(true);
      if (hadFocus) tabs.querySelector<HTMLElement>('[data-tab="' + tab + '"]')?.focus();
      return;
    }
    if (target.dataset.family) {
      const hadFocus = filters.contains(document.activeElement);
      filter = target.dataset.family;
      paintFilters();
      if (hadFocus) filters.querySelector<HTMLElement>('[data-family="' + filter + '"]')?.focus();
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
  paintGrid(false, true);
  const unsubscribe = onLookChange(() => {
    if (tab === 'emotion') paintGrid();
  });

  return {
    el,
    dispose(): void {
      unsubscribe();
      grid.removeEventListener('keydown', onGridKey);
      if (spotFrame) window.cancelAnimationFrame(spotFrame);
      spotFrame = 0;
      live.disconnect();
      teardownFeatureRuntime();
      if (ghostTimer) {
        window.clearTimeout(ghostTimer);
        ghostTimer = 0;
      }
      for (const layer of wrap.querySelectorAll('.wall-grid-ghost')) layer.remove();
      teardownLightbox();
    },
  };
}
