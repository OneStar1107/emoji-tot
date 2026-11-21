#!/usr/bin/env node
/*
 * Version discipline gate (docs/RELEASING.md).
 *
 * PATCH bumps are free. A MINOR or MAJOR bump has to be earned: the release
 * notes for that exact version must list at least three user-visible items.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const current = pkg.version;

let lastTag = '';
try {
  lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { encoding: 'utf8' }).trim();
} catch {
  console.log('version:check — no tags yet, nothing to compare');
  process.exit(0);
}

const parse = (v) => v.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
const [cMaj, cMin, cPat] = parse(current);
const [lMaj, lMin, lPat] = parse(lastTag);
const cmp = (cMaj - lMaj) || (cMin - lMin) || (cPat - lPat);

if (cmp <= 0) {
  console.error('version:check FAIL — package.json ' + current + ' is not newer than ' + lastTag);
  process.exit(1);
}

const kind = cMaj > lMaj ? 'MAJOR' : cMin > lMin ? 'MINOR' : 'PATCH';
if (kind === 'PATCH') {
  console.log('version:check PASS — ' + lastTag + ' -> v' + current + ' (' + kind + ')');
  process.exit(0);
}

const notesPath = 'docs/RELEASE-NOTES.md';
const notes = existsSync(new URL('../' + notesPath, import.meta.url)) ? read(notesPath) : '';
const section = notes.split(/^## /m).find((s) => s.startsWith(current) || s.startsWith('v' + current)) || '';
const bullets = section.split('\n').filter((l) => /^- /.test(l.trim())).length;

if (bullets >= 3) {
  console.log('version:check PASS — ' + lastTag + ' -> v' + current + ' (' + kind + ', ' + bullets + ' notes)');
  process.exit(0);
}

console.error('version:check FAIL — ' + lastTag + ' -> v' + current + ' is a ' + kind +
  ' bump but ' + notesPath + ' has ' + bullets + ' item(s) for ' + current + '.');
console.error('Either write >=3 user-visible bullets under "## ' + current + '" or keep the bump a PATCH (' +
  lMaj + '.' + lMin + '.' + (lPat + 1) + ').');
process.exit(1);
