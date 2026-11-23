import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILL_EXPRESSION,
  fitStatusRow,
  pillContentPlan,
  visiblePillStatusKeys,
} from '../src/renderer/island-pill.mjs';

/** Directory of this test file, so the renderer sources can be read. */
const here = dirname(fileURLToPath(import.meta.url));
const islandJs = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
const islandCss = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.css'), 'utf8');
const islandHtml = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.html'), 'utf8');

/** The declared block for a selector, or '' when the selector is gone. */
function cssBlock(selector) {
  const at = islandCss.indexOf(selector + ' {');
  if (at < 0) return '';
  return islandCss.slice(at, islandCss.indexOf('}', at) + 1);
}

describe('collapsed pill carries the status components', () => {
  it('keeps the status row in the collapsed state', () => {
    /*
     * 0.3.49's rule is the root cause of this task: island.js rendered the row
     * and this one declaration took it back. Asserting on the selector as a
     * whole keeps a future "tidy" from re-adding it under another comment.
     */
    assert.ok(
      !islandCss.includes('#island[data-open="false"] .pill .pill-status'),
      'the collapsed state must not hide .pill-status',
    );
  });

  it('does not draw the legacy playing-bars indicator', () => {
    assert.ok(!islandHtml.includes('pill-live'), 'the collapsed markup has no bars');
    assert.ok(!islandCss.includes('.pill-live'), 'the stylesheet has no bars');
    assert.ok(!islandJs.includes('.pill-live'), 'the renderer does not reserve or measure bars');
  });

  it('builds the row from the user order, enabled components only', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const end = islandJs.indexOf('topClock.textContent', start);
    const body = islandJs.slice(start, end);
    assert.ok(body.includes('for (const key of visible)'), 'the row follows prefs.statusItems order');
    for (const key of ['battery', 'clock', 'weather', 'quota', 'kaomoji']) {
      assert.ok(body.includes(`key === '${key}'`), `${key} needs a renderer`);
    }
    assert.ok(body.includes('parts.push'), 'a component without data is skipped, not faked');
  });

  it('draws kaomoji only as the explicitly enabled status component', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const end = islandJs.indexOf('topClock.textContent', start);
    const body = islandJs.slice(start, end);
    assert.ok(body.includes("key === 'kaomoji'"), 'the settings switch needs a renderer');
    assert.ok(body.includes('PILL_EXPRESSION'), 'the island and preview use the same expression');
    assert.ok(body.includes('visiblePillStatusKeys('), 'status availability is decided by the pure helper');
  });

  it('grows the native stage with content while keeping the user width as a hard cap', () => {
    const pill = cssBlock('.pill');
    const frame = cssBlock('#frame');
    assert.ok(
      pill.includes('width: var(--pill-content-w, max-content)'),
      'the animated capsule retains a content-sized fallback',
    );
    assert.ok(pill.includes('max-width: var(--pill-max-w)'), 'the capsule is capped');
    assert.ok(pill.includes('min-width: var(--fold-w)'), 'a face-only capsule keeps its old width');
    assert.ok(pill.includes('flex: none'), 'the panel cannot squeeze the capsule while it is being measured');
    assert.ok(
      frame.includes('width: var(--pill-stage-w, var(--fold-w))'),
      'the collapsed stage follows the measured capsule width',
    );
    assert.ok(
      islandCss.includes('#island[data-open="true"] #frame { width: var(--island-w); }'),
      'the open stage uses the user-defined maximum width',
    );
    assert.ok(
      !/\n  width: var\(--fold-w\);/.test(pill),
      'the old fixed width must not come back into the base rule (min-width is fine)',
    );
    assert.ok(
      islandCss.includes('--pill-max-w: var(--island-w);'),
      'the longest capsule is exactly the user-defined island width',
    );
    assert.ok(
      islandJs.includes('pillWidthSpring.retarget(target, now / 1000)'),
      'new content retargets the existing width spring instead of restarting it',
    );
    assert.ok(
      islandJs.includes("--pill-stage-w"),
      'the renderer publishes the measured native stage width',
    );
    // Tied to the panel, not to vw: the maximum native stage is the panel width.
    assert.ok(!islandCss.includes('--pill-max-w: 45vw'));
  });

  it('trims before the window measures the capsule', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const body = islandJs.slice(start, islandJs.indexOf('/* ------------------------------------------------------------------- pages */', start));
    assert.ok(body.includes('fitPillStatus();'), 'the row is trimmed on every render');
    assert.ok(
      body.indexOf('fitPillStatus();') < body.indexOf('measure();'),
      'trimming happens before the box is reported to the main process',
    );
  });

  it('keeps numbers on one line in the compact row', () => {
    const status = cssBlock('.pill-status');
    assert.ok(status.includes('gap: 7px'), 'components are 7px apart');
    assert.ok(status.includes('flex: none'), 'the row is measured at its natural width');
    assert.ok(
      islandJs.includes('const overflow = padding + face.getBoundingClientRect().width + gap + statusWidth - cap;'),
      'the trim compares the natural status row against the cap',
    );
    assert.ok(status.includes('overflow: hidden'), 'the row cannot spill out of the capsule');
    assert.ok(status.includes('font-variant-numeric: tabular-nums'), 'digits keep one width');
    assert.ok(status.includes('font-size: var(--ui-size)'), 'the row follows the UI scale');
    const stat = cssBlock('.pill-status .stat');
    assert.ok(stat.includes('flex: none'), 'a component is never squeezed into half a number');
  });

  it('scrolls an overlong now-playing title instead of hard-clipping it', () => {
    assert.ok(
      islandCss.includes('--pill-title-max-w: min(') &&
        islandCss.includes('calc(240px * var(--ui-scale, 1))'),
      'the title viewport uses the shorter red-box width rather than the whole island',
    );
    assert.ok(
      islandJs.includes('now-playing-pill__text'),
      'the now-playing label keeps its text in a movable inner span',
    );
    assert.match(
      islandCss,
      /\.now-playing-pill\[data-over="true"\] > span\s*\{[^}]*animation:/,
      'the overlong title runs a marquee inside its capped slot',
    );
    assert.match(
      islandCss,
      /\.now-playing-pill\s*\{[^}]*overflow:\s*hidden/,
      'the marquee viewport clips only the moving text',
    );
  });

  it('balances the face inset with a slightly wider right gutter', () => {
    const pill = cssBlock('.pill');
    assert.match(
      pill,
      /padding:\s*0 var\(--pill-pad-right\) 0 var\(--pill-pad-left\);/,
      'the capsule consumes the two optical gutter tokens',
    );
    assert.match(islandCss, /--pill-pad-left:\s*12px;/, 'the face edge keeps the base gutter');
    assert.match(
      islandCss,
      /--pill-pad-right:\s*23\.5px;/,
      'the text edge matches the visible face gap instead of overshooting it',
    );
    assert.ok(
      islandCss.includes('- var(--pill-pad-right)') &&
        islandCss.includes('- var(--pill-pad-left)'),
      'the title cap accounts for both gutters',
    );
  });
});

