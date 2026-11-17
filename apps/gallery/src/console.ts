/**
 * The studio: one big character, its knobs below, its code beside.
 *
 * The console is not a form. The stage is the largest thing on the page, the
 * snippet sits on it like a caption, and every choice lives in a drawer of
 * pictures at the bottom — the shape you want, drawn; the colour you want,
 * filled. The only fields left are the ones with no picture: the parameters a
 * variant exposes.
 */
import { getStyle, paramsForVariant } from '@aora-bot/engine';
import { createDrawer } from './drawer';
import { t } from './i18n';
import { backgroundClass, look, onLookChange, setLook } from './store';
import { BACKGROUND_ZH, zh } from './zh';
import { getLang } from './i18n';

const BACKGROUNDS: { id: string; key: string }[] = [
  { id: 'plain', key: 'plain' },
  { id: 'grid', key: 'grid' },
  { id: 'dots', key: 'dots' },
  { id: 'night', key: 'night' },
  { id: 'paper', key: 'paper' },
];

function snippet(): string {
  const attrs = [
    `shape="${look.shape}"`,
    `color="${look.color}"`,
    `state="${look.state}"`,
    `style-id="${look.styleId}"`,
    `variant="${look.variant}"`,
  ];
  if (Object.keys(look.options).length) attrs.push(`style-options='${JSON.stringify(look.options)}'`);
  return `<aora-bot ${attrs.join(' ')}></aora-bot>`;
}

export function createConsole(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'studio';

  el.innerHTML = `
    <section class="studio-main">
      <div class="stage ${backgroundClass()}" id="stage">
        <aora-bot data-hero shape="${look.shape}" color="${look.color}" state="${look.state}"
                  style-id="${look.styleId}" variant="${look.variant}" size="240"></aora-bot>
      </div>
      <div class="stage-bar">
        <div class="actions">
          <button type="button" data-act="spin">${t('console.spin')}</button>
          <button type="button" data-act="bounce">${t('console.bounce')}</button>
          <button type="button" data-act="burst">${t('console.burst')}</button>
        </div>
        <div class="group" id="backgrounds">
          ${BACKGROUNDS.map(
            (b) =>
              `<button type="button" data-bg="${b.id}" aria-pressed="${look.background === b.id}">${zh(BACKGROUND_ZH, b.id, getLang())}</button>`,
          ).join('')}
        </div>
      </div>
    </section>

    <aside class="studio-side">
      <div class="code-card">
        <div class="code-head"><span>snippet</span><button type="button" id="copy">${t('console.copy')}</button></div>
        <pre class="snippet"><code data-snippet>${snippet()}</code></pre>
      </div>
      <div class="params" id="params"></div>
    </aside>
  `;

  const hero = el.querySelector<HTMLElement & Record<string, unknown>>('[data-hero]')!;
  const stage = el.querySelector<HTMLElement>('#stage')!;
  const paramsBox = el.querySelector<HTMLDivElement>('#params')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;

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

  /** Only what the current variant reads, so a slider never changes nothing. */
  function buildParams(): void {
    const style = getStyle(look.styleId);
    const specs = paramsForVariant(style, look.variant);
    const defaults = style.defaults as Record<string, unknown>;
    const entries = Object.entries(specs);
    if (!entries.length) {
      paramsBox.innerHTML = `<p class="hint">${t('console.noParams')}</p>`;
      return;
    }
    paramsBox.innerHTML =
      `<div class="params-head">参数</div>` +
      entries
        .map(([key, spec]) => {
          const label = spec.label ?? key;
          const current = (look.options[key] ?? defaults[key]) as unknown;
          if (spec.type === 'number') {
            return `<label class="row param"><span>${label}</span>
              <input type="range" data-opt="${key}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${current}" />
              <output>${current}</output></label>`;
          }
          if (spec.type === 'enum') {
            return `<label class="row param"><span>${label}</span>
              <select data-opt="${key}">${spec.options.map((o) => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
          }
          return `<label class="row param"><span>${label}</span>
            <input type="checkbox" data-opt="${key}"${current ? ' checked' : ''} class="check" /></label>`;
        })
        .join('');
  }

  el.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    const opt = target.dataset.opt;
    if (!opt) return;
    const isCheck = target.type === 'checkbox';
    const raw = isCheck ? target.checked : target.type === 'range' ? Number(target.value) : target.value;
    setLook({ options: { ...look.options, [opt]: raw } });
    const output = target.parentElement?.querySelector('output');
    if (output) output.textContent = String(raw);
    applyHero();
  });

  el.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.dataset.opt || target.type !== 'range') return;
    setLook({ options: { ...look.options, [target.dataset.opt]: Number(target.value) } });
    const output = target.parentElement?.querySelector('output');
    if (output) output.textContent = target.value;
    applyHero();
  });

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], [data-bg], #copy');
    if (!target) return;
    if (target.dataset.act === 'spin') hero.spin?.(1.5);
    if (target.dataset.act === 'bounce') hero.bounce?.(0.5);
    if (target.dataset.act === 'burst') hero.burst?.(24);
    if (target.dataset.bg) {
      setLook({ background: target.dataset.bg as never });
      applyHero();
    }
    if (target.id === 'copy') {
      navigator.clipboard?.writeText(snippetEl.textContent ?? '');
      target.textContent = t('console.copied');
      setTimeout(() => (target.textContent = t('console.copy')), 1400);
    }
  });

  buildParams();
  applyHero();

  const drawer = createDrawer(() => {
    buildParams();
    applyHero();
  });
  el.append(drawer);

  onLookChange(() => {
    buildParams();
    applyHero();
  });

  return el;
}
