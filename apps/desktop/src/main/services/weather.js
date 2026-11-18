/**
 * Weather through Open-Meteo: free, keyless, no account.
 *
 * The request runs in a PowerShell child, not in this process. Electron's main
 * process shares Chromium's network stack, and on this machine every HTTPS
 * request from it timed out while PowerShell reached the same host instantly;
 * a fifteen-minute refresh does not justify fighting that. The city travels as
 * base64 so a Chinese name survives the argv encoding on Windows.
 *
 * Results are cached so a flaky network shows the last good reading instead of
 * an empty card, and a failed lookup never throws.
 */
const platform = require('../platform');
const path = require('node:path');
const { cachePath, readJson, writeJson, scriptFile } = require('../paths');

const CACHE_TTL = 10 * 60 * 1000;
const SCRIPT = scriptFile('weather.ps1');

/** WMO weather codes, the vocabulary Open-Meteo answers in. */
const CODE_ZH = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '小毛雨', 53: '毛雨', 55: '大毛雨',
  56: '冻毛雨', 57: '强冻毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
  80: '阵雨', 81: '强阵雨', 82: '暴雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷暴', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹',
};

const CODE_ICON = {
  0: 'sun', 1: 'sun-cloud', 2: 'cloud', 3: 'cloud',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'rain', 66: 'rain', 67: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'rain', 85: 'snow', 86: 'snow',
  95: 'storm', 96: 'storm', 99: 'storm',
};

const describe = (code) => ({
  code,
  text: CODE_ZH[code] ?? '未知',
  icon: CODE_ICON[code] ?? 'cloud',
});

function cacheFile() {
  return cachePath('weather');
}

/** Ask the child process; resolve the raw object or reject with a reason. */
async function fetchRemote(city, autoLocate) {
  const encoded = Buffer.from(city, 'utf8').toString('base64');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT];
  if (autoLocate) args.push('-AutoLocate');
  else args.push('-CityB64', encoded);
  const result = await platform.runPowerShell(args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  if (!result.ok) throw new Error(String(result.stderr || result.error).trim().slice(0, 200));
  const text = result.stdout.trim();
  if (!text || text === 'null') throw new Error('city not found');
  return JSON.parse(text);
}

function normalize(raw) {
  const current = raw.current ?? {};
  const daily = raw.daily ?? {};
  const days = (daily.time ?? []).map((date, index) => ({
    date,
    ...describe(daily.weather_code?.[index]),
    max: Math.round(daily.temperature_2m_max?.[index] ?? 0),
    min: Math.round(daily.temperature_2m_min?.[index] ?? 0),
    rain: daily.precipitation_probability_max?.[index] ?? 0,
  }));
  return {
    place: { name: raw.place?.name ?? '', country: raw.place?.country ?? '', lat: raw.place?.lat, lon: raw.place?.lon },
    current: {
      temp: Math.round(current.temperature_2m ?? 0),
      feels: Math.round(current.apparent_temperature ?? 0),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      wind: Math.round(current.wind_speed_10m ?? 0),
      rain: current.precipitation ?? 0,
      sunrise: daily.sunrise?.[0] ?? '',
      sunset: daily.sunset?.[0] ?? '',
      ...describe(current.weather_code ?? 0),
    },
    days,
    fetchedAt: Date.now(),
  };
}

/** Last good reading, used while the network is unreachable. */
function cached() {
  const raw = readJson(cacheFile(), null);
  return raw && raw.data ? raw.data : null;
}

/**
 * Resolve a city and its forecast. Cached for ten minutes per city, so opening
 * the island repeatedly costs one child process, not one per open.
 */
async function load(city, autoLocate) {
  const file = cacheFile();
  // "auto" is its own cache slot: switching back to a named city must not
  // reuse the coordinates the locator happened to find.
  const key = autoLocate ? 'auto' : city;
  const saved = readJson(file, null);
  if (saved && saved.city === key && saved.data && Date.now() - saved.data.fetchedAt < CACHE_TTL) {
    return saved.data;
  }
  const data = normalize(await fetchRemote(city, autoLocate));
  writeJson(file, { city: key, data });
  return data;
}

module.exports = { load, cached, describe };