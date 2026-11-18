/**
 * Battery level, charging state, or nothing at all.
 *
 * Electron has no battery API beyond "am I on AC power", so each platform is
 * asked its own question: Windows through CIM, macOS through pmset. A desktop
 * with no battery answers null, and the island hides the component instead of
 * showing a permanent 100%.
 */
const platform = require('../platform');

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
  platform.runPowerShell(['-NoProfile', '-NonInteractive', '-Command', WINDOWS], { timeout: 6000 }).then((result) => {
    if (!result.ok || !result.stdout.trim()) return done(null);
    try {
      const value = JSON.parse(result.stdout.trim());
      const level = Number(value.EstimatedChargeRemaining);
      if (!Number.isFinite(level)) return done(null);
      done({ level: Math.max(0, Math.min(100, Math.round(level))), charging: Number(value.BatteryStatus) === 2 });
    } catch {
      done(null);
    }
  });
}

/** Call back with { level, charging } or null; never throws. */
function read(done) {
  // Windows-only: the app's runtime features are all PowerShell-backed. On
  // anything else the battery simply has no value, which the island hides.
  if (!platform.supports('battery')) {
    done(null);
    return;
  }
  readWindows(done);
}

module.exports = { read };
