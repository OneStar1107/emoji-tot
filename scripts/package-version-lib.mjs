import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SHIPPING_PACKAGE_FILES = [
  'apps/gallery/package.json',
  'packages/core/package.json',
  'packages/protocol/package.json',
];

export function syncPackageVersions({
  rootDir,
  version,
  files = SHIPPING_PACKAGE_FILES,
}) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) {
    throw new Error('package version must have exactly three numeric segments');
  }
  for (const file of files) {
    const path = join(rootDir, file);
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    if (pkg.version === version) continue;
    pkg.version = version;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
}
