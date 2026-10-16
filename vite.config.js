import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pwa from './scripts/vite-pwa.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Definido pelos workflows do GitHub Actions (ex.: 1.0.42); localmente fica "x.y.z-dev".
const version = process.env.APP_VERSION || `${pkg.version}-dev`;

// O mesmo código gera duas versões: APK (`vite build`) e web/PWA (`vite build --mode web`).
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    root: 'src',
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __PWA__: JSON.stringify(web)
    },
    plugins: [pwa({
      web, version,
      swSource: fileURLToPath(new URL('./src/sw.js', import.meta.url)),
      publicDir: fileURLToPath(new URL('./src/public', import.meta.url))
    })],
    build: {
      outDir: web ? '../dist-web' : '../dist',
      emptyOutDir: true,
      target: 'es2022'
    }
  };
});
