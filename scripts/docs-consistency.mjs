#!/usr/bin/env node
/**
 * Checks human-authored documentation for facts that `docs:sync` cannot infer.
 *
 * The marker-based sync covers counts owned by the code. This pass covers
 * sample JSON, stale test counts, obsolete IPC names and artifact filenames.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_MANIFEST, SETTINGS_PAGE_KEYS } from '../apps/desktop/src/shared/schema.js';
import { latestReleaseVersionFromNotes } from './release-version-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const version = JSON.parse(read('package.json')).version;
const artifactVersion = latestReleaseVersionFromNotes(read('docs/RELEASE-NOTES.md'), version);
const failures = [];

function expectText(file, needle, why) {
  if (!read(file).includes(needle)) failures.push(`${file}: missing ${JSON.stringify(needle)} (${why})`);
}

function rejectText(file, needle, why) {
  if (read(file).includes(needle)) failures.push(`${file}: stale ${JSON.stringify(needle)} (${why})`);
}

for (const file of ['README.md', 'README.en.md']) {
  expectText(file, `EmojiTot.Setup.${artifactVersion}.exe`, 'installer link must match artifactName');
  expectText(file, `EmojiTot.${artifactVersion}.portable.exe`, 'portable link must match artifactName');
  rejectText(file, `EmojiTot.${artifactVersion}.exe`, 'the portable artifact has a .portable suffix');
  expectText(file, 'pnpm smoke:desktop', 'document the real-window smoke command');
}

rejectText('README.md', '23 个测试', 'protocol suite now has 33 tests');
rejectText('README.md', `13 个导航项`, `settings rail has ${SETTINGS_PAGE_KEYS.length} items`);
rejectText('README.md', `14 个导航项`, `settings rail has ${SETTINGS_PAGE_KEYS.length} items`);
rejectText('README.md', '十个功能页', `page manifest has ${PAGE_MANIFEST.length} pages`);
rejectText('README.md', '两个窗口都提前创建', 'the island is created lazily');
rejectText('README.en.md', 'both windows are created up front', 'the island is created lazily');
rejectText('README.en.md', 'Thirteen', `settings rail has ${SETTINGS_PAGE_KEYS.length} items`);
rejectText('README.en.md', 'Fourteen', `settings rail has ${SETTINGS_PAGE_KEYS.length} items`);
rejectText('README.en.md', '**Ten pages**', `page manifest has ${PAGE_MANIFEST.length} pages`);
rejectText('README.en.md', '23 tests', 'protocol suite now has 33 tests');
rejectText('README.md', 'EmojiTot Setup 0.3.0.exe', 'packaged artifacts now use the versioned dotted name');
expectText('README.en.md', 'EmojiTot Noncommercial License', 'English README must match the root license');
rejectText('README.en.md', '**MIT.**', 'the project license is noncommercial, not MIT');
for (const file of ['packages/core/package.json', 'packages/protocol/package.json']) {
  expectText(file, 'LicenseRef-EmojiTot-Noncommercial', 'published package metadata must match the root license');
  rejectText(file, '"license": "MIT"', 'the project license is noncommercial, not MIT');
}

rejectText('docs/PROTOCOL.md', '27 个测试', 'protocol suite now has 33 tests');
rejectText('docs/SETTINGS.md', '"anchor"', 'anchor is not a schema key');
rejectText('docs/SETTINGS.md', '"volume"', 'volume is not a status item');
rejectText('docs/PRIVACY.md', 'mail-cache.json', 'the mail store is mail.json');
expectText('docs/PRIVACY.md', 'mail.json', 'the actual mail store name');
rejectText('docs/SECURITY.md', '桌面端三个 html 还没有 CSP', 'all desktop pages now have CSP');
rejectText('docs/SECURITY.md', '唯一剩下的 moderate', 'the audit is currently clean');
expectText('docs/SECURITY.md', 'window-smoke.mjs', 'record the real-window verification actually performed');
rejectText('docs/ISLAND.md', 'island:page', 'the island has no page IPC channel');
rejectText('docs/ISLAND.md', 'island:expand', 'the island has no expand IPC channel');
rejectText('docs/ISLAND.md', '左右 14px', 'actual horizontal padding is 32px');
rejectText('docs/ISLAND.md', '上下 10px', 'actual vertical padding is 36px');
rejectText('apps/gallery/index.html', '71 cast members', 'current cast has 15 members');
rejectText('apps/desktop/src/renderer/settings.js', 'Fourteen rows', 'settings rail now has 15 pages');
rejectText('apps/desktop/src/renderer/settings.js', '十个功能页', `page manifest has ${PAGE_MANIFEST.length} pages`);

expectText('docs/SETTINGS.md', 'mailProvider', 'mail provider is persisted');
expectText('apps/gallery/index.html', '15 characters', 'social metadata must describe the current cast');
expectText('apps/gallery/index.html', 'emoji-tot/blob/main/LICENSE', 'structured data must point at the project license');
rejectText('apps/gallery/index.html', 'opensource.org/licenses/MIT', 'the project is not MIT licensed');
if (!existsSync(resolve(root, 'apps/gallery/public/og.png'))) {
  failures.push('apps/gallery/public/og.png: missing Open Graph image');
}

if (failures.length) {
  console.error('✗ documentation consistency');
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}

console.log('✓ documentation consistency');
