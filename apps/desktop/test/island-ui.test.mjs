import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  islandHeaderState,
  pagingVisibility,
} from '../src/renderer/island-header.mjs';

describe('island header title', () => {
  it('shows the playing title instead of repeating the page name', () => {
    const state = islandHeaderState({ active: true, playing: true, title: '正在播放的歌' });
    assert.equal(state.title, '正在播放的歌');
  });

  it('leaves the line empty when nothing is playing', () => {
    const state = islandHeaderState({ active: false, title: '旧歌' });
    assert.equal(state.title, '');
  });
});

describe('island paging affordances', () => {
  it('removes paging controls when no page is enabled', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
    const branch = source.slice(
      source.indexOf('if (!list.length)'),
      source.indexOf('  // Wrapping, not clamping'),
    );
    assert.ok(branch.includes('dotsEl.hidden = true'), 'zero pages must hide the dots');
    assert.ok(branch.includes('pager.hidden = true'), 'zero pages must hide both arrows');
    assert.ok(!branch.includes('subEl.textContent ='), 'zero pages must preserve the reusable subtitle span');
  });

  it('removes both arrows and dots when there is one page', () => {
    assert.deepEqual(pagingVisibility(1), { arrows: false, dots: false });
  });

  it('keeps both paging paths when more than one page exists', () => {
    assert.deepEqual(pagingVisibility(2), { arrows: true, dots: true });
  });
});
