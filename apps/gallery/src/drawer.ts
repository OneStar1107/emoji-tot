/**
 * The gene editor.
 *
 * Every control writes one gene and re-renders the stage; there is no apply
 * button, because a character is cheap to draw and a pending state would only
 * make the wall lag behind the sliders. Controls are pictures where a picture
 * is possible — bodies, colours and faces are all their own render — and text
 * only where a picture cannot say it (a member's name).
 */
import {
  BODIES,
  COLORS,
  COLOR_IDS,
  FACES,
  FAMILIES,
  CAST,
  SURFACE_IDS,
  TOP_IDS,
  castMember,
  renderCharacter,
} from '@emojibot/core';
import { EMOTIONS, EMOTION_SEGMENTS } from '@emojibot/protocol';
import { look, selectCast, setLook, toggleTrait, type BackgroundId } from './store';

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

function bodySwatch(id: string): string {
  return renderCharacter({ body: id, color: look.color, state: 'idle', size: 34 });
}

function faceSwatch(state: string): string {
  return renderCharacter({ body: look.body, color: look.color, traits: look.traits, state, size: 30 });
}

export function createDrawer(onChange: () => void): HTMLElement {
  const el = document.createElement('section');
  el.className = 'drawer';

  function castOptions(): string {
    return FAMILIES.map((f) => {
      const members = CAST.filter((m) => m.family === f.id);
      return `<optgroup label="${f.zh}">${members
        .map((m) => `<option value="${m.id}" ${look.cast === m.id ? 'selected' : ''}>${m.name.zh} · ${m.name.en}</option>`)
        .join('')}</optgroup>`;
    }).join('');
  }

  function paint(): void {
    const member = look.cast ? castMember(look.cast) : undefined;
    el.innerHTML = `
      <div class="gene-row">
        <label class="gene-label" for="cast-pick">角色<small>${CAST.length}</small></label>
        <select id="cast-pick" class="cast-select">
          <option value="" ${look.cast ? '' : 'selected'}>自定义（不取名）</option>
          ${castOptions()}
        </select>
        <p class="gene-desc">${member ? member.desc : '一个没有被命名的组合。'}</p>
      </div>

      <div class="gene-row">
        <span class="gene-label">身体<small>${BODIES.length}</small></span>
        <div class="chips bodies">
          ${BODIES.map(
            (b) =>
              `<button type="button" class="chip body-chip" data-body="${b.id}" aria-pressed="${look.body === b.id}" title="${b.id}">${bodySwatch(b.id)}</button>`,
          ).join('')}
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">颜色<small>${COLOR_IDS.length}</small></span>
        <div class="chips colors">
          ${COLOR_IDS.map(
            (id) =>
              `<button type="button" class="chip color-chip" data-color="${id}" aria-pressed="${look.color === id}" title="${id}" style="--swatch:${COLORS[id]}"></button>`,
          ).join('')}
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">特征<small>${EARS.length + TOPS.length + SIDES.length + SURFACE_IDS.length}</small></span>
        <div class="trait-groups">
          <div class="trait-group"><span>耳朵</span>${EARS.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>头顶</span>${TOPS.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>身侧</span>${SIDES.map((id) => traitChip(id)).join('')}</div>
          <div class="trait-group"><span>表面</span>${SURFACE_IDS.filter((id) => id !== 'none').map((id) => traitChip(id)).join('')}</div>
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">表情<small>${Object.keys(FACES).length}</small></span>
        <div class="emotion-groups">
          <div class="chips" id="quick-faces">
            ${['idle', 'happy', 'excited', 'laughing', 'shy', 'sad', 'surprised', 'thinking']
              .map(
                (s) =>
                  `<button type="button" class="chip face-chip" data-state="${s}" aria-pressed="${look.state === s}" title="${s}">${faceSwatch(s)}<b>${s}</b></button>`,
              )
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
              `<button type="button" class="chip bg-chip" data-bg="${id}" aria-pressed="${look.background === id}">${BACKGROUND_ZH[id]}</button>`,
          ).join('')}
        </div>
      </div>
    `;
  }

  function traitChip(id: string): string {
    return `<button type="button" class="chip trait-chip" data-trait="${id}" aria-pressed="${look.traits.includes(id)}">${id}</button>`;
  }

  el.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select');
    if (!select) return;
    if (select.id === 'cast-pick') selectCast(select.value);
    else if (select.classList.contains('state-select')) setLook({ state: select.value });
    paint();
    onChange();
  });

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-body], [data-color], [data-trait], [data-state], [data-bg]');
    if (!target) return;
    if (target.dataset.body) setLook({ body: target.dataset.body });
    else if (target.dataset.color) setLook({ color: target.dataset.color });
    else if (target.dataset.trait) toggleTrait(target.dataset.trait);
    else if (target.dataset.state) setLook({ state: target.dataset.state });
    else if (target.dataset.bg) setLook({ background: target.dataset.bg as BackgroundId });
    paint();
    onChange();
  });

  paint();
  return el;
}
