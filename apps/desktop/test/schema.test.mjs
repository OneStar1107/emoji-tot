/**
 * The settings audit, as tests.
 *
 * Every assertion here exists because the same mistake already happened once:
 * a control that writes prefs.json and changes nothing, a page the island can
 * draw but settings cannot reach, a status item with no renderer. The schema
 * is the single source of truth, so each of those is now a property that can
 * be checked instead of a paragraph someone has to remember.
 *
 * Run: pnpm --filter @emojitot/desktop test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSUMERS,
  DEFAULTS,
  PAGE_MANIFEST,
  PRESET_MANIFEST,
  STATUS_MANIFEST,
  enabledPageKeys,
  enabledServices,
  enabledStatusKeys,
  filterPatch,
  knownPaths,
  orderedPageKeys,
  orderedStatusKeys,
  presetPatch,
  serviceChanges,
  setStatusItemEnabled,
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

describe('schema: every preference has a consumer', () => {
  const paths = knownPaths();

  it('lists every path in CONSUMERS and nothing else', () => {
    const missing = paths.filter((path) => !(path in CONSUMERS));
    const extra = Object.keys(CONSUMERS).filter((path) => !paths.includes(path));
    assert.deepEqual(missing, [], 'these keys have no recorded consumer');
    assert.deepEqual(extra, [], 'CONSUMERS mentions keys the schema does not define');
  });

  it('records a scope and a call site for each', () => {
    for (const path of paths) {
      const entry = CONSUMERS[path];
      assert.ok(['main', 'renderer'].includes(entry.scope), path + ' has no scope');
      assert.ok(entry.at && entry.at.length > 3, path + ' has no call site');
      assert.equal(typeof entry.live, 'boolean', path + ' must say whether it applies live');
    }
  });

  it('keeps every default serialisable, so prefs.json stays readable', () => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      assert.notEqual(value, undefined, key + ' is undefined');
      assert.doesNotThrow(() => JSON.stringify(value), key + ' is not serialisable');
    }
  });
});

describe('schema: defaults', () => {
  /*
   * The auto-avoid default is a decision, not an accident.
   *
   * On, because the island sits where a maximised browser keeps its tabs and
   * the way back from a collapsed strip (hover it) is far easier to find than
   * the setting that would have prevented the overlap. Narrow, because it only
   * reacts to browsers unless the user adds apps — that scoping is what makes
   * an on-by-default overlay acceptable.
   */
  it('collapses away from browsers by default, and only from them', () => {
    assert.equal(DEFAULTS.avoidEnabled, true, 'auto-avoid should be on for a fresh install');
    assert.equal(DEFAULTS.avoidBrowsers, true, 'browsers are the scope that makes it safe');
    assert.deepEqual(DEFAULTS.avoidApps, [], 'no third-party app is avoided until the user adds one');
  });

  it('fills every page and status key the manifests describe', () => {
    const filled = withDefaults({});
    for (const page of PAGE_MANIFEST) {
      assert.equal(typeof filled.pages[page.key], 'boolean', 'pages.' + page.key + ' has no default');
    }
    for (const item of STATUS_MANIFEST) {
      assert.equal(typeof item.service === 'string' || item.service === null, true);
    }
  });

  it('never shares an array with the source object', () => {
    const first = withDefaults({});
    first.statusItems.push('clock');
    first.pageOrder.push('devices');
    const second = withDefaults({});
    assert.deepEqual(second.statusItems, DEFAULTS.statusItems);
    assert.deepEqual(second.pageOrder, DEFAULTS.pageOrder);
  });

  it('only mentions status items the manifest knows', () => {
    for (const key of DEFAULTS.statusItems) {
      assert.ok(STATUS_MANIFEST.some((item) => item.key === key), 'unknown default status item ' + key);
    }
  });

  it('orders known pages first and keeps unknown pins out', () => {
    const order = orderedPageKeys(withDefaults({ pageOrder: ['shelf', 'gone', 'music'] }));
    assert.equal(order[0], 'shelf');
    assert.equal(order[1], 'music');
    assert.ok(!order.includes('gone'));
    assert.equal(order.length, PAGE_MANIFEST.length);
  });
});

