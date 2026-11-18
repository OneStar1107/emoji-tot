/**
 * Render the icon master to every size the app actually uses.
 *
 * sharp rasterises the SVG with a real antialiaser, which is the whole point:
 * downscaling a 512px bitmap to 16px is what produced the stepped edges in the
 * tray. Run with: node scripts/make-icon.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../assets');
const svg = await readFile(resolve(assets, 'icon.svg'));

const outputs = [
  ['icon.png', 512],
  ['icon-256.png', 256],
  ['tray-32.png', 32],
  ['tray-16.png', 16],
];

for (const [name, size] of outputs) {
  await sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(assets, name));
  console.log('wrote', name, size + 'px');
}
