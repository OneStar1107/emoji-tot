import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PILL_EXPRESSION, fitStatusRow, pillContentPlan } from '../src/renderer/island-pill.mjs';

/** Directory of this test file, so the renderer sources can be read. */
const here = dirname(fileURLToPath(import.meta.url));
const islandJs = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
const islandCss = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.css'), 'utf8');

/** The declared block for a selector, or '' when the selector is gone. */
function cssBlock(selector) {
  const at = islandCss.indexOf(selector + ' {');
  if (at < 0) return '';
  return islandCss.slice(at, islandCss.indexOf('}', at) + 1);
}

describe('collapsed pill carries the status components', () => {
  it('no longer hides the status row in the collapsed state', () => {
    /*
     * 0.3.49's rule is the root cause of this task: island.js rendered the row
     * and this one declaration took it back. Asserting on the selector as a
     * whole keeps a future "tidy" from re-adding it under another comment.
     */
    assert.ok(
      !islandCss.includes('#island[data-open="false"] .pill .pill-status'),
      'the collapsed state must not hide .pill-status',
    );
    assert.ok(
      islandCss.includes('#island[data-open="false"] .pill .pill-live { display: none; }'),
      'the play indicator is the one row still hidden while collapsed',
    );
  });

  it('builds the row from the user order, enabled components only', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const end = islandJs.indexOf('topClock.textContent', start);
    const body = islandJs.slice(start, end);
    assert.ok(body.includes('for (const key of items)'), 'the row follows prefs.statusItems order');
    for (const key of ['battery', 'clock', 'weather', 'quota']) {
      assert.ok(body.includes(`key === '${key}'`), `${key} needs a renderer`);
    }
    assert.ok(body.includes('parts.push'), 'a component without data is skipped, not faked');
  });

  it('sizes the capsule to its content under a ceiling', () => {
    const pill = cssBlock('.pill');
    assert.ok(pill.includes('width: max-content'), 'the capsule is content-sized');
    assert.ok(pill.includes('max-width: var(--pill-max-w)'), 'the capsule is capped');
    assert.ok(pill.includes('min-width: var(--fold-w)'), 'a face-only capsule keeps its old width');
    assert.ok(
      !/\n  width: var\(--fold-w\);/.test(pill),
      'the old fixed width must not come back into the base rule (min-width is fine)',
    );
    assert.ok(
      islandCss.includes('--pill-max-w: min(520px, calc(var(--island-w) + 72px));'),
      'the cap is declared once, next to the fold sizes',
    );
    // Tied to the panel, not to vw: the window is sized from this content.
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
    assert.ok(islandJs.includes('const overflow = padding + face.getBoundingClientRect().width + gap + statusWidth - cap;'), 'the trim compares the natural row against the cap');
    assert.ok(status.includes('overflow: hidden'), 'the row cannot spill out of the capsule');
    assert.ok(status.includes('font-variant-numeric: tabular-nums'), 'digits keep one width');
    assert.ok(status.includes('font-size: var(--ui-size)'), 'the row follows the UI scale');
    const stat = cssBlock('.pill-status .stat');
    assert.ok(stat.includes('flex: none'), 'a component is never squeezed into half a number');
  });
});

describe('what the collapsed pill shows', () => {
  it('shows the status components', () => {
    const plan = pillContentPlan({ statusCount: 3 });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 3);
  });

  it('still shows them while a song plays with island lyrics on', () => {
    const plan = pillContentPlan({ statusCount: 3, playing: true, islandLyrics: true });
    assert.equal(plan.mode, 'status', 'the lyric must not cover the components');
    assert.equal(plan.trailer, false);
  });

  it('falls back to the expression when every component is off', () => {
    const plan = pillContentPlan({ statusCount: 0, playing: false, islandLyrics: true });
    assert.equal(plan.mode, 'face');
    assert.equal(plan.trailer, true);
    assert.ok(islandCss.includes('#pill[data-trailer="off"]::after { display: none; }'));
    assert.ok(
      islandCss.includes(`content: "${PILL_EXPRESSION}";`),
      'the expression the plan talks about is the one the stylesheet draws',
    );
  });

  it('hides the expression once two components share the row', () => {
    assert.equal(pillContentPlan({ statusCount: 2 }).trailer, false);
    assert.equal(pillContentPlan({ statusCount: 4 }).trailer, false);
  });

  it('keeps the expression beside a single component', () => {
    assert.equal(pillContentPlan({ statusCount: 1 }).trailer, true);
  });

  it('lets the lyric fill a pill whose components are all off', () => {
    const plan = pillContentPlan({ statusCount: 0, playing: true, islandLyrics: true });
    assert.equal(plan.mode, 'lyric');
    assert.equal(plan.trailer, false);
    assert.equal(pillContentPlan({ statusCount: 0, playing: true, islandLyrics: false }).mode, 'face');
    assert.equal(pillContentPlan({ statusCount: 0, playing: false }).mode, 'face');
  });

  it('treats a missing count and a negative one as nothing to show', () => {
    assert.equal(pillContentPlan().mode, 'face');
    assert.equal(pillContentPlan({ statusCount: -2 }).mode, 'face');
    assert.equal(pillContentPlan({ statusCount: Number.NaN }).mode, 'face');
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
