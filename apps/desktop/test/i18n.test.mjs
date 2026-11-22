/**
 * The settings window's dictionary, as tests.
 *
 * The window is bilingual now, and the failure mode of a dictionary is silent:
 * the English page simply keeps a Chinese row, or a missing key renders as
 * "general.language.label" in the middle of the UI. Both are cheap to check
 * statically, so they are checked here instead of being found by eye.
 *
 * Run: node --test test/i18n.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, MESSAGES, keysOf, translate } from '../src/renderer/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

/**
 * Every {placeholder} a value uses, as a sorted set, so zh and en can be compared.
 *
 * A set, not a list: a plural pair ("{n} item|{n} items") repeats the placeholder
 * once per branch, and the Chinese line only needs it once.
 */
const placeholders = (value) =>
  [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('i18n: the two tables describe the same interface', () => {
  it('ships exactly the two languages the switch offers', () => {
    assert.deepEqual(LANGS, ['zh', 'en']);
    assert.deepEqual(Object.keys(MESSAGES).sort(), ['en', 'zh']);
  });

  it('has the same key set in zh and en', () => {
    const zh = keysOf('zh');
    const en = keysOf('en');
    assert.deepEqual(zh.filter((key) => !en.includes(key)), [], 'keys only in zh');
    assert.deepEqual(en.filter((key) => !zh.includes(key)), [], 'keys only in en');
    assert.ok(zh.length > 300, 'the dictionary should cover the whole window, not a sample');
  });

  it('gives every key a non-empty value in both languages', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        assert.equal(typeof value, 'string', lang + '.' + key + ' is not a string');
        assert.ok(value.trim().length > 0, lang + '.' + key + ' is empty');
      }
    }
  });

  it('uses the two-branch plural form when it uses one at all', () => {
    for (const key of keysOf('zh')) {
      assert.ok(MESSAGES.zh[key].split('|').length <= 2, key + ' has more than one pipe in zh');
      assert.ok(MESSAGES.en[key].split('|').length <= 2, key + ' has more than one pipe in en');
    }
  });

  it('keeps the placeholders identical, so no translation drops a number', () => {
    for (const key of keysOf('zh')) {
      assert.deepEqual(placeholders(MESSAGES.zh[key]), placeholders(MESSAGES.en[key]),
        key + ' uses different placeholders in zh and en');
    }
  });

  it('leaves no Chinese text in the English table', () => {
    // 允许的例外只有语言开关自己的名字，以及品牌/协议名，它们不是译文。
    const allowed = new Set(['中文']);
    const offenders = [];
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      for (const run of value.match(/[\u3400-\u9FFF\uFF00-\uFFEF]+/g) ?? []) {
        if (!allowed.has(run)) offenders.push(key + ': ' + value);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe('i18n: translate()', () => {
  it('reads the requested language', () => {
    assert.equal(translate('zh', 'cast.title'), '角色与表情');
    assert.equal(translate('en', 'cast.title'), 'Cast & faces');
    assert.equal(translate('en', 'weather.autoLocate.label'), 'Auto-locate');
  });

  it('falls back to zh for a key the request language does not carry', () => {
    // A schema row added a release before its English line: the window must
    // keep reading Chinese, never the dotted key.
    MESSAGES.zh['test.onlyZh'] = '只有中文';
    try {
      assert.equal(translate('en', 'test.onlyZh'), '只有中文');
    } finally {
      delete MESSAGES.zh['test.onlyZh'];
    }
  });

  it('falls back to the caller fallback, then to the key itself', () => {
    assert.equal(translate('en', 'nope.missing', null, '设备'), '设备');
    assert.equal(translate('en', 'nope.missing'), 'nope.missing');
    assert.equal(translate('en', 'nope.missing', { n: 1 }), 'nope.missing');
  });

  it('fills {placeholders} and leaves unknown ones alone', () => {
    assert.equal(translate('en', 'pages.pinned.some', { n: 2 }),
      '2 pinned · up to 3; tap the star at the end of a row to toggle');
    assert.equal(translate('zh', 'count.items', { n: 7 }), '7 项');
    assert.equal(translate('en', 'pages.order.up', {}), 'Move {name} up');
    assert.equal(translate('en', 'pages.order.up', { name: 'Weather' }), 'Move Weather up');
  });

  it('treats an unknown language as zh instead of drawing English', () => {
    assert.equal(translate('fr', 'cast.title'), '角色与表情');
    assert.equal(translate(undefined, 'cast.title'), '角色与表情');
  });
});

describe('i18n: the window only asks for keys that exist', () => {
  const settings = src('renderer/settings.js');
  const settingsHtml = src('renderer/settings.html');

  /**
   * T('some.key') and data-i18n="some.key" — the two static ways in.
   *
   * A key that ends at the dot is a prefix built at runtime (T('island.' + page.key)),
   * so those families are asserted key by key in the two tests below instead.
   */
  const used = new Set([
    ...[...settings.matchAll(/T\('([a-zA-Z][\w.]*)'/g)].map((m) => m[1]).filter((key) => !key.endsWith('.')),
    ...[...settingsHtml.matchAll(/data-i18n(?:-title|-aria)?="([a-zA-Z][\w.]*)"/g)].map((m) => m[1]),
  ]);

  it('finds the keys the renderer and the shell use', () => {
    assert.ok(used.size > 300, 'expected the window to use most of the dictionary');
  });

  it('has every statically referenced key in zh', () => {
    const missing = [...used].filter((key) => !(key in MESSAGES.zh)).sort();
    assert.deepEqual(missing, [], 'these keys are referenced but not defined');
  });

  it('defines a title and a lead for every settings page, devices included', () => {
    const pages = ['general', 'appearance', 'layout', 'behavior', 'cast', 'pages', 'music',
      'focus', 'todo', 'comm', 'quota', 'weather', 'plugins', 'about', 'devices'];
    for (const page of pages) {
      for (const suffix of ['title', 'lead']) {
        assert.ok((page + '.' + suffix) in MESSAGES.en, page + '.' + suffix + ' is missing');
        assert.ok((page + '.' + suffix) in MESSAGES.zh, page + '.' + suffix + ' is missing');
      }
    }
  });

  it('defines the island page labels the pages list renders', () => {
    const pages = ['music', 'weather', 'quota', 'mail', 'focus', 'todo', 'health', 'shelf',
      'devices', 'calendar', 'messenger'];
    for (const page of pages) {
      for (const suffix of ['label', 'sub']) {
        assert.ok(('island.' + page + '.' + suffix) in MESSAGES.en, 'island.' + page + '.' + suffix);
        assert.ok(('island.' + page + '.' + suffix) in MESSAGES.zh, 'island.' + page + '.' + suffix);
      }
    }
  });

  it('keeps the shell labels in the dictionary rather than in the html', () => {
    for (const key of ['app.title', 'win.minimize', 'win.maximize', 'win.close', 'preview.title']) {
      assert.ok(key in MESSAGES.zh, key);
      assert.ok(key in MESSAGES.en, key);
    }
  });
});
