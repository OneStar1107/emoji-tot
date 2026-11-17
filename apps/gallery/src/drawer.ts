/**
 * The drawer: every option as a picture of itself.
 *
 * A dropdown makes you imagine what `riso` or `strawberry` looks like. Here
 * each choice renders the thing it stands for — the shape, drawn; the colour,
 * filled; the state, with that face — so the choice is made by looking rather
 * than by recalling a name. The tray scrolls sideways because there are 71
 * shapes and no column wide enough for them.
 */
import { CAST_IDS, SHAPE_IDS, allVariants, castMember, getStyle } from '@aora-bot/engine';
import { renderStaticSvg } from '@aora-bot/engine/static';
import { EMOTIONS, getEmotion } from '@emojibot-studio/protocol';
import { getLang, t } from './i18n';
import { look, onLookChange, setLook } from './store';
import { COLOR_ZH, SHAPE_ZH, STYLE_ZH, VARIANT_ZH, zh } from './zh';

export type DrawerTab = 'cast' | 'shape' | 'color' | 'style' | 'variant' | 'state';

const TABS: { id: DrawerTab; key: 'console.cast' | 'console.shape' | 'console.color' | 'console.style' | 'console.variant' | 'console.state' }[] = [
  { id: 'cast', key: 'console.cast' },
  { id: 'shape', key: 'console.shape' },
  { id: 'color', key: 'console.color' },
  { id: 'style', key: 'console.style' },
  { id: 'variant', key: 'console.variant' },
  { id: 'state', key: 'console.state' },
];

const THUMB = 64;

function svg(options: Parameters<typeof renderStaticSvg>[0], size = THUMB): string {
  try {
    return renderStaticSvg({ ...options, size }).replaceAll('@media (prefers-color-scheme: dark)', '@media all');
  } catch {
    return '';
  }
}

export function createDrawer(onPick?: () => void): HTMLElement {
  const el = document.createElement('section');
  el.className = 'drawer';
  let tab: DrawerTab = 'cast';

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

  function swatch(color: string): string {
    return `<span class="swatch" style="background:var(--aora-swatch-${color}, ${cssColor(color)})"></span>`;
  }

  /** The palette ids are the engine's; a plain CSS colour keeps this independent of its variables. */
  function cssColor(id: string): string {
    const map: Record<string, string> = {
      cream: '#F6E7C1', ivory: '#F8F4E8', black: '#1F1F1F', brown: '#7A4B2A', red: '#D93A3A',
      orange: '#F08A24', yellow: '#F2C230', green: '#4FA65B', cyan: '#38B6C4', blue: '#3C6FE0',
      violet: '#7C5CD6', magenta: '#D4478F', pink: '#F39BB6', gray: '#9AA0A6', sage: '#9FB49A',
      clay: '#C4846A', navy: '#26324F', mauve: '#B08CA8',
    };
    return map[id] ?? '#ccc';
  }

  function renderTray(): void {
    const L = lang();
    let html = '';
    if (tab === 'cast') {
      html = CAST_IDS.map((id) => {
        const member = castMember(id);
        let preview = '';
        try {
          preview = svg({
            shape: (member?.shape ?? look.shape) as never,
            color: (member?.color ?? 'black') as never,
            state: 'idle',
            size: THUMB,
          });
        } catch {
          preview = '';
        }
        return chip(id, id, preview, id === look.cast);
      }).join('');
    } else if (tab === 'shape') {
      html = SHAPE_IDS.map((id) =>
        chip(id, zh(SHAPE_ZH, id, L), svg({ shape: id as never, color: look.color as never, state: 'idle' }), id === look.shape),
      ).join('');
    } else if (tab === 'color') {
      html = Object.keys(COLOR_ZH).map((id) =>
        chip(id, zh(COLOR_ZH, id, L), swatch(id), id === look.color),
      ).join('');
    } else if (tab === 'style') {
      html = ['vector', 'pixel', 'kaomoji'].map((id) => {
        const style = getStyle(id);
        return chip(
          id,
          zh(STYLE_ZH, id, L),
          svg({ shape: look.shape as never, color: look.color as never, state: 'idle', style: id as never, variant: style.defaultVariant as never }),
          id === look.styleId,
        );
      }).join('');
    } else if (tab === 'variant') {
      const style = getStyle(look.styleId);
      html = allVariants(style).map((id) =>
        chip(
          id,
          zh(VARIANT_ZH, id, L),
          svg({ shape: look.shape as never, color: look.color as never, state: 'idle', style: look.styleId as never, variant: id as never }),
          id === look.variant,
        ),
      ).join('');
    } else {
      html = EMOTIONS.map((def) =>
        chip(
          def.state,
          L === 'zh' ? def.name.zh : def.name.en,
          svg({ shape: look.shape as never, color: look.color as never, state: def.state as never, style: look.styleId as never, variant: look.variant as never }),
          def.state === look.state,
        ),
      ).join('');
    }
    tray.innerHTML = html;
  }

  function markTab(): void {
    for (const button of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
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
    if (!option) return;
    const value = option.dataset.value!;
    if (tab === 'cast') setLook({ cast: value });
    if (tab === 'shape') setLook({ shape: value });
    if (tab === 'color') setLook({ color: value });
    if (tab === 'style') {
      const style = getStyle(value);
      setLook({ styleId: value, variant: style.defaultVariant });
    }
    if (tab === 'variant') setLook({ variant: value });
    if (tab === 'state') {
      const def = getEmotion(value);
      if (def) setLook({ state: def.state });
    }
    renderTray();
    onPick?.();
  });

  markTab();
  renderTray();
  onLookChange(() => {
    // Only the selected chip changes; rebuilding 71 pictures on every click
    // would throw away work the browser just did.
    for (const button of tray.querySelectorAll<HTMLElement>('.chip')) {
      const active =
        (tab === 'cast' && button.dataset.value === look.cast) ||
        (tab === 'shape' && button.dataset.value === look.shape) ||
        (tab === 'color' && button.dataset.value === look.color) ||
        (tab === 'style' && button.dataset.value === look.styleId) ||
        (tab === 'variant' && button.dataset.value === look.variant) ||
        (tab === 'state' && button.dataset.value === look.state);
      button.setAttribute('aria-selected', String(active));
    }
  });

  return el;
}
