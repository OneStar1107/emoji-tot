import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * GitHub Pages serves this site from /emoji-tot/, so the built asset URLs need
 * that prefix. Dev keeps the root, or every absolute path would 404.
 *
 * The settings schema is aliased in rather than copied: the docs page prints
 * the number of settings pages, and a second copy of that list is exactly the
 * kind of number that goes stale. One file, two consumers.
 */
const settingsSchema = fileURLToPath(new URL('../desktop/src/shared/schema.js', import.meta.url));

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/emoji-tot/' : '/',
  build: { outDir: 'dist' },
  resolve: {
    alias: { '@emojitot/settings-schema': settingsSchema },
  },
  server: {
    // The alias points outside this package, so the dev server has to be
    // allowed to read one directory up.
    fs: { allow: ['..'] },
  },
}));
