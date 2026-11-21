import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placePanel, GAP, EDGE, CORNER } from '../src/main/tray-menu.js';

/** The panel the app draws: 200 wide, 164 tall. */
const PANEL = { width: 200, height: 164 };
/** 1920×1080 with nothing reserved; the taskbar cases below place the icon. */
const WORK = { x: 0, y: 0, width: 1920, height: 1400 };

describe('tray panel placement', () => {
  it('sits above an icon that is low on the screen', () => {
    const anchor = { x: 1700, y: 1300, width: 24, height: 24 };
    const pos = placePanel(anchor, PANEL, WORK);
    assert.equal(pos.y, anchor.y - GAP - PANEL.height);
    assert.equal(pos.x, anchor.x + anchor.width / 2 - PANEL.width / 2);
  });

  it('sits below an icon that is high on the screen', () => {
    const anchor = { x: 900, y: 20, width: 24, height: 24 };
    const pos = placePanel(anchor, PANEL, WORK);
    assert.equal(pos.y, anchor.y + anchor.height + GAP);
  });

  it('never leaves the work area at an edge', () => {
    const right = placePanel({ x: 1900, y: 1300, width: 24, height: 24 }, PANEL, WORK);
    assert.equal(right.x, WORK.x + WORK.width - EDGE - PANEL.width);

    const left = placePanel({ x: 0, y: 1300, width: 24, height: 24 }, PANEL, WORK);
    assert.equal(left.x, WORK.x + EDGE);
  });

  it('stays inside the work area when the icon is on the taskbar itself', () => {
    // A real tray rectangle is outside the work area — the taskbar is not part
    // of it — so the panel has to stop at the usable edge instead.
    const area = { x: 0, y: 0, width: 1920, height: 1032 };
    const pos = placePanel({ x: 1700, y: 1032, width: 24, height: 24 }, PANEL, area);
    assert.ok(pos.y >= area.y + EDGE);
    assert.ok(pos.y + PANEL.height <= area.y + area.height - EDGE + 1);
    assert.equal(pos.y, area.y + area.height - EDGE - PANEL.height);
  });

  it('falls back to the bottom-right corner without an anchor', () => {
    const pos = placePanel(null, PANEL, WORK);
    assert.deepEqual(pos, {
      x: WORK.x + WORK.width - CORNER - PANEL.width,
      y: WORK.y + WORK.height - CORNER - PANEL.height,
    });
  });

  it('treats a zero-size or missing rectangle as no anchor', () => {
    const empty = { x: 0, y: 0, width: 0, height: 0 };
    assert.deepEqual(placePanel(empty, PANEL, WORK), placePanel(null, PANEL, WORK));
    assert.deepEqual(placePanel(undefined, PANEL, WORK), placePanel(null, PANEL, WORK));
  });

  it('stays inside a work area smaller than the panel', () => {
    const tiny = { x: 0, y: 0, width: 120, height: 90 };
    const pos = placePanel({ x: 60, y: 80, width: 20, height: 20 }, PANEL, tiny);
    assert.equal(pos.x, tiny.x + EDGE);
    assert.equal(pos.y, tiny.y + EDGE);
  });
});
