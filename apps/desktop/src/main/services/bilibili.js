/**
 * A cover for a Bilibili live stream that Windows hands us no thumbnail for.
 *
 * The live page never sets MediaSession artwork, so its SMTC frame carries a
 * title and nothing else — there is no thumbnail to forward. The title is
 * still a pointer: Bilibili writes it as
 *
 *   "<stream title> - <anchor> - 哔哩哔哩直播，二次元弹幕直播平台"
 *
 * and the public live search endpoint maps the anchor to the room and its
 * cover. Neither the page nor a login is involved: one search request and one
 * image request, both anonymous.
 *
 * Failure is silent on purpose. A broadcast without a cover has to keep
 * playing and fall back to the skin's placeholder, so every path here resolves
 * to an empty string instead of throwing.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('bilibili-cover.ps1');
/** A cover belongs to one broadcast and does not change while it is on. */
const COVER_TTL = 6 * 60 * 60 * 1000;
/** A miss is a maybe: the search endpoint is rate limited and the network returns. */
const FAIL_TTL = 60 * 1000;
/** The script has its own request timeouts; this is the backstop for a hung child. */
const TIMEOUT_MS = 15000;
/** Enough channels for an evening of switching; anything older is re-fetched. */
const CACHE_MAX = 12;

/** The shape of a Bilibili live page title, as it reaches SMTC. */
const LIVE_TITLE = /^.*?\s+-\s+[^-]+?\s+-\s+哔哩哔哩直播/u;

/** Whether this frame is a Bilibili live broadcast by its title alone. */
function looksLive(title) {
  return typeof title === 'string' && LIVE_TITLE.test(title);
}

const covers = new Map();
const pending = new Map();

function remember(key, art) {
  covers.set(key, { art, at: Date.now() });
  if (covers.size > CACHE_MAX) covers.delete(covers.keys().next().value);
}

/**
 * The cover for one broadcast title, or '' when there is none.
 *
 * Repeated frames for the same broadcast are the normal case (one per second),
 * so a found cover is kept for hours and a miss is retried after a minute
 * instead of on every frame.
 */
function coverFor(title) {
  const key = String(title || '');
  if (!looksLive(key)) return Promise.resolve('');
  const hit = covers.get(key);
  if (hit && Date.now() - hit.at < (hit.art ? COVER_TTL : FAIL_TTL)) return Promise.resolve(hit.art);
  if (pending.has(key)) return pending.get(key);
  const task = lookup(key)
    .then((art) => {
      pending.delete(key);
      remember(key, art);
      return art;
    })
    .catch(() => {
      pending.delete(key);
      remember(key, '');
      return '';
    });
  pending.set(key, task);
  return task;
}

/** Run the PowerShell bridge and read one JSON line back. */
function lookup(title) {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const finish = (art) => {
      if (settled) return;
      settled = true;
      resolve(art);
    };
    const child = platform.spawnPowerShell(
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Title', title],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (!child) {
      resolve('');
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      finish('');
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      // A cover is a few hundred KB of base64; anything past that is a runaway.
      if (out.length > 4 * 1024 * 1024) {
        try {
          child.kill();
        } catch {
          // already gone
        }
        finish('');
      }
    });
    child.on('error', () => finish(''));
    child.on('exit', () => {
      clearTimeout(timer);
      const line = out
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith('{'));
      if (!line) {
        finish('');
        return;
      }
      try {
        const parsed = JSON.parse(line);
        finish(typeof parsed.art === 'string' && parsed.art.startsWith('data:image/') ? parsed.art : '');
      } catch {
        finish('');
      }
    });
  });
}

module.exports = { looksLive, coverFor };
