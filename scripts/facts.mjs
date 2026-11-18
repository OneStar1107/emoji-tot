#!/usr/bin/env node
/**
 * Every count the docs quote, computed from the code that owns it.
 *
 * A number written twice drifts. The tables in packages/core and
 * packages/protocol are the single source of truth, so the README does not
 * restate their size by hand: it carries a marker
 * (`<!--facts:faceStates-->…<!--/facts-->`) and `pnpm docs:sync` fills it in.
 *
 * Run `pnpm facts` to print the current values.
 */
import { readFileSync } from 'node:fs';
import { SETTINGS_PAGE_KEYS } from '../apps/desktop/src/shared/schema.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Import the built packages by path rather than by name: this script lives at
 * the workspace root, which deliberately depends on nothing, so there is no
 * root-level node_modules entry for the engine to resolve through.
 */
let core;
let protocol;
try {
  core = await import('../packages/core/dist/index.js');
  protocol = await import('../packages/protocol/dist/index.js');
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('✗ packages are not built — run `pnpm build` first');
    process.exit(1);
  }
  throw error;
}
const { BODY_IDS, CAST_IDS, COLOR_IDS, EAR_IDS, FACE_IDS, FAMILIES, MOTIONS, SIDE_IDS, SURFACE_IDS, TOP_IDS, TRAIT_IDS } = core;
const { EMOTION_SEGMENTS, EMOTIONS } = protocol;

const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/** Count the members of a string-literal union type. */
function unionSize(rel, name) {
  const match = read(rel).match(new RegExp('export type ' + name + ' = ([^;]+);'));
  if (!match) throw new Error(`could not find type ${name} in ${rel}`);
  return (match[1].match(/'/g) ?? []).length / 2;
}

/** Count the groups in the settings window's NAV table. */
/** Settings pages, from the one manifest that defines the rail. */
function settingsPageCount() {
  return SETTINGS_PAGE_KEYS.length;
}

/** How many cast members the scene page puts on stage. */
function sceneHerdCount() {
  const match = read('apps/gallery/src/scene.ts').match(/const HERD = (\d+);/);
  if (!match) throw new Error('could not find HERD in scene.ts');
  return Number(match[1]);
}

/** Count the hash-router views in the site shell. */
function sitePageCount() {
  const match = read('apps/gallery/src/main.ts').match(/const routes[^;]*= \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('could not find routes in gallery main.ts');
  return (match[1].match(/^ {2}[a-zA-Z]+:/gm) ?? []).length;
}

export const FACTS = {
  version: JSON.parse(read('package.json')).version,
  /** Two-digit protocol ids. Several may share one face. */
  protocolIds: EMOTIONS.length,
  /** Distinct faces in the engine — what a picker lists. */
  faceStates: FACE_IDS.length,
  bodies: BODY_IDS.length,
  cast: CAST_IDS.length,
  colors: COLOR_IDS.length,
  traits: TRAIT_IDS.length,
  earTraits: EAR_IDS.length,
  topTraits: TOP_IDS.length,
  sideTraits: SIDE_IDS.length,
  /** Surface markings a picker offers — "none" is the empty slot, not a marking. */
  surfaceTraits: SURFACE_IDS.filter((id) => id !== 'none').length,
  families: FAMILIES.length,
  motions: MOTIONS.length,
  segments: EMOTION_SEGMENTS.length,
  eyeStyles: unionSize('packages/core/src/face.ts', 'EyeStyle'),
  mouthStyles: unionSize('packages/core/src/face.ts', 'MouthStyle'),
  settingsPages: settingsPageCount(),
  sitePages: sitePageCount(),
  sceneHerd: sceneHerdCount(),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const width = Math.max(...Object.keys(FACTS).map((k) => k.length));
  for (const [key, value] of Object.entries(FACTS)) {
    console.log(`${key.padEnd(width)}  ${value}`);
  }
}