describe('schema: patches', () => {
  it('rejects keys the schema does not define', () => {
    const { accepted, rejected } = filterPatch({ theme: 'light', 'focus.enabled': true, nope: 1 });
    assert.deepEqual(accepted, { theme: 'light' });
    assert.deepEqual(rejected, ['focus.enabled', 'nope']);
  });

  it('accepts grouped objects as a whole', () => {
    const { accepted } = filterPatch({ focus: { enabled: true } });
    assert.deepEqual(accepted, { focus: { enabled: true } });
  });

  it('ignores a non-object patch instead of throwing', () => {
    assert.deepEqual(filterPatch(null).accepted, {});
    assert.deepEqual(filterPatch('nope').accepted, {});
  });

  it('persists the mail provider selected in settings', () => {
    assert.equal(withDefaults({}).mailProvider, '163');
    assert.deepEqual(filterPatch({ mailProvider: 'gmail' }), {
      accepted: { mailProvider: 'gmail' },
      rejected: [],
    });
  });

  it('accepts one display mode and rejects the legacy pair', () => {
    assert.deepEqual(filterPatch({ displayMode: 'both' }), {
      accepted: { displayMode: 'both' },
      rejected: [],
    });
    assert.deepEqual(filterPatch({ form: 'ball', formBoth: true }), {
      accepted: {},
      rejected: ['form', 'formBoth'],
    });
  });
});

describe('schema: display mode migration', () => {
  it('maps the legacy pair onto one canonical value', () => {
    assert.equal(withDefaults({ displayMode: 'island' }).displayMode, 'island');
    assert.equal(withDefaults({ form: 'ball', formBoth: false }).displayMode, 'ball');
    assert.equal(withDefaults({ form: 'island', formBoth: true }).displayMode, 'both');
    assert.equal(withDefaults({ form: 'ball', formBoth: true }).displayMode, 'both');
  });

  it('lets a new value beat stale legacy keys', () => {
    assert.equal(
      withDefaults({ displayMode: 'ball', form: 'island', formBoth: true }).displayMode,
      'ball',
    );
  });
});

describe('schema: pages drive services', () => {
  it('stops a service when its page is switched off', () => {
    const off = withDefaults({ pages: { weather: false }, statusItems: ['battery', 'clock'] });
    assert.ok(!enabledServices(off).has('weather'));
  });

  it('keeps a service alive when a pill status item needs it', () => {
    const off = withDefaults({ pages: { weather: false }, statusItems: ['battery', 'clock', 'weather'] });
    assert.ok(enabledServices(off).has('weather'), 'the pill still shows the temperature');
  });

  it('does not run a page service by default when its feature is off', () => {
    const defaults = withDefaults({});
    assert.ok(!enabledServices(defaults).has('focus'), 'focus.enabled defaults to false');
    assert.ok(!enabledServices(defaults).has('health'), 'health.enabled defaults to false');
  });

  it('drops the clipboard worker when the clipboard switch is off', () => {
    const off = withDefaults({ shelf: { clipboard: false } });
    assert.ok(!enabledServices(off).has('clipboard'));
  });

  it('returns only switched-on pages and status items', () => {
    const prefs = withDefaults({ pages: { music: false }, statusItems: ['battery'] });
    assert.ok(!enabledPageKeys(prefs).includes('music'));
    assert.deepEqual(enabledStatusKeys(prefs), ['battery']);
  });

  it('only refreshes weather while it is running', () => {
    const off = serviceChanges(
      withDefaults({ pages: { weather: false }, statusItems: ['battery'] }),
      withDefaults({ pages: { weather: false }, statusItems: ['battery'], weather: { city: 'Macau' } }),
    );
    assert.equal(off.weatherRefresh, false);
    assert.equal(off.weatherReschedule, false);

    const on = serviceChanges(
      withDefaults({}),
      withDefaults({ weather: { intervalMin: 30 } }),
    );
    assert.equal(on.weatherRefresh, false);
    assert.equal(on.weatherReschedule, true);
  });

  it('does not reschedule quota after its page is off', () => {
    const change = serviceChanges(
      withDefaults({ pages: { quota: false }, statusItems: ['battery'] }),
      withDefaults({
        pages: { quota: false },
        statusItems: ['battery'],
        quota: { intervalMin: 30 },
      }),
    );
    assert.equal(change.quotaReschedule, false);
  });
});

