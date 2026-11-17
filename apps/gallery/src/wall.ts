/**
 * The wall: every state at once, drawn with the current shape and colour.
 *
 * Static renders, so all of them are real SVG from the same renderer the live
 * character uses, and none of them runs a frame loop.
 */
import { renderCharacter } from '@emojibot/core';
import { EMOTIONS, EMOTION_SEGMENTS, getEmotion, type SegmentId } from '@emojibot/protocol';
import { t } from './i18n';
import { look, onLookChange } from './store';

const THUMB = 128;

/**
 * One card per id, and the id is shown.
 *
 * Fifty-one ids share forty-four states, so a wall keyed by state would repeat
 * itself. The number is the thing a host actually sends, so it belongs on the
 * card; two ids with the same face are a fact about the protocol, not a bug.
 */
function cardHtml(id: string, state: string, label: string): string {
  const svg = (() => {
    try {
      return renderCharacter({ shape: look.shape, color: look.color, state, size: THUMB });
    } catch {
      return '';
    }
  })();
  return `<button type="button" class="card" data-state="${state}" data-id="${id}" aria-label="${id} ${label}">
    ${svg}
    <span class="card-id">#${id}</span>
    <span class="card-name">${label}</span>
  </button>`;
}

export function createWall(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wall-view';
  let filter: 'all' | SegmentId = 'all';

  el.innerHTML = `
    <section class="filters">
      <div class="group" id="segments"></div>
      <span class="count" id="count"></span>
    </section>
    <section class="grid" id="grid"></section>
  `;

  const grid = el.querySelector<HTMLElement>('#grid')!;
  const segments = el.querySelector<HTMLElement>('#segments')!;
  const count = el.querySelector<HTMLElement>('#count')!;

  function visible() {
    if (filter === 'all') return EMOTIONS;
    const range = EMOTION_SEGMENTS.find((s) => s.id === filter)!.range;
    return EMOTIONS.filter((d) => Number(d.id) >= range[0] && Number(d.id) <= range[1]);
  }

  function renderGrid(): void {
    const list = visible();
    count.textContent = `${list.length} / ${EMOTIONS.length} 个 id`;
    grid.innerHTML = list.map((d) => cardHtml(d.id, d.state, d.name.zh)).join('');
  }

  const options: { id: 'all' | SegmentId; label: string }[] = [
    { id: 'all', label: t('wall.all') },
    ...EMOTION_SEGMENTS.map((s) => ({ id: s.id as SegmentId, label: s.name.zh })),
  ];
  segments.innerHTML = options
    .map((o) => `<button type="button" data-filter="${o.id}" aria-pressed="${o.id === filter}">${o.label}</button>`)
    .join('');

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const filterButton = target.closest<HTMLElement>('[data-filter]');
    if (!filterButton) return;
    filter = filterButton.dataset.filter as never;
    for (const b of segments.querySelectorAll<HTMLElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    }
    renderGrid();
  });

  renderGrid();
  onLookChange(renderGrid);
  return el;
}
