/**
 * The screen capture, without a screen.
 *
 * Every rule that can be wrong in services/backdrop.js is either a pure function
 * or an injectable seam, so the whole service runs here against a fake capture:
 * no Electron, no display, no 50-200ms wait. The three things under test are the
 * ones a user would feel — the picture lands where the desktop is, two opens in
 * the same half second are one photograph, and a failed capture is null rather
 * than a thrown error.
 *
 * Run: node --test test/backdrop.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backdrop = require('../src/main/services/backdrop.js');

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

const FRAME = 'data:image/jpeg;base64,AAAA';

const PRIMARY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  size: { width: 2560, height: 1440 },
  scaleFactor: 1,
};

const SECOND = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1.5,
};

/** The panel as the renderer reports it: CSS px inside the window. */
const PANEL = { x: 32, y: 36, w: 420, h: 324 };

describe('backdrop: capture size follows the display DPI', () => {
  it('asks for the physical pixels, not the DIP ones', () => {
    assert.deepEqual(backdrop.thumbnailFor(PRIMARY), { width: 2560, height: 1440 });
    assert.deepEqual(backdrop.thumbnailFor(SECOND), { width: 2560, height: 1440 });
  });

  it('caps the long edge so a 4K screen is not a multi-megabyte frame', () => {
    const hidpi = { size: { width: 2560, height: 1440 }, scaleFactor: 2 };
    const thumbnail = backdrop.thumbnailFor(hidpi);
    assert.equal(Math.max(thumbnail.width, thumbnail.height), backdrop.MAX_EDGE);
    assert.equal(thumbnail.width, 2560);
    assert.equal(thumbnail.height, 1440);
  });

  it('treats a missing or broken scale factor as 1', () => {
    assert.deepEqual(
      backdrop.thumbnailFor({ size: { width: 800, height: 600 } }),
      { width: 800, height: 600 },
    );
    assert.deepEqual(
      backdrop.thumbnailFor({ size: { width: 800, height: 600 }, scaleFactor: 0 }),
      { width: 800, height: 600 },
    );
  });
});

describe('backdrop: the picture lands where the desktop is', () => {
  it('offsets the display origin by the panel origin, plus the bleed', () => {
    const placement = backdrop.glassPlacement({
      panel: PANEL,
      window: { x: 770, y: 44 },
      display: backdrop.screenRect(PRIMARY),
    });
    // panel on screen: 770+32 = 802 → the image starts 802-24 = 778px to the left.
    assert.equal(placement.x, -778);
    assert.equal(placement.y, -56);
    assert.equal(placement.width, 2560);
    assert.equal(placement.height, 1440);
  });

  it('measures against the display the window is on, not the primary one', () => {
    const placement = backdrop.glassPlacement({
      panel: PANEL,
      window: { x: 2020, y: 44 },
      display: backdrop.screenRect(SECOND),
    });
    // 2020+32-1920 = 132 inside the second display → 24-132.
    assert.equal(placement.x, -108);
    assert.equal(placement.y, -56);
  });

  it('does not move when the display scale factor changes', () => {
    const at1 = backdrop.glassPlacement({
      panel: PANEL,
      window: { x: 770, y: 44 },
      display: { ...backdrop.screenRect(PRIMARY), scaleFactor: 1 },
    });
    const at2 = backdrop.glassPlacement({
      panel: PANEL,
      window: { x: 770, y: 44 },
      display: { ...backdrop.screenRect(PRIMARY), scaleFactor: 2 },
    });
    assert.deepEqual(at2, at1, 'DPI changes the detail, never the position');
  });

  it('keeps the bleed in step with the stylesheet', () => {
    assert.equal(backdrop.GLASS_BLEED, 24);
    assert.match(src('renderer/island.css'), /--glass-bleed:\s*24px/);
  });
});

describe('backdrop: the 500ms cache', () => {
  it('hits strictly inside the window and misses at the boundary', () => {
    const entry = { key: 'a', at: 1000 };
    assert.equal(backdrop.cacheHit(entry, 'a', 1499, 500), true);
    assert.equal(backdrop.cacheHit(entry, 'a', 1500, 500), false);
    assert.equal(backdrop.cacheHit(entry, 'b', 1200, 500), false);
    assert.equal(backdrop.cacheHit(null, 'a', 1200, 500), false);
  });

  it('does not trust a clock that went backwards', () => {
    assert.equal(backdrop.cacheHit({ key: 'a', at: 1000 }, 'a', 900, 500), false);
  });
});

