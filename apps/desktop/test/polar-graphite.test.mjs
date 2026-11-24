import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGE_MANIFEST,
  SETTINGS_PAGE_KEYS,
  pageOfPath,
} from '../src/shared/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

describe('Polar Graphite application shell', () => {
  it('links the approved theme in both real renderer windows', () => {
    assert.match(src('renderer/settings.html'), /href="\.\/polar-graphite\.css"/);
    assert.match(src('renderer/island.html'), /href="\.\/polar-graphite\.css"/);
  });

  it('keeps the transparent island transparent while painting the settings window', () => {
    const css = src('renderer/polar-graphite.css');
    assert.match(css, /html,\s*body\s*\{[^}]*background:\s*transparent;/s);
    assert.match(css, /html:has\(\.titlebar\),\s*html:has\(\.titlebar\) body\s*\{[^}]*background:\s*var\(--bg\);/s);
    assert.match(css, /html\[data-theme="light"\],\s*body\[data-theme="light"\]\s*\{/);
  });

  it('puts both auto-avoid eyes inside the open center gap', () => {
    const css = src('renderer/polar-graphite.css');
    assert.match(css, /radial-gradient\(circle at 48% 50%, var\(--pg-foreground\)/);
    assert.match(css, /radial-gradient\(circle at 52% 50%, var\(--pg-foreground\)/);
    assert.match(css, /#avoid-strip::before[\s\S]*?width:\s*46%/);
    assert.match(css, /#avoid-strip::after[\s\S]*?width:\s*46%/);
  });

  it('ships the full eleven-page island and sixteen-page settings inventory', () => {
    assert.equal(PAGE_MANIFEST.length, 11);
    assert.equal(SETTINGS_PAGE_KEYS.length, 16);
    assert.equal(new Set(SETTINGS_PAGE_KEYS).size, SETTINGS_PAGE_KEYS.length);

    const settings = src('renderer/settings.js');
    const mapStart = settings.indexOf('const RENDERERS = {');
    const mapEnd = settings.indexOf('\n};', mapStart);
    assert.ok(mapStart >= 0 && mapEnd > mapStart);
    const rendererMap = settings.slice(mapStart, mapEnd);
    for (const key of SETTINGS_PAGE_KEYS) {
      assert.match(rendererMap, new RegExp('\\b' + key + ':\\s*page'), key + ' must have a settings renderer');
    }
  });

  it('maps the tray icon preference to the redesigned tray page', () => {
    assert.equal(pageOfPath('trayIcon'), 'tray');
    const settings = src('renderer/settings.js');
    assert.match(settings, /function pageTray\(\)/);
    assert.match(settings, /tray: pageTray/);
  });

  it('uses the normalized cast in the rail, preview, residency strip and tray preview', () => {
    const settings = src('renderer/settings.js');
    assert.match(settings, /const id = activeCastId\(\);\s*const name = castName\(id\);/);
    assert.match(settings, /cast="'\s*\+\s*escapeHtml\(activeCastId\(\)\)/);
    assert.match(settings, /document\.querySelectorAll\('emojitot-ball\[live\]'\)/);
  });
});

describe('Polar Graphite island controls', () => {
  it('renders a literal page count and upright pager labels', () => {
    const html = src('renderer/island.html');
    assert.match(html, /id="page-count">01 \/ 11</);
    assert.match(html, /class="pgm-pips dots" id="dots" aria-hidden="true"/);
    assert.doesNotMatch(html, /<nav class="dots"/);
    assert.match(html, /<span>上一页<\/span>/);
    assert.match(html, /<span>下一页<\/span>/);
    assert.doesNotMatch(html, /rotate\(/);
  });

  it('keeps the pager hit area at the desktop accessibility floor', () => {
    const css = src('renderer/polar-graphite.css');
    const pager = css.slice(css.indexOf('.island-footer .pager {'), css.indexOf('.island-footer .pager.next {'));
    assert.match(pager, /min-width:\s*44px/);
    assert.match(pager, /height:\s*32px/);
    assert.match(css, /\.dots \.dot\s*\{/);
    assert.doesNotMatch(css, /\.dots button/);
  });

  it('bounds page navigation and disables the endpoint control', () => {
    const js = src('renderer/island.js');
    assert.match(js, /Math\.max\(0, Math\.min\(pageIndex, list\.length - 1\)\)/);
    assert.match(js, /pager\.disabled = pager\.dataset\.pageNav === '-1' \? pageIndex === 0 : pageIndex === list\.length - 1/);
    assert.match(js, /String\(pageIndex \+ 1\)\.padStart\(2, '0'\)/);
  });
});

describe('Polar Graphite keeps required page content inside the island', () => {
  it('resets the legacy negative page lifts after removing .pages padding', () => {
    const css = src('renderer/polar-graphite.css');
    const block = css.slice(
      css.indexOf('.pages > .state,'),
      css.indexOf('.pages > .mail-page {\n  height: 100%;'),
    );
    for (const selector of [
      '.state',
      '.mail-page',
      '.music',
      '.wx',
      '.calendar',
      '.focus',
      '.health',
      '.todo',
      '.shelf',
      '.dev',
      '.msg-page',
      '.quota',
    ]) {
      assert.match(block, new RegExp('\\.pages > \\' + selector + '\\b'), selector + ' must be reset');
    }
    assert.match(block, /margin-top:\s*0/);
  });

  it('wraps state copy instead of hiding it behind a nowrap ellipsis', () => {
    const css = src('renderer/polar-graphite.css');
    const state = css.slice(css.indexOf('.pages .state {'), css.indexOf('.cal-right .state {'));
    assert.match(state, /display:\s*grid/);
    assert.match(state, /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
    assert.match(state, /max-height:\s*none/);
    assert.match(state, /\.pages \.state-line,[\s\S]*?\.pages \.state-hint\s*\{[^}]*white-space:\s*normal/s);
    assert.match(state, /\.pages \.state-line,[\s\S]*?\.pages \.state-hint\s*\{[^}]*overflow:\s*visible/s);
  });

  it('keeps calendar labels and errors readable when they wrap', () => {
    const css = src('renderer/polar-graphite.css');
    assert.match(css, /\.cal-day-title,[\s\S]*?\.cal-festival,[\s\S]*?\.cal-error\s*\{[^}]*white-space:\s*normal/s);
    assert.match(css, /\.cal-day-title,[\s\S]*?\.cal-error\s*\{[^}]*overflow:\s*visible/s);
  });
});

describe('Polar Graphite settings selects', () => {
  const settings = src('renderer/settings.js');

  it('uses the artboard combobox instead of a native select', () => {
    assert.doesNotMatch(settings, /['"]<select(?=[\s>])/);
    assert.match(settings, /class="pgm-select-shell" role="combobox"/);
    assert.match(settings, /role="listbox" popover="manual"/);
    assert.match(settings, /menu\.showPopover\(\)/);
  });

  it('supports mouse, arrows, Home, End, Enter, Space, Escape and Tab', () => {
    assert.match(settings, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
    assert.match(settings, /event\.key === 'Home' \|\| event\.key === 'End'/);
    assert.match(settings, /event\.key === 'Enter' \|\| event\.key === ' '/);
    assert.match(settings, /event\.key === 'Escape'/);
    assert.match(settings, /event\.key === 'Tab'/);
    assert.match(settings, /content\.addEventListener\('pointermove'/);
  });

  it('keeps the popover inside the window and flips it only when needed', () => {
    assert.match(settings, /const edge = 8/);
    assert.match(settings, /const menuRect = menu\.getBoundingClientRect\(\)/);
    assert.match(settings, /const openAbove = menuRect\.height > below && above > below/);
    assert.match(settings, /Math\.max\(edge, Math\.min\(rect\.left, innerWidth - edge - menuRect\.width\)\)/);
  });

  it('persists the chosen value through the schema path', () => {
    assert.match(settings, /value = key === 'displayId' && raw === 'null' \? null : raw/);
    assert.match(settings, /patch\(setPath\(key, value\)\)/);
  });
});

describe('Polar Graphite device settings', () => {
  it('lays device actions out in flow instead of over the battery copy', () => {
    const css = src('renderer/polar-graphite.css');
    const hero = css.slice(css.indexOf('.dev-hero {'), css.indexOf('.dev-hero .dev-foot[data-open-system]'));
    assert.match(hero, /\.dev-hero\s*\{[^}]*display:\s*grid/s);
    assert.match(hero, /\.dev-hero \.dev-tools\s*\{[^}]*position:\s*static/s);
    assert.match(hero, /\.dev-hero \.dev-tools\s*\{[^}]*grid-column:\s*2/s);
    assert.match(hero, /\.dev-hero \.dev-tools\s*\{[^}]*flex-wrap:\s*wrap/s);
  });
});
