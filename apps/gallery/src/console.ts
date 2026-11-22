/**
 * The studio: one character on a lit stage, its genome below, its code beside.
 *
 * The stage is the largest object on the page and the one thing the other
 * pages keep pointing at: it draws the character as SVG directly, so the
 * editor is not limited by what an attribute can express, while the snippet
 * beside it shows the element that hands you the same drawing.
 *
 * Three things answer the pointer at once: the character (parallax through
 * two custom properties, never per-frame attributes), the key light on the
 * stage floor, and the expression strip. The code block only flashes when the
 * text it shows actually changed — a flash on every re-render is noise.
 */
import { CAST, FACE_META, castMember, renderCast, renderCharacter } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';
import { createDrawer } from './drawer';
import { backgroundClass, look, onLookChange, setLook } from './store';
import { getLang, t } from './i18n';
import type { RouteContext, View } from './main';

/** The hero's default size. The snippet only prints a size that differs. */
const DEFAULT_SIZE = 360;

/** Three stage sizes: small enough for a phone, large enough to read the face. */
const SIZES = [220, 360, 480];

/** Where the chosen stage size survives a page change. */
const SIZE_KEY = 'es.stage.size';

/** How far the character may lean toward the pointer, in CSS pixels. */
const LOOK_RANGE = 6;

function storedSize(): number {
  try {
    const raw = Number(localStorage.getItem(SIZE_KEY));
    if (SIZES.includes(raw)) return raw;
  } catch {
    /* private mode */
  }
  return DEFAULT_SIZE;
}

/** Shared by every console instance: resizing the stage is a page preference. */
let stageSize = storedSize();

/**
 * The character the stage draws.
 *
 * A cast member is drawn from its id; a genome edited by hand has no id, so
 * it is drawn from its own genes. Falling back to 'tot' when there is no cast
 * is what made an edited colour or trait disappear: the drawer stored the new
 * gene and the stage put the old character back on screen.
 *
 * The stage character is the one place the app argues "this is alive": the
 * idle loop comes from the engine, so the snippet beside it reproduces it.
 */
function hero(size = stageSize): string {
  if (look.cast) {
    return renderCast({ id: look.cast, state: look.state, size, style: look.finish, motion: 'demo' });
  }
  return renderCharacter({
    body: look.body,
    color: look.color,
    traits: look.traits,
    state: look.state,
    size,
    style: look.finish,
    motion: 'demo',
  });
}

/** The expression's own name, from the protocol — zh and en both live there. */
function faceLabel(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return state;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
}

/** The two-digit protocol id the wall and the docs both print. */
function faceId(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  return emotion ? emotion.id : '';
}

/**
 * The element that reproduces the stage, in the element's own precedence:
 * cast wins, otherwise body/color/traits describe the genome. Printing
 * cast="tot" for an edited genome was a snippet that drew something else.
 */
function snippet(): string {
  const finish = look.finish === 'flat' ? ' finish="flat"' : '';
  const size = stageSize === DEFAULT_SIZE ? '' : ' size="' + stageSize + '"';
  const traits = look.traits.length ? ' traits="' + look.traits.join(' ') + '"' : '';
  const genes = look.cast
    ? ' cast="' + look.cast + '"'
    : ' body="' + look.body + '" color="' + look.color + '"' + traits;
  return '\u0060emojitot-ball' + genes + finish + size + ' state="' + look.state + '"></emojitot-ball>\u0060';
}

/**
 * The genome as data — all four genes, read from the live look.
 *
 * Colour and traits were missing, so editing either left both code blocks
 * untouched, and body came from the fallback member rather than from what is
 * being drawn. cast is null once the genome is custom.
 */
function genome(): string {
  return JSON.stringify(
    {
      cast: look.cast || null,
      body: look.body,
      color: look.color,
      traits: look.traits,
      state: look.state,
      finish: look.finish,
    },
    null,
    2,
  );
}

/** One cell of the expression grid: the current character wearing that face. */
function faceChip(state: string): string {
  const art = renderCharacter({ body: look.body, color: look.color, traits: look.traits, state, size: 30 });
  return (
    '<button type="button" class="face-chip" data-face="' + state + '" aria-pressed="' +
    (look.state === state) +
    '" title="' + faceLabel(state) + ' · #' + faceId(state) + '">' +
    '<span class="face-chip-art">' + art + '</span>' +
    '<span class="face-chip-name">' + faceLabel(state) + '</span>' +
    '</button>'
  );
}