describe('backdrop: one photograph per display per window', () => {
  /** A service with a fake capture and a clock the test moves by hand. */
  const make = (grab, options = {}) => {
    const clock = { at: 1000 };
    const calls = [];
    const service = backdrop.createBackdrop({
      now: () => clock.at,
      grab: async (display) => {
        calls.push(display.id);
        return typeof grab === 'function' ? grab(display) : FRAME;
      },
      ...options,
    });
    return { service, clock, calls };
  };

  it('returns the frame, the display and the offset the renderer needs', async () => {
    const { service, calls } = make();
    const capture = await service.capture({
      display: PRIMARY,
      panel: PANEL,
      window: { x: 770, y: 44 },
    });
    assert.equal(capture.dataUrl, FRAME);
    assert.deepEqual(capture.screen, { x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 1 });
    assert.deepEqual(capture.offset, { x: -778, y: -56 });
    assert.deepEqual(capture.size, { width: 2560, height: 1440 });
    assert.equal(typeof capture.capturedAt, 'number');
    assert.deepEqual(calls, [1]);
  });

  it('reuses the frame for a second open inside the window', async () => {
    const { service, clock, calls } = make();
    await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    clock.at += 499;
    await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    assert.deepEqual(calls, [1], 'the resize after an open must not cost a second screenshot');
  });

  it('captures again once the window has passed', async () => {
    const { service, clock, calls } = make();
    await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    clock.at += 500;
    await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    assert.deepEqual(calls, [1, 1]);
  });

  it('captures again for a different display', async () => {
    const { service, calls } = make();
    await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    await service.capture({ display: SECOND, panel: PANEL, window: { x: 2020, y: 44 } });
    assert.deepEqual(calls, [1, 2]);
  });

  it('shares one capture between two asks in flight', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { service, calls } = make(async () => {
      await gate;
      return FRAME;
    });
    const a = service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    const b = service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    release();
    const [first, second] = await Promise.all([a, b]);
    assert.deepEqual(calls, [1]);
    assert.equal(first.dataUrl, FRAME);
    assert.equal(second.dataUrl, FRAME);
  });

  it('recomputes the offset from the frame it reuses', async () => {
    const { service, clock } = make();
    const a = await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });
    clock.at += 100;
    const b = await service.capture({ display: PRIMARY, panel: PANEL, window: { x: 800, y: 44 } });
    assert.equal(b.offset.x, a.offset.x - 30, 'a window that moved 30px moves the picture 30px');
    assert.equal(b.capturedAt, a.capturedAt);
  });
});

describe('backdrop: a failure is an answer, not an exception', () => {
  const ask = (service) => service.capture({ display: PRIMARY, panel: PANEL, window: { x: 770, y: 44 } });

  it('resolves null when the capture throws', async () => {
    const service = backdrop.createBackdrop({
      grab: async () => { throw new Error('permission denied'); },
    });
    assert.equal(await ask(service), null);
  });

  it('resolves null when the capture answers nothing usable', async () => {
    for (const answer of [null, undefined, '', 42, { dataUrl: FRAME }]) {
      const service = backdrop.createBackdrop({ grab: async () => answer });
      assert.equal(await ask(service), null);
    }
  });

  it('resolves null when the capture hangs', async () => {
    const service = backdrop.createBackdrop({
      grab: () => new Promise(() => {}),
      timeoutMs: 15,
    });
    assert.equal(await ask(service), null);
  });

  it('does not cache the failure, so the next open retries', async () => {
    let attempt = 0;
    const service = backdrop.createBackdrop({
      grab: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('driver not ready');
        return FRAME;
      },
    });
    assert.equal(await ask(service), null);
    assert.equal((await ask(service)).dataUrl, FRAME);
    assert.equal(attempt, 2);
  });

  it('logs the message, never the frame', async () => {
    const logged = [];
    const service = backdrop.createBackdrop({
      grab: async () => { throw new Error('boom'); },
      log: (message) => logged.push(message),
    });
    await ask(service);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /boom/);
    assert.ok(!logged[0].includes('base64'), 'the frame itself must never reach a log line');
  });
});

describe('backdrop: source selection', () => {
  const source = (id, empty = false) => ({
    display_id: id,
    thumbnail: { isEmpty: () => empty },
  });

  it('picks the source whose display id matches', () => {
    const picked = backdrop.pickSource([source('2'), source('1')], PRIMARY);
    assert.equal(picked.display_id, '1');
  });

  it('falls back to the first usable source when ids are empty', () => {
    assert.equal(backdrop.pickSource([source(''), source('', true)], { id: 9 }).display_id, '');
    assert.equal(backdrop.pickSource([source('', true), source('')], { id: 9 }).display_id, '');
  });

  it('answers null when every source is blank', () => {
    assert.equal(backdrop.pickSource([], PRIMARY), null);
    assert.equal(backdrop.pickSource([source('1', true)], PRIMARY), null);
    assert.equal(backdrop.pickSource(null, PRIMARY), null);
  });
});

describe('backdrop: the frame stays in memory', () => {
  const source = src('main/services/backdrop.js');

  it('never writes the frame anywhere', () => {
    assert.ok(!/require\(['"]node:fs/.test(source), 'a capture must not touch the disk');
    assert.ok(!/writeFile|appendFile|createWriteStream/.test(source), 'no write path exists');
  });

  it('never uploads it', () => {
    assert.ok(!/require\(['"]node:https?/.test(source), 'no network module');
    assert.ok(!/fetch\(|net\.|upload/i.test(source), 'no upload path exists');
  });
});
