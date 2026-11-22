#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { nextBuildInfo } from './build-info-lib.mjs';
import { syncPackageVersions } from './package-version-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps', 'desktop');
const stateFile = join(desktop, '.build-number');
const outputFile = join(desktop, 'build-info.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function runBuildInfo() {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const previous = readJson(stateFile, {});
  const explicitNumber = process.env.EMOJITOT_BUILD_NUMBER || process.env.BUILD_NUMBER || null;
  const info = nextBuildInfo({ version, previous, explicitNumber });

  syncPackageVersions({ rootDir: root, version: info.version });
  mkdirSync(desktop, { recursive: true });
  if (!explicitNumber) {
    writeFileSync(stateFile, JSON.stringify({ version: info.version, number: info.number }, null, 2) + '\n', 'utf8');
  }
  const build = {
    ...info,
    buildNumber: info.number,
    commit: gitCommit(),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(outputFile, JSON.stringify(build, null, 2) + '\n', 'utf8');
  return build;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = runBuildInfo();
  console.log('build ' + info.buildVersion + (info.commit ? ' · ' + info.commit : ''));
}
