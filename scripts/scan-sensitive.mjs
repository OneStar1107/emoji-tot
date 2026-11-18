#!/usr/bin/env node
/**
 * Pre-upload privacy scan.
 *
 * Run this before every push that leaves the machine, and before every release.
 * It is deliberately dumb: exact patterns over tracked files, plus a list of
 * large images a human still has to look at. Dumb is the point — a scanner that
 * needs judgement can be argued with, and this one cannot.
 *
 *   node scripts/scan-sensitive.mjs        # PASS / WARN / FAIL + exit code
 *
 * FAIL exits 1. WARN does not: an untracked-looking design screenshot is not a
 * leak until someone has looked at it, and the tool cannot see pixels.
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SELF = 'scripts/scan-sensitive.mjs';
const SKIP_DIR = /(^|\/)(vendor|node_modules|release|dist)\//;
const TEXT_EXT = /(\.(m?js|cjs|ts|tsx|jsx|json|md|html|css|ps1|xml|yml|yaml|txt|svg))$/i;
const IMAGE_EXT = /(\.(png|jpe?g|webp|gif))$/i;

/** A local username is the one string a generic pattern cannot guess. */
function localUserNames() {
  const names = new Set();
  const home = homedir();
  for (const part of home.split(/[\\/]/)) {
    if (part && !/^[A-Za-z]:$/.test(part)) names.add(part);
  }
  for (const key of ['USERNAME', 'USER']) {
    if (process.env[key]) names.add(process.env[key]);
  }
  return [...names].filter((name) => name.length >= 3);
}

const users = localUserNames();

const textRules = [
  { id: 'email', test: (line) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line), allow: /noreply|example\.(com|org)|you@|user@|someone@|@example/i },
  { id: 'phone', test: (line) => /(^|[^\d])1[3-9]\d{9}([^\d]|$)/.test(line), allow: /0{8,}|1234567890/ },
  { id: 'api-key', test: (line) => /(sk-[A-Za-z0-9_-]{16,}|gh[opsur]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})/.test(line), allow: /sk-\.\.\.|sk-xxx|placeholder|your[_-]?key/i },
  { id: 'local-path', test: (line) => /[A-Za-z]:\\Users\\[^\\\s"']+|\/Users\/[^/\s"']+|\/home\/[^/\s"']+/.test(line), allow: /Users\\Public|\\Users\\<|Example/i },
  { id: 'onedrive', test: (line) => /OneDrive/i.test(line), allow: null },
];

function scanText(files) {
  const findings = [];
  for (const file of files) {
    if (file === SELF) continue;
    if (!TEXT_EXT.test(file)) continue;
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length > 4000) continue;
      for (const rule of textRules) {
        if (!rule.test(line)) continue;
        if (rule.allow && rule.allow.test(line)) continue;
        findings.push({ file, line: i + 1, rule: rule.id, text: line.trim().slice(0, 160) });
      }
      for (const name of users) {
        if (line.includes(name) && new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(line)) {
          findings.push({ file, line: i + 1, rule: 'local-user', text: line.trim().slice(0, 160) });
        }
      }
    }
  }
  return findings;
}

function scanImages(files) {
  const large = [];
  for (const file of files) {
    if (!IMAGE_EXT.test(file)) continue;
    if (file === SELF) continue;
    if (!existsSync(file)) continue;
    const size = statSync(file).size;
    if (size < 120000) continue;
    let width = 0;
    let height = 0;
    try {
      const head = readFileSync(file).subarray(0, 24);
      width = head.readUInt32BE(16);
      height = head.readUInt32BE(20);
    } catch {
      continue;
    }
    if (width >= 1200 || height >= 900) large.push({ file, width, height, kb: Math.round(size / 1024) });
  }
  return large;
}

function scanAuthors() {
  const raw = execSync('git log --format=%ae', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = [...new Set(raw)].filter((email) => !/noreply\.github\.com$/.test(email));
  return bad;
}

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !SKIP_DIR.test(file));

const findings = scanText(files);
const large = scanImages(files);
const authors = scanAuthors();

console.log('scanned ' + files.length + ' tracked files');
console.log('');

console.log('FAIL (must remove before publishing): ' + findings.length);
for (const f of findings.slice(0, 40)) {
  console.log('  ' + f.file + ':' + f.line + ' [' + f.rule + '] ' + f.text);
}
if (findings.length > 40) console.log('  … ' + (findings.length - 40) + ' more');

console.log('');
console.log('WARN (large images — open each and confirm no desktop, names or paths): ' + large.length);
for (const img of large) {
  console.log('  ' + img.file + ' ' + img.width + 'x' + img.height + ' ' + img.kb + 'KB');
}

console.log('');
console.log('WARN (commit authors with a real email): ' + authors.length);
for (const email of authors) console.log('  ' + email);

console.log('');
if (findings.length > 0) {
  console.log('RESULT: FAIL — do not push or release until the lines above are gone.');
  process.exit(1);
}
console.log('RESULT: PASS — text is clean; still open the images above if the count is not 0.');
