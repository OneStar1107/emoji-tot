/**
 * The gene editor: every choice is shown as itself.
 *
 * Nothing here is a word you have to guess at. The 135 members are their own
 * pictures, the bodies are their own silhouettes, the traits are the current
 * character wearing that trait, the colours are their swatches and the
 * expressions are the current character feeling that expression. Text is only
 * used for the name, and always the Chinese name when the page is in Chinese.
 */
import { CAST, COLOR_IDS, COLOR_ZH, COLORS, FACES, FAMILIES, castMember, renderCast, renderCharacter } from '@emojitot/core';
import { EMOTIONS, EMOTION_SEGMENTS } from '@emojitot/protocol';
import { look, selectCast, setLook, type BackgroundId } from './store';
import { getLang, t } from './i18n';
import { BACKGROUND_ZH } from './zh';

const BACKGROUNDS: BackgroundId[] = ['plain', 'grid', 'dots', 'night', 'paper'];

/** The background's name: the dictionary in Chinese, the id in English. */
const backgroundName = (id: BackgroundId): string => (getLang() === 'zh' ? BACKGROUND_ZH[id] ?? id : id);

/** The current character feeling one expression. */
function faceSwatch(state: string): string {
  return renderCharacter({ body: look.body, color: look.color, traits: look.traits, state, size: 36 });
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

  function paint(): void {
    const member = look.cast ? castMember(look.cast) : undefined;
    el.innerHTML = `
      <div class="gene-row cast-row">
        <span class="gene-label">${t('drawer.cast')}<small>${CAST.length}</small></span>
        <div class="cast-picker">
          <input class="cast-search" type="search" placeholder="${t('drawer.search')}" value="${query}">
          <div class="cast-scroll">${castGrid(query)}</div>
          <p class="gene-desc">${member ? `${member.name.zh} · ${member.desc}` : t('drawer.unnamed')}</p>
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">${t('drawer.color')}<small>${COLOR_IDS.length}</small></span>
        <div class="chips colors">
          ${COLOR_IDS.map(
            (id) =>
              `<button type="button" class="color-chip" data-color="${id}" aria-pressed="${look.color === id}" title="${COLOR_ZH[id] ?? id}" style="--swatch:${COLORS[id]}"><span class="sr-only">${COLOR_ZH[id] ?? id}</span></button>`,
          ).join('')}
        </div>
      </div>

      <div class="gene-row">
        <span class="gene-label">${t('drawer.face')}<small>${Object.keys(FACES).length}</small></span>
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
        <span class="gene-label">${t('drawer.background')}<small>5</small></span>
        <div class="chips" id="backgrounds">
          ${BACKGROUNDS.map(
            (id) =>
              `<button type="button" class="bg-chip" data-bg="${id}" aria-pressed="${look.background === id}">${backgroundName(id)}</button>`,
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
      '[data-cast], [data-color], [data-state], [data-bg]',
    );
    if (!target) return;
    if (target.dataset.cast) selectCast(target.dataset.cast);
    else if (target.dataset.color) setLook({ color: target.dataset.color });
    else if (target.dataset.state) setLook({ state: target.dataset.state });
    else if (target.dataset.bg) setLook({ background: target.dataset.bg as BackgroundId });
    paint();
    onChange();
  });

  paint();
  return el;
}
