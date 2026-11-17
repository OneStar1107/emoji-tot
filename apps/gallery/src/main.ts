/**
 * The gallery: every id, every drawing style, and the two lines that reproduce
 * what you are looking at.
 *
 * The grid renders static SVG in Node-compatible code paths (no timers, no
 * DOM), so switching a style re-renders 51 pictures in milliseconds. The
 * detail panel uses a live element, because that is what a host actually
 * embeds.
 */
import { defineAoraBot } from '@aora-bot/element';
import { renderStaticSvg } from '@aora-bot/engine/static';
import {
  EMOTIONS,
  EMOTION_SEGMENTS,
  getEmotion,
  type EmotionId,
  type SegmentId,
} from '@emojibot-studio/protocol';
import './style.css';

defineAoraBot();

type Filter = 'all' | SegmentId;

const SHAPES = ['circle', 'mochi', 'blob', 'egg', 'star', 'heart', 'cloud', 'cat', 'bun'];
const STYLES = ['vector', 'pixel', 'kaomoji'] as const;

const state = {
  filter: 'all' as Filter,
  style: 'vector' as (typeof STYLES)[number],
  shape: 'circle',
  selected: null as EmotionId | null,
};

const grid = document.getElementById('grid')!;
const segments = document.getElementById('segments')!;
const styleSelect = document.getElementById('style') as HTMLSelectElement;
const shapeSelect = document.getElementById('shape') as HTMLSelectElement;
const countEl = document.getElementById('count')!;
const detail = document.getElementById('detail')!;
const preview = document.getElementById('preview') as HTMLElement & { state: string };
const detailTitle = document.getElementById('detail-title')!;
const detailMeta = document.getElementById('detail-meta')!;
const snippet = document.getElementById('snippet')!;
const mono = document.getElementById('mono') as HTMLInputElement;

function visible(): typeof EMOTIONS {
  if (state.filter === 'all') return EMOTIONS;
  const range = EMOTION_SEGMENTS.find((s) => s.id === state.filter)!.range;
  return EMOTIONS.filter((def) => {
    const n = Number(def.id);
    return n >= range[0] && n <= range[1];
  });
}

function buildSegmentButtons(): void {
  const options: { id: Filter; label: string }[] = [
    { id: 'all', label: '全部' },
    ...EMOTION_SEGMENTS.map((s) => ({ id: s.id as Filter, label: s.name.zh })),
  ];
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.dataset.filter = option.id;
    button.addEventListener('click', () => {
      state.filter = option.id;
      markFilter();
      renderGrid();
    });
    segments.append(button);
  }
  markFilter();
}

function markFilter(): void {
  for (const button of segments.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  }
}

function buildShapeOptions(): void {
  for (const shape of SHAPES) {
    const option = document.createElement('option');
    option.value = shape;
    option.textContent = shape;
    shapeSelect.append(option);
  }
  shapeSelect.value = state.shape;
}

/**
 * Force the white-ball branch in every static render.
 *
 * The static renderer writes its ink as a `prefers-color-scheme` media query
 * because it has to work with no page variables at all. The ball is always
 * white with black features here, so that query is rewritten to match
 * unconditionally — otherwise a light desktop would silently turn every
 * picture black while the live elements stay white.
 */
function pinSvg(svg: string): string {
  return svg.replaceAll('@media (prefers-color-scheme: dark)', '@media all');
}

function cardHtml(id: EmotionId): string {
  const def = getEmotion(id)!;
  const svg = pinSvg(
    renderStaticSvg({ shape: state.shape as never, color: 'black', state: def.state, size: 128 }),
  );
  const selected = state.selected === id ? ' aria-selected="true"' : '';
  return `<button type="button" class="card" data-id="${id}" aria-label="${id} ${def.name.zh}"${selected}>
    ${svg}
    <span class="card-id">${id}</span>
    <span class="card-name">${def.name.zh}</span>
  </button>`;
}

function renderGrid(): void {
  const list = visible();
  countEl.textContent = `${list.length} / ${EMOTIONS.length} 个 id`;
  grid.innerHTML = list.map((def) => cardHtml(def.id)).join('');
}

function openDetail(id: EmotionId): void {
  state.selected = id;
  const def = getEmotion(id)!;
  const event = def.oneshot ? ' · 事件' : '';
  detailTitle.textContent = `${id} · ${def.name.zh} / ${def.name.en}`;
  detailMeta.textContent = `state: ${def.state}${event} · 画法 ${state.style} · 形状 ${state.shape}`;
  preview.state = def.state;
  preview.setAttribute('shape', state.shape);
  preview.setAttribute('size', '132');
  snippet.textContent = [
    `<aora-bot shape="${state.shape}" color="black" state="${def.state}"></aora-bot>`,
    `channel.feed('${id}');`,
  ].join('\n');
  detail.hidden = false;
  for (const card of grid.querySelectorAll<HTMLButtonElement>('.card')) {
    card.setAttribute('aria-selected', String(card.dataset.id === id));
  }
  try {
    localStorage.setItem('es.selected', id);
  } catch {
    /* private mode */
  }
}

grid.addEventListener('click', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.card');
  if (card?.dataset.id) openDetail(card.dataset.id);
});

document.getElementById('close')!.addEventListener('click', () => {
  detail.hidden = true;
  state.selected = null;
  for (const card of grid.querySelectorAll('.card')) card.setAttribute('aria-selected', 'false');
});

document.getElementById('copy')!.addEventListener('click', async () => {
  const button = document.getElementById('copy') as HTMLButtonElement;
  const text = snippet.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = '已复制';
  } catch {
    button.textContent = '复制失败';
  }
  setTimeout(() => {
    button.textContent = '复制代码';
  }, 1400);
});

styleSelect.addEventListener('change', () => {
  state.style = styleSelect.value as (typeof STYLES)[number];
  renderGrid();
  if (state.selected) openDetail(state.selected);
});

shapeSelect.addEventListener('change', () => {
  state.shape = shapeSelect.value;
  renderGrid();
  if (state.selected) openDetail(state.selected);
});

/* Same rule as the demo: pin the page scheme so the drawing cannot drift. */
const root = document.documentElement;
function setMono(on: boolean): void {
  // Light page by default; the switch only changes what is behind the ball,
  // never the ball itself.
  root.dataset.mono = on ? 'dark' : 'light';
  try {
    localStorage.setItem('es.mono', on ? '1' : '0');
  } catch {
    /* private mode */
  }
  renderGrid();
}

let savedMono = false;
try {
  savedMono = localStorage.getItem('es.mono') === '1';
} catch {
  savedMono = false;
}
mono.checked = savedMono;
setMono(savedMono);
mono.addEventListener('change', () => setMono(mono.checked));

buildSegmentButtons();
buildShapeOptions();

// The header ball is a live element; the grid is static. Both read the same
// engine, so a style that renders in the grid renders in the header.
document.querySelectorAll<HTMLElement>('aora-bot').forEach((el) => {
  el.setAttribute('shape', state.shape);
});

renderGrid();

try {
  const last = localStorage.getItem('es.selected');
  if (last && getEmotion(last)) openDetail(last);
} catch {
  /* private mode */
}