describe('what the collapsed pill shows', () => {
  it('shows the status components while playback is stopped', () => {
    const plan = pillContentPlan({
      statusCount: 3,
      media: { active: true, playing: false, title: 'paused track' },
    });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 3);
  });

  it('shows the playing title instead of the status components', () => {
    const plan = pillContentPlan({
      statusCount: 4,
      media: {
        active: true,
        playing: true,
        title: 'a6！赚够100W再下播',
        artist: '棉花大哥哥',
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, 'a6！赚够100W再下播 - 棉花大哥哥');
    assert.equal(plan.statusCount, 0);
  });

  it('shows a song as title and artist only', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        source: 'QQMusic.exe',
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, '晴天 - 周杰伦');
  });

  it('shows a live room title and anchor name without the platform suffix', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台',
        live: {
          platform: 'bilibili',
          roomTitle: 'gta6！赚够100W再下播',
          anchorName: '棉花大哥哥',
          anchorId: '1871001',
        },
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, 'gta6！赚够100W再下播 - 棉花大哥哥');
  });

  it('removes the Bilibili platform suffix even before room metadata arrives', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台',
      },
    });
    assert.equal(plan.text, 'gta6！赚够100W再下播 - 棉花大哥哥');
  });

  it('restores the status row when the now-playing display is switched off', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: { active: true, playing: true, title: 'a paused preference hides this' },
      showNowPlaying: false,
    });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 2);
  });

  it('falls back to the face when every component is off', () => {
    const plan = pillContentPlan({ statusCount: 0, media: { active: false, playing: false } });
    assert.equal(plan.mode, 'face');
    assert.equal(Object.hasOwn(plan, 'trailer'), false, 'the automatic CSS expression is gone');
  });

  it('has no automatic expression trailer in the capsule stylesheet', () => {
    assert.ok(!islandCss.includes('.pill::after'), 'kaomoji must not be drawn by CSS pseudo-content');
    assert.ok(!islandCss.includes('data-trailer'), 'there is no automatic trailer state left');
    assert.ok(!islandJs.includes('dataset.trailer'), 'the renderer no longer sets trailer state');
  });

  it('treats a missing count and a negative one as nothing to show', () => {
    assert.equal(pillContentPlan().mode, 'face');
    assert.equal(pillContentPlan({ statusCount: -2 }).mode, 'face');
    assert.equal(pillContentPlan({ statusCount: Number.NaN }).mode, 'face');
  });
});

