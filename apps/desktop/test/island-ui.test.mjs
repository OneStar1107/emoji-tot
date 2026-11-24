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

  it('adds the artist to a song title', () => {
    const state = islandHeaderState({
      active: true,
      playing: true,
      title: '晴天',
      artist: '周杰伦',
    });
    assert.equal(state.title, '晴天 - 周杰伦');
  });

  it('shows a live room as room title and anchor name without the platform', () => {
    const state = islandHeaderState({
      active: true,
      playing: true,
      title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台',
      live: {
        platform: 'bilibili',
        roomTitle: 'gta6！赚够100W再下播',
        anchorName: '棉花大哥哥',
        anchorId: '1871001',
      },
    });
    assert.equal(state.title, 'gta6！赚够100W再下播 - 棉花大哥哥');
  });

  it('leaves the line empty when nothing is playing', () => {
    const state = islandHeaderState({ active: false, title: '旧歌' });
    assert.equal(state.title, '');
  });
});

describe('island paging affordances', () => {
  it('replaces paging controls with a clear empty state when no page is enabled', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
    const branch = source.slice(
      source.indexOf('if (!list.length)'),
      source.indexOf('  // Wrapping, not clamping'),
    );
    assert.ok(branch.includes('dotsEl.hidden = true'), 'zero pages must hide the dots');
    assert.ok(branch.includes('pager.hidden = true'), 'zero pages must hide both arrows');
    assert.ok(branch.includes("pageCountEl.textContent = '00 / 00'"), 'zero pages must show an empty count');
    assert.ok(branch.includes("subEl.textContent = '去设置里打开'"), 'zero pages must explain how to recover');
  });

  it('removes both arrows and dots when there is one page', () => {
    assert.deepEqual(pagingVisibility(1), { arrows: false, dots: false });
  });

  it('keeps both paging paths when more than one page exists', () => {
    assert.deepEqual(pagingVisibility(2), { arrows: true, dots: true });
  });

  it('keeps the progress rail decorative and supports keyboard pager activation', () => {
    const source = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
    const handler = source.slice(
      source.indexOf("panelEl.addEventListener('click'"),
      source.indexOf("panelEl.addEventListener('change'"),
    );
    assert.match(handler, /event\.target\.closest\('\[data-page-nav\]'\)/);
    assert.match(handler, /event\.detail === 0/);
    assert.doesNotMatch(handler, /#dots \[data-page\]/);
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
    assert.match(body, /appCount - MESSAGE_ROWS/, 'the overflow count is derived from the row cap');
    assert.match(body, /pgm-visually-hidden/, 'the overflow summary remains available to assistive tech');
    assert.match(body, /data-local="messenger:activate"/, 'a row still brings its window forward');
  });

  it('lets the mailbox column scroll instead of clipping the button', () => {
    // 0.7.0 runs every empty/error state through one template; the mailbox
    // placeholder is a .state block now and no longer needs its own scroller.
    assert.match(islandCss, /\.state\s*\{/);
    assert.match(islandCss, /\.state[\s\S]{0,400}max-height:\s*96px/);
    assert.match(islandCss, /\.mail-page\s*\{[^}]*overflow:\s*hidden/, 'the page wrapper clips, so .pages never scrolls');
  });

  it('does not flip pages when the wheel is over that column', () => {
    assert.match(
      islandJs,
      /const WHEEL_OWNERS =\s*'\.clip-list, \.shelf-list, \.todo-list, \.dev-list, \.msg-list, \.mail-page, \.mail, \.quota-scroll'/,
      'the wheel over the mailbox belongs to the mailbox',
    );
    const handler = islandJs.slice(islandJs.indexOf('function wheelOwner'));
    assert.match(handler, /const named = target\.closest\(WHEEL_OWNERS\)/, 'the wheel stop reads the list');
  });
});

/*
 * The device list scrolls inside the page, not the page itself: five 26px rows
 * are the viewport of a 130px cap and the rest stay one wheel away. That cap is
 * why the wheel over the sixth device flipped the page instead of scrolling —
 * .dev-list was the only inner scroller missing from the wheel-owner list.
 */
describe('island devices page owns its own wheel', () => {
  it('names the device list as a wheel owner', () => {
    const owners = islandJs.match(/const WHEEL_OWNERS =[\s\S]{0,200}?;/);
    assert.ok(owners, 'the wheel-owner list must be a named constant');
    assert.match(owners[0], /\.dev-list\b/, 'the device list is a wheel owner: ' + owners[0]);
  });

  it('keeps the device list scrollable inside the 217px page', () => {
    const block = islandCss.slice(islandCss.indexOf('.dev-list {'));
    const rule = block.slice(0, block.indexOf('}'));
    assert.match(rule, /max-height:\s*130px/, 'the cap is five 26px rows');
    assert.match(rule, /overflow-y:\s*auto/, 'the list scrolls itself');
    assert.match(rule, /overscroll-behavior:\s*contain/, 'the list never chains its scroll to the page');
  });

  it('swallows the wheel at either end instead of leaking it to the pager', () => {
    const handler = islandJs.slice(
      islandJs.indexOf("document.addEventListener(\n  'wheel'"),
      islandJs.indexOf('{ capture: true }'),
    );
    assert.match(handler, /list\.scrollHeight > list\.clientHeight \+ 1[\s\S]{0,300}event\.stopPropagation\(\)/, 'a scrolling list swallows the wheel even at its start or end: ' + handler);
    assert.doesNotMatch(handler, /scrollTop/, 'no boundary check re-arms paging at the ends');
  });

  it('does not disable paging for the page box itself', () => {
    const fallback = islandJs.slice(islandJs.indexOf('function wheelOwner'), islandJs.indexOf('{ capture: true }'));
    assert.match(fallback, /el !== pagesEl/, '#pages must stay outside the general rule');
  });

  it('covers the message centre list the same way', () => {
    const owners = islandJs.match(/const WHEEL_OWNERS =[\s\S]{0,200}?;/);
    assert.match(owners[0], /\.msg-list\b/, '.msg-list scrolls inside the page too');
  });
});

describe('AI workbench scrolls its lower block without stealing page paging', () => {
  it('separates open idle platforms from platforms that are not running', () => {
    const block = islandJs.slice(islandJs.indexOf('function agentBlock'), islandJs.indexOf('function quotaPage'));
    assert.match(block, /const idle = Math\.max\(0, active - running\)/);
    assert.match(block, /const stopped = Math\.max\(0, on\.length - active\)/);
    assert.match(block, /<b>\$\{stopped\}<\/b>未启动/);
  });

  it('keeps refresh on the provider line instead of the scrolling footer', () => {
    const block = islandJs.slice(islandJs.indexOf('function quotaPage'), islandJs.indexOf('/**\n * "(3) 张三"'));
    const meta = block.match(/const meta = `<div class="quota-meta[^"]*">([\s\S]*?)<\/div>`;/);
    assert.ok(meta, 'the provider line must remain a named block');
    assert.match(meta[1], /\$\{refresh\}/, 'refresh belongs on the provider line');
    const footer = block.slice(
      block.indexOf('<div class="quota-foot">'),
      block.indexOf('</div>', block.indexOf('<div class="quota-foot">')),
    );
    assert.doesNotMatch(footer, /\$\{refresh\}/, 'the footer keeps only its update stamp');
  });

  it('keeps the agent rows in the lower list scroller', () => {
    const block = islandJs.slice(islandJs.indexOf('function quotaPage'), islandJs.indexOf('/**\n * "(3) 张三"'));
    assert.match(block, /class="pgm-ai-list quota-scroll"/);
    const open = block.indexOf('class="pgm-ai-list quota-scroll"');
    const agents = block.indexOf('${rows ||');
    assert.ok(open >= 0 && open < agents, 'the lower list must own the scrolling agent rows');
    assert.doesNotMatch(block, /class="quota-foot"/, 'the artboard has no separate quota footer');
  });

  it('makes that block a wheel owner', () => {
    const owners = islandJs.match(/const WHEEL_OWNERS =[\s\S]{0,240}?;/);
    assert.ok(owners, 'the wheel-owner list must be a named constant');
    assert.match(owners[0], /\.quota-scroll\b/);
  });

  it('never pages while the wheel is inside the lower block', () => {
    const handler = islandJs.slice(
      islandJs.indexOf("document.addEventListener(\n  'wheel'"),
      islandJs.indexOf('{ capture: true }'),
    );
    assert.match(handler, /list\.matches\('\.quota-scroll'\)/, 'the quota block stays a strict wheel boundary');
  });

  it('keeps scrolling while hiding only its scrollbar', () => {
    const block = islandCss.slice(islandCss.indexOf('.quota-scroll {'));
    const rule = block.slice(0, block.indexOf('}'));
    assert.match(rule, /overflow-y:\s*auto/);
    assert.match(rule, /scrollbar-width:\s*none/);
    assert.match(rule, /overscroll-behavior:\s*contain/);
    assert.match(islandCss, /\.quota-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it('marks the pages box with the current key', () => {
    assert.match(islandJs, /pagesEl\.dataset\.page\s*=\s*showingNotification\s*\?\s*'notification'\s*:\s*page\.key/);
    assert.match(islandCss, /\.pages\[data-page="quota"\]\s*\{[^}]*scrollbar-width:\s*none/);
  });

  it('shrinks the balance stack rather than spending the scroller budget on it', () => {
    const block = islandCss.slice(islandCss.indexOf('.quota-amount {'));
    const rule = block.slice(0, block.indexOf('}'));
    assert.match(rule, /font-size:\s*25px/);
  });
});

/*
 * The focus page keeps its 96px ring, the clock and the three keys, and adds
 * two rows: today and this week. Both rows share one grid so the figures line
 * up, and the long rest names itself in the ring instead of appearing as a
 * 15:00 nobody announced.
 */
describe('island focus page reports both windows', () => {
  it('prints the current round and current day as two tabular rows', () => {
    const block = islandJs.slice(islandJs.indexOf('function focusPage'), islandJs.indexOf('function healthPage'));
    assert.match(block, /focus-stats/, 'the two-row statistics block must be rendered');
    assert.match(block, /statRow\('本轮'/, 'the current round has its own row');
    assert.match(block, /statRow\('本日'/, 'the current day has its own row');
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
