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
    // 0.6.0 moved the switchboard out of the mailbox page into its own page.
    assert.match(islandJs, /function messengerPage/, 'the switchboard must still exist');
    const block = islandJs.slice(islandJs.indexOf('function messengerPage'));
    const body = block.slice(0, block.indexOf('\n}'));
    assert.match(islandJs, /MESSAGE_ROWS/, 'the row cap is a named constant');
    assert.match(body, /msg-more/, 'the overflow row tells the user how many are left');
    assert.match(body, /messenger:activate/, 'a row still brings its window forward');
  });

  it('lets the mailbox column scroll instead of clipping the button', () => {
    // 0.7.0 runs every empty/error state through one template; the mailbox
    // placeholder is a .state block now and no longer needs its own scroller.
    assert.match(islandCss, /\.state\s*\{/);
    assert.match(islandCss, /\.state[\s\S]{0,400}max-height:\s*96px/);
    assert.match(islandCss, /\.mail-page\s*\{[^}]*overflow:\s*hidden/, 'the page wrapper clips, so .pages never scrolls');
  });

  it('does not flip pages when the wheel is over that column', () => {
    const wheel = islandJs.slice(islandJs.indexOf("document.addEventListener(\n  'wheel'"), islandJs.indexOf("document.addEventListener(\n  'wheel'") + 420);
    assert.match(wheel, /closest\('\.clip-list, \.shelf-list, \.todo-list, \.mail-page, \.mail'\)/, 'the wheel over the mailbox belongs to the mailbox: ' + wheel);
  });
});

/*
 * The focus page keeps its 96px ring, the clock and the three keys, and adds
 * two rows: today and this week. Both rows share one grid so the figures line
 * up, and the long rest names itself in the ring instead of appearing as a
 * 15:00 nobody announced.
 */
describe('island focus page reports both windows', () => {
  it('prints today and this week as two tabular rows', () => {
    const block = islandJs.slice(islandJs.indexOf('function focusPage'), islandJs.indexOf('function healthPage'));
    assert.match(block, /focus-stats/, 'the two-row statistics block must be rendered');
    assert.match(block, /statRow\('今日'/, 'today has its own row');
    assert.match(block, /statRow\('本周'/, 'the week has its own row');
    assert.match(block, /focus-ring/, 'the 96px ring is kept');
    assert.match(block, /focus-time/, 'the clock beside the ring is kept');
    assert.match(block, /focus-key/, 'the three keys are kept');
    assert.match(block, /长休息/, 'a long rest names itself in the ring');
    assert.doesNotMatch(block, /focus-note/, 'the single note line was replaced by the two rows');
  });

  it('gives both rows one grid and tabular figures', () => {
    const css = islandCss.slice(islandCss.indexOf('.focus-stats {'), islandCss.indexOf('.focus-empty'));
    assert.match(css, /grid-template-columns:\s*1fr max-content max-content/, 'both rows share the column widths');
    assert.match(css, /font-variant-numeric:\s*tabular-nums/, 'the figures are tabular');
    assert.match(css, /text-align:\s*right/, 'the numbers are right-aligned');
  });
});
