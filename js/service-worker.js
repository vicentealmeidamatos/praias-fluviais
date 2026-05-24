// service-worker.js — Cache offline para o site PWA e para a app Capacitor.
// Estratégias por padrão de URL:
//   - HTML: network-first (sempre tenta rede, usa cache se offline)
//   - JS/CSS: stale-while-revalidate (cache rápido + atualiza em background)
//   - Imagens: cache-first (uma vez baixadas, servem do cache para sempre)
//   - APIs/JSON: network-only (dados sempre frescos da rede)
//
// Bump o CACHE_VERSION ao alterar a estratégia ou ao publicar mudanças
// críticas que devam invalidar caches existentes.

const CACHE_VERSION = 'gpf-v1';
const CACHE_HTML    = `${CACHE_VERSION}-html`;
const CACHE_ASSETS  = `${CACHE_VERSION}-assets`;
const CACHE_IMAGES  = `${CACHE_VERSION}-images`;

// Páginas core que vale a pena pre-cachear no install
const PRECACHE_HTML = [
  '/',
  '/rede.html',
  '/passaporte.html',
  '/carimbar.html',
  '/css/tailwind.built.css',
  '/css/shared.css',
  '/js/shared.js',
  '/js/data-loader.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_HTML).then((cache) =>
      cache.addAll(PRECACHE_HTML).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isHTML(req)   { return req.mode === 'navigate' || req.destination === 'document' || req.url.endsWith('.html'); }
function isAsset(req)  { return /\.(js|css|woff2?|ttf)$/i.test(new URL(req.url).pathname); }
function isImage(req)  { return req.destination === 'image' || /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(new URL(req.url).pathname); }
function isAPI(req)    { const u = new URL(req.url); return u.pathname.startsWith('/api/') || u.hostname.endsWith('supabase.co') || u.pathname.endsWith('.json'); }

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw new Error('Network and cache both unavailable');
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só intercepta GET — POST/PUT/DELETE passam direto à rede
  if (req.method !== 'GET') return;

  // Skip extensões de browser e schemes não-http(s)
  if (!req.url.startsWith('http')) return;

  if (isAPI(req))       return; // network-only (sem intercept)
  if (isHTML(req))      return event.respondWith(networkFirst(req, CACHE_HTML));
  if (isImage(req))     return event.respondWith(cacheFirst(req, CACHE_IMAGES));
  if (isAsset(req))     return event.respondWith(staleWhileRevalidate(req, CACHE_ASSETS));
});
