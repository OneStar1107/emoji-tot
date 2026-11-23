/**
 * 常驻排列：顺序是数据，不是 DOM。
 *
 * 预览条和它下面那张「状态组件」列表共用同一份 prefs.statusItems，所以顺序
 * 的每一次变化都必须落在同一个纯函数上。这里盯的是那个函数、它的默认值和
 * 两个消费者，而不是某个格子的像素——像素那部分交给真机截图。
 *
 * Run: node --test test/status-order.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS,
  STATUS_MANIFEST,
  defaultStatusItems,
  enabledStatusKeys,
  moveStatusKey,
  orderedStatusKeys,
  setStatusItemEnabled,
  statusPreviewRows,
  withDefaults,
} from '../src/shared/schema.js';
import { batteryText, clockText, quotaText, temperatureText } from '../src/shared/status-view.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');
const ALL = STATUS_MANIFEST.map((item) => item.key);

describe('residency: a drag writes one order', () => {
  it('moves an item to the position it was dropped on', () => {
    const prefs = withDefaults({ statusItems: ['battery', 'clock', 'weather', 'quota'] });
    assert.deepEqual(moveStatusKey(prefs, 'weather', 0), ['weather', 'battery', 'clock', 'quota']);
    assert.deepEqual(moveStatusKey(prefs, 'battery', 3), ['clock', 'weather', 'quota', 'battery']);
    assert.deepEqual(moveStatusKey(prefs, 'clock', 2), ['battery', 'weather', 'clock', 'quota']);
  });

  it('clamps a drop past either end instead of losing the item', () => {
    const prefs = withDefaults({ statusItems: ['battery', 'clock'] });
    assert.deepEqual(moveStatusKey(prefs, 'battery', -5), ['battery', 'clock']);
    assert.deepEqual(moveStatusKey(prefs, 'battery', 99), ['clock', 'battery']);
    assert.deepEqual(moveStatusKey(prefs, 'clock', 1.7), ['battery', 'clock']);
  });

  it('never adds an item that is switched off', () => {
    // 余额默认关闭；拖它只会返回当前已启用的那串，不会把它偷偷打开。
    const prefs = withDefaults({ statusItems: ['battery', 'clock', 'weather'] });
    assert.deepEqual(moveStatusKey(prefs, 'quota', 0), ['battery', 'clock', 'weather']);
    assert.deepEqual(moveStatusKey(prefs, 'volume', 0), ['battery', 'clock', 'weather']);
  });

  it('leaves the array alone when the drop changes nothing', () => {
    const prefs = withDefaults({ statusItems: ['battery', 'clock', 'weather'] });
    assert.deepEqual(moveStatusKey(prefs, 'clock', 1), ['battery', 'clock', 'weather']);
    assert.deepEqual(moveStatusKey(prefs, 'clock', '1'), ['battery', 'clock', 'weather']);
  });
});

describe('residency: reset', () => {
  it('returns the fresh-install row with optional components off', () => {
    const fresh = defaultStatusItems();
    assert.deepEqual(fresh, ['battery', 'clock', 'weather']);
    assert.deepEqual(fresh, DEFAULTS.statusItems);
    assert.ok(!fresh.includes('quota'), 'the balance stays switched off after a reset');
    assert.ok(!fresh.includes('kaomoji'), 'kaomoji stays switched off after a reset');
  });

  it('hands back a copy, so resetting cannot edit the schema default', () => {
    const copy = defaultStatusItems();
    copy.push('quota');
    assert.deepEqual(DEFAULTS.statusItems, ['battery', 'clock', 'weather']);
  });

  it('puts a messy order and a switched-off default back', () => {
    const messy = withDefaults({ statusItems: ['quota', 'weather'] });
    assert.deepEqual(enabledStatusKeys(messy), ['quota', 'weather']);
    const after = withDefaults({ statusItems: defaultStatusItems() });
    assert.deepEqual(enabledStatusKeys(after), ['battery', 'clock', 'weather']);
    assert.ok(!enabledStatusKeys(after).includes('quota'));
  });
});

describe('residency: the preview keeps a slot for switched-off items', () => {
  it('lists every manifest item, switched-on ones first in the user order', () => {
    const rows = statusPreviewRows(withDefaults({ statusItems: ['weather', 'battery'] }));
    assert.deepEqual(rows.map((row) => row.key), ['weather', 'battery', 'clock', 'quota', 'kaomoji']);
    assert.deepEqual(rows.filter((row) => row.enabled).map((row) => row.key), ['weather', 'battery']);
    assert.equal(rows.find((row) => row.key === 'clock').enabled, false);
    assert.equal(rows.find((row) => row.key === 'kaomoji').enabled, false);
    assert.deepEqual(rows.map((row) => row.key).sort(), [...ALL].sort());
  });

  it('keeps the off item as a grey slot after a drag', () => {
    const moved = moveStatusKey(withDefaults({ statusItems: ['battery', 'clock', 'weather'] }), 'weather', 0);
    const rows = statusPreviewRows(withDefaults({ statusItems: moved }));
    assert.deepEqual(rows.map((row) => row.key), ['weather', 'battery', 'clock', 'quota', 'kaomoji']);
    assert.equal(rows.find((row) => row.key === 'quota').enabled, false, 'balance keeps its reserved slot');
    assert.equal(rows.at(-1).enabled, false, 'kaomoji keeps the last slot, switched off');
  });

  it('adds kaomoji to the same statusItems order when switched on', () => {
    const before = withDefaults({ statusItems: ['battery', 'clock', 'weather'] });
    const after = withDefaults({ statusItems: setStatusItemEnabled(before, 'kaomoji', true) });
    assert.deepEqual(enabledStatusKeys(after), ['battery', 'clock', 'weather', 'kaomoji']);
    assert.equal(statusPreviewRows(after).find((row) => row.key === 'kaomoji').enabled, true);
  });
});

describe('residency: the two lists are one list', () => {
  it('a move shows up in the pill order and in the strip', () => {
    const before = withDefaults({ statusItems: ['battery', 'clock', 'weather', 'quota'] });
    const after = withDefaults({ statusItems: moveStatusKey(before, 'quota', 0) });
    assert.deepEqual(enabledStatusKeys(after), ['quota', 'battery', 'clock', 'weather']);
    // 预览条上「已启用」的那一串，就是胶囊真正会画的顺序。
    assert.deepEqual(statusPreviewRows(after).filter((row) => row.enabled).map((row) => row.key), enabledStatusKeys(after));
  });

  it('switching one off removes it from both at the same time', () => {
    const before = withDefaults({ statusItems: ['quota', 'battery', 'clock', 'weather'] });
    const off = withDefaults({ statusItems: setStatusItemEnabled(before, 'clock', false) });
    assert.deepEqual(enabledStatusKeys(off), ['quota', 'battery', 'weather']);
    const rows = statusPreviewRows(off);
    assert.equal(rows.find((row) => row.key === 'clock').enabled, false);
    assert.ok(rows.findIndex((row) => row.key === 'clock') >= 3, 'the off item moves to the reserved tail');
    assert.deepEqual(orderedStatusKeys(off), ['quota', 'battery', 'weather', 'clock', 'kaomoji']);
  });

  it('the settings page reads both lists from the schema, not from a copy', () => {
    const settings = src('renderer/settings.js');
    assert.ok(settings.includes('statusPreviewRows(prefs)'), 'the strip rows must come from schema');
    assert.ok(settings.includes('orderedStatusKeys(prefs)'), 'the row list order comes from schema');
    assert.ok(settings.includes("orderList('status', statusItems"), 'the row list stays on the page');
    assert.ok(settings.includes('moveStatusKey(prefs'), 'a drag writes through the shared mover');
    assert.ok(settings.includes('defaultStatusItems()'), 'reset uses the schema default, not a literal');
    assert.ok(!/statusItems: \['battery'/.test(settings), 'no second copy of the default order in the renderer');
  });

  it('previews kaomoji with the same expression the island renders', () => {
    const settings = src('renderer/settings.js');
    assert.ok(settings.includes('PILL_EXPRESSION'), 'the settings preview imports the shared expression');
    assert.ok(settings.includes("key === 'kaomoji'"), 'the preview has a kaomoji branch');
  });

  it('the island and the strip share one set of reading rules', () => {
    const island = src('renderer/island.js');
    for (const name of ['batteryGlyph', 'batteryText', 'clockReadout', 'temperatureText', 'quotaText']) {
      assert.ok(island.includes(name + '('), 'island.js must read ' + name + ' from the shared module');
    }
    assert.ok(island.includes("from '../shared/status-view.js'"), 'the shared module is the one source');
    assert.ok(!island.includes('function batterySvg('), 'the battery icon must not be re-implemented in the island');
  });

  it('aliases the shared clock, because island.js owns a calendar clockText', () => {
    // 岛内本来就有一个 clockText（日历行的 HH:mm）。直接 import 同名会让整个
    // 模块在解析期抛 SyntaxError，胶囊一片空白——这正是真机验证抓到的第一版。
    const island = src('renderer/island.js');
    assert.ok(island.includes('clockText as clockReadout'), 'the shared clock must be aliased');
    assert.ok(island.includes('clockReadout(new Date()'), 'hhmm must read the shared clock');
    assert.equal((island.match(/^(const|function) clockText\b/gm) ?? []).length, 1,
      'the calendar clockText must stay the only declaration of that name');
  });
});

describe('status-view: one set of reading rules', () => {
  const at = (hour, minute) => new Date(2026, 0, 2, hour, minute, 0, 0);

  it('prints the clock in both formats', () => {
    assert.equal(clockText(at(15, 41), true), '15:41');
    assert.equal(clockText(at(9, 5), true), '09:05');
    assert.equal(clockText(at(15, 41), false), '3:41 PM');
    assert.equal(clockText(at(0, 7), false), '12:07 AM');
    assert.equal(clockText(at(12, 0), false), '12:00 PM');
  });

  it('follows the unit preference for temperature', () => {
    assert.equal(temperatureText(17, 'c'), '17°');
    assert.equal(temperatureText(17, 'f'), '63°');
    assert.equal(temperatureText(17.6, 'c'), '18°');
    assert.equal(temperatureText(undefined, 'c'), '0°');
    assert.equal(temperatureText(null, 'f'), '32°');
  });

  it('writes the level and the balance exactly like the pill', () => {
    assert.equal(batteryText(82), '82%');
    assert.equal(batteryText(0), '0%');
    assert.equal(quotaText({ total: 20.8 }), '¥20.8');
    assert.equal(quotaText({ total: 0 }), '¥0');
  });

  it('draws nothing for a missing or failed balance', () => {
    assert.equal(quotaText(null), '');
    assert.equal(quotaText({}), '');
    assert.equal(quotaText({ total: 3, error: 'expired' }), '');
  });
});
