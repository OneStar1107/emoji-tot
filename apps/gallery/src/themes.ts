/**
 * Themes: seven seasonal sets of shapes, cast members and skins.
 *
 * A theme is code-split — nothing here is in the base bundle until a card is
 * clicked. That is why the page shows a name and counts first, and only draws
 * pictures after `loadTheme` resolves.
 */
import { THEME_MANIFEST, isThemeInstalled, loadTheme } from '@aora-bot/engine';
import { renderStaticSvg } from '@aora-bot/engine/static';
import { t } from './i18n';

function pinSvg(svg: string): string {
  return svg.replaceAll('@media (prefers-color-scheme: dark)', '@media all');
}

export function createThemes(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'themes';

  el.innerHTML = `
    <h1 class="view-title">${t('themes.title')}</h1>
    <p class="lead">${t('themes.lead')} <span id="status"></span></p>
    <section class="theme-grid" id="theme-grid">
      ${THEME_MANIFEST.map(
        (t) => `<button type="button" class="theme-card" data-theme="${t.id}">
          <span class="theme-art" data-art="${t.id}"></span>
          <span class="theme-name">${t.name.zh}<small>${t.name.en}</small></span>
          <span class="theme-meta">${t.shapes.length} shapes · ${t.cast.length} cast</span>
        </button>`,
      ).join('')}
    </section>
  `;

  const status = el.querySelector('#status')!;

  async function drawTheme(id: string): Promise<void> {
    const manifest = THEME_MANIFEST.find((t) => t.id === id);
    if (!manifest) return;
    const art = el.querySelector<HTMLElement>(`[data-art="${id}"]`);
    if (!art) return;
    if (!isThemeInstalled(id as never)) {
      status.textContent = t('themes.loading');
      try {
        await loadTheme(id as never);
      } catch {
        status.textContent = t('themes.failed');
        return;
      }
    }
    // Four of the theme's own shapes, drawn with its default look.
    const previews = manifest.shapes.slice(0, 4).map((shape) => {
      try {
        return pinSvg(renderStaticSvg({ shape: shape as never, color: 'black', size: 96 }));
      } catch {
        return '';
      }
    });
    art.innerHTML = previews.join('');
    status.textContent = '';
    art.closest('button')?.classList.add('loaded');
  }

  el.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-theme]');
    if (card?.dataset.theme) void drawTheme(card.dataset.theme);
  });

  return el;
}
