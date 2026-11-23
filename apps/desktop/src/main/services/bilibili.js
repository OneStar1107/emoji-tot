/**
 * Metadata for a Bilibili live room.
 *
 * The live page's SMTC title is
 *
 *   "<stream title> - <anchor> - 哔哩哔哩直播，二次元弹幕直播平台"
 *
 * but its thumbnail is sometimes a 300px Bilibili placeholder. The public
 * search and room endpoints map the title to the authoritative room name,
 * anchor name, live start and stable cover. Failure is silent: playback keeps
 * its raw title and skin fallback rather than throwing.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('bilibili-cover.ps1');
/** Room titles can change, and a new broadcast has a new start time. */
const INFO_TTL = 5 * 60 * 1000;
/** A miss is a maybe: the search endpoint is rate limited and the network returns. */
const FAIL_TTL = 30 * 1000;
/** The script has its own request timeouts; this is the backstop for a hung child. */
const TIMEOUT_MS = 25000;
/** Enough channels for an evening of switching; anything older is re-fetched. */
const CACHE_MAX = 16;

/** The shape of a Bilibili live page title, as it reaches SMTC. */
const LIVE_TITLE = /^.*?\s+-\s+[^-]+?\s+-\s+哔哩哔哩直播/u;

/** Whether this frame is a Bilibili live broadcast by its title alone. */
function looksLive(title) {
  return typeof title === 'string' && LIVE_TITLE.test(title);
}

const rooms = new Map();
const pending = new Map();

function remember(key, info) {
  rooms.set(key, { info, at: Date.now() });
  if (rooms.size > CACHE_MAX) rooms.delete(rooms.keys().next().value);
}

/**
 * Room metadata for one broadcast title, or null when it cannot be resolved.
 *
 * Repeated frames for the same broadcast are the normal case (one per second),
 * so a hit stays cached briefly and a miss is retried after half a minute.
 */
function infoFor(title) {
  const key = String(title || '');
  if (!looksLive(key)) return Promise.resolve(null);
  const hit = rooms.get(key);
  if (hit && Date.now() - hit.at < (hit.info ? INFO_TTL : FAIL_TTL)) return Promise.resolve(hit.info);
  if (pending.has(key)) return pending.get(key);
  const task = lookup(key)
    .then((info) => {
      pending.delete(key);
      remember(key, info);
      return info;
    })
    .catch(() => {
      pending.delete(key);
      remember(key, null);
      return null;
    });
  pending.set(key, task);
  return task;
}

/** Run the PowerShell bridge and read one JSON line back. */
function lookup(title) {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const finish = (info) => {
      if (settled) return;
      settled = true;
      resolve(info);
    };
    const child = platform.spawnPowerShell(
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Title', title],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (!child) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      finish(null);
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      // A cover is a few hundred KB of base64; anything past that is a runaway.
      if (out.length > 8 * 1024 * 1024) {
        try {
          child.kill();
        } catch {
          // already gone
        }
        finish(null);
      }
    });
    child.on('error', () => finish(null));
    child.on('exit', () => {
      clearTimeout(timer);
      const line = out
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith('{'));
      if (!line) {
        finish(null);
        return;
      }
      try {
        const parsed = JSON.parse(line);
        if (parsed.ok !== true || !parsed.roomTitle || !parsed.anchorName) {
          finish(null);
          return;
        }
        finish({
          platform: 'bilibili',
          roomId: String(parsed.roomId || ''),
          roomTitle: String(parsed.roomTitle),
          anchorName: String(parsed.anchorName),
          startedAt: Number(parsed.startedAt) || 0,
          art: typeof parsed.art === 'string' && parsed.art.startsWith('data:image/') ? parsed.art : '',
        });
      } catch {
        finish(null);
      }
    });
  });
}

/** Kept as a narrow cover-only view for callers that do not need metadata. */
function coverFor(title) {
  return infoFor(title).then((info) => info?.art || '');
}

module.exports = { looksLive, infoFor, coverFor };
