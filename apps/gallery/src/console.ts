/**
 * The console: one character, every knob that changes how it is drawn.
 *
 * This is the page that answers "what can I make it look like" — 71 cast
 * members, 71 shapes, 18 colours, three style series with sixteen variants
 * between them, and the parameters each variant actually reads. Every control
 * writes the shared look, so the snippet at the bottom always matches what is
 * on the stage.
 */
import {
  ASSIGNABLE_COLOR_IDS,
  CAST_IDS,
  SHAPE_IDS,
  allVariants,
  getStyle,
  paramsForVariant,
} from '@aora-bot/engine';
import { EMOTIONS, getEmotion } from '@emojibot-studio/protocol';
import { backgroundClass, look, onLookChange, setLook } from './store';
import { t } from './i18n';

const BACKGROUNDS: { id: string; key: 'console.plain' | 'console.grid' | 'console.dots' | 'console.night' | 'console.paper' }[] = [
  { id: 'plain', key: 'console.plain' },
  { id: 'grid', key: 'console.grid' },
  { id: 'dots', key: 'console.dots' },
  { id: 'night', key: 'console.night' },
  { id: 'paper', key: 'console.paper' },
];

function option(value: string, label = value, selected = false): string {
  return `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
}

function row(label: string, control: string): string {
  return `<label class="row"><span>${label}</span>${control}</label>`;
}

/**
 * The colour list, plus the current colour when it is not in it.
 *
 * `ASSIGNABLE_COLOR_IDS` is the palette a picker offers; the engine still
 * accepts others ("black" is a real ink but not a palette chip). Without this
 * the select would silently show the first entry while the ball rendered the
 * saved colour.
 */
function colorOptions(): string {
  const ids = [...ASSIGNABLE_COLOR_IDS];
  if (!ids.includes(look.color as never)) ids.unshift(look.color as never);
  return ids.map((c) => option(c, c, c === look.color)).join('');
}

/** States are addressed by name; the id is shown for the protocol's sake. */
function stateOptions(): string {
  return EMOTIONS.map((d) => option(d.state, `${d.id} ${d.name.zh}`, d.state === look.state)).join('');
}

function snippet(): string {
  const attrs = [
    `shape="${look.shape}"`,
    `color="${look.color}"`,
    `state="${look.state}"`,
    `style-id="${look.styleId}"`,
    `variant="${look.variant}"`,
  ];
  if (Object.keys(look.options).length) {
    attrs.push(`style-options='${JSON.stringify(look.options)}'`);
  }
  return `<aora-bot ${attrs.join(' ')}></aora-bot>`;
}

export function createConsole(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'console';

  el.innerHTML = `
    <section class="stage-col">
      <div class="stage ${backgroundClass()}" id="stage">
        <aora-bot data-hero shape="${look.shape}" color="${look.color}" state="${look.state}"
                  style-id="${look.styleId}" variant="${look.variant}" size="220"></aora-bot>
      </div>
      <div class="stage-bar">
        <div class="actions">
          <button type="button" data-act="spin">${t('console.spin')}</button>
          <button type="button" data-act="bounce">${t('console.bounce')}</button>
          <button type="button" data-act="burst">${t('console.burst')}</button>
        </div>
        <div class="group" id="backgrounds">
          ${BACKGROUNDS.map((b) => `<button type="button" data-bg="${b.id}" aria-pressed="${look.background === b.id}">${t(b.key)}</button>`).join('')}
        </div>
      </div>
      <pre class="snippet"><code data-snippet>${snippet()}</code></pre>
    </section>

    <aside class="panel">
      ${row(t('console.cast'), `<select data-field="cast">${CAST_IDS.map((c) => option(c, c, c === look.cast)).join('')}</select>`)}
      ${row(t('console.shape'), `<select data-field="shape">${SHAPE_IDS.map((s) => option(s, s, s === look.shape)).join('')}</select>`)}
      ${row(t('console.color'), `<select data-field="color">${colorOptions()}</select>`)}
      ${row(t('console.style'), `<select data-field="styleId">${['vector', 'pixel', 'kaomoji'].map((s) => option(s, s, followStyle(s))).join('')}</select>`)}
      ${row(t('console.variant'), `<select data-field="variant"></select>`)}
      ${row(t('console.state'), `<select data-field="state">${stateOptions()}</select>`)}
      <div class="params" id="params"></div>
      <button type="button" class="primary" id="copy">${t('console.copy')}</button>
    </aside>
  `;

  const hero = el.querySelector<HTMLElement & Record<string, unknown>>('[data-hero]')!;
  const stage = el.querySelector<HTMLElement>('#stage')!;
  const variantSelect = el.querySelector<HTMLSelectElement>('[data-field="variant"]')!;
  const paramsBox = el.querySelector<HTMLDivElement>('#params')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;

  function followStyle(id: string): boolean {
    return id === look.styleId;
  }

  function applyHero(): void {
    hero.setAttribute('shape', look.shape);
    hero.setAttribute('color', look.color);
    hero.state = look.state;
    hero.styleId = look.styleId;
    hero.variant = look.variant;
    hero.setAttribute('style-options', JSON.stringify(look.options));
    stage.className = `stage ${backgroundClass()}`;
    snippetEl.textContent = snippet();
    for (const button of el.querySelectorAll<HTMLButtonElement>('#backgrounds button')) {
      button.setAttribute('aria-pressed', String(button.dataset.bg === look.background));
    }
  }

  function buildVariants(): void {
    const style = getStyle(look.styleId);
    const variants = allVariants(style);
    if (!variants.includes(look.variant)) setLook({ variant: style.defaultVariant });
    variantSelect.innerHTML = variants.map((v) => option(v, v, v === look.variant)).join('');
  }

  /**
   * Only the parameters the current variant reads. A control for a value that
   * renders nothing would be a lie about what the slider does.
   */
  function buildParams(): void {
    const style = getStyle(look.styleId);
    const specs = paramsForVariant(style, look.variant);
    const defaults = style.defaults as Record<string, unknown>;
    const entries = Object.entries(specs);
    if (!entries.length) {
      paramsBox.innerHTML = `<p class="hint">${t('console.noParams')}</p>`;
      return;
    }
    paramsBox.innerHTML = entries
      .map(([key, spec]) => {
        const label = spec.label ?? key;
        const current = (look.options[key] ?? defaults[key]) as unknown;
        if (spec.type === 'number') {
          return `<label class="row param">
            <span>${label}</span>
            <input type="range" data-opt="${key}" min="${spec.min}" max="${spec.max}" step="${spec.step}"
                   value="${current}" />
            <output>${current}</output>
          </label>`;
        }
        if (spec.type === 'enum') {
          return `<label class="row param"><span>${label}</span>
            <select data-opt="${key}">${spec.options
              .map((o) => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`)
              .join('')}</select></label>`;
        }
        return `<label class="row param"><span>${label}</span>
          <input type="checkbox" data-opt="${key}"${current ? ' checked' : ''} class="check" /></label>`;
      })
      .join('');
  }

  el.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const field = target.dataset.field;
    if (field) {
      const value = field === 'state' ? target.value : target.value;
      setLook({ [field]: value } as never);
      if (field === 'styleId') {
        buildVariants();
        buildParams();
      }
      if (field === 'variant') buildParams();
      applyHero();
      return;
    }
    const opt = target.dataset.opt;
    if (opt) {
      const isNumber = target.type === 'range';
      const isCheck = target instanceof HTMLInputElement && target.type === 'checkbox';
      const raw = isCheck ? (target as HTMLInputElement).checked : isNumber ? Number(target.value) : target.value;
      setLook({ options: { ...look.options, [opt]: raw } });
      const output = target.parentElement?.querySelector('output');
      if (output) output.textContent = String(raw);
      applyHero();
    }
  });

  el.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.opt && target.type === 'range') {
      setLook({ options: { ...look.options, [target.dataset.opt]: Number(target.value) } });
      const output = target.parentElement?.querySelector('output');
      if (output) output.textContent = target.value;
      applyHero();
    }
  });

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], [data-bg], #copy');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'spin') hero.spin?.(1.5);
    if (act === 'bounce') hero.bounce?.(0.5);
    if (act === 'burst') hero.burst?.(24);
    const bg = target.dataset.bg;
    if (bg) {
      setLook({ background: bg as never });
      applyHero();
    }
    if (target.id === 'copy') {
      const text = snippetEl.textContent ?? '';
      navigator.clipboard?.writeText(text).then(
        () => (target.textContent = t('console.copied')),
        () => (target.textContent = t('console.copied')),
      );
      setTimeout(() => (target.textContent = t('console.copy')), 1400);
    }
  });

  buildVariants();
  buildParams();
  applyHero();

  // The wall changes the look too; mirror it without rebuilding the DOM.
  onLookChange(() => {
    buildVariants();
    buildParams();
    applyHero();
  });

  return el;
}

/** Shared by the console and the wall: the label for a state id. */
export function stateLabel(id: string): string {
  const def = getEmotion(id);
  return def ? `${id} ${def.name.zh}` : id;
}
