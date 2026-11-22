/**
 * The devices list's two-stage push and its one resident child.
 *
 * The feature's promises are about *when* the page gets rows: a cold start must
 * not wait for the battery property read before it can draw a name, and a second
 * start must not leave two sweepers behind. Neither is visible from the outside
 * when it breaks - the page is simply empty for longer, or a second PowerShell
 * reads the same properties on its own clock - so they are tested here.
 *
 * The probe script itself is checked for the parts that only exist in
 * PowerShell: the two lines it prints, and the short first interval that is the
 * post-boot catch-up sweep.
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const ENTRY = require.resolve('../src/main/services/devices.js');
const SCRIPT = require.resolve('../src/main/services/devices.ps1');

const stats = { spawn: 0 };
const children = [];
const cache = { value: null, writes: 0 };
/** What the vendor probe would answer, by device name. */
let vendorLevel = null;
const battery = {
  starts: 0,
  probes: 0,
  focused: [],
  listeners: new Set(),
  get: (name) => (vendorLevel && vendorLevel.name === name ? vendorLevel.value : null),
  status: () => ({ probedAt: 0 }),
  onChange: (fn) => battery.listeners.add(fn),
  start: () => { battery.starts += 1; },
  stop: () => {},
  setFocused: (active) => { battery.focused.push(active); },
  probeNow: () => { battery.probes += 1; return Promise.resolve(true); },
};

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.kill = () => {};
  children.push(child);
  return child;
}

const originalLoad = Module._load;
Module._load = function patched(request, parent) {
  if (parent && parent.filename === ENTRY) {
    if (request === '../platform') {
      return {
        spawnPowerShell: () => {
          stats.spawn += 1;
          return makeChild();
        },
      };
    }
    if (request === '../paths') {
      return {
        scriptFile: (name) => name,
        cachePath: (name) => name,
        readJson: () => cache.value,
        writeJson: (_name, value) => {
          cache.value = value;
          cache.writes += 1;
        },
      };
    }
    if (request === './device-battery') return battery;
  }
  return originalLoad.apply(this, arguments);
};

/** A module instance with no state left over from the previous case. */
function fresh() {
  delete require.cache[ENTRY];
  return require(ENTRY);
}

/** One JSON line on the current child's stdout. */
function line(text) {
  children[children.length - 1].stdout.emit('data', text + '\n');
}

const listLine = (rows) => JSON.stringify({ phase: 'list', ts: 1, devices: rows });
const batteryLine = (rows) => JSON.stringify({ phase: 'battery', ts: 2, devices: rows });

