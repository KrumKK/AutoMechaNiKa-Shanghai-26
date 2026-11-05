/* Automechanika Shanghai 26 · Service Worker
 * App: red primero (así se actualiza sola) con copia para cuando no hay conexión.
 * Diapositivas, brochure y PDF: se guardan al abrirlos o con "Guardar presentaciones".
 * El vídeo y SharePoint no pasan por aquí. */
'use strict';

const CACHE = 'ams26-v4';
const APP = [
  './', 'index.html', 'styles.css', 'config.js', 'store.js', 'app.js',
  'presentations-slides-manifest.js', 'manifest.webmanifest', 'icon.svg', 'lizarte-logo.png',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'vendor/xlsx.mini.min.js',
  'fonts/dm-sans-latin-400-normal.woff2', 'fonts/dm-sans-latin-500-normal.woff2',
  'fonts/dm-sans-latin-600-normal.woff2', 'fonts/dm-sans-latin-700-normal.woff2'
];

self.addEventListener('install', e => {
  // cache: 'no-cache' evita guardar copias viejas que el navegador tuviera en su caché HTTP
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, { cache: 'no-cache' })))).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function redPrimero(req) {
  return new Promise(resolve => {
    let resuelto = false;
    // Si la red tarda (habitual en China), servimos la copia guardada a los 4 s
    const t = setTimeout(() => caches.match(req, { ignoreSearch: true }).then(c => { if (c && !resuelto) { resuelto = true; resolve(c); } }), 4000);
    fetch(req, { cache: 'no-cache' }).then(r => {
      if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      clearTimeout(t);
      if (!resuelto) { resuelto = true; resolve(r); }
    }).catch(() => {
      clearTimeout(t);
      caches.match(req, { ignoreSearch: true }).then(c => {
        if (!resuelto) { resuelto = true; resolve(c || caches.match('index.html')); }
      });
    });
  });
}

function cachePrimero(req) {
  return caches.match(req, { ignoreSearch: true }).then(c => c || fetch(req).then(r => {
    if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then(cc => cc.put(req, copia)); }
    return r;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\.mp4$/i.test(url.pathname)) return;
  if (url.pathname.includes('/Presentaciones/') || /brochure-liz-china\.html$/.test(url.pathname) || url.pathname.includes('/fonts/')) {
    e.respondWith(cachePrimero(req));
    return;
  }
  e.respondWith(redPrimero(req));
});
