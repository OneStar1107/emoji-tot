/**
 * The real-glass layer, as rules.
 *
 * Three kinds of assertion, each for a failure this feature can produce:
 *
 * 1. **Material rules** (island-glass.mjs): when the photograph is allowed, and
 *    that a failed or malformed capture paints nothing at all.
 * 2. **The numbers in the stylesheet**: the bleed the geometry assumes is the
 *    bleed the CSS pads with, and the tint still keeps body text at 4.5:1 over
 *    the worst desktop either theme can have.
 * 3. **The wiring**, read out of the sources: the layer becomes visible only
 *    after a capture, a closed panel releases it, and the capture channel is
 *    island-only and refuses when the switch is off.
 *
 * Run: node --test test/glass.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { GLASS_SKINS, glassAllowed, glassPaint } from '../src/renderer/island-glass.mjs';

const require = createRequire(import.meta.url);
const { GLASS_BLEED } = require('../src/main/services/backdrop.js');

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

const islandJs = src('renderer/island.js');
const islandCss = src('renderer/island.css');
const islandHtml = src('renderer/island.html');
const mainJs = src('main.js');
const preload = src('preload-island.js');
const schemaJs = src('shared/schema.js');
const settingsJs = src('renderer/settings.js');
const material = src('renderer/island-glass.mjs');

const FRAME = 'data:image/jpeg;base64,AAAA';

/* --------------------------------------------------------------- materials */

describe('glass: when the photograph may be shown', () => {
  it('only for the frost material with blur on', () => {
    assert.deepEqual(GLASS_SKINS, ['frost']);
    assert.equal(glassAllowed({}), true, 'a fresh profile has the frost material');
    assert.equal(glassAllowed({ skin: 'frost', blur: true, glassBackdrop: true }), true);
    assert.equal(glassAllowed({ skin: 'solid' }), false, 'a solid skin promises an opaque card');
    assert.equal(glassAllowed({ skin: 'plain' }), false);
    assert.equal(glassAllowed({ blur: false }), false, 'blur off means no translucency at all');
  });

  it('is off when the switch is off, and off without preferences', () => {
    assert.equal(glassAllowed({ glassBackdrop: false }), false);
    assert.equal(glassAllowed({ skin: 'frost', glassBackdrop: false }), false);
    assert.equal(glassAllowed(null), false);
    assert.equal(glassAllowed('frost'), false);
  });
});

describe('glass: the style values a payload becomes', () => {
  it('places the display image at the offset the main process measured', () => {
    const paint = glassPaint({
      dataUrl: FRAME,
      offset: { x: -778, y: -56 },
      size: { width: 2560, height: 1440 },
    });
    assert.equal(paint.position, '-778px -56px');
    assert.equal(paint.size, '2560px 1440px');
    assert.equal(paint.image, 'url("' + FRAME + '")');
  });

  it('keeps fractional offsets, so a centred panel still lines up', () => {
    const paint = glassPaint({
      dataUrl: FRAME,
      offset: { x: -777.5, y: -56.25 },
      size: { width: 2560, height: 1440 },
    });
    assert.equal(paint.position, '-777.5px -56.25px');
  });
});

/*
 * The fallback is the whole safety story: a capture that fails, arrives late or
 * comes back truncated must be indistinguishable from a capture that never
 * happened. In every one of these cases the layer is never painted, so the
 * panel keeps the CSS material underneath it.
 */
describe('glass: a failure paints nothing', () => {
  it('refuses null and non-objects', () => {
    for (const payload of [null, undefined, '', 0, [], 'data:image/jpeg;base64,AAAA']) {
      assert.equal(glassPaint(payload), null);
    }
  });

  it('refuses an answer without a real image', () => {
    const base = { offset: { x: 0, y: 0 }, size: { width: 100, height: 100 } };
    assert.equal(glassPaint({ ...base, dataUrl: '' }), null);
    assert.equal(glassPaint({ ...base, dataUrl: 'about:blank' }), null);
    assert.equal(glassPaint({ ...base, dataUrl: 42 }), null);
  });

  it('refuses an answer without a usable offset or size', () => {
    assert.equal(glassPaint({ dataUrl: FRAME, size: { width: 100, height: 100 } }), null);
    assert.equal(glassPaint({ dataUrl: FRAME, offset: { x: 0 } , size: { width: 100, height: 100 } }), null);
    assert.equal(glassPaint({ dataUrl: FRAME, offset: { x: 0, y: 0 }, size: { width: 0, height: 100 } }), null);
    assert.equal(glassPaint({ dataUrl: FRAME, offset: { x: 0, y: 0 }, size: { width: 100 } }), null);
  });

  it('lays the panel material out under the layer, never over it', () => {
    assert.match(islandCss, /\.panel\s*\{[^}]*isolation:\s*isolate/, 'the panel must be a stacking context');
    assert.match(islandCss, /\.panel-glass\s*\{[^}]*z-index:\s*-2/, 'the photograph sits above the panel background');
    assert.match(islandCss, /\.panel-veil\s*\{[^}]*z-index:\s*-1/, 'the tint sits above the photograph');
  });
});

