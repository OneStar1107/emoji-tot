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
  STATUS_MANIFEST,
  enabledPageKeys,
  enabledServices,
  enabledStatusKeys,
  filterPatch,
  knownPaths,
  orderedPageKeys,
  orderedStatusKeys,
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
});

describe('settings UI actually reads and writes the schema', () => {
  const settings = src('renderer/settings.js');
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
});
