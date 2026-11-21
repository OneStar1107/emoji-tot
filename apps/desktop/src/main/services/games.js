/**
 * Foreground game detection: the third media signal.
 *
 * The check is a resident PowerShell child printing the foreground window's
 * executable name once a second — the same enumeration avoidance.ps1 uses
 * (QueryFullProcessImageName on the foreground window), so the app has one
 * answer to "which process owns the screen" instead of two.
 *
 * A game is a name on the list below, never a guess about pixels or window
 * size: a list is auditable, and a wrong entry costs one setting instead of a
 * change of behaviour nobody can explain.
 */
const platform = require('../platform');
const path = require('node:path');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('games.ps1');

/**
 * Executables that mean "the person is playing".
 *
 * Process image names, lowercased, because that is what the child prints. A
 * launcher is not a game: steam.exe, epicgameslauncher.exe and battle.net.exe
 * stay off the list, or the face would turn Focused every time the launcher
 * was in front.
 */
const KNOWN_GAMES = Object.freeze([
  'cs2.exe', 'csgo.exe',
  'valorant.exe', 'valorant-win64-shipping.exe',
  'leagueclientux.exe', 'league of legends.exe', 'leagueclient.exe',
  'dota2.exe', 'overwatch.exe', 'r5apex.exe', 'tslgame.exe',
  'genshinimpact.exe', 'yuanshen.exe', 'starrail.exe', 'zenlesszonezero.exe',
  'wutheringwaves.exe', 'honkai3rd.exe',
  'minecraft.exe', 'terraria.exe', 'stardew valley.exe',
  'hades.exe', 'hades2.exe', 'palworld.exe', 'among us.exe',
  'eldenring.exe', 'sekiro.exe', 'dark souls iii.exe', 'cyberpunk2077.exe',
  'witcher3.exe', 'baldurs gate 3.exe', 'bg3.exe', 'gta5.exe',
  'rocketleague.exe', 'fall guys.exe', 'osu!.exe', 'hearthstone.exe',
  'wow.exe', 'destiny2.exe', 'warframe.x64.exe', 'pathofexile.exe',
  'rustclient.exe', 'monsterhunterworld.exe', 'mhw.exe',
]);

let proc = null;
let stopped = true;
let last = '';
let onState = null;

function apply(name) {
  if (name === last) return;
  last = name;
  try {
    onState?.(name);
  } catch {
    // A broken handler must not stop the watcher.
  }
}

function start(handler) {
  stop();
  stopped = false;
  onState = handler;
  last = '';
  proc = platform.spawnPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (!proc) {
    proc = null;
    return;
  }
  proc.stdout.setEncoding('utf8');
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) apply(line.trim().toLowerCase());
  });
  const self = proc;
  proc.on('exit', () => {
    if (proc !== self) return;
    proc = null;
    if (!stopped) setTimeout(() => start(handler), 3000);
  });
}

function stop() {
  stopped = true;
  onState = null;
  last = '';
  if (proc) {
    try {
      proc.kill();
    } catch {
      // already gone
    }
    proc = null;
  }
}

/** The foreground executable right now, lowercased; empty when unknown. */
function current() {
  return last;
}

function isGame(name) {
  return KNOWN_GAMES.includes(String(name || '').toLowerCase());
}

module.exports = { start, stop, current, isGame, KNOWN_GAMES };
