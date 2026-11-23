import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isChineseLocale, localizeDeviceName } = require('../src/main/device-names.js');

describe('device names: display localization without changing device identity', () => {
  it('uses the names shown by Armoury Crate in Chinese locales', () => {
    assert.equal(localizeDeviceName('ROG AZOTH', 'zh-CN'), 'ROG 夜魔');
    assert.equal(
      localizeDeviceName('ROG GLADIUS III WIRELESS AIMPOINT', 'zh-TW'),
      'ROG 战刃 3 无线 AimPoint',
    );
  });

  it('recognizes every Chinese locale variant', () => {
    for (const locale of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-HK', 'zh-TW']) {
      assert.equal(isChineseLocale(locale), true, locale);
    }
    for (const locale of ['en-US', 'ja-JP', 'ko-KR', 'de-DE', '']) {
      assert.equal(isChineseLocale(locale), false, locale);
    }
  });

  it('keeps the PnP name in non-Chinese locales', () => {
    assert.equal(localizeDeviceName('ROG AZOTH', 'en-US'), 'ROG AZOTH');
    assert.equal(
      localizeDeviceName('ROG GLADIUS III WIRELESS AIMPOINT', 'ja-JP'),
      'ROG GLADIUS III WIRELESS AIMPOINT',
    );
  });

  it('falls back to the original name for unknown hardware', () => {
    assert.equal(localizeDeviceName('Xbox Wireless Controller', 'zh-CN'), 'Xbox Wireless Controller');
    assert.equal(localizeDeviceName('USB Composite Device', 'zh-CN'), 'USB Composite Device');
  });

  it('matches names case-insensitively but preserves unknown text verbatim', () => {
    assert.equal(localizeDeviceName('rog azoth', 'zh-CN'), 'ROG 夜魔');
    assert.equal(localizeDeviceName('  FlyDigi BS2PRO  ', 'zh-CN'), '  FlyDigi BS2PRO  ');
    assert.equal(localizeDeviceName('', 'zh-CN'), '');
    assert.equal(localizeDeviceName(null, 'zh-CN'), '');
  });
});
