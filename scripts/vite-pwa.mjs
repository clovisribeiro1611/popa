// Plugin do Vite para a versão web (BUILD_TARGET=web): injeta manifest, ícones e política de segurança
// no index.html, e gera manifest.webmanifest + sw.js com a lista de todos os ficheiros do build.
// No build Android não faz nada (o APK não usa service worker).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Política de segurança: só ficheiros da própria app; nenhuma ligação externa (sem analytics, sem CDN).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'none'"
].join('; ');

const MANIFEST = {
  name: 'POPA — orçamento familiar',
  short_name: 'POPA',
  description: 'Conselheiro financeiro offline para a família. Os dados ficam só neste dispositivo.',
  lang: 'pt-PT',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#0F766E',
  theme_color: '#0F766E',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

const listFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? listFiles(p) : [p];
});

export default function pwa({ web, version, swSource, publicDir }) {
  return {
    name: 'popa-pwa',
    transformIndexHtml(html) {
      if (!web) return html;
      return html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}">
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="icon" href="./icons/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <title>`);
    },
    generateBundle(_, bundle) {
      if (!web) return;
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(MANIFEST, null, 2) });
      const publicFiles = listFiles(publicDir).map((p) => relative(publicDir, p).replace(/\\/g, '/'));
      const assets = ['./', './index.html', './manifest.webmanifest', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles]
        .map((f) => (f.startsWith('./') ? f : `./${f}`));
      const sw = readFileSync(swSource, 'utf8')
        .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`)
        .replace('const ASSETS = __ASSETS__;', `const ASSETS = ${JSON.stringify([...new Set(assets)], null, 2)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    }
  };
}
