import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkNow,
  compareVersions,
  notesFromRelease,
  readLatestRelease,
} from '../src/main/update-check.js';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const src = (path) => readFileSync(join(desktop, 'src', path), 'utf8');

describe('release updates', () => {
  it('compares four-part versions numerically', () => {
    assert.equal(compareVersions('v0.8.18.14', '0.8.18.13'), 1);
    assert.equal(compareVersions('0.8.18', '0.8.18.0'), 0);
    assert.equal(compareVersions('0.8.17.99', '0.8.18'), -1);
    assert.equal(compareVersions('junk', '0.8.18'), 0);
  });

  it('uses only the latest release tag and clean note lines', () => {
    const release = {
      tag_name: 'v0.8.18.14',
      body: [
        '## 0.8.18.14',
        '- 修复灵动岛重影',
        '- 外设冷启动立即检测',
        '- [下载](https://example.invalid)',
        '',
      ].join('\n'),
      draft: false,
      prerelease: false,
    };
    assert.deepEqual(readLatestRelease(release), {
      version: '0.8.18.14',
      notes: ['修复灵动岛重影', '外设冷启动立即检测'],
    });
    assert.deepEqual(notesFromRelease('### Changes\n\n* one\n* two\n'), ['one', 'two']);
  });

  it('notifies the optional update card only when the release is newer', async () => {
    const prompted = [];
    const status = await checkNow({
      currentVersion: '0.8.18.13',
      prompt: { notifyAvailable: (value) => prompted.push(value) },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          tag_name: 'v0.8.18.14',
          body: '- 修复灵动岛重影\n- 外设冷启动立即检测',
          draft: false,
          prerelease: false,
        }),
      }),
    });
    assert.equal(status.state, 'available');
    assert.equal(status.latestVersion, '0.8.18.14');
    assert.deepEqual(prompted, [{
      version: '0.8.18.14',
      notes: ['修复灵动岛重影', '外设冷启动立即检测'],
    }]);
  });

  it('wires a non-blocking checker into boot and About', () => {
    const main = src('main.js');
    const settings = src('renderer/settings.js');
    const i18n = src('renderer/i18n.js');
    assert.match(main, /updateCheck\.start/);
    assert.match(main, /updateCheck\.snapshot/);
    assert.match(settings, /about\.update/);
    assert.match(i18n, /about\.update\./);
  });
});
