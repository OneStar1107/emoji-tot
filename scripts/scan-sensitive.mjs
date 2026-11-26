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
import { pathToFileURL } from 'node:url';

const SELF = 'scripts/scan-sensitive.mjs';
const SKIP_DIR = /(^|\/)(vendor|node_modules|release|dist)\//;
const TEXT_EXT = /(\.(m?js|cjs|ts|tsx|jsx|json|md|html|css|ps1|xml|yml|yaml|txt|svg))$/i;
const IMAGE_EXT = /(\.(png|jpe?g|webp|gif))$/i;

/**
 * A local username is the one string a generic pattern cannot guess.
 *
 * The home path also contains directory names that every Windows machine
 * shares ("Users", "home", "AppData"); treating those as a username flags
 * documentation that merely mentions the path. Only the leaf is personal.
 */
const COMMON_DIRS = new Set([
  'users', 'home', 'root', 'appdata', 'local', 'roaming', 'documents',
  'desktop', 'downloads', 'library', 'program', 'programdata', 'public',
  'shared', 'onedrive', 'temp', 'tmp',
]);

function localUserNames() {
  const names = new Set();
  const home = homedir();
  const parts = home.split(/[\\/]/).filter((part) => part && !/^[A-Za-z]:$/.test(part));
  const leaf = parts[parts.length - 1];
  if (leaf) names.add(leaf);
  for (const key of ['USERNAME', 'USER']) {
    if (process.env[key]) names.add(process.env[key]);
  }
  return [...names].filter((name) => name.length >= 3 && !COMMON_DIRS.has(name.toLowerCase()));
}

const users = localUserNames();

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * The README, LICENSE and release notes intentionally publish one project
 * contact for commercial licensing. That address is not leaked personal data.
 * Keep this list exact; every unrelated address still fails the scan.
 */
const PUBLIC_CONTACT_EMAILS = new Set(['hyx110702@163.com']);
const PLACEHOLDER_EMAILS = new Set(['you@163.com', 'you@example.com', 'person@example.com']);

export function emailAllowed(address) {
  const normalized = String(address).trim().toLowerCase();
  if (PUBLIC_CONTACT_EMAILS.has(normalized) || PLACEHOLDER_EMAILS.has(normalized)) return true;
  return /^noreply@/i.test(normalized) || /@example\.(com|org)$/i.test(normalized);
}

export function parseReleaseCandidates(output) {
  return [...new Set(
    String(output)
      .split('\0')
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/')),
  )];
}

const textRules = [
  { id: 'email', test: (line) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line), email: true },
  { id: 'phone', test: (line) => /(^|[^\d])1[3-9]\d{9}([^\d]|$)/.test(line), allow: /0{8,}|1234567890/ },
  { id: 'api-key', test: (line) => /(sk-[A-Za-z0-9_-]{16,}|gh[opsur]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})/.test(line), allow: /sk-\.\.\.|sk-xxx|placeholder|your[_-]?key/i },
  { id: 'local-path', test: (line) => /[A-Za-z]:\\Users\\[^\\\s"']+|\/Users\/[^/\s"']+|\/home\/[^/\s"']+/.test(line), allow: /Users\\Public|\\Users\\<|Users\\…|Users\\\.\.\.|Example/i },
  { id: 'onedrive', test: (line) => /OneDrive/i.test(line), allow: null },
];

/**
 * Is this the local user name in a place that actually leaks it?
 *
 * A bare word match is only convincing when the name could not be an ordinary
 * word: GitHub's runner account is called "runner", so matching the bare word
 * flagged "Node test runner" in two plan documents. Path and account context
 * (\name, /name, @name, ~name) is always a hit, and a name that is not plain
 * lowercase letters (it carries a digit or a capital) is distinctive enough
 * that a bare mention is itself identifying.
 */
