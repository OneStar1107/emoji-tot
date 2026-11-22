/**
 * Weather's one promise about failure: an auto-locate that cannot answer on
 * this refresh must not replace the city it answered on the last one.
 *
 * The PowerShell child is stubbed, not written around: runPowerShell is the
 * single seam the service has with the outside world, so the tests can pin the
 * three outcomes that matter (located, located yesterday, never located) with
 * no network and no Electron window.
 *
 * Run: node --test test/weather.test.mjs
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Module = require('node:module');

/** A throwaway userData per test: caches are files, so the directory is the state. */
let dataDir = mkdtempSync(join(tmpdir(), 'emojitot-weather-'));

const originalLoad = Module._load;
Module._load = function patched(request) {
  if (request === 'electron') {
    return { app: { getPath: () => dataDir } };
  }
  return originalLoad.apply(this, arguments);
};

const platform = require('../src/main/platform.js');
const paths = require('../src/main/paths.js');

/**
 * One script answer: the place the child resolved plus the reading Open-Meteo
 * would have returned for it.
 */
function reading(place) {
  return {
    place,
    source: 'test',
    log: [],
    current: {
      temperature_2m: 21,
      apparent_temperature: 20,
      relative_humidity_2m: 56,
      precipitation: 0,
      weather_code: 3,
      wind_speed_10m: 9,
    },
    daily: {
      time: ['2026-11-22'],
      weather_code: [3],
      temperature_2m_max: [25],
      temperature_2m_min: [17],
      precipitation_probability_max: [10],
      sunrise: ['2026-11-22T06:48'],
      sunset: ['2026-11-22T17:39'],
    },
    hourly: {
      time: ['2026-11-22T15:00', '2026-11-22T16:00'],
      weather_code: [3, 3],
      temperature_2m: [21, 22],
      precipitation_probability: [0, 0],
    },
  };
}

const GUANGZHOU = { name: '广州', country: '中国', lat: 23.02, lon: 113.35 };
const HONG_KONG = { name: '香港', country: '中国香港', lat: 22.32, lon: 114.17 };

/** What the locator chain answers; a test swaps in a failure. */
let locator = () => ({ ok: true, stdout: JSON.stringify(reading(GUANGZHOU)) });
/** What geocoding + forecast answer for a named city. */
let cityLookup = (name) => ({
  ok: true,
  stdout: JSON.stringify(reading(name === '香港' ? HONG_KONG : { ...HONG_KONG, name })),
});

const calls = [];

/* The seam: weather.js calls platform.runPowerShell at request time, so
   replacing the property here is the same object the service holds. */
platform.runPowerShell = async (args) => {
  calls.push(args.join(' '));
  // -AutoLocate is the system/IP chain; -Lat/-Lon is the forecast for a place
  // a previous locate settled on. Both are "the locator".
  if (args.includes('-AutoLocate') || args.includes('-Lat')) return locator();
  return cityLookup('香港');
};

let weather;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'emojitot-weather-'));
  calls.length = 0;
  locator = () => ({ ok: true, stdout: JSON.stringify(reading(GUANGZHOU)) });
  cityLookup = (name) => ({
    ok: true,
    stdout: JSON.stringify(reading(name === '香港' ? HONG_KONG : { ...HONG_KONG, name })),
  });
  // failure and the locate cache are module state; a fresh require is the
  // cheapest honest reset and matches a new app boot.
  delete require.cache[require.resolve('../src/main/services/weather.js')];
  weather = require('../src/main/services/weather.js');
});

describe('weather: auto-locate', () => {
  it("uses the locator's city, not the manual fallback", async () => {
    const data = await weather.load('香港', true);
    assert.equal(data.place.name, '广州');
    assert.ok(calls.some((call) => call.includes('-AutoLocate')), 'the locator ran');
    assert.ok(!calls.some((call) => call.includes('-CityB64')), 'the manual city was not needed');
  });

  it('keeps a named city when auto-locate is off', async () => {
    const data = await weather.load('香港', false);
    assert.equal(data.place.name, '香港');
    assert.ok(calls.some((call) => call.includes('-CityB64')));
    assert.ok(!calls.some((call) => call.includes('-AutoLocate')), 'a manual city never asks the locator');
  });
});

describe('weather: failed locate keeps a place', () => {
  it('falls back to the manual city when the locator answers nothing', async () => {
    locator = () => ({ ok: true, stdout: 'null' });
    const data = await weather.load('香港', true);
    assert.equal(data.place.name, '香港');
    assert.ok(calls.some((call) => call.includes('-AutoLocate')), 'the locator was tried first');
    assert.ok(calls.some((call) => call.includes('-CityB64')), 'then the manual city');
  });

  it('keeps the last located reading when a later locate fails', async () => {
    const first = await weather.load('香港', true);
    assert.equal(first.place.name, '广州');
    // Age the reading past CACHE_TTL but keep the coordinates the locator
    // saved, so the second refresh takes the "forecast a known place" branch.
    const file = paths.cachePath('weather');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    saved.data.fetchedAt = Date.now() - 11 * 60 * 1000;
    paths.writeJson(file, saved);
    locator = () => ({ ok: false, error: 'offline' });
    calls.length = 0;
    const second = await weather.load('香港', true);
    assert.equal(second.place.name, '广州', 'the last located city outlives a flaky network');
    assert.ok(!calls.some((call) => call.includes('-CityB64')), 'the stale located city beats the manual fallback');
  });

  it('does not repeat both lookups for a second open within thirty seconds', async () => {
    locator = () => ({ ok: true, stdout: 'null' });
    const first = await weather.load('香港', true);
    const count = calls.length;
    const second = await weather.load('香港', true);
    assert.equal(second.place.name, first.place.name);
    assert.equal(calls.length, count, 'the fallback is remembered, not re-fetched');
  });
});
