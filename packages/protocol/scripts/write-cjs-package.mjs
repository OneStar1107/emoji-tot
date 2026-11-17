/**
 * The package is "type": "module", so a CommonJS build has to say so in its
 * own folder — otherwise Node reads dist-cjs/index.js as ESM and the Electron
 * main process cannot require it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../dist-cjs');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
console.log('wrote dist-cjs/package.json');