describe('schema: status item toggles', () => {
  it('enables and disables one status item without disturbing the rest', () => {
    const initial = withDefaults({ statusItems: ['battery', 'clock', 'weather'] });
    const withQuota = setStatusItemEnabled(initial, 'quota', true);
    assert.deepEqual(withQuota, ['battery', 'clock', 'weather', 'quota']);

    const withoutClock = setStatusItemEnabled(
      withDefaults({ statusItems: withQuota }),
      'clock',
      false,
    );
    assert.deepEqual(withoutClock, ['battery', 'weather', 'quota']);
  });

  it('ignores unknown status keys and duplicate enables', () => {
    const prefs = withDefaults({ statusItems: ['battery', 'clock'] });
    assert.deepEqual(setStatusItemEnabled(prefs, 'battery', true), ['battery', 'clock']);
    assert.deepEqual(setStatusItemEnabled(prefs, 'volume', true), ['battery', 'clock']);
  });
});

describe('schema: page presets', () => {
  it('defines the four entry points', () => {
    assert.deepEqual(PRESET_MANIFEST.map((preset) => preset.key), ['minimal', 'work', 'life', 'full']);
  });

  it('sets the documented pages, statuses and feature switches', () => {
    const minimal = withDefaults(presetPatch('minimal', {}));
    assert.deepEqual(enabledPageKeys(minimal), ['weather']);
    assert.deepEqual(minimal.statusItems, ['battery', 'clock']);

    const work = withDefaults(presetPatch('work', {}));
    assert.deepEqual(
      enabledPageKeys(work),
      ['music', 'quota', 'focus', 'todo', 'calendar'],
    );
    assert.deepEqual(work.statusItems, ['battery', 'clock', 'quota']);
    assert.equal(work.focus.enabled, true);

    const life = withDefaults(presetPatch('life', {}));
    assert.deepEqual(
      enabledPageKeys(life),
      ['weather', 'todo', 'health', 'shelf', 'devices', 'calendar'],
    );
    assert.equal(life.health.enabled, true);
    assert.equal(life.shelf.clipboard, false);
  });

  it('keeps full enabled and preserves unrelated custom values', () => {
    const custom = withDefaults({
      focus: { work: 50 },
      shelf: { clipboard: true },
    });
    const full = withDefaults({ ...custom, ...presetPatch('full', custom) });
    assert.deepEqual(enabledPageKeys(full), PAGE_MANIFEST.map((page) => page.key));
    assert.equal(full.focus.work, 50);
    assert.equal(full.shelf.clipboard, true);
  });
});

