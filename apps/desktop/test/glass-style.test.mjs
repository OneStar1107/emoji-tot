import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(desktop, 'src', 'renderer', 'island.css'), 'utf8');
const islandMain = readFileSync(join(desktop, 'src', 'main', 'island.js'), 'utf8');

describe('frost liquid-glass material', () => {
  it('lets the frost panel and pill reveal the desktop tint', () => {
    const start = css.indexOf('\n.panel {');
    const end = start < 0 ? -1 : css.indexOf('\n}', start + 1);
    const panel = start < 0 || end < 0 ? '' : css.slice(start, end + 2);
    assert.match(panel, /var\(--card\);/);
    assert.doesNotMatch(panel, /var\(--card-solid\);/);
  });

  it('does not relight the CSS surface from a native window material', () => {
    assert.doesNotMatch(css, /data-material="acrylic"/);
  });

  it('keeps the island window transparent and unshaped', () => {
    assert.match(islandMain, /transparent: true/);
    assert.doesNotMatch(islandMain, /backgroundMaterial|resolveBackgroundMaterial|applyMaterialShape|setShape/);
  });
});
