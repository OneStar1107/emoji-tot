/**
 * Privacy and hardening, as tests.
 *
 * Two kinds of assertion live here. The first exercises the IPC shape rules
 * directly — they are pure functions by design, so a hostile payload can be
 * fed to them without starting Electron. The second reads the source of the
 * windows and asserts the settings that are invisible at runtime: sandbox on,
 * navigation denied, CSP present. Those are the regressions nobody notices
 * until something is already open.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const shape = require('../src/main/ipc-shape.js');
const { DEFAULTS, withDefaults, enabledServices } = await import('../src/shared/schema.js');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');
const repo = (rel) => readFileSync(resolve(root, rel), 'utf8');

describe('ipc: size accounting', () => {
  it('counts strings, arrays, buffers and typed arrays', () => {
    assert.equal(shape.byteSize(null), 0);
    assert.equal(shape.byteSize('abcd'), 8);
    assert.equal(shape.byteSize(new Uint8Array(32)), 32);
    assert.equal(shape.byteSize(new ArrayBuffer(64)), 64);
    assert.equal(shape.byteSize({ a: 'xx', b: [1, 2] }) > 8, true);
  });

  it('does not recurse forever on a self-referencing object', () => {
    const loop = { name: 'x' };
    loop.self = loop;
    assert.doesNotThrow(() => shape.byteSize(loop));
    assert.ok(Number.isFinite(shape.byteSize(loop)));
  });

  it('counts deep payloads instead of treating them as eight bytes', () => {
    let value = 'x'.repeat(1024 * 1024);
    for (let i = 0; i < 6; i += 1) value = { value };
    assert.ok(shape.byteSize(value) > shape.BUS_LIMIT);
  });
});

describe('ipc: local:do allowlist', () => {
  it('accepts a known service and action', () => {
    assert.deepEqual(shape.checkLocal({ service: 'clipboard', action: 'clear' }), {
      service: 'clipboard',
      action: 'clear',
      data: {},
    });
  });

  it('refuses an unknown service', () => {
    assert.equal(shape.checkLocal({ service: 'shell', action: 'clear' }), undefined);
  });

  it('refuses an action that belongs to another service', () => {
    assert.equal(shape.checkLocal({ service: 'messenger', action: 'clear' }), undefined);
    assert.equal(shape.checkLocal({ service: 'clipboard', action: 'start' }), undefined);
  });

  it('refuses a non-object payload', () => {
    assert.equal(shape.checkLocal(null), undefined);
    assert.equal(shape.checkLocal('local:do'), undefined);
    assert.equal(shape.checkLocal([1, 2]), undefined);
  });

  it('bounds a dragged-in file to 8 MB and requires a name', () => {
    const small = shape.checkLocal({ service: 'shelf', action: 'addBuffer', data: { name: 'a.png', bytes: new Uint8Array(16) } });
    assert.ok(small, 'a small buffer is accepted');
    const big = shape.checkLocal({
      service: 'shelf',
      action: 'addBuffer',
      data: { name: 'a.png', bytes: new Uint8Array(shape.SHELF_BUFFER_LIMIT + 1) },
    });
    assert.equal(big, undefined, 'an oversized buffer is refused');
    const unnamed = shape.checkLocal({ service: 'shelf', action: 'addBuffer', data: { bytes: new Uint8Array(4) } });
    assert.equal(unnamed, undefined, 'a buffer with no name is refused');
  });

  it('bounds everything else to 64 KB', () => {
    const long = 'x'.repeat(shape.BUS_LIMIT);
    const refused = shape.checkLocal({ service: 'todo', action: 'add', data: { text: long } });
    assert.equal(refused, undefined);
  });
});

describe('ipc: geometric payloads', () => {
  it('accepts a real screen point and refuses NaN or absurd values', () => {
    assert.deepEqual(shape.checkPoint({ x: 10, y: -4 }), { x: 10, y: -4 });
    assert.equal(shape.checkPoint({ x: Number.NaN, y: 0 }), undefined);
    assert.equal(shape.checkPoint({ x: 1e9, y: 0 }), undefined);
    assert.equal(shape.checkPoint(null), undefined);
  });

  it('accepts a content box and refuses a zero or negative one', () => {
    assert.deepEqual(shape.checkBox({ w: 420, h: 272 }), { w: 420, h: 272 });
    assert.equal(shape.checkBox({ w: 0, h: 10 }), undefined);
    assert.equal(shape.checkBox({ w: -5, h: 10 }), undefined);
    assert.equal(shape.checkBox({ w: 99999, h: 10 }), undefined);
  });
});

describe('ipc: action payloads', () => {
  it('refuses an action outside the declared list', () => {
    const check = shape.actionPayload(['add', 'remove']);
    assert.deepEqual(check({ action: 'add' }), { action: 'add', data: {} });
    assert.equal(check({ action: 'drop-table' }), undefined);
    assert.equal(check({ action: 'add', data: 'nope' }), undefined);
  });
});

/*
 * Payload-less channels are the ones a drag depends on.
 *
 * drag:end, pet:menu and pet:action send no argument, so their payload is
 * undefined. The guard used to fold "no check" and "the check said no" into
 * one answer and refuse all three — the visible symptom was a ball that would
 * not let go after a drag, because its release never reached the main process.
 * Source-level because the gate needs electron's ipcMain to run.
 */