describe('settings UI actually reads and writes the schema', () => {
  const settings = src('renderer/settings.js');
  const settingsCss = src('renderer/settings.css');
  const island = src('renderer/island.js');

  it('imports the shared schema instead of keeping a copy', () => {
    assert.ok(settings.includes("from '../shared/schema.js'"), 'settings must import the shared schema');
    assert.ok(!settings.includes('const PAGES_TABLE = ['), 'a second page table would drift again');
    assert.ok(!settings.includes('const DEFAULTS = {'), 'a second defaults object would drift again');
  });

  it('renders a control for every page and status key', () => {
    assert.ok(settings.includes('PAGE_MANIFEST.map'), 'pages must come from the manifest');
    assert.ok(settings.includes('STATUS_MANIFEST.map'), 'status items must come from the manifest');
  });

  it('writes dotted keys through setPath, never as one literal property', () => {
    // Both regressions were the same line shape: patch({ [key]: ... }).
    assert.ok(!settings.includes('patch({ [key]:'), 'a dotted key must go through setPath');
    assert.ok(settings.includes('setPath(key, !valueOf(key))'), 'toggles must flip the value at the path');
  });

  it('renders one canonical display mode control', () => {
    assert.ok(settings.includes("'displayMode'"), 'settings must write displayMode');
    assert.ok(!settings.includes("'formBoth'"), 'settings must not expose the legacy formBoth switch');
    assert.ok(!settings.includes("rowActionToggle('显示灵动岛'"), 'visibility is owned by displayMode');
  });

  it('offers an accessible search across page content', () => {
    assert.ok(settings.includes('aria-label="搜索设置"'), 'search input needs an accessible name');
    assert.ok(settings.includes('pageSearchText'), 'search must index rendered setting labels');
    assert.ok(settings.includes('searchTextCache'), 'the page search index must be memoized');
  });

  it('offers keyboard-operable order controls beside drag and drop', () => {
    assert.ok(settings.includes('data-order-move'), 'order rows need move buttons');
    assert.ok(settings.includes("event.key === 'ArrowUp'"), 'orders need an Up key path');
    assert.ok(settings.includes("event.key === 'ArrowDown'"), 'orders need a Down key path');
  });

  it('renders page presets from the shared manifest', () => {
    assert.ok(settings.includes('PRESET_MANIFEST.map'), 'preset choices must come from schema');
    assert.ok(settings.includes('presetPatch('), 'preset cards must apply schema patches');
  });

  it('keeps small secondary text at a readable dark-theme opacity', () => {
    assert.match(
      settingsCss,
      /--faint:\s*rgba\(241,\s*241,\s*244,\s*0\.5\)/,
      'dark faint text must be at least 50% ink opacity',
    );
  });

  it('draws every status item that the manifest offers', () => {
    const body = functionBody(island, 'renderPillStatus');
    for (const item of STATUS_MANIFEST) {
      assert.ok(
        body.includes("key === '" + item.key + "'"),
        'renderPillStatus never draws "' + item.key + '" — the switch would look on and do nothing',
      );
    }
  });

  it('applies the reduce-motion switch to the page', () => {
    assert.ok(island.includes('dataset.reduceMotion'), 'the island never reads reduceMotion');
  });
});

describe('main process implements every service a page can ask for', () => {
  const main = src('main.js');

  it('has a SERVICE_PLAN entry for each page service', () => {
    const plan = main.slice(main.indexOf('const SERVICE_PLAN = {'));
    const end = plan.indexOf('\n};');
    const table = plan.slice(0, end);
    for (const page of PAGE_MANIFEST) {
      const services = [page.service, ...(page.alsoServices ?? [])].filter(Boolean);
      for (const service of services) {
        assert.ok(
          table.includes('  ' + service + ': {'),
          'SERVICE_PLAN has no "' + service + '" entry',
        );
      }
    }
  });

  it('applies a pref change to the running app instead of the next launch', () => {
    assert.ok(main.includes('applyServicePlan();'), 'a pref change must re-plan the services');
    assert.ok(main.includes('applyWindowFlags();'), 'a pref change must re-apply window flags');
  });

  it('reads and applies only the canonical display mode', () => {
    assert.ok(main.includes('displayMode'), 'main must read displayMode');
    assert.ok(!main.includes('next.formBoth'), 'main must not read the legacy pair');
    assert.ok(!main.includes('writePrefs({ form }'), 'main must not write form');
  });
});
