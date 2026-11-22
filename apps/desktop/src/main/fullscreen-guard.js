/**
 * Confirm full-screen edges before acting on them.
 *
 * The watcher samples every two seconds. A screenshot/snipping overlay can
 * cover the screen for one sample and then vanish; requiring two adjacent
 * samples suppresses that false edge without adding a second timer.
 */
function createFullscreenGuard({ hideAfter = 2, showAfter = 2 } = {}) {
  const hideCount = Math.max(1, Math.trunc(Number(hideAfter) || 2));
  const showCount = Math.max(1, Math.trunc(Number(showAfter) || 2));
  let active = false;
  let streak = 0;
  let sample = null;

  return {
    push(full) {
      const next = full === true;
      if (next !== sample) {
        sample = next;
        streak = 0;
      }
      streak += 1;
      if (next && !active && streak >= hideCount) {
        active = true;
        return 'hide';
      }
      if (!next && active && streak >= showCount) {
        active = false;
        return 'show';
      }
      return null;
    },
    reset() {
      active = false;
      streak = 0;
      sample = null;
    },
    get active() {
      return active;
    },
  };
}

module.exports = { createFullscreenGuard };