function leaksUser(line, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp('[\\\\/@~]' + escaped + '(?![A-Za-z0-9_-])').test(line)) return true;
  if (/[^a-z]/.test(name)) return new RegExp('\\b' + escaped + '\\b').test(line);
  return false;
}

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
        if (rule.email) {
          const addresses = line.match(EMAIL_PATTERN) ?? [];
          EMAIL_PATTERN.lastIndex = 0;
          if (addresses.every(emailAllowed)) continue;
        } else if (rule.allow && rule.allow.test(line)) continue;
        findings.push({ file, line: i + 1, rule: rule.id, text: line.trim().slice(0, 160) });
      }
      for (const name of users) {
        if (line.includes(name) && leaksUser(line, name)) {
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

/*
 * Screenshots at desktop resolution need a human to have looked at them.
 *
 * Text scanning cannot see a window title, a folder name or a line of chat
 * inside a picture, and the images most likely to carry those are the ones the
 * size of the whole screen. docs/screenshots/.reviewed lists the ones that were
 * opened and cleared, each with a reason; a desktop-sized image that is not in
 * that file fails the scan instead of blending into the WARN pile.
 */
const REVIEWED = 'docs/screenshots/.reviewed';
const DESKTOP_WIDTH = 2400;
const DESKTOP_HEIGHT = 1400;

function readReviewed() {
  if (!existsSync(REVIEWED)) return new Map();
  const out = new Map();
  for (const line of readFileSync(REVIEWED, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [file, ...rest] = trimmed.split(' ');
    out.set(file, rest.join(' ').trim() || 'reviewed');
  }
  return out;
}

function scanDesktopScreenshots(files) {
  const reviewed = readReviewed();
  const missing = [];
  for (const file of files) {
    if (!IMAGE_EXT.test(file)) continue;
    if (!existsSync(file)) continue;
    let width = 0;
    let height = 0;
    try {
      const head = readFileSync(file).subarray(0, 24);
      width = head.readUInt32BE(16);
      height = head.readUInt32BE(20);
    } catch {
      continue;
    }
    // Both edges near desktop size: a tall composite sheet is a crop, an image this
    // wide *and* this tall is a whole screen.
    if (width < DESKTOP_WIDTH || height < DESKTOP_HEIGHT) continue;
    if (!reviewed.has(file)) missing.push({ file, width, height });
  }
  return missing;
}

function scanAuthors() {
  const raw = execSync('git log --format=%ae', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = [...new Set(raw)].filter((email) => !/noreply\.github\.com$/.test(email));
  return bad;
}

function main() {
  // Include tracked, staged, and untracked-but-not-ignored files. A first
  // upload can contain new screenshots and manifests that `git ls-files`
  // alone cannot see; the release scan must inspect what could actually leave
  // this computer, not only paths already in the index.
  const files = parseReleaseCandidates(
    execSync('git ls-files --cached --others --exclude-standard -z', {
      encoding: 'utf8',
    }),
  ).filter((file) => !SKIP_DIR.test(file));

  const findings = scanText(files);
  const large = scanImages(files);
  const unreviewed = scanDesktopScreenshots(files);
  const authors = scanAuthors();

  console.log('scanned ' + files.length + ' release-candidate files');
  console.log('');

  console.log('FAIL (must remove before publishing): ' + (findings.length + unreviewed.length));
  for (const f of findings.slice(0, 40)) {
    console.log('  ' + f.file + ':' + f.line + ' [' + f.rule + '] ' + f.text);
  }
  if (findings.length > 40) console.log('  … ' + (findings.length - 40) + ' more');
  for (const img of unreviewed) {
    console.log('  ' + img.file + ' ' + img.width + 'x' + img.height + ' [unreviewed screenshot]');
  }
  if (unreviewed.length) {
    console.log('  → open each one, confirm it shows no desktop, window title, folder or path,');
    console.log('    then add a line to ' + REVIEWED + ': "<path> <why it is safe>"');
  }

  console.log('');
  console.log('WARN (large images — open each and confirm no desktop, names or paths): ' + large.length);
  for (const img of large) {
    console.log('  ' + img.file + ' ' + img.width + 'x' + img.height + ' ' + img.kb + 'KB');
  }

  console.log('');
  console.log('WARN (commit authors with a real email): ' + authors.length);
  for (const email of authors) console.log('  ' + email);

  console.log('');
  if (findings.length + unreviewed.length > 0) {
    console.log('RESULT: FAIL — do not push or release until the lines above are gone.');
    process.exitCode = 1;
    return;
  }
  console.log('RESULT: PASS — text is clean; still open the images above if the count is not 0.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
