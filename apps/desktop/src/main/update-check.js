/**
 * GitHub latest-release check.
 *
 * The network half is deliberately small and one-way: it tells the existing
 * update card that a newer release exists and publishes a status snapshot for
 * About. It never downloads, installs, or blocks boot.
 */
const REPO = 'OneStar1107/emoji-tot';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer = null;
let inFlight = null;
let status = {
  state: 'idle',
  currentVersion: '',
  latestVersion: '',
  checkedAt: 0,
  error: '',
  releasesUrl: RELEASES_URL,
};

function versionParts(value) {
  const text = String(value ?? '').trim().replace(/^v/i, '');
  if (!/^\d+(?:\.\d+){0,3}$/.test(text)) return null;
  const parts = text.split('.').map((part) => Number(part));
  while (parts.length < 4) parts.push(0);
  return parts;
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function cleanNote(line) {
  return String(line ?? '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function notesFromRelease(body) {
  const notes = [];
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const trimmed = String(raw ?? '').trimStart();
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    const listed = /^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
    if (!listed) continue;
    const line = cleanNote(trimmed);
    if (!line || /^\d+(?:\.\d+){1,3}$/.test(line)) continue;
    notes.push(line.slice(0, 160));
    if (notes.length === 2) break;
  }
  return notes;
}

function readLatestRelease(release) {
  if (!release || typeof release !== 'object' || release.draft === true || release.prerelease === true) return null;
  const version = String(release.tag_name ?? '').trim().replace(/^v/i, '').slice(0, 32);
  if (!versionParts(version)) return null;
  return { version, notes: notesFromRelease(release.body) };
}

function snapshot() {
  return { ...status };
}

function publish(next, onChange) {
  status = { ...status, ...next };
  try {
    onChange?.(snapshot());
  } catch {
    // A status listener must not break the background check.
  }
  return snapshot();
}

async function checkNow({
  currentVersion,
  prompt = null,
  onChange = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  if (inFlight) return inFlight;
  const current = String(currentVersion ?? '').trim().replace(/^v/i, '');
  publish({ state: 'checking', currentVersion: current, error: '' }, onChange);
  inFlight = (async () => {
    try {
      if (typeof fetchImpl !== 'function') throw new Error('network unavailable');
      const response = await fetchImpl(API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EmojiTot-Desktop',
        },
        signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 8000)),
      });
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      const release = readLatestRelease(await response.json());
      if (!release) throw new Error('no stable release');
      const available = compareVersions(release.version, current) > 0;
      const next = publish({
        state: available ? 'available' : 'current',
        latestVersion: release.version,
        checkedAt: Date.now(),
        error: '',
      }, onChange);
      if (available) prompt?.notifyAvailable?.({ version: release.version, notes: release.notes });
      return next;
    } catch (error) {
      return publish({
        state: 'error',
        checkedAt: Date.now(),
        error: String(error?.message ?? error).slice(0, 200),
      }, onChange);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function start(options = {}) {
  clearInterval(timer);
  void checkNow(options);
  timer = setInterval(() => void checkNow(options), CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = {
  API_URL,
  CHECK_INTERVAL_MS,
  RELEASES_URL,
  compareVersions,
  checkNow,
  notesFromRelease,
  readLatestRelease,
  snapshot,
  start,
  stop,
};
