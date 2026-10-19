// Service worker: deja la app instalable y abre aunque no haya señal (los datos se ven desde la copia local).
const VERSION = 'gc-v1.01';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/auth.js', './js/util.js', './js/store.js', './js/domain.js', './js/ui.js', './js/table.js', './js/output.js',
  './js/views/inicio.js', './js/views/alarmas.js', './js/views/clientes.js', './js/views/cartera.js', './js/views/proveedor.js',
  './js/views/cotizaciones.js', './js/views/ventas.js', './js/views/inventario.js', './js/views/reportes.js', './js/views/ajustes.js', './js/views/mas.js',
  './img/logo.jpg', './img/prod_recargable.jpg', './img/prod_312.jpg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return; // datos: siempre en línea
  // Archivos propios: primero red (para recibir actualizaciones), si falla, caché
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  // Librerías y fuentes de CDN: caché primero
  if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })));
  }
});
