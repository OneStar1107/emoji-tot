import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loginItemOptions } from '../src/main/login-item.js';

describe('launch-at-login target', () => {
  it('uses the launcher path inherited from the native wrapper', () => {
    assert.deepEqual(
      loginItemOptions(true, 'C:\\Program Files\\EmojiTot\\EmojiTotRuntime.exe', {
        EMOJITOT_LAUNCHER: 'D:\\项目\\EmojiTot.exe',
      }),
      { openAtLogin: true, path: 'D:\\项目\\EmojiTot.exe' },
    );
  });

  it('uses the running executable for development launches', () => {
    assert.deepEqual(
      loginItemOptions(false, 'C:\\EmojiTot\\EmojiTotRuntime.exe', {}),
      { openAtLogin: false, path: 'C:\\EmojiTot\\EmojiTotRuntime.exe' },
    );
  });
});
