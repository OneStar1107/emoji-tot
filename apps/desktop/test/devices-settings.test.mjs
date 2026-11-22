/**
 * 设置 · 设备页：导航、hidden/pinned 规则与两个窗口的接线。
 *
 * The page exists because the same two decisions (may a level be shown, which
 * rows come first, which rows appear at all) were spread over the island's row
 * stars and a group on 页面管理. These tests pin the parts that would silently
 * rot back: the rail entry, the third preference, the cap, and the fact that
 * both windows read the same schema instead of their own copy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS,
  orderDevices,
  DEVICE_PIN_LIMIT,
  SETTINGS_NAV,
  SETTINGS_PAGE_KEYS,
  deviceKind,
  pageOfPath,
  togglePinnedDevice,
  visibleDevices,
  withDefaults,
} from '../src/shared/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

/** The body of one function in a source file, by brace matching. */
function functionBody(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'function ' + name + ' not found');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail('unbalanced braces in ' + name);
}

describe('settings nav: the devices page lives under 内容', () => {
  it('adds 设备 to the content group, after 天气', () => {
    const content = SETTINGS_NAV.find((group) => group.id === 'content');
    assert.ok(content, 'the content group is gone');
    const keys = content.items.map((item) => item.key);
    assert.ok(keys.includes('devices'), '设备 must be a content page');
    assert.equal(keys[keys.length - 1], 'devices', '设备 trails 天气');
    const item = content.items.find((entry) => entry.key === 'devices');
    assert.equal(item.label, '设备');
    assert.equal(item.icon, 'tray');
  });

  it('keeps every page key unique and reachable', () => {
    assert.equal(SETTINGS_PAGE_KEYS.length, new Set(SETTINGS_PAGE_KEYS).size);
    assert.ok(SETTINGS_PAGE_KEYS.includes('devices'));
    assert.ok(SETTINGS_PAGE_KEYS.includes('pages'), '页面管理 stays: its switch gates the island page');
  });

  it('groups the device preferences under the devices page', () => {
    assert.equal(pageOfPath('devices.hidden'), 'devices');
    assert.equal(pageOfPath('devices.pinned'), 'devices');
    assert.equal(pageOfPath('devices.showBattery'), 'devices');
  });
});

describe('devices: hidden and pinned are pure rules', () => {
  it('defaults hidden to an empty list and fills it for old profiles', () => {
    assert.deepEqual(DEFAULTS.devices.hidden, []);
    assert.deepEqual(withDefaults({ devices: { showBattery: false } }).devices.hidden, []);
    assert.deepEqual(withDefaults({}).devices.hidden, []);
  });

  it('never shares the devices arrays with the defaults', () => {
    const first = withDefaults({});
    first.devices.hidden.push('mouse');
    first.devices.pinned.push('keyboard');
    const second = withDefaults({});
    assert.deepEqual(second.devices.hidden, []);
    assert.deepEqual(second.devices.pinned, []);
  });

  it('filters hidden devices without touching the probe list', () => {
    const list = [{ name: '耳机' }, { name: '键盘' }, { name: '' }];
    const shown = visibleDevices(list, ['键盘']);
    assert.deepEqual(shown.map((device) => device.name), ['耳机']);
    assert.equal(list.length, 3, 'the probe list is not mutated');
    assert.deepEqual(visibleDevices(list, []).map((device) => device.name), ['耳机', '键盘']);
    assert.deepEqual(visibleDevices(null, ['x']), []);
  });

  it('caps pins at three and treats a fourth as a no-op', () => {
    assert.equal(DEVICE_PIN_LIMIT, 3);
    let pinned = [];
    pinned = togglePinnedDevice(pinned, 'a');
    pinned = togglePinnedDevice(pinned, 'b');
    pinned = togglePinnedDevice(pinned, 'c');
    assert.deepEqual(pinned, ['a', 'b', 'c']);
    assert.deepEqual(togglePinnedDevice(pinned, 'd'), ['a', 'b', 'c'], 'a fourth pin changes nothing');
    assert.deepEqual(togglePinnedDevice(pinned, 'b'), ['a', 'c'], 'a second click unpins');
  });

  it('ignores empty names and duplicates', () => {
    assert.deepEqual(togglePinnedDevice([], ''), []);
    assert.deepEqual(togglePinnedDevice(['a'], 'a'), []);
    assert.deepEqual(togglePinnedDevice(['a', 'a'], 'a'), []);
  });
});