describe('ipc guard: a channel without a check still delivers', () => {
  it('passes the payload through before asking about its shape', () => {
    const guard = src('main/ipc-guard.js');
    assert.match(guard, /if \(!check\) \{/, 'no-check channels take the early exit');
    assert.match(guard, /handler\(payload, event\)/, 'the handler sees the raw payload');
  });
});

describe('hardening: every window is sandboxed', () => {
  it('keeps a drag from ever passing clicks through', () => {
    const source = src('main.js');
    assert.match(source, /passThroughWhileDragging\(Boolean\(dragTimer\)/, 'the drag state reaches the pass-through decision');
  });

  it('sets sandbox: true in every window module', () => {
    for (const rel of ['main.js', 'main/island.js', 'main/settings.js', 'main/update-prompt.js']) {
      const source = src(rel);
      assert.ok(source.includes('sandbox: true'), rel + ' must run its renderer sandboxed');
      assert.ok(!source.includes('sandbox: false'), rel + ' still disables the sandbox');
      assert.ok(source.includes('contextIsolation: true'), rel + ' must keep context isolation');
      assert.ok(source.includes('nodeIntegration: false'), rel + ' must keep Node out of the page');
    }
  });

  it('routes every ipcMain handler through the guard', () => {
    for (const rel of ['main.js', 'main/island.js', 'main/settings.js', 'main/update-prompt.js']) {
      const source = src(rel);
      assert.ok(!/ipcMain\.(handle|on)\(/.test(source), rel + ' still registers a raw ipcMain listener');
    }
  });
});

describe('hardening: navigation and permissions are refused', () => {
  const main = src('main.js');

  it('denies new windows and foreign navigation', () => {
    assert.ok(main.includes("setWindowOpenHandler(() => ({ action: 'deny' }))"));
    assert.ok(main.includes("contents.on('will-navigate'"));
    assert.ok(main.includes("contents.on('will-attach-webview'"));
  });

  it('answers every permission request with no', () => {
    assert.ok(main.includes('setPermissionRequestHandler'));
    assert.ok(main.includes('setPermissionCheckHandler'));
    assert.ok(main.includes('setDevicePermissionHandler'));
    assert.ok(main.includes('hardenSession(session.defaultSession)'));
  });
});

describe('hardening: settings actions stay closed', () => {
  it('does not expose direct surface show/hide actions once displayMode owns visibility', () => {
    const settingsMain = src('main/settings.js');
    const match = settingsMain.match(/const ACTION_KINDS = \[(.*?)\];/s);
    assert.ok(match, 'ACTION_KINDS not found');
    assert.ok(!match[1].includes("'island'"), 'island must not be a separate action');
    assert.ok(!match[1].includes("'ball'"), 'ball must not be a separate action');
  });
});

describe('hardening: gallery ships a CSP', () => {
  it('declares a policy that forbids inline script and remote origins', () => {
    const html = repo('apps/gallery/index.html');
    assert.ok(html.includes('Content-Security-Policy'), 'no CSP meta tag');
    const policy = html.slice(html.indexOf('Content-Security-Policy'));
    assert.ok(policy.includes("script-src 'self'"), 'script-src must stay self');
    assert.ok(policy.includes("object-src 'none'"));
    assert.ok(policy.includes("frame-ancestors 'none'"));
    assert.ok(policy.includes("connect-src 'self'"));
  });
});

describe('privacy: clipboard history', () => {
  const clipboard = src('main/services/clipboard.js');

  it('is off by default', () => {
    assert.equal(DEFAULTS.shelf.clipboard, false);
    assert.ok(!enabledServices(withDefaults({})).has('clipboard'), 'the worker must not run by default');
  });

  it('starts when the switch is turned on', () => {
    assert.ok(enabledServices(withDefaults({ shelf: { clipboard: true } })).has('clipboard'));
  });

  it('drops unpinned entries when the worker stops', () => {
    assert.ok(clipboard.includes('clearUnpinned'), 'no unpinned purge');
    const stopBody = clipboard.slice(clipboard.indexOf('function stop()'));
    assert.ok(stopBody.slice(0, 400).includes('clearUnpinned()'), 'stop() must purge what it collected');
  });

  it('keeps pinned entries when purging', () => {
    assert.ok(clipboard.includes('items.filter((item) => item.pinned)'));
  });

  it('offers a way to delete everything', () => {
    assert.ok(clipboard.includes('function clear()'));
    assert.ok(/module\.exports = \{[^}]*clearUnpinned/.test(clipboard));
  });
});

describe('privacy: sensitive stores', () => {
  it('encrypts calendar subscription URLs through safeStorage', () => {
    const calendar = src('main/services/calendar.js');
    assert.ok(calendar.includes("require('../secrets')"), 'calendar must use the safeStorage wrapper');
    assert.ok(calendar.includes('secrets.encrypt(sub.url)'), 'subscription URLs must be written encrypted');
    assert.ok(calendar.includes('decodeUrl'), 'stored values must be decoded on read');
  });

  it('escapes every weather string that comes from outside', () => {
    const island = src('renderer/island.js');
    assert.ok(island.includes('escapeHtml(now.text)'));
    // The page was re-laid out in 0.4.0 and the call now spans lines, so match
    // the expression rather than a literal slice of it.
    assert.match(island, /escapeHtml\(\s*placeZh\(weather\.place\.name\)/);
    assert.match(island, /escapeHtml\(\s*countryZh\(weather\.place\.country\)/);
    assert.ok(!island.includes('<b>${now.text}</b>'), 'weather description must not be interpolated raw');
  });
});
