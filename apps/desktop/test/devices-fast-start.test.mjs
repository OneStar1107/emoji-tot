import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyDeviceSnapshot } from '../src/main/device-cache.js';

const here = dirname(fileURLToPath(import.meta.url));
const devices = readFileSync(resolve(here, '..', 'src', 'main', 'services', 'devices.js'), 'utf8');
const script = readFileSync(resolve(here, '..', 'src', 'main', 'services', 'devices.ps1'), 'utf8');
const settings = readFileSync(resolve(here, '..', 'src', 'renderer', 'settings.js'), 'utf8');
const island = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');

describe('devices: cache first, then a bounded live probe', () => {
  it('labels a cold snapshot as scanning instead of empty', () => {
    assert.deepEqual(classifyDeviceSnapshot({
      devices: [],
      cachedAt: 0,
      scanning: true,
    }), {
      devices: [],
      cachedAt: 0,
      scanning: true,
    });
    assert.match(settings, /devices\.scanning/);
    assert.match(island, /正在检测外设/);
  });

  it('uses fast connected-class pnputil queries instead of a full cold WMI sweep', () => {
    assert.match(script, /\/enum-devices/);
    assert.match(script, /Bluetooth/);
    assert.match(script, /HIDClass/);
    assert.match(script, /Mouse/);
    assert.match(script, /Keyboard/);
    assert.doesNotMatch(script, /Get-CimInstance Win32_PnPEntity/);
    assert.match(script, /OEMCodePage/);
  });

  it('persists the last list and restarts a child that never emits', () => {
    assert.match(devices, /cachePath\('devices'\)/);
    assert.match(devices, /FIRST_OUTPUT_TIMEOUT_MS/);
    assert.match(devices, /restartProbe/);
  });
});
