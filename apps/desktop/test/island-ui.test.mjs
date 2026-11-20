import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  islandHeaderState,
  pagingVisibility,
} from '../src/renderer/island-header.mjs';

/** Directory of this test file, so the renderer sources can be read. */
const here = dirname(fileURLToPath(import.meta.url));

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

/*
 * The mailbox page is the one page that can carry another block above its empty
 * state. With every messenger app running (five by default) the old markup put a
 * 157.6px empty state below a 133px switchboard inside a 205px box: the "添加邮箱"
 * button was clipped, and the wheel over it flipped the page instead of scrolling
 * to the button. These three invariants are what keep that from coming back.
 */
const islandJs = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
const islandCss = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.css'), 'utf8');

describe('island mailbox page fits its 205px budget', () => {
  it('caps the messenger switchboard and summarises the rest', () => {
    assert.match(islandJs, /function messengerBlock/, 'the switchboard must still exist');
    const block = islandJs.slice(islandJs.indexOf('function messengerBlock'));
    const body = block.slice(0, block.indexOf('\n}'));
    assert.match(body, /slice\(0,/, 'rows must be capped, not unbounded');
    assert.match(body, /msg-more/, 'the overflow row tells the user how many are left');
  });

  it('lets the mailbox column scroll instead of clipping the button', () => {
    assert.match(
      islandCss,
      /\.mail-page-empty\s*\{[^}]*overflow-y:\s*auto/,
      'the mailbox page without accounts must scroll instead of clipping the button',
    );
    assert.match(islandCss, /\.mail-page\s*\{[^}]*overflow:\s*hidden/, 'the page wrapper clips, so .pages never scrolls');
  });

  it('does not flip pages when the wheel is over that column', () => {
    const wheel = islandJs.slice(islandJs.indexOf("document.addEventListener(\n  'wheel'"), islandJs.indexOf("document.addEventListener(\n  'wheel'") + 420);
    assert.match(wheel, /closest\('\.clip-list, \.shelf-list, \.todo-list, \.mail-page, \.mail'\)/, 'the wheel over the mailbox belongs to the mailbox: ' + wheel);
  });
});
