/**
 * Copy the workspace packages into the desktop app before running or packaging.
 *
 * A workspace dependency is a symlink in development and a missing folder in a
 * packaged app. Vendoring the built CommonJS/ESM output keeps the app to three
 * self-contained folders with no resolution surprises at runtime.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
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