describe('devices: one resident child, two pushes per sweep', () => {
  beforeEach(() => {
    stats.spawn = 0;
    children.length = 0;
    vendorLevel = null;
    battery.starts = 0;
    battery.probes = 0;
    battery.focused.length = 0;
    cache.value = null;
    cache.writes = 0;
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'], now: 0 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('starts the sweep at once, without waiting for a timer', () => {
    const devices = fresh();
    devices.start();
    assert.equal(stats.spawn, 1, 'start() spawns the probe on its own');
    assert.equal(battery.starts, 1, 'the vendor probe starts on the same call');
    devices.stop();
  });

  it('pushes the list first with null levels, then the same rows with levels', () => {
    const devices = fresh();
    const pushes = [];
    devices.onChange((value) => pushes.push(value));
    devices.start();
    assert.equal(pushes.length, 1, 'start pushes the cold/scanning state immediately');
    assert.equal(pushes[0].scanning, true);

    line(listLine([
      { name: 'Xbox Wireless Controller', status: 'OK', battery: null, source: 'bluetooth' },
      { name: 'ROG AZOTH', status: 'OK', battery: null, source: 'bluetooth' },
    ]));
    assert.equal(pushes.length, 2, 'the first line is its own push');
    assert.equal(pushes[1].phase, 'list');
    assert.equal(pushes[1].scanning, false);
    assert.deepEqual(pushes[1].devices.map((row) => row.battery), [null, null]);
    assert.equal(pushes[1].withBattery, 0);

    line(batteryLine([
      { name: 'Xbox Wireless Controller', status: 'OK', battery: 89, source: 'bluetooth' },
      { name: 'ROG AZOTH', status: 'OK', battery: 100, source: 'bluetooth' },
    ]));
    assert.equal(pushes.length, 3, 'the second line repaints, it does not wait');
    assert.equal(pushes[2].phase, 'battery');
    assert.deepEqual(pushes[2].devices.map((row) => row.battery), [89, 100]);
    assert.equal(pushes[2].withBattery, 2);
    assert.ok(cache.value && cache.value.devices.length === 2, 'the last list is persisted');
    devices.stop();
  });

  it('a vendor level lands on a row the list pass left at null', () => {
    const devices = fresh();
    const pushes = [];
    devices.onChange((value) => pushes.push(value));
    vendorLevel = { name: 'ROG GLADIUS III WIRELESS AIMPOINT', value: { level: 64, charging: false, source: 'hid' } };
    devices.start();

    line(listLine([{ name: 'ROG GLADIUS III WIRELESS AIMPOINT', status: 'OK', battery: null, source: 'hid-wireless' }]));
    assert.deepEqual(pushes[1].devices.map((row) => row.battery), [64], 'the receiver level is merged on read');
    assert.equal(pushes[1].withBattery, 1);
    devices.stop();
  });

  it('one child per start; the only Node-side timer is the cold-output watchdog', () => {
    const devices = fresh();
    devices.start();
    devices.start();
    assert.equal(stats.spawn, 1, 'a second start() must not spawn a second sweeper');

    /* The five-minute sweep clock lives in the resident child. Node's timer is
     * the bounded first-output watchdog, not a second sweep loop. */
    mock.timers.tick(5 * 1000);
    assert.equal(stats.spawn, 1, 'nothing respawns before the watchdog deadline');

    devices.stop();
    devices.start();
    assert.equal(stats.spawn, 2, 'stop() then start() is one new child, not two');
    devices.stop();
  });

  it('the page refresh asks the vendor probe once', () => {
    const devices = fresh();
    devices.start();
    devices.refresh();
    assert.equal(battery.probes, 1);
    assert.equal(stats.spawn, 2, 'refresh restarts the stalled list probe as well');
    devices.setFocused(true);
    assert.deepEqual(battery.focused, [true]);
    devices.stop();
  });
});

describe('devices.ps1: the two-line protocol and the post-boot sweep', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  const number = (name) => Number((script.match(new RegExp('\\$' + name + ' = (\\d+)')) || [])[1]);

  it('prints the list before it prints the levels', () => {
    const listAt = script.indexOf("Write-Rows 'list'");
    const batteryAt = script.indexOf("Write-Rows 'battery'");
    assert.ok(listAt > 0, 'the list phase is emitted');
    assert.ok(batteryAt > 0, 'the battery phase is emitted');
    assert.ok(listAt < batteryAt, 'the fast half comes first');
  });

  it('sweeps every five minutes, with one catch-up sweep 10-30s after start', () => {
    assert.equal(number('SWEEP_MS'), 300000);
    const warmup = number('WARMUP_MS');
    assert.ok(warmup >= 10000 && warmup <= 30000, 'the catch-up sweep lands 10-30s after start, got ' + warmup);
    assert.ok(
      script.indexOf('$delay = $WARMUP_MS') > 0 && script.indexOf('$delay = $SWEEP_MS') > 0,
      'the first wait is the catch-up, every later wait is the clock',
    );
  });

  it('enumerates with fast class-filtered pnputil calls instead of cold WMI', () => {
    assert.doesNotMatch(script, /Get-CimInstance Win32_PnPEntity/);
    assert.match(script, /pnputil\.exe/);
    assert.match(script, /OEMCodePage/);
    assert.ok(!/Get-PnpDevice -Class/.test(script), 'the slow class queries are gone');
  });
});