describe('explicit kaomoji status item', () => {
  it('keeps the user order and appends kaomoji after available readings', () => {
    assert.deepEqual(
      visiblePillStatusKeys(
        ['kaomoji', 'battery', 'clock', 'weather', 'quota'],
        { battery: true, clock: true, weather: true, quota: true },
      ),
      ['kaomoji', 'battery', 'clock', 'weather', 'quota'],
    );
    assert.deepEqual(
      visiblePillStatusKeys(
        ['battery', 'quota', 'kaomoji', 'weather'],
        { battery: true, clock: true, weather: false, quota: false },
      ),
      ['battery', 'kaomoji'],
    );
  });

  it('never lets kaomoji become the only collapsed-pill content', () => {
    assert.deepEqual(visiblePillStatusKeys(['kaomoji'], {}), []);
    assert.deepEqual(
      visiblePillStatusKeys(['weather', 'kaomoji'], { weather: false }),
      [],
      'missing readings must not turn the status row into a lone expression',
    );
    assert.equal(
      pillContentPlan({
        statusCount: visiblePillStatusKeys(['kaomoji'], {}).length,
        media: { active: false, playing: false },
      }).mode,
      'face',
    );
  });
});

describe('width cap trimming', () => {
  const gap = 7;

  it('keeps every component while the row fits', () => {
    assert.deepEqual(fitStatusRow([50, 40, 30], gap, 200), { keep: 3, truncated: false });
  });

  it('cuts whole components off the tail and says so', () => {
    // 200+140+120+14 = 474 > 436; two fit (347 + gap + "…" = 364).
    assert.deepEqual(fitStatusRow([200, 140, 120, 120], gap, 436), { keep: 2, truncated: true });
  });

  it('never leaves half a number behind', () => {
    const widths = [210, 96, 88, 64];
    const available = 330;
    const fit = fitStatusRow(widths, gap, available);
    assert.equal(fit.truncated, true);
    const kept = widths.slice(0, fit.keep).reduce((sum, w) => sum + w, 0) + gap * (fit.keep - 1);
    assert.ok(kept <= available, 'the kept prefix is all whole components');
    assert.ok(fit.keep >= 1, 'at least one component survives so the row is not just "…"');
  });

  it('keeps one oversized component rather than showing an empty marker', () => {
    assert.deepEqual(fitStatusRow([400], gap, 100), { keep: 1, truncated: false });
    assert.deepEqual(fitStatusRow([], gap, 100), { keep: 0, truncated: false });
  });

  it('reserves room for the marker it appends', () => {
    // Exactly the row width without the marker: it still has to be cut.
    assert.equal(fitStatusRow([100, 100, 100], gap, 214).truncated, true);
    assert.equal(fitStatusRow([100, 100, 100], gap, 320).truncated, false);
  });

  it('draws the marker as a quiet tail item', () => {
    assert.ok(islandCss.includes('.pill-status .stat.more'), 'the "…" needs its own rule');
    assert.ok(islandJs.includes("more.textContent = '…';"));
    assert.ok(islandJs.includes("pillEl.dataset.truncated = 'true';"));
  });
});
