/**
 * The wall: every id at once, drawn with whatever look the console set.
 *
 * Static renders, so all 51 pictures are real SVG produced by the same engine
 * the live character uses — switching a style redraws them in milliseconds,
 * and none of them runs a frame loop.
 */
import { renderStaticSvg } from '@aora-bot/engine/static';
import { EMOTIONS, EMOTION_SEGMENTS, getEmotion, type EmotionId, type SegmentId } from '@emojibot-studio/protocol';
import { look, onLookChange } from './store';
import { t } from './i18n';

/** The ball is always white, so the static branch that draws it is forced. */
function pinSvg(svg: string): string {
  return svg.replaceAll('@media (prefers-color-scheme: dark)', '@media all');
}

function cardHtml(id: EmotionId): string {
  const def = getEmotion(id)!;
  const svg = pinSvg(
    renderStaticSvg({
      shape: look.shape as never,
      color: look.color as never,
      state: def.state as never,
      style: look.styleId as never,
      variant: look.variant as never,
      styleOptions: look.options,
      size: 128,
    }),
  );
  return `<button type="button" class="card" data-id="${id}" aria-label="${id} ${def.name.zh}">
    ${svg}
    <span class="card-id">${id}</span>
    <span class="card-name">${def.name.zh}</span>
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
    <aside class="detail" id="detail" hidden>
      <div class="detail-preview"><aora-bot id="preview" shape="${look.shape}" color="${look.color}"
        style-id="${look.styleId}" variant="${look.variant}" size="132"></aora-bot></div>
      <div class="detail-body">
        <h2 id="detail-title"></h2>
        <p id="detail-meta"></p>
        <pre class="snippet"><code id="snippet"></code></pre>
        <div class="detail-actions">
          <button type="button" id="copy">${t('wall.copy')}</button>
          <button type="button" id="close" class="ghost">${t('wall.close')}</button>
        </div>
      </div>
    </aside>
  `;

  const grid = el.querySelector<HTMLElement>('#grid')!;
  const segments = el.querySelector<HTMLElement>('#segments')!;
  const count = el.querySelector<HTMLElement>('#count')!;
  const detail = el.querySelector<HTMLElement>('#detail')!;
  const preview = el.querySelector<HTMLElement & { state: string }>('#preview')!;
  let selected: EmotionId | null = null;

  function visible() {
    if (filter === 'all') return EMOTIONS;
    const range = EMOTION_SEGMENTS.find((s) => s.id === filter)!.range;
    return EMOTIONS.filter((d) => Number(d.id) >= range[0] && Number(d.id) <= range[1]);
  }

  function renderGrid(): void {
    const list = visible();
    count.textContent = `${list.length} / ${EMOTIONS.length} 个 id`;
    grid.innerHTML = list.map((d) => cardHtml(d.id)).join('');
    if (selected) {
      for (const card of grid.querySelectorAll<HTMLButtonElement>('.card')) {
        card.setAttribute('aria-selected', String(card.dataset.id === selected));
      }
    }
  }

  function openDetail(id: EmotionId): void {
    selected = id;
    const def = getEmotion(id)!;
    preview.state = def.state;
    preview.setAttribute('shape', look.shape);
    preview.setAttribute('color', look.color);
    preview.styleId = look.styleId;
    preview.variant = look.variant;
    preview.setAttribute('style-options', JSON.stringify(look.options));
    el.querySelector('#detail-title')!.textContent = `${id} · ${def.name.zh} / ${def.name.en}`;
    el.querySelector('#detail-meta')!.textContent =
      `state: ${def.state}${def.oneshot ? ' · 事件' : ''} · ${look.styleId}/${look.variant} · ${look.shape} · ${look.color}`;
    el.querySelector('#snippet')!.textContent = [
      `<aora-bot shape="${look.shape}" color="${look.color}" state="${def.state}" style-id="${look.styleId}" variant="${look.variant}"></aora-bot>`,
      `channel.feed('${id}');`,
    ].join('\n');
    detail.hidden = false;
    for (const card of grid.querySelectorAll<HTMLButtonElement>('.card')) {
      card.setAttribute('aria-selected', String(card.dataset.id === id));
    }
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
    if (filterButton) {
      filter = filterButton.dataset.filter as never;
      for (const b of segments.querySelectorAll<HTMLElement>('button')) {
        b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
      }
      renderGrid();
      return;
    }
    const card = target.closest<HTMLButtonElement>('.card');
    if (card?.dataset.id) openDetail(card.dataset.id);
    if (target.closest('#close')) {
      detail.hidden = true;
      selected = null;
      for (const c of grid.querySelectorAll('.card')) c.setAttribute('aria-selected', 'false');
    }
    if (target.closest('#copy')) {
      const button = target.closest<HTMLElement>('#copy')!;
      navigator.clipboard?.writeText(el.querySelector('#snippet')!.textContent ?? '');
      button.textContent = t('console.copied');
      setTimeout(() => (button.textContent = t('wall.copy')), 1400);
    }
  });

  renderGrid();
  onLookChange(() => {
    renderGrid();
    if (selected) openDetail(selected);
  });

  return el;
}
