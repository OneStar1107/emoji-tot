/**
 * Copy the workspace packages into the desktop app before running or packaging.
 *
 * A workspace dependency is a symlink in development and a missing folder in a
 * packaged app. Vendoring the built CommonJS/ESM output keeps the app to three
 * self-contained folders with no resolution surprises at runtime.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const jobs = [
  { from: resolve(here, '../../../packages/protocol/dist-cjs'), to: resolve(here, '../src/vendor/protocol') },
  // The element runs in the renderer, so it has to live under src/renderer,
  // where the page's relative <script src> points.
  { from: resolve(here, '../../../packages/core/dist'), to: resolve(here, '../src/renderer/vendor/core') },
];

for (const job of jobs) {
  await rm(job.to, { recursive: true, force: true });
  await mkdir(job.to, { recursive: true });
  await cp(job.from, job.to, { recursive: true });
  console.log('copied', job.to);
}

/*
 * The core is ESM and the desktop package is CommonJS, so a plain .js file in
 * this folder would be read as CJS by Node inside the main process — the
 * dynamic import that loads the cast table would fail on the first `export`.
 * A local package.json marks just this folder as ESM. The renderer is
 * unaffected (a module script does not consult package.json).
 */
await writeFile(
  resolve(here, '../src/renderer/vendor/core/package.json'),
  JSON.stringify({ type: 'module', main: 'index.js' }, null, 2) + '\n',
  'utf8',
);
console.log('marked core as ESM');
