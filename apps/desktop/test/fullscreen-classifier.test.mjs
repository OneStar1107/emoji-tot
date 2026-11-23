import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const WINDOWS_ONLY = process.platform === 'win32' ? describe : describe.skip;
const SCRIPT = fileURLToPath(new URL('../src/main/services/fullscreen.ps1', import.meta.url));
const POWERSHELL = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

function classify(target) {
  const result = spawnSync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Classify', target],
    { encoding: 'utf8', windowsHide: true, timeout: 3000 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

WINDOWS_ONLY('full-screen classifier', () => {
  it('does not treat the Windows desktop shell as a full-screen app', () => {
    const state = classify('shell');
    assert.equal(state.fullscreen, false);
    assert.equal(state.reason, 'shell-window');
  });

  it('does not treat EmojiTot itself as the full-screen app', () => {
    const state = classify('self');
    assert.equal(state.fullscreen, false);
    assert.equal(state.reason, 'self');
  });
});
