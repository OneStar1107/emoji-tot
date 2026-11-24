/**
 * Platform capabilities and screen geometry.
 *
 * The screen math is the part that only shows up on a second monitor, usually
 * one placed to the left of the primary where every coordinate is negative.
 * These tests pin the arithmetic so a refactor cannot quietly anchor to 0.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');
const repo = (rel) => readFileSync(resolve(root, rel), 'utf8');

const platform = require('../src/main/platform.js');
const { sameDisplayId } = require('../src/main/window-state.js');

describe('platform: one place decides what this machine can do', () => {
  it('reports the features the app actually ships', () => {
    const caps = platform.capabilities();
    for (const name of ['battery', 'media', 'devices', 'messenger', 'fullscreen', 'weather', 'lyrics', 'quota', 'calendar', 'clipboard', 'volume', 'mail']) {
      assert.equal(typeof caps[name], 'boolean', name + ' must have a capability entry');
    }
  });

  it('answers supports() consistently with capabilities()', () => {
    for (const [name, on] of Object.entries(platform.capabilities())) {
      assert.equal(platform.supports(name), on, name);
    }
  });

  it('keeps mail on Windows: IMAP is pure Node, not a PowerShell child', () => {
    /* The service table gates every worker on platform.supports(feature); a
       missing 'mail' key silently disabled the mail worker on the one platform
       the app ships for. Pin the decision on both sides: the capability is on,
       and the service still touches no shell. */
    assert.match(src('main/platform.js'), /win32:\s*\{[^}]*\bmail:\s*true/s);
    const mail = src('main/services/mail.js');
    assert.ok(!/(^|[^.\w])spawn\(/.test(mail), 'mail.js must not spawn a watcher');
    assert.ok(!/(^|[^.\w])execFile\(/.test(mail), 'mail.js must not shell out');
    assert.ok(mail.includes("require('imapflow')"), 'mail.js should read IMAP directly');
    if (process.platform === 'win32') assert.equal(platform.supports('mail'), true);
  });

  it('reports an unknown feature as unsupported', () => {
    assert.equal(platform.supports('teleportation'), false);
  });

  it('never throws when asked to run a command on a platform without one', async () => {
    // On Windows this is a real call; the assertion is that it always settles
    // with a shape, never rejects.
    const result = await platform.runPowerShell(['-NoProfile', '-Command', '1']);
    assert.equal(typeof result.ok, 'boolean');
    assert.equal(typeof result.code, 'string');
  });
});

describe('services only spawn through the platform layer', () => {
  const files = ['battery', 'media', 'fullscreen', 'devices', 'messenger', 'weather', 'lyrics', 'agent-presence', 'quota', 'calendar'];

  it('has no raw spawn or execFile left in a service', () => {
    for (const name of files) {
      const source = src('main/services/' + name + '.js');
      assert.ok(!/(^|[^.\w])spawn\(/.test(source), name + ' still calls spawn directly');
      assert.ok(!/(^|[^.\w])execFile\(/.test(source), name + ' still calls execFile directly');
      assert.ok(source.includes("require('../platform')"), name + ' must import the platform layer');
    }
  });

  it('attaches an error listener where a watcher can fail', () => {
    for (const name of ['media', 'fullscreen', 'devices', 'messenger', 'agent-presence']) {
      const source = src('main/services/' + name + '.js');
      const handled = source.includes(".on('error'") || source.includes('onError');
      assert.ok(handled, name + ' spawns a watcher with no error path');
    }
  });

  it('gates every service on a capability', () => {
    const main = src('main.js');
    for (const feature of ['battery', 'weather', 'media', 'quota', 'mail', 'calendar', 'clipboard', 'devices', 'messenger']) {
      assert.ok(main.includes("feature: '" + feature + "'"), 'SERVICE_PLAN has no feature gate for ' + feature);
    }
    assert.ok(main.includes('platform.supports(control.feature)'));
  });
});

describe('window geometry honours the display origin', () => {
  const main = src('main.js');

  it('returns the whole work area, not just its size', () => {
    assert.ok(main.includes('return displayForBall(prefs).workArea'));
    assert.ok(!main.includes('getPrimaryDisplay().workAreaSize'), 'workAreaSize has no origin and breaks a left-hand monitor');
    assert.ok(!main.includes('const area = screen.getPrimaryDisplay().workAreaSize'));
  });

  it('anchors the default position to the area origin', () => {
    const fn = main.slice(main.indexOf('function defaultPosition'), main.indexOf('function createWindow'));
    assert.ok(fn.includes('area.x + area.width'), 'default x must be relative to the display origin');
    assert.ok(fn.includes('area.y + area.height'), 'default y must be relative to the display origin');
  });

  it('docks and undocks relative to the area origin', () => {
    const dock = main.slice(main.indexOf('function dock('), main.indexOf('function undock('));
    assert.ok(dock.includes('area.x + peek'), 'left dock must use the origin');
    assert.ok(dock.includes('area.x + area.width - peek'), 'right dock must use the far edge');
    assert.ok(!/x = peek - outer/.test(dock), 'left dock is still anchored at 0');

    const undock = main.slice(main.indexOf('function undock('), main.indexOf('function sliverRect'));
    assert.ok(undock.includes('area.x + area.width'), 'undock must use the far edge');
    assert.ok(!/x = area\.width - /.test(undock), 'undock is still missing the origin');
  });

  it('computes the sliver and drag edges from the display origin', () => {
    const sliver = main.slice(main.indexOf('function sliverRect'), main.indexOf('function openPosition'));
    assert.ok(sliver.includes('area.x + area.width - peek'));
    const drag = main.slice(main.indexOf('function endDrag'), main.indexOf('function endDrag') + 800);
    assert.ok(drag.includes('area.x + EDGE_SNAP'));
    assert.ok(drag.includes('area.x + area.width'));
  });

  it('picks the display by id and falls back when it is gone', () => {
    const fn = main.slice(main.indexOf('function displayForBall'), main.indexOf('function workArea'));
    assert.equal(sameDisplayId(42, '42'), true);
    assert.equal(sameDisplayId(42, '43'), false);
    assert.ok(fn.includes('sameDisplayId(display.id, wanted)'));
    assert.ok(fn.includes('return screen.getPrimaryDisplay()'), 'a removed display must fall back to primary');
  });

  it('reacts to a display being plugged in or out', () => {
    assert.ok(main.includes("screen.on('display-removed'"));
    assert.ok(main.includes("screen.on('display-added'"));
    assert.ok(main.includes('applyDisplayPreference()'));
  });
});

describe('the product says what it is', () => {
  it('ships no macOS build target', () => {
    const pkg = JSON.parse(repo('apps/desktop/package.json'));
    assert.equal(pkg.build.mac, undefined, 'a dmg target promises support the code does not have');
  });

  it('does not promise a macOS download in the README', () => {
    const zh = repo('README.md');
    const en = repo('README.en.md');
    assert.ok(!/Windows \/ macOS/.test(zh), 'README still claims both platforms');
    assert.ok(!/Windows \/ macOS/.test(en));
    assert.ok(!zh.includes('~/Library/Application Support/EmojiTot/'));
  });

  it('tells the user what is unavailable on this platform', () => {
    const main = src('main.js');
    assert.ok(main.includes('platform: { id: platform.id'));
    const settings = src('renderer/settings.js');
    assert.ok(settings.includes('meta?.platform?.features'));
  });
});
