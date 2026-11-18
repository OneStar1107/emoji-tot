/**
 * Battery level, charging state, or nothing at all.
 *
 * Electron has no battery API beyond "am I on AC power", so each platform is
 * asked its own question: Windows through CIM, macOS through pmset. A desktop
 * with no battery answers null, and the island hides the component instead of
 * showing a permanent 100%.
 */
const { execFile } = require('node:child_process');

/*
 * ConvertTo-Json, not a hand-built string.
 *
 * The first version interpolated into JSON inside a PowerShell double-quoted
 * string, which PowerShell does not escape with backslashes: the command threw
 * a ParserError, the callback got empty stdout, and the battery simply never
 * appeared. Letting PowerShell serialise its own object removes every quote
 * and every $() from the command.
 */
const WINDOWS = "Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress";

function readWindows(done) {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS], { windowsHide: true, timeout: 6000 }, (error, stdout) => {
    if (error || !stdout || !stdout.trim()) return done(null);
    try {
      const value = JSON.parse(stdout.trim());
      const level = Number(value.EstimatedChargeRemaining);
      if (!Number.isFinite(level)) return done(null);
      done({ level: Math.max(0, Math.min(100, Math.round(level))), charging: Number(value.BatteryStatus) === 2 });
    } catch {
      done(null);
    }
  });
}

function readMac(done) {
  execFile('pmset', ['-g', 'batt'], { timeout: 4000 }, (error, stdout) => {
    if (error || !stdout) return done(null);
    if (/no batteries|AC Power/i.test(stdout) && !/%/.test(stdout)) return done(null);
    const level = /(\d+)%/.exec(stdout);
    if (!level) return done(null);
    done({ level: Number(level[1]), charging: /AC Power|charging/i.test(stdout) });
  });
}

/** Call back with { level, charging } or null; never throws. */
function read(done) {
  if (process.platform === 'win32') return readWindows(done);
  if (process.platform === 'darwin') return readMac(done);
  done(null);
}

module.exports = { read };
