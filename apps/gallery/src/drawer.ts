/**
 * The gene editor: every choice is shown as itself.
 *
 * Nothing here is a word you have to guess at. The 135 members are their own
 * pictures, the bodies are their own silhouettes, the traits are the current
 * character wearing that trait, the colours are their swatches and the
 * expressions are the current character feeling that expression. Text is only
 * used for the name, and always the Chinese name when the page is in Chinese.
 */
import {
  BODIES,
  BODY_ZH,
  CAST,
  COLOR_IDS,
  COLOR_ZH,
  COLORS,
  FACES,
  FAMILIES,
  SURFACE_IDS,
  TOP_IDS,
  TRAIT_ZH,
  castMember,
  renderCast,
  renderCharacter,
} from '@emojibot/core';
import { EMOTIONS, EMOTION_SEGMENTS } from '@emojibot/protocol';
import { look, selectCast, setLook, setTrait, type BackgroundId } from './store';

const BACKGROUNDS: BackgroundId[] = ['plain', 'grid', 'dots', 'night', 'paper'];
const BACKGROUND_ZH: Record<BackgroundId, string> = {
  plain: '纯色',
  grid: '网格',
  dots: '圆点',
  night: '夜色',
  paper: '纸张',
};

const EARS = ['catEar', 'bunnyEar', 'bearEar', 'foxEar', 'mouseEar', 'deerAntler'];
const TOPS = TOP_IDS.filter((id) => id !== 'none');
const SIDES = ['wing', 'fin', 'spike', 'tail', 'fluff'];
const SURFACES = SURFACE_IDS.filter((id) => id !== 'none');

/** The current character wearing one trait, at picker size. */
function traitSwatch(id: string): string {
  return renderCharacter({ body: look.body, color: look.color, traits: [id], state: look.state, size: 38 });
}

/** The current character feeling one expression. */
function faceSwatch(state: string): string {
  return renderCharacter({ body: look.body, color: look.color, traits: look.traits, state, size: 36 });
}

function bodySwatch(id: string): string {
  return renderCharacter({ body: id, color: look.color, traits: [], state: 'idle', size: 40 });
}

function castTile(id: string): string {
  const member = castMember(id)!;
  return `<button type="button" class="cast-tile" data-cast="${id}" aria-pressed="${look.cast === id}" title="${member.desc}">
    <span class="cast-art">${renderCast({ id, size: 46 })}</span>
    <span class="cast-label">${member.name.zh}</span>
  </button>`;
}

function castGrid(query = ''): string {
  const q = query.trim();
  return FAMILIES.map((f) => {
    const members = CAST.filter((m) => m.family === f.id && (!q || m.name.zh.includes(q) || m.name.en.includes(q)));
    if (!members.length) return '';
    return `<div class="cast-family"><span class="cast-family-name">${f.zh}</span>${members.map((m) => castTile(m.id)).join('')}</div>`;
  }).join('');
}

export function createDrawer(onChange: () => void): HTMLElement {
  const el = document.createElement('section');
  el.className = 'drawer';
  let query = '';

  function traitChip(id: string): string {
    return `<button type="button" class="trait-chip" data-trait="${id}" aria-pressed="${look.traits.includes(id)}" title="${TRAIT_ZH[id] ?? id}">
      <span class="trait-art">${traitSwatch(id)}</span>
      <span class="trait-name">${TRAIT_ZH[id] ?? id}</span>
    </button>`;
  }

  function paint(): void {
    const member = look.cast ? castMember(look.cast) : undefined;
    el.innerHTML = `
      <div class="gene-row cast-row">
        <span class="gene-label">角色<small>${CAST.length}</small></span>
        <div class="cast-picker">
          <input class="cast-search" type="search" placeholder="搜索名字" value="${query}">
          <div class="cast-scroll">${castGrid(query)}</div>
          <p class="gene-desc">${member ? `${member.name.zh} · ${member.desc}` : '一个没有被命名的组合。'}</p>
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">身体<small>${BODIES.length}</small></span>
        <div class="chips bodies">
          ${BODIES.map(
            (b) =>
              `<button type="button" class="body-chip" data-body="${b.id}" aria-pressed="${look.body === b.id}" title="${BODY_ZH[b.id] ?? b.id}">
                <span class="body-art">${bodySwatch(b.id)}</span>
                <span class="body-name">${BODY_ZH[b.id] ?? b.id}</span>
              </button>`,
          ).join('')}
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">颜色<small>${COLOR_IDS.length}</small></span>
        <div class="chips colors">
          ${COLOR_IDS.map(
            (id) =>
              `<button type="button" class="color-chip" data-color="${id}" aria-pressed="${look.color === id}" title="${COLOR_ZH[id] ?? id}" style="--swatch:${COLORS[id]}"><span class="sr-only">${COLOR_ZH[id] ?? id}</span></button>`,
          ).join('')}
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">特征<small>单选</small></span>
        <div class="trait-groups">
          <div class="trait-group"><span>耳朵</span>${EARS.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>头顶</span>${TOPS.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>身侧</span>${SIDES.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>表面</span>${SURFACES.map((id) => traitChip(id)).join('')}</div>
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">表情<small>${Object.keys(FACES).length}</small></span>
        <div class="emotion-groups">
          <div class="chips" id="quick-faces">
            ${['idle', 'happy', 'excited', 'laughing', 'shy', 'sad', 'surprised', 'thinking']
              .map((s) => {
                const zh = EMOTIONS.find((e) => e.state === s)?.name.zh ?? s;
                return `<button type="button" class="face-chip" data-state="${s}" aria-pressed="${look.state === s}" title="${zh}">
                  <span class="face-art">${faceSwatch(s)}</span>
                  <span class="face-name">${zh}</span>
                </button>`;
              })
              .join('')}
          </div>
          <select class="state-select">
            ${EMOTION_SEGMENTS.map(
              (seg) =>
                `<optgroup label="${seg.name.zh}">${EMOTIONS.filter((d) => {
                  const [a, b] = seg.range;
                  const n = Number(d.id);
                  return n >= a && n <= b;
                })
                  .map((d) => `<option value="${d.state}" ${look.state === d.state ? 'selected' : ''}>#${d.id} ${d.name.zh}</option>`)
                  .join('')}</optgroup>`,
            ).join('')}
          </select>
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">背景<small>5</small></span>
        <div class="chips" id="backgrounds">
          ${BACKGROUNDS.map(
            (id) =>
              `<button type="button" class="bg-chip" data-bg="${id}" aria-pressed="${look.background === id}">${BACKGROUND_ZH[id]}</button>`,
          ).join('')}
        </div>
      </div>
    `;
  }

  el.addEventListener('input', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('.cast-search');
    if (!input) return;
    query = input.value;
    const scroll = el.querySelector<HTMLElement>('.cast-scroll');
    if (scroll) scroll.innerHTML = castGrid(query);
  });

  el.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('.state-select');
    if (!select) return;
    setLook({ state: select.value });
    paint();
    onChange();
  });

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-cast], [data-body], [data-color], [data-trait], [data-state], [data-bg]',
    );
    if (!target) return;
    if (target.dataset.cast) selectCast(target.dataset.cast);
    else if (target.dataset.body) setLook({ body: target.dataset.body });
    else if (target.dataset.color) setLook({ color: target.dataset.color });
    else if (target.dataset.trait) setTrait(target.dataset.trait);
    else if (target.dataset.state) setLook({ state: target.dataset.state });
    else if (target.dataset.bg) setLook({ background: target.dataset.bg as BackgroundId });
    paint();
    onChange();
  });

  paint();
  return el;
}
