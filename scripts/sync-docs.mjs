#!/usr/bin/env node
/**
 * Fill the numbers the docs quote from the code that owns them.
 *
 * Two kinds of drift are caught here:
 *
 * 1. Counts. The README writes `<!--facts:faceStates-->44<!--/facts-->` and
 *    this script rewrites the text between the markers to whatever the engine
 *    currently says.
 * 2. The download block. Everything between `<!--downloads:start-->` and
 *    `<!--downloads:end-->` has its version number forced to package.json's,
 *    so a release bump cannot leave a stale link behind.
 *
 * `--check` exits non-zero when anything is stale, which is what CI runs.
 *
 * Usage:
 *   pnpm docs:sync          # rewrite in place
 *   pnpm docs:check         # fail if anything is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS } from './facts.mjs';
import { currentReleaseVersion } from './release-version-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const DOCS = [
  'README.md',
  'README.en.md',
  'docs/ARCHITECTURE.md',
  'docs/PROTOCOL.md',
  'docs/ISLAND.md',
  'docs/SETTINGS.md',
  'docs/RESEARCH.md',
];

const FACT_MARKER = /<!--facts:([A-Za-z]+)-->([\s\S]*?)<!--\/facts-->/g;
const DOWNLOAD_BLOCK = /<!--downloads:start-->([\s\S]*?)<!--downloads:end-->/g;
const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
let buildInfo = null;
try {
  buildInfo = JSON.parse(readFileSync(resolve(root, 'apps', 'desktop', 'build-info.json'), 'utf8'));
} catch {
  // A clean source tree without a build has only the public three-part version.
}
const VERSION = currentReleaseVersion({ packageVersion, buildInfo });

let stale = 0;
let checked = 0;
let unknown = 0;
let links = 0;

for (const rel of DOCS) {
  const path = resolve(root, rel);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  let next = source.replace(FACT_MARKER, (whole, key, current) => {
    if (!(key in FACTS)) {
      unknown += 1;
      console.error(`✗ ${rel}: unknown fact "${key}"`);
      return whole;
    }
    checked += 1;
    const want = String(FACTS[key]);
    if (current === want) return whole;
    stale += 1;
    console.error(`${checkOnly ? '✗' : '·'} ${rel}: ${key} ${current} → ${want}`);
    return `<!--facts:${key}-->${want}<!--/facts-->`;
  });

  next = next.replace(DOWNLOAD_BLOCK, (whole, body) => {
    // Bare versions first (skipping the one inside "v0.3.2"), then the v-prefixed
    // form, so a release URL and its file name cannot disagree.
    const fixed = body
      .replace(/(?<![\w.])\d+\.\d+\.\d+(?:\.\d+)?(?![\w.])/g, () => {
        links += 1;
        return VERSION;
      })
      .replace(/v\d+\.\d+\.\d+(?:\.\d+)?/g, () => {
        links += 1;
        return 'v' + VERSION;
      });
    if (fixed !== body) {
      stale += 1;
      console.error(`${checkOnly ? '✗' : '·'} ${rel}: download block version → ${VERSION}`);
    }
    return whole.replace(body, fixed);
  });

  if (next !== source && !checkOnly) writeFileSync(path, next);
}

if (unknown > 0) {
  console.error(`\n${unknown} unknown fact marker(s)`);
  process.exit(1);
}

if (checkOnly) {
  if (stale > 0) {
    console.error(`\n${stale} stale spot(s) — run \`pnpm docs:sync\``);
    process.exit(1);
  }
  console.log(`✓ ${checked} fact marker(s) match the code`);
} else {
  console.log(`${stale === 0 ? '✓' : '·'} ${checked} fact marker(s) checked, ${links} download version(s) touched, ${stale} spot(s) rewritten`);
}
