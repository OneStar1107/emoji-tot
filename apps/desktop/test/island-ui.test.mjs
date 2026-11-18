import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  islandHeaderState,
  pagingVisibility,
} from '../src/renderer/island-header.mjs';

describe('island header hierarchy', () => {
  it('keeps the page title primary while media is active', () => {
    const state = islandHeaderState('天气', {
      active: true,
      playing: true,
      title: '正在播放的歌',
    });
    assert.equal(state.title, '天气');
    assert.equal(state.media, '正在播放的歌');
  });

  it('clears the secondary media slot when nothing is active', () => {
    const state = islandHeaderState('天气', { active: false, title: '旧歌' });
    assert.equal(state.title, '天气');
    assert.equal(state.media, '');
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
