// Service worker da versão web (PWA). Gerado no build web pelo scripts/vite-pwa.mjs, que substitui
// __VERSION__ e __ASSETS__. Guarda todos os ficheiros da app para funcionar 100% offline.
// Uma versão nova fica "à espera" até o utilizador tocar em "Atualizar" (sem substituição silenciosa).

const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const CACHE = `popa-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('popa-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navegação (abrir a app, recarregar): sempre a página da versão em cache.
    // ignoreVary: os pedidos de módulos levam o cabeçalho Origin e não devem falhar por causa de "Vary: Origin".
    if (req.mode === 'navigate') return (await cache.match(new URL('./index.html', self.registration.scope).href, { ignoreVary: true })) || fetch(req);
    return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) || fetch(req);
  })());
});
