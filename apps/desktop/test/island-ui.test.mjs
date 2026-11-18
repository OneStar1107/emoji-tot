import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  it('removes both arrows and dots when there is one page', () => {
    assert.deepEqual(pagingVisibility(1), { arrows: false, dots: false });
  });

  it('keeps both paging paths when more than one page exists', () => {
    assert.deepEqual(pagingVisibility(2), { arrows: true, dots: true });
  });
});
