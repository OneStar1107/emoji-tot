import { defineConfig } from 'vite';

/**
 * GitHub Pages serves this site from /emoji-tot/, so the built asset
 * URLs need that prefix. Dev keeps the root, or every absolute path would
 * 404 on localhost.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/emoji-tot/' : '/',
  build: { outDir: 'dist' },
}));
