/**
 * The drawer: every option as a picture of itself.
 *
 * A dropdown makes you imagine what a `squircle` looks like. Here each choice
 * renders the thing it stands for — the shape, drawn; the colour, filled; the
 * state, with that face — so the choice is made by looking rather than by
 * recalling a name.
 */
import { COLOR_IDS, FACES, SHAPE_IDS, colorHex, renderCharacter } from '@emojibot/core';
import { EMOTIONS, getEmotion } from '@emojibot-studio/protocol';
import { getLang, t } from './i18n';
import { look, onLookChange, setLook } from './store';
import { COLOR_ZH, SHAPE_ZH, zh } from './zh';

export type DrawerTab = 'shape' | 'color' | 'state';

const TABS: { id: DrawerTab; key: 'console.shape' | 'console.color' | 'console.state' }[] = [
  { id: 'shape', key: 'console.shape' },
  { id: 'color', key: 'console.color' },
  { id: 'state', key: 'console.state' },
];

const THUMB = 56;

function thumb(options: { shape?: string; color?: string; state?: string }): string {
  try {
    return renderCharacter({
      shape: options.shape ?? look.shape,
      color: options.color ?? look.color,
      state: options.state ?? 'idle',
      size: THUMB,
    });
  } catch {
    return '';
  }
}

function swatch(color: string): string {
  return `<span class="swatch" style="background:${colorHex(color)}"></span>`;
}

export function createDrawer(onPick?: () => void): HTMLElement {
  const el = document.createElement('section');
  el.className = 'drawer';
  let tab: DrawerTab = 'shape';

  el.innerHTML = `
    <div class="drawer-tabs" role="tablist">
      ${TABS.map((x) => `<button type="button" role="tab" data-tab="${x.id}">${t(x.key)}</button>`).join('')}
    </div>
    <div class="tray" id="tray" role="listbox"></div>
  `;

  const tray = el.querySelector<HTMLElement>('#tray')!;
  const lang = () => getLang();

  function chip(value: string, label: string, preview: string, active: boolean): string {
    return `<button type="button" class="chip" data-value="${value}" role="option" aria-selected="${active}" title="${label}">
      <span class="chip-art">${preview}</span>
      <span class="chip-label">${label}</span>
    </button>`;
  }

  /**
   * One chip per state, not per id: several ids share a state ("Tired" and
   * "Dormant" both drowse) and the picture would be identical.
   */
  function stateEntries(): { state: string; label: string }[] {
    const seen = new Map<string, string>();
    for (const def of EMOTIONS) {
      if (seen.has(def.state)) continue;
      seen.set(def.state, lang() === 'zh' ? def.name.zh : def.name.en);
    }
    return [...seen].map(([state, label]) => ({ state, label }));
  }

  function renderTray(): void {
    const L = lang();
    if (tab === 'shape') {
      tray.innerHTML = SHAPE_IDS.map((id) =>
        chip(id, zh(SHAPE_ZH, id, L), thumb({ shape: id, state: look.state }), id === look.shape),
      ).join('');
      return;
    }
    if (tab === 'color') {
      tray.innerHTML = COLOR_IDS.map((id) =>
        chip(id, zh(COLOR_ZH, id, L), swatch(id), id === look.color),
      ).join('');
      return;
    }
    tray.innerHTML = stateEntries()
      .map((entry) => chip(entry.state, entry.label, thumb({ state: entry.state }), entry.state === look.state))
      .join('');
  }

  function markTab(): void {
    for (const button of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    }
  }

  function markChips(): void {
    for (const button of tray.querySelectorAll<HTMLElement>('.chip')) {
      const active =
        (tab === 'shape' && button.dataset.value === look.shape) ||
        (tab === 'color' && button.dataset.value === look.color) ||
        (tab === 'state' && button.dataset.value === look.state);
      button.setAttribute('aria-selected', String(active));
    }
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const tabButton = target.closest<HTMLElement>('[data-tab]');
    if (tabButton) {
      tab = tabButton.dataset.tab as DrawerTab;
      markTab();
      renderTray();
      return;
    }
    const option = target.closest<HTMLElement>('.chip');
    if (!option?.dataset.value) return;
    const value = option.dataset.value;
    if (tab === 'shape') setLook({ shape: value });
    if (tab === 'color') setLook({ color: value });
    if (tab === 'state') {
      const def = getEmotion(value);
      setLook({ state: def?.state ?? value });
    }
    // Redraw the thumbnails too: they are drawn with the current look, so a
    // shape change repaints the colour and state chips as well.
    renderTray();
    onPick?.();
  });

  markTab();
  renderTray();
  onLookChange(() => {
    renderTray();
    markChips();
  });

  return el;
}

/** The number of distinct states a wall can show. */
export function stateCount(): number {
  return new Set(Object.keys(FACES)).size;
}
