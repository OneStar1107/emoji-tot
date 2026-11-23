/**
 * Metadata for a Douyu live room.
 *
 * Windows reports the room title and anchor name, but not the room URL. The
 * public search endpoint maps those exact names to a room; its detail payload
 * supplies the stable cover, owner name and broadcast start time.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('douyu-live.ps1');
const INFO_TTL = 5 * 60 * 1000;
const FAIL_TTL = 30 * 1000;
const TIMEOUT_MS = 25000;
const CACHE_MAX = 16;
const BROWSER_SOURCES = ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'egolite', 'browser', 'chromium', 'douyu'];

const rooms = new Map();
const pending = new Map();

const text = (value) => String(value ?? '').trim();

/**
 * Whether a live frame is worth a Douyu lookup.
 *
 * A browser live stream with both a room title and anchor name is the shape
 * Windows exposes for Douyu. A strict exact-name match in the bridge makes a
 * miss harmless for YouTube, Twitch and other live sites.
 */
function looksCandidate(frame) {
  if (!frame || !frame.active || frame.duration || !text(frame.title) || !text(frame.artist)) return false;
  const source = text(frame.source).toLowerCase();
  return BROWSER_SOURCES.some((name) => source.includes(name));
}

/** Pick the room whose room name or anchor name matches the SMTC frame. */
function pickRoom(title, artist, list) {
  const wantTitle = text(title);
  const wantArtist = text(artist);
  const rooms = (Array.isArray(list) ? list : []).filter((room) => Number(room?.isLive) === 1);
  const byRoomTitle = rooms.find((room) => {
    const roomName = text(room?.roomName);
    const nickname = text(room?.nickName);
    return roomName === wantTitle && (!wantArtist || nickname === wantArtist);
  });
  if (byRoomTitle) return byRoomTitle;
  /* Some clients put the anchor name in the title and the room name in artist. */
  return rooms.find((room) => {
    const roomName = text(room?.roomName);
    const nickname = text(room?.nickName);
    return nickname === wantTitle && (!wantArtist || roomName === wantArtist);
  }) || null;
}

function remember(key, info) {
  rooms.set(key, { info, at: Date.now() });
  if (rooms.size > CACHE_MAX) rooms.delete(rooms.keys().next().value);
}

function infoFor(title, artist) {
  const key = JSON.stringify([text(title), text(artist)]);
  const hit = rooms.get(key);
  if (hit && Date.now() - hit.at < (hit.info ? INFO_TTL : FAIL_TTL)) return Promise.resolve(hit.info);
  if (pending.has(key)) return pending.get(key);
  const task = lookup(title, artist)
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

function lookup(title, artist) {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const finish = (info) => {
      if (settled) return;
      settled = true;
      resolve(info);
    };
    const child = platform.spawnPowerShell(
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        SCRIPT,
        '-Title',
        text(title),
        '-Artist',
        text(artist),
      ],
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
          platform: 'douyu',
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

module.exports = { infoFor, looksCandidate, pickRoom };