/**
 * The traced path around the hero.
 *
 * Every character in this app is a closed path sampled by hand, so the one
 * abstract graphic on the site is that fact: a closed outline that draws
 * itself, a dashed orbit that turns underneath it, and four crop ticks.
 */
function orbit(): string {
  const ticks = [0, 90, 180, 270]
    .map((angle) => {
      const rad = (angle * Math.PI) / 180;
      const x1 = 100 + Math.cos(rad) * 96;
      const y1 = 100 + Math.sin(rad) * 96;
      const x2 = 100 + Math.cos(rad) * 88;
      const y2 = 100 + Math.sin(rad) * 88;
      return '<line class="orbit-tick" x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) +
        '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
    })
    .join('');
  return '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">' +
    '<circle class="orbit-dash" cx="100" cy="100" r="96"/>' +
    '<path class="orbit-trace" d="M100 8 C150.8 8 192 49.2 192 100 C192 150.8 150.8 192 100 192 C49.2 192 8 150.8 8 100 C8 49.2 49.2 8 100 8 Z"/>' +
    '<circle class="orbit-ring" cx="100" cy="100" r="78" opacity=".16"/>' +
    ticks +
    '</svg>';
}

export function createConsole(ctx: RouteContext = { route: 'console' }): View {
  // #/console?state=happy — the wall links here per expression, and a shared
  // link must open on that expression rather than on whatever was stored.
  if (ctx.state) setLook({ state: ctx.state });

  const el = document.createElement('div');
  el.className = 'studio-view';

  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="eyebrow"><b>01</b><i></i>Console<i></i>Stage</div>
        <h1 class="page-title">${t('console.title')}<span>one face, drawn not exported</span></h1>
      </div>
      <div>
        <p class="page-lead">${t('console.lead')}</p>
        <div class="page-stats">
          <div class="stat"><b>${CAST.length}</b><span>cast</span></div>
          <div class="stat"><b>${FACE_META.length}</b><span>faces</span></div>
          <div class="stat"><b>0</b><span>images</span></div>
        </div>
      </div>
    </header>

    <div class="studio">
      <section class="studio-main">
        <div class="stage ${backgroundClass()}" id="stage">
          <div class="stage-grid" aria-hidden="true"></div>
          <div class="stage-orbit" aria-hidden="true">${orbit()}</div>
          <span class="stage-badge" data-stage-badge>path · closed</span>
          <span class="stage-id" data-stage-id>#${faceId(look.state)}</span>
          <div class="stage-center">
            <div class="hero" data-hero><div class="hero-art">${hero()}</div></div>
            <div class="stage-label">
              <span class="stage-name" data-stage-name></span>
            </div>
          </div>
          <div class="stage-bar">
            <div class="actions">
              <button type="button" data-act="spin">${t('console.act.spin')}</button>
              <button type="button" data-act="bounce">${t('console.act.bounce')}</button>
              <button type="button" data-act="burst">${t('console.act.burst')}</button>
              <span class="sep"></span>
              <button type="button" data-finish="sticker" aria-pressed="true">${t('console.finish.sticker')}</button>
              <button type="button" data-finish="flat" aria-pressed="false">${t('console.finish.flat')}</button>
              <span class="sep"></span>
              ${SIZES.map(
                (size) =>
                  '<button type="button" data-size="' + size + '" aria-pressed="' + (size === stageSize) +
                  '" title="' + size + ' px">' + size + '</button>',
              ).join('')}
            </div>
            <div class="who" id="who"></div>
          </div>
        </div>

        <div class="face-strip">
          <div class="strip-head">
            <span class="strip-title">${t('drawer.face')} <b>${EMOTIONS.length}</b></span>
            <span class="strip-hint">00 — 60 · protocol</span>
          </div>
          <div class="face-grid" id="faceGrid" role="group" aria-label="${t('drawer.face')}"></div>
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
          <p class="island-note"><span>desktop · island</span>${t('console.islandNote')}</p>
        </div>
      </section>

      <aside class="studio-side">
        <div class="code-card">
          <div class="term-bar">
            <span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="term-name">snippet.html</span>
            <button type="button" class="btn" id="copy">${t('console.copy')}</button>
          </div>
          <pre class="snippet" data-code><code data-snippet>${snippet()}</code></pre>
        </div>
        <div class="code-card">
          <div class="term-bar">
            <span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="term-name">genome.json</span>
            <button type="button" class="btn" id="copy-json">${t('console.copy')}</button>
          </div>
          <pre class="snippet" data-code><code data-genome>${genome()}</code></pre>
        </div>
      </aside>

      <div class="drawer-slot"></div>
    </div>
  `;

  const stage = el.querySelector<HTMLElement>('#stage')!;
  const heroEl = el.querySelector<HTMLElement>('[data-hero]')!;
  const who = el.querySelector<HTMLElement>('#who')!;
  const faceGrid = el.querySelector<HTMLElement>('#faceGrid')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;
  const genomeEl = el.querySelector<HTMLElement>('[data-genome]')!;
  const stageId = el.querySelector<HTMLElement>('[data-stage-id]')!;
  const stageName = el.querySelector<HTMLElement>('[data-stage-name]')!;

  /** Timers this view owns; dispose() clears them. */
  const timers = new Set<number>();

  /** What the stage shows, so a real change can be told from a repaint. */
  let shownState = look.state;

  /** The genome the chips were drawn from; the chip art is that genome. */
  let chipGenome = '';

  /** The hero's box, kept in sync with the size preference. */
  heroEl.style.setProperty('--hero-size', stageSize + 'px');

  /* --- the pointer moves the character and the key light --------------- */

  /*
   * The stage writes four custom properties and nothing else.
   *
   * pointermove can fire far more often than the screen refreshes, so the
   * handler only records the latest position and one rAF per frame does the
   * write. Setting attributes or rebuilding the SVG here would cost a layout
   * per event for an effect that is a couple of pixels.
   */
  let lookX = 0;
  let lookY = 0;
  let spotX = 50;
  let spotY = 24;
  let lookFrame = 0;

  function paintLook(): void {
    lookFrame = 0;
    heroEl.style.setProperty('--look-x', lookX + 'px');
    heroEl.style.setProperty('--look-y', lookY + 'px');
    stage.style.setProperty('--spot-x', spotX.toFixed(1) + '%');
    stage.style.setProperty('--spot-y', spotY.toFixed(1) + '%');
  }

  function queueLook(): void {
    if (!lookFrame) lookFrame = window.requestAnimationFrame(paintLook);
  }

  function onStageMove(event: PointerEvent): void {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
    const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);
    lookX = Math.round(x * LOOK_RANGE * 100) / 100;
    lookY = Math.round(y * LOOK_RANGE * 100) / 100;
    spotX = ((event.clientX - rect.left) / rect.width) * 100;
    spotY = ((event.clientY - rect.top) / rect.height) * 100;
    queueLook();
  }

  function resetLook(): void {
    lookX = 0;
    lookY = 0;
    spotX = 50;
    spotY = 24;
    queueLook();
  }

  stage.addEventListener('pointermove', onStageMove);
  stage.addEventListener('pointerleave', resetLook);
  paintLook();

  /* --- feedback -------------------------------------------------------- */

  /**
   * Flash the code card whose text just changed.
   *
   * The attribute is removed and re-added around a forced reflow so a second
   * change inside the flash window restarts it instead of being swallowed.
   * The timer exists so the attribute never outlives the animation.
   */
  function flash(block: Element | null): void {
    if (!(block instanceof HTMLElement)) return;
    block.removeAttribute('data-flash');
    void block.offsetWidth;
    block.setAttribute('data-flash', '');
    const id = window.setTimeout(() => {
      timers.delete(id);
      block.removeAttribute('data-flash');
    }, 520);
    timers.add(id);
  }

  /** Mark the hero for one 220ms expression cross-fade. */
  function swapFace(): void {
    heroEl.removeAttribute('data-swap');
    void heroEl.offsetWidth;
    heroEl.setAttribute('data-swap', '');
    const id = window.setTimeout(() => {
      timers.delete(id);
      heroEl.removeAttribute('data-swap');
    }, 220);
    timers.add(id);
  }

  function paintFaces(): void {
    faceGrid.innerHTML = EMOTIONS.map((emotion) => faceChip(emotion.state)).join('');
    chipGenome = look.body + '|' + look.color + '|' + look.traits.join(' ');
  }

  function syncFaces(): void {
    for (const button of faceGrid.querySelectorAll<HTMLElement>('[data-face]')) {
      button.setAttribute('aria-pressed', String(button.dataset.face === look.state));
    }
  }

  function apply(): void {
    const nextSnippet = snippet();
    const nextGenome = genome();
    const change = {
      snippet: snippetEl.textContent !== nextSnippet,
      genome: genomeEl.textContent !== nextGenome,
      state: shownState !== look.state,
    };
    shownState = look.state;

    heroEl.innerHTML = '<div class="hero-art">' + hero() + '</div>';
    if (change.state) swapFace();

    stage.className = 'stage ' + backgroundClass();
    if (change.snippet) {
      snippetEl.textContent = nextSnippet;
      flash(snippetEl.closest('.code-card'));
    }
    if (change.genome) {
      genomeEl.textContent = nextGenome;
      flash(genomeEl.closest('.code-card'));
    }

    const member = look.cast ? castMember(look.cast) : undefined;
    // The stage caption stays short: the name is already on the stage label,
    // so this line carries the character's own description instead.
    who.textContent = member
      ? member.desc
      : t('console.customGenome');
    stageName.innerHTML = '<b>' + (member ? (getLang() === 'zh' ? member.name.zh : member.name.en) : t('console.custom')) +
      '</b> <i>·</i> ' + faceLabel(look.state);
    stageId.textContent = '#' + faceId(look.state);

    const face = el.querySelector<HTMLElement>('[data-island-face]');
    if (face) face.innerHTML = hero(22);
    const art = el.querySelector<HTMLElement>('[data-island-art]');
    if (art) art.innerHTML = hero(54);
    const title = el.querySelector<HTMLElement>('[data-island-title]');
    if (title) title.textContent = member ? member.name.zh : t('console.custom');

    for (const button of el.querySelectorAll<HTMLElement>('[data-finish]')) {
      button.setAttribute('aria-pressed', String(button.dataset.finish === look.finish));
    }
    for (const button of el.querySelectorAll<HTMLElement>('[data-size]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.size) === stageSize));
    }

    // Chip art is the current genome, so it only needs a redraw when a gene
    // changed; a face change just moves the pressed state.
    const nextChipGenome = look.body + '|' + look.color + '|' + look.traits.join(' ');
    if (nextChipGenome !== chipGenome) paintFaces();
    else syncFaces();
  }

  function setStageSize(size: number): void {
    if (size === stageSize || !SIZES.includes(size)) return;
    stageSize = size;
    heroEl.style.setProperty('--hero-size', size + 'px');
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      /* private mode */
    }
    apply();
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
      button.setAttribute('data-done', '');
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
        button.removeAttribute('data-done');
        delete button.dataset.state;
      }, 1200);
      timers.add(id);
    }
  }

  /**
   * Play one of the three stage effects.
   *
   * The class comes off on a timer instead of staying on the element: a
   * leftover fx-* class is a finished animation that replays the moment the
   * hero re-renders for another reason — changing the face removes data-swap
   * after 220ms and hands the animation property back to it, so the character
   * would spin again on its own right after the expression changed.
   */
  function playFx(act: string): void {
    const fx = act === 'spin' ? 'fx-spin' : act === 'bounce' ? 'fx-bounce' : 'fx-burst';
    heroEl.classList.remove('fx-spin', 'fx-bounce', 'fx-burst');
    void heroEl.offsetWidth;
    heroEl.classList.add(fx);
    const id = window.setTimeout(() => {
      timers.delete(id);
      heroEl.classList.remove(fx);
    }, act === 'spin' ? 900 : 700);
    timers.add(id);
  }

  el.addEventListener('click', (event) => {
    const finishBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-finish]');
    if (finishBtn) {
      setLook({ finish: finishBtn.dataset.finish as 'sticker' | 'flat' });
      return;
    }
    const sizeBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-size]');
    if (sizeBtn) {
      setStageSize(Number(sizeBtn.dataset.size));
      return;
    }
    const faceBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-face]');
    if (faceBtn) {
      // Strictly a one-line store write: every panel follows from it.
      setLook({ state: faceBtn.dataset.face! });
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
      playFx(act);
      return;
    }
    const text = target.id === 'copy' ? snippetEl.textContent ?? '' : genomeEl.textContent ?? '';
    void copyText(target as HTMLButtonElement, text);
  });

  apply();
  el.querySelector('.drawer-slot')!.replaceWith(createDrawer(apply));
  const unsubscribe = onLookChange(apply);

  return {
    el,
    dispose(): void {
      unsubscribe();
      stage.removeEventListener('pointermove', onStageMove);
      stage.removeEventListener('pointerleave', resetLook);
      if (lookFrame) window.cancelAnimationFrame(lookFrame);
      lookFrame = 0;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    },
  };
}
