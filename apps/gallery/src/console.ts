/**
 * The studio: one character, its genes below, its code beside.
 *
 * The stage is the largest thing on the page and the snippet sits next to it,
 * because the point of the page is "this is what you get and this is how you
 * ask for it". The stage draws the character as SVG directly rather than
 * through the custom element, so the editor is not limited by what an
 * attribute can express; the element is what the snippet hands you.
 */
import { castMember, renderCast } from '@emojitot/core';
import { createDrawer } from './drawer';
import { backgroundClass, look, onLookChange, setLook } from './store';
import { t } from './i18n';
import type { RouteContext, View } from './main';

function hero(size = 260): string {
  const id = look.cast || 'tot';
  return renderCast({ id, state: look.state, size, style: look.finish });
}

function snippet(): string {
  const id = look.cast || 'tot';
  const finish = look.finish === 'flat' ? ' finish="flat"' : '';
  return `<emojitot-ball cast="${id}"${finish} state="${look.state}"></emojitot-ball>`;
}

function genome(): string {
  const id = look.cast || 'tot';
  const member = castMember(id);
  return JSON.stringify({ cast: id, state: look.state, finish: look.finish, body: member?.body }, null, 2);
}

export function createConsole(ctx: RouteContext = { route: 'console' }): View {
  // #/console?state=happy — the wall links here per expression, and a shared
  // link must open on that expression rather than on whatever was stored.
  if (ctx.state) setLook({ state: ctx.state });

  const el = document.createElement('div');
  el.className = 'studio';

  el.innerHTML = `
    <section class="studio-main">
      <div class="stage ${backgroundClass()}" id="stage">
        <div class="hero" data-hero>${hero()}</div>
      </div>
      <div class="stage-bar">
        <div class="actions">
          <button type="button" data-act="spin">${t('console.act.spin')}</button>
          <button type="button" data-act="bounce">${t('console.act.bounce')}</button>
          <button type="button" data-act="burst">${t('console.act.burst')}</button>
          <span class="sep"></span>
          <button type="button" data-finish="sticker" aria-pressed="true">${t('console.finish.sticker')}</button>
          <button type="button" data-finish="flat" aria-pressed="false">${t('console.finish.flat')}</button>
        </div>
        <div class="who" id="who"></div>
      </div>
      <div class="island-demo">
        <button type="button" class="island-pill" id="island-pill" aria-expanded="false">
          <span class="island-face" data-island-face></span>
          <span>09:41</span><span data-island-temp>19°</span>
        </button>
        <div class="island-panel" id="island-panel" hidden>
          <div class="island-top"><b data-island-title>${t('console.islandTitle')}</b><span>09:41</span></div>
          <div class="island-body">
            <figure data-island-art></figure>
            <div><b data-island-song>${t('console.islandSong')}</b><span>${t('console.islandHint')}</span></div>
          </div>
        </div>
        <p class="island-note">${t('console.islandNote')}</p>
      </div>
    </section>

    <aside class="studio-side">
      <div class="code-card">
        <div class="code-head"><span>${t('console.snippet')}</span><button type="button" id="copy">${t('console.copy')}</button></div>
        <pre class="snippet"><code data-snippet>${snippet()}</code></pre>
      </div>
      <div class="code-card">
        <div class="code-head"><span>${t('console.genome')}</span><button type="button" id="copy-json">${t('console.copy')}</button></div>
        <pre class="snippet"><code data-genome>${genome()}</code></pre>
      </div>
    </aside>
  `;

  const stage = el.querySelector<HTMLElement>('#stage')!;
  const heroEl = el.querySelector<HTMLElement>('[data-hero]')!;
  const who = el.querySelector<HTMLElement>('#who')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;
  const genomeEl = el.querySelector<HTMLElement>('[data-genome]')!;

  /** Timers this view owns; dispose() clears them. */
  const timers = new Set<number>();

  function apply(): void {
    heroEl.innerHTML = hero();
    stage.className = `stage ${backgroundClass()}`;
    snippetEl.textContent = snippet();
    genomeEl.textContent = genome();
    const member = look.cast ? castMember(look.cast) : undefined;
    who.textContent = member
      ? `${member.name.zh} · ${member.name.en} · ${member.desc}`
      : t('console.customGenome');
    const face = el.querySelector<HTMLElement>('[data-island-face]');
    if (face) face.innerHTML = hero(22);
    const art = el.querySelector<HTMLElement>('[data-island-art]');
    if (art) art.innerHTML = hero(54);
    const title = el.querySelector<HTMLElement>('[data-island-title]');
    if (title) title.textContent = member ? member.name.zh : t('console.custom');
    for (const b of el.querySelectorAll<HTMLElement>('[data-finish]')) {
      b.setAttribute('aria-pressed', String(b.dataset.finish === look.finish));
    }
  }

  /**
   * Copy through the clipboard API and report what actually happened.
   *
   * writeText returns a promise and it rejects — no permission, no focus, no
   * secure context. The old code called it, ignored the result and printed
   * "copied" unconditionally, so the one case where the copy failed looked
   * exactly like the case where it worked.
   */
  async function copyText(button: HTMLButtonElement, text: string): Promise<void> {
    const label = button.textContent ?? '';
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = t('console.copied');
      button.dataset.state = 'ok';
    } catch (error) {
      button.textContent = t('console.copyFailed');
      button.dataset.state = 'failed';
      console.warn('[console] clipboard write failed', error);
    } finally {
      button.disabled = false;
      const id = window.setTimeout(() => {
        timers.delete(id);
        button.textContent = label;
        delete button.dataset.state;
      }, 1400);
      timers.add(id);
    }
  }

  el.addEventListener('click', (event) => {
    const finishBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-finish]');
    if (finishBtn) {
      setLook({ finish: finishBtn.dataset.finish as 'sticker' | 'flat' });
      return;
    }
    const pill = (event.target as HTMLElement).closest<HTMLElement>('#island-pill');
    if (pill) {
      const panel = el.querySelector<HTMLElement>('#island-panel')!;
      panel.hidden = !panel.hidden;
      pill.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], #copy, #copy-json');
    if (!target) return;
    const act = target.dataset.act;
    if (act) {
      heroEl.classList.remove('fx-spin', 'fx-bounce', 'fx-burst');
      void heroEl.offsetWidth;
      heroEl.classList.add(act === 'spin' ? 'fx-spin' : act === 'bounce' ? 'fx-bounce' : 'fx-burst');
      return;
    }
    const text = target.id === 'copy' ? snippetEl.textContent ?? '' : genomeEl.textContent ?? '';
    void copyText(target as HTMLButtonElement, text);
  });

  apply();
  el.append(createDrawer(apply));
  const unsubscribe = onLookChange(apply);

  return {
    el,
    dispose(): void {
      unsubscribe();
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    },
  };
}
