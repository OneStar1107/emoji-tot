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
/*
 * The place is cached for half an hour: the locate chain (the system locator
 * plus three IP services) is the slow, rate-limited half, and a city does not
 * move between two five-minute refreshes. The reading above it still refreshes
 * every ten minutes.
 */
const LOCATE_TTL = 30 * 60 * 1000;

/*
 * The cache file is not just the reading: a build that adds a field has to
 * invalidate the old file, or the island shows yesterday's shape for ten
 * minutes / until the next scheduled refresh. Bump this whenever normalize()
 * starts returning a field the page needs.
 */
const CACHE_VERSION = 2;
/*
 * Twelve hours, starting at the next whole hour. Open-Meteo returns whole
 * hours from the current one, so the first entry is the hour already on the
 * clock and "未来 12 小时" is the twelve after it.
 */
const HOURS = 12;

/**
 * How long a failed lookup is remembered, in this process only.
 *
 * A failure is never written to disk: the next five-minute tick should try
 * again. But the island can open, a settings refresh can be asked for and the
 * timer can tick within seconds of each other, and each of those used to spawn
 * another PowerShell round-trip against a network already known to be down.
 * Thirty seconds folds that burst into one attempt.
 */
const FAILURE_TTL = 30 * 1000;
/** The last failed lookup: { key, at, message }. */
let failure = null;
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

function locateFile() {
  return cachePath('weather-locate');
}

/** The place the locate chain settled on, while it is under half an hour old. */
function cachedPlace() {
  const saved = readJson(locateFile(), null);
  const place = saved && saved.place;
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return null;
  return Date.now() - Number(saved.at) < LOCATE_TTL ? place : null;
}

/** Remember a fresh place; the forecast may refresh sooner than the place. */
function savePlace(place) {
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return;
  writeJson(locateFile(), {
    at: Date.now(),
    place: {
      name: place.name ?? '',
      country: place.country ?? '',
      lat: Number(place.lat),
      lon: Number(place.lon),
      /* The district is what the page leads with; a cached place without one
         still works (the city name takes its place). */
      district: String(place.district ?? ''),
    },
  });
}

const SCRIPT_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT];

/** Chinese city names travel as base64 so they survive the argv encoding. */
const encode = (text) => Buffer.from(text, 'utf8').toString('base64');

/** Ask the child process; resolve the raw object or reject with a reason. */
async function runWeather(args, timeout) {
  const result = await platform.runPowerShell([...SCRIPT_ARGS, ...args], { timeout, maxBuffer: 2 * 1024 * 1024 });
  if (!result.ok) throw new Error(String(result.stderr || result.error).trim().slice(0, 200));
  const text = result.stdout.trim();
  if (!text || text === 'null') throw new Error('city not found');
  return JSON.parse(text);
}

/** A named city: geocode it, then forecast it. */
function fetchCity(city) {
  return runWeather(['-CityB64', encode(city)], 30000);
}

/**
 * The locate chain: Windows location first, then the IP services. It returns
 * the place and the reading in one call, and prints the chain's own log lines
 * so the terminal says which step answered and which city it found.
 */
async function fetchAuto() {
  const raw = await runWeather(['-AutoLocate'], 60000);
  for (const line of Array.isArray(raw.log) ? raw.log : []) console.log('[weather] ' + line);
  return raw;
}

/** Forecast for coordinates a previous locate settled on. */
function fetchCoordinates(place) {
  const args = ['-Lat', String(place.lat), '-Lon', String(place.lon)];
  if (place.name) args.push('-NameB64', encode(place.name));
  if (place.country) args.push('-CountryB64', encode(place.country));
  return runWeather(args, 30000);
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
  /* Whole hours in, whole hours out: the strip shows HH and a number, not a
     minute nobody reads. Open-Meteo starts at the hour already on the clock,
     so the first entry is skipped and the strip is the twelve after now. */
  const hourly = (raw.hourly?.time ?? [])
    .slice(1, HOURS + 1)
    .map((time, index) => ({
      time,
      ...describe(raw.hourly.weather_code?.[index + 1]),
      temp: Math.round(raw.hourly.temperature_2m?.[index + 1] ?? 0),
      rain: raw.hourly.precipitation_probability?.[index + 1] ?? 0,
    }));
  return {
    place: {
      name: raw.place?.name ?? '',
      country: raw.place?.country ?? '',
      district: String(raw.place?.district ?? ''),
      lat: raw.place?.lat,
      lon: raw.place?.lon,
    },
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
    hourly,
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
 *
 * A failed auto-locate is a degraded refresh, not an empty page: it falls back
 * to the last reading the locator produced, then to the city preference. The
 * fallback is remembered in memory for FAILURE_TTL so a burst of window opens
 * does not repeat both lookups, but it is never written to the cache file, so
 * the refresh after that window asks the locator again.
 */
async function load(city, autoLocate) {
  const file = cacheFile();
  // "auto" is its own cache slot: switching back to a named city must not
  // reuse the coordinates the locator happened to find.
  const key = autoLocate ? 'auto' : city;
  const saved = readJson(file, null);
  const stored = saved && saved.city === key && saved.v === CACHE_VERSION && saved.data ? saved.data : null;
  if (stored && Date.now() - stored.fetchedAt < CACHE_TTL) {
    return stored;
  }
  if (failure && failure.key === key && Date.now() - failure.at < FAILURE_TTL) {
    if (failure.data) return failure.data;
    throw new Error(failure.message);
  }
  let data;
  try {
    if (!autoLocate) {
      data = normalize(await fetchCity(city));
    } else {
      const known = cachedPlace();
      if (known) {
        data = normalize(await fetchCoordinates(known));
      } else {
        const raw = await fetchAuto();
        data = normalize(raw);
        savePlace(raw.place);
      }
    }
  } catch (error) {
    const message = String(error?.message ?? error);
    /*
     * The machine has not moved: last half hour's city still describes it, so
     * keep that reading while the locator is unreachable. Only a machine that
     * has never located anything falls back to the manual city, which is 香港
     * until a person picks one. A named city never falls back — the person
     * asked for that exact place and a guess would be worse than the error.
     */
    if (autoLocate) {
      if (stored) {
        console.warn('[weather] locate failed, keeping the last reading:', message);
        failure = { key, at: Date.now(), message, data: stored };
        return stored;
      }
      try {
        const fallback = normalize(await fetchCity(city));
        console.warn('[weather] locate failed, using the city preference ' + city + ':', message);
        failure = { key, at: Date.now(), message, data: fallback };
        return fallback;
      } catch {
        // Both halves are down; the locator's reason is the one worth showing.
      }
    }
    failure = { key, at: Date.now(), message };
    throw error;
  }
  failure = null;
  writeJson(file, { city: key, v: CACHE_VERSION, data });
  return data;
}

module.exports = { load, cached, describe };