#!/usr/bin/env node
/*
 * Version discipline gate (docs/RELEASING.md).
 *
 * Four segments: 0.<series>.<big>.<small>. npm only accepts three, so the
 * fourth lives in electron-builder's buildVersion and in the git tag; here we
 * compare the tag-shaped version, falling back to package.json.
 *
 * A big batch (third segment) needs three user-visible notes; a small fix
 * (fourth segment) needs one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const builder = pkg.build && pkg.build.buildVersion ? String(pkg.build.buildVersion) : '';
const current = builder || pkg.version;

let lastTag = '';
try {
  lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { encoding: 'utf8' }).trim();
} catch {
  console.log('version:check — no tags yet, nothing to compare');
  process.exit(0);
}

const parse = (v) => {
  const parts = v.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  while (parts.length < 4) parts.push(0);
  return parts;
};
const c = parse(current);
const l = parse(lastTag);
let cmp = 0;
for (let i = 0; i < 4; i += 1) { if (c[i] !== l[i]) { cmp = c[i] - l[i]; break; } }

if (cmp <= 0) {
  console.error('version:check FAIL — ' + current + ' is not newer than ' + lastTag);
  process.exit(1);
}

const kind = c[1] > l[1] ? 'SERIES' : c[2] > l[2] ? 'BIG' : 'SMALL';
const notesPath = 'docs/RELEASE-NOTES.md';
const notes = existsSync(new URL('../' + notesPath, import.meta.url)) ? read(notesPath) : '';
const section = notes.split(/^## /m).find((s) => s.startsWith(current) || s.startsWith('v' + current)) || '';
const bullets = section.split('\n').filter((line) => /^- /.test(line.trim())).length;
const need = kind === 'SMALL' ? 1 : 3;

if (bullets >= need) {
  console.log('version:check PASS — ' + lastTag + ' -> v' + current + ' (' + kind + ', ' + bullets + ' notes)');
  process.exit(0);
}

console.error('version:check FAIL — ' + lastTag + ' -> v' + current + ' is a ' + kind +
  ' bump and needs ' + need + ' user-visible note(s); ' + notesPath + ' has ' + bullets + '.');
console.error(kind === 'SMALL'
  ? 'Write one line under "## ' + current + '".'
  : 'Write three lines under "## ' + current + '", or make this a small fix (fourth segment).');
process.exit(1);