/* ----------------------------------------------------------------- numbers */

/** One declaration's value from the first block that starts with `head`. */
function block(css, head) {
  const at = css.indexOf(head);
  assert.ok(at >= 0, 'missing block ' + head);
  const open = css.indexOf('{', at);
  const close = css.indexOf('\n}', open);
  return css.slice(open, close);
}

function declaration(css, name) {
  const found = css.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  assert.ok(found, 'missing --' + name);
  return found[1].trim();
}

const rgba = (value) => {
  const numbers = value.match(/-?[\d.]+/g)?.map(Number) ?? [];
  assert.ok(numbers.length >= 3, 'not a colour: ' + value);
  return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers.length > 3 ? numbers[3] : 1 };
};

const luminance = ({ r, g, b }) => {
  const channel = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a, b) => {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
};

const over = (top, alpha, bottom) => ({
  r: top.r * alpha + bottom.r * (1 - alpha),
  g: top.g * alpha + bottom.g * (1 - alpha),
  b: top.b * alpha + bottom.b * (1 - alpha),
});

const hex = (value) => {
  const n = Number.parseInt(String(value).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
};

const dark = block(islandCss, ':root {');
const light = block(islandCss, 'body[data-theme="light"] {');

describe('glass: the tint keeps body text readable', () => {
  const vein = declaration(dark, 'glass-veil');
  const ratio = Number(vein.match(/var\(--card\)\s+(\d+)%/)?.[1]);

  it('is the card tint at a stated fraction, not a second colour', () => {
    assert.match(vein, /color-mix\(in srgb, var\(--card\) \d+%, transparent\)/);
    assert.equal(ratio, 66, 'the fraction and the contrast numbers below are one decision');
  });

  /*
   * The worst desktop each theme can have: the dark theme's is a white page
   * (the brightest backdrop under light ink), the light theme's is a black one.
   * The photograph is brightness(0.94), then the veil, and the ink is the
   * stylesheet's own --ink — so this is the real composite, not a copy of it.
   */
  it('stays above 4.5:1 over a white desktop in the dark theme', () => {
    const card = rgba(declaration(dark, 'card'));
    const ink = hex(declaration(dark, 'ink'));
    const photo = { r: 255 * 0.9, g: 255 * 0.9, b: 255 * 0.9 };
    const composed = over(card, card.a * (ratio / 100), photo);
    const value = contrast(composed, ink);
    assert.ok(value >= 4.5, 'dark theme contrast is ' + value.toFixed(2) + ':1');
  });

  it('stays above 4.5:1 over a black desktop in the light theme', () => {
    const card = rgba(declaration(light, 'card'));
    const ink = hex(declaration(light, 'ink'));
    const photo = { r: 0, g: 0, b: 0 };
    const composed = over(card, card.a * (ratio / 100), photo);
    const value = contrast(composed, ink);
    assert.ok(value >= 4.5, 'light theme contrast is ' + value.toFixed(2) + ':1');
  });

  it('keeps the blur, saturation and brightness the layer was designed around', () => {
    assert.match(islandCss, /filter:\s*blur\(20px\) saturate\(155%\) brightness\(0\.9\)/);
  });

  it('pads the layer by the distance the geometry subtracts', () => {
    assert.equal(declaration(dark, 'glass-bleed'), GLASS_BLEED + 'px');
    assert.match(islandCss, /\.panel-glass\s*\{[^}]*inset:\s*calc\(-1 \* var\(--glass-bleed\)\)/);
  });
});

/* ------------------------------------------------------------------ wiring */

describe('glass: the layer is only visible after a capture', () => {
  it('has the two layers inside the panel', () => {
    assert.match(islandHtml, /<div class="panel-glass" id="panel-glass" aria-hidden="true"><\/div>/);
    assert.match(islandHtml, /<div class="panel-veil" aria-hidden="true"><\/div>/);
  });

  it('gates display on the open panel, the frost skin and a landed capture', () => {
    const rule = islandCss.slice(islandCss.indexOf('body[data-glass="on"][data-skin="frost"]'));
    const selector = rule.slice(0, rule.indexOf('{'));
    for (const token of ['data-glass="on"', 'data-skin="frost"', '#island[data-open="true"]', '.panel-glass', '.panel-veil']) {
      assert.ok(selector.includes(token), 'the display rule must require ' + token);
    }
    assert.match(islandCss, /\.panel-glass,\s*\n?\.panel-veil\s*\{\s*\n?\s*display:\s*none/, 'hidden until painted');
  });

  it('sets data-glass="on" in one place, after a payload', () => {
    const occurrences = islandJs.match(/dataset\.glass = 'on'/g) ?? [];
    assert.equal(occurrences.length, 1);
    const paint = islandJs.slice(islandJs.indexOf('function paintGlass'));
    assert.ok(paint.slice(0, paint.indexOf('\n}')).includes("dataset.glass = 'on'"), 'only paintGlass shows the layer');
  });

  it('releases the photograph when the panel closes', () => {
    const clear = islandJs.slice(islandJs.indexOf('function clearGlass'));
    const body = clear.slice(0, clear.indexOf('\n}'));
    assert.ok(body.includes("dataset.glass = 'off'"));
    assert.ok(body.includes("backgroundImage = ''"), 'dropping the background frees the decoded bitmap');
    assert.ok(islandJs.includes('if (folding) clearGlass();'), 'a closing panel releases it in the same task');
    const landed = islandJs.slice(islandJs.indexOf('function landClosed'));
    assert.ok(landed.slice(0, landed.indexOf('\n}')).includes('clearGlass()'));
  });

  it('asks only while open, and not in the middle of the fold', () => {
    const request = islandJs.slice(islandJs.indexOf('function requestGlass'));
    const body = request.slice(0, request.indexOf('\n}'));
    assert.ok(body.includes('if (!open || !glassAllowed(prefs))'));
    assert.ok(body.includes('if (morph || closing) return;'), 'painting mid-fold would scale the desktop');
    assert.ok(
      body.includes('.backdrop({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })'),
      'the ask carries the panel box in CSS pixels',
    );
    /* A late answer from an older ask must not repaint a newer one. */
    assert.ok(body.includes('token !== glassToken || !open'));
    const settle = islandJs.slice(islandJs.indexOf('function settleMorph'));
    assert.ok(settle.slice(0, settle.indexOf('\n}')).includes('requestGlass()'), 'the fold lands before the first ask');
  });

  it('re-shoots after the window moved, once, after a debounce', () => {
    assert.ok(islandJs.includes("window.addEventListener('resize', scheduleGlassRefresh)"));
    assert.ok(islandJs.includes('api.onMoved?.(scheduleGlassRefresh)'));
    const refresh = islandJs.slice(islandJs.indexOf('function scheduleGlassRefresh'));
    assert.ok(refresh.slice(0, refresh.indexOf('\n}')).includes('GLASS_REFRESH_MS'));
    assert.match(islandJs, /const GLASS_REFRESH_MS = 300;/);
  });

  it('drops the frame when the material turns it off', () => {
    assert.match(material, /prefs\.glassBackdrop === false/);
    const sync = islandJs.slice(islandJs.indexOf('function syncGlassMaterial'));
    const body = sync.slice(0, sync.indexOf('\n}'));
    assert.ok(body.includes('if (!glassAllowed(prefs)) clearGlass();'));
    assert.ok(body.includes('scheduleGlassRefresh()'));
  });
});

describe('glass: the capture stays local and island-only', () => {
  it('is a guarded channel for the island alone', () => {
    const handler = mainJs.slice(mainJs.indexOf("'island:backdrop'"), mainJs.indexOf("'island:backdrop'") + 1200);
    const body = handler;
    assert.ok(body.includes("['island']"), 'no other window may photograph the screen');
    assert.ok(body.includes('check: guard.checkRect'));
    assert.ok(body.includes("readPrefs().glassBackdrop === false"), 'the switch is re-read in main');
    assert.ok(body.includes('getDisplayMatching(bounds)'), 'the display under the window, not the primary one');
  });

  it('exposes one method to the page, not the service', () => {
    assert.match(preload, /backdrop: \(rect\) => ipcRenderer\.invoke\('island:backdrop', rect\)/);
    assert.ok(!preload.includes('desktopCapturer'), 'the renderer cannot capture anything itself');
  });

  it('ships the preference on by default and on the appearance page', () => {
    assert.match(schemaJs, /glassBackdrop: true/);
    assert.match(schemaJs, /glassBackdrop: 'appearance'/);
    assert.match(schemaJs, /glassBackdrop: \{ scope: 'renderer'/);
    assert.match(settingsJs, /rowToggle\(T\('appearance\.glassBackdrop\.label'\), T\('appearance\.glassBackdrop\.sub'\), 'glassBackdrop'\)/);
  });
});
