/**
 * The studio: one character, its choices below, its code beside.
 *
 * The stage is the largest thing on the page and the snippet sits next to it,
 * because the point of the page is "this is what you get and this is how you
 * ask for it". Every choice is a picture in the drawer; the only text control
 * left is the copy button.
 */
import { defineBall } from '@emojibot/core/element';
import { createDrawer } from './drawer';
import { getLang, t } from './i18n';
import { backgroundClass, look, onLookChange, setLook } from './store';
import { BACKGROUND_ZH, zh } from './zh';

defineBall();

const BACKGROUNDS = ['plain', 'grid', 'dots', 'night', 'paper'] as const;

function snippet(): string {
  return `<emojibot-ball shape="${look.shape}" color="${look.color}" state="${look.state}"></emojibot-ball>`;
}

export function createConsole(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'studio';

  el.innerHTML = `
    <section class="studio-main">
      <div class="stage ${backgroundClass()}" id="stage">
        <emojibot-ball data-hero shape="${look.shape}" color="${look.color}" state="${look.state}" size="240"></emojibot-ball>
      </div>
      <div class="stage-bar">
        <div class="actions">
          <button type="button" data-act="spin">${t('console.spin')}</button>
          <button type="button" data-act="bounce">${t('console.bounce')}</button>
          <button type="button" data-act="burst">${t('console.burst')}</button>
        </div>
        <div class="group" id="backgrounds">
          ${BACKGROUNDS.map(
            (id) =>
              `<button type="button" data-bg="${id}" aria-pressed="${look.background === id}">${zh(BACKGROUND_ZH, id, getLang())}</button>`,
          ).join('')}
        </div>
      </div>
    </section>

    <aside class="studio-side">
      <div class="code-card">
        <div class="code-head"><span>${t('console.code')}</span><button type="button" id="copy">${t('console.copy')}</button></div>
        <pre class="snippet"><code data-snippet>${snippet()}</code></pre>
      </div>
      <div class="params"><p class="hint">${getLang() === 'zh'
        ? '这个引擎有三个维度：形状、颜色、状态。脸部墨色按身体亮度自动取反，所以不用另外选。'
        : 'Three dimensions: shape, colour, state. The face ink is derived from the body brightness, so there is nothing to pick.'}</p></div>
    </aside>
  `;

  const hero = el.querySelector<HTMLElement & Record<string, unknown>>('[data-hero]')!;
  const stage = el.querySelector<HTMLElement>('#stage')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;

  function applyHero(): void {
    hero.setAttribute('shape', look.shape);
    hero.setAttribute('color', look.color);
    hero.state = look.state;
    stage.className = `stage ${backgroundClass()}`;
    snippetEl.textContent = snippet();
    for (const button of el.querySelectorAll<HTMLButtonElement>('#backgrounds button')) {
      button.setAttribute('aria-pressed', String(button.dataset.bg === look.background));
    }
  }

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], [data-bg], #copy');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'spin') hero.spin?.(1.5);
    if (act === 'bounce') hero.bounce?.(0.5);
    if (act === 'burst') hero.burst?.(24);
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

  applyHero();
  el.append(createDrawer(applyHero));
  onLookChange(applyHero);
  return el;
}
