/**
 * Copy the built protocol package into the app before running or packaging.
 *
 * A workspace dependency is a symlink in development and a missing folder in
 * a packaged app. Vendoring the CommonJS build keeps the desktop app to two
 * self-contained files (this one and the engine bundle), with no resolution
 * surprises at runtime.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../../../packages/protocol/dist-cjs');
const to = resolve(here, '../src/vendor/protocol');

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log('protocol copied to src/vendor/protocol');
