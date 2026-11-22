/**
 * The vendor battery probe's timing, exercised with the shell stubbed out.
 *
 * The feature's promises are about *when* it reads, and every way they break
 * looks the same from the outside: a number that is stale, or a row that never
 * leaves its em dash. So they are tested here - the open-page burst, the
 * background clock, the refresh path - instead of being left to a manual run.
 */
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const ENTRY = require.resolve('../src/main/services/device-battery.js');

const stats = { spawn: 0, args: [] };
let payload = '{"devices":[{"name":"ROG AZOTH","level":100,"protocol":"asus-kb"}]}';

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.kill = () => {};
  queueMicrotask(() => {
    child.stdout.emit('data', payload);
    child.emit('exit', 0);
  });
  return child;
}

const originalLoad = Module._load;
Module._load = function patched(request, parent) {
  if (parent && parent.filename === ENTRY) {
    if (request === '../platform') {
      return {
        spawnPowerShell: (args) => {
          stats.spawn += 1;
          stats.args.push(args);
          return makeChild();
        },
      };
    }
    if (request === '../paths') return { scriptFile: (name) => name };
  }
  return originalLoad.apply(this, arguments);
};

/** A module instance with no state left over from the previous case. */
function fresh() {
  delete require.cache[ENTRY];
  return require(ENTRY);
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('device-battery: three read layers', () => {
  beforeEach(() => {
    stats.spawn = 0;
    stats.args.length = 0;
    payload = '{"devices":[{"name":"ROG AZOTH","level":100,"protocol":"asus-kb"}]}';
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'], now: 0 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('starts one probe and then the five-minute background clock', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    assert.equal(stats.spawn, 1, 'start() probes once on its own');

    mock.timers.tick(5 * 60 * 1000 - 1);
    await flush();
    assert.equal(stats.spawn, 1, 'nothing before five minutes');

    mock.timers.tick(1);
    await flush();
    assert.equal(stats.spawn, 2, 'the background clock fires with no page open');

    mock.timers.tick(5 * 60 * 1000);
    await flush();
    assert.equal(stats.spawn, 3, 'and keeps firing every five minutes');
    battery.stop();
  });

  it('a second start is not a second clock', async () => {
    const battery = fresh();
    battery.start();
    battery.start();
    await flush();
    assert.equal(stats.spawn, 1, 'the second start() finds the probe already running');

    mock.timers.tick(5 * 60 * 1000);
    await flush();
    assert.equal(stats.spawn, 2, 'one tick, one probe: the clock was not stacked');
    battery.stop();
  });

  it('probing the page open three times, spaced, not once', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    assert.equal(stats.spawn, 1);

    battery.setFocused(true);
    await flush();
    assert.equal(stats.spawn, 2, 'the first attempt is immediate');

    mock.timers.tick(3000);
    await flush();
    assert.equal(stats.spawn, 3, 'the second attempt follows after the gap');

    mock.timers.tick(3000);
    await flush();
    assert.equal(stats.spawn, 4, 'the third attempt completes the burst');

    mock.timers.tick(3000);
    await flush();
    assert.equal(stats.spawn, 4, 'a burst is three attempts, not a loop');
    battery.stop();
  });

  it('closing the page stops the burst and returns to five minutes', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    battery.setFocused(true);
    await flush();
    assert.equal(stats.spawn, 2);

    battery.setFocused(false);
    mock.timers.tick(3000);
    await flush();
    assert.equal(stats.spawn, 2, 'the remaining burst attempts are cancelled');

    mock.timers.tick(5 * 60 * 1000);
    await flush();
    assert.equal(stats.spawn, 3, 'the idle clock still runs');
    battery.stop();
  });

  it('the refresh path probes once, outside both clocks', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    assert.equal(stats.spawn, 1);

    battery.probeNow();
    await flush();
    assert.equal(stats.spawn, 2, 'one probe for one refresh');

    // The next idle tick is still a full five minutes away: a refresh is not a
    // replacement for the clock, and it must not push the clock back either.
    mock.timers.tick(5 * 60 * 1000 - 1);
    await flush();
    assert.equal(stats.spawn, 2);
    mock.timers.tick(1);
    await flush();
    assert.equal(stats.spawn, 3);
    battery.stop();
  });

  it('keeps the last answer, exposes it by name, and stamps probedAt', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    assert.deepEqual(battery.get('ROG AZOTH'), { level: 100, charging: false, source: 'asus-kb' });
    assert.equal(battery.get('missing'), null);

    const first = battery.status().probedAt;
    assert.ok(first > 0, 'the probe completion is stamped');
    payload = '{"devices":[]}';
    mock.timers.tick(5 * 60 * 1000);
    await flush();
    assert.ok(battery.status().probedAt >= first, 'the stamp advances on the next probe');
    battery.stop();
  });

  it('a failed probe leaves the previous level in place', async () => {
    const battery = fresh();
    battery.start();
    await flush();
    payload = '';
    mock.timers.tick(5 * 60 * 1000);
    await flush();
    assert.deepEqual(battery.get('ROG AZOTH'), { level: 100, charging: false, source: 'asus-kb' });
    battery.stop();
  });
});