describe('devices: category glyphs, never initials', () => {
  it('classifies the common kinds by name', () => {
    assert.equal(deviceKind('WH-1000XM4 耳机'), 'audio');
    assert.equal(deviceKind('HHKB Professional 键盘'), 'keyboard');
    assert.equal(deviceKind('Logitech MX Master 鼠标'), 'mouse');
    assert.equal(deviceKind('Xbox Wireless Controller'), 'gamepad');
    assert.equal(deviceKind('iPhone'), 'phone');
  });

  it('falls back to a neutral mark, not the first letter', () => {
    const kind = deviceKind('USB Composite Device');
    assert.equal(kind, 'other');
    assert.notEqual(kind, 'u');
    assert.notEqual(kind, 'USB Composite Device'[0]);
  });
});

describe('the settings window renders and writes the devices page', () => {
  const settings = src('renderer/settings.js');
  const css = src('renderer/settings.css');
  const island = src('renderer/island.js');
  const main = src('main.js');
  const preload = src('preload-settings.js');

  it('registers a devices renderer and reads the shared category helper', () => {
    assert.ok(settings.includes('function pageDevices()'));
    assert.ok(settings.includes('devices: pageDevices'), 'RENDERERS must own the page');
    assert.ok(settings.includes('deviceKind(name)'), 'the glyph must come from the shared classifier');
    assert.ok(!/name\[0\]|charAt\(0\)/.test(settings), 'no first-letter icons');
  });

  it('shows every probed device, hidden ones included', () => {
    assert.ok(settings.includes('Array.isArray(devicesState?.devices)'));
    assert.ok(settings.includes('devices.hidden'), 'the row switch reads hidden');
    assert.ok(!settings.includes("group('设备页'"), '页面管理 must not keep a second devices card');
  });

  it('goes through the narrow main-process channels, not a raw group write', () => {
    assert.ok(settings.includes('api.hideDevice?.'));
    assert.ok(settings.includes('api.pinDevice?.'));
    assert.ok(settings.includes('api.devicesRefresh?.'));
    assert.ok(preload.includes("'settings:devices'"));
    assert.ok(preload.includes("'settings:devices-refresh'"));
    assert.ok(preload.includes("'settings:devices-watch'"));
    assert.ok(preload.includes("'settings:devices-pin'"));
    assert.ok(preload.includes("'settings:devices-hidden'"));
  });

  it('starts and releases the probe with the page', () => {
    assert.ok(settings.includes('devicesWatch'), 'the window must hold a probe demand');
    assert.ok(settings.includes('api.devicesWatch?.(want)'));
    assert.ok(main.includes("if (devicesWatch > 0) wanted.add('devices')"), 'the demand joins the service plan');
    assert.ok(main.includes('settings.setClosedHook'), 'closing the window must release the demand');
  });

  it('scrolls the device list inside its own card', () => {
    assert.match(css, /\.dev-rows\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/);
    assert.ok(css.includes('.dev-star'), 'the pin control has its own style');
  });

  it('filters the island rows through the same hidden rule', () => {
    const body = functionBody(island, 'devicesPage');
    assert.ok(body.includes('visibleDevices(probed, prefs.devices?.hidden)'), 'the island must hide, not the probe');
    assert.ok(body.includes('设备都隐藏了'), 'all-hidden has its own empty state');
  });
});

describe('devices: the order a person dragged', () => {
  const rows = [
    { name: 'Keyboard' },
    { name: 'Mouse' },
    { name: 'Headset' },
  ];

  it('follows the stored order', () => {
    const out = orderDevices(rows, { order: ['Headset', 'Keyboard', 'Mouse'] });
    assert.deepEqual(out.map((d) => d.name), ['Headset', 'Keyboard', 'Mouse']);
  });

  it('keeps pinned rows above the stored order', () => {
    const out = orderDevices(rows, { pinned: ['Mouse'], order: ['Headset', 'Keyboard'] });
    assert.deepEqual(out.map((d) => d.name), ['Mouse', 'Headset', 'Keyboard']);
  });

  it('puts a device the order has never seen after the known ones, in probe order', () => {
    const out = orderDevices(rows, { order: ['Headset'] });
    assert.deepEqual(out.map((d) => d.name), ['Headset', 'Keyboard', 'Mouse']);
  });

  it('ignores names that are no longer paired and duplicates in the order', () => {
    const out = orderDevices(rows, { order: ['Ghost', 'Mouse', 'Mouse', 'Keyboard'] });
    assert.deepEqual(out.map((d) => d.name), ['Mouse', 'Keyboard', 'Headset']);
  });

  it('is a stable no-op with no order stored', () => {
    const out = orderDevices(rows, {});
    assert.deepEqual(out.map((d) => d.name), ['Keyboard', 'Mouse', 'Headset']);
  });
});
