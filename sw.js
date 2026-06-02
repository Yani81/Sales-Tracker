// Service Worker for Sales Tracker PWA
// Strategy:
//   - Precache app shell (HTML, icons, manifest, Supabase SDK, fonts) on install
//   - Network-first for HTML (so updates show up when online)
//   - Cache-first for static assets
//   - Never cache Supabase API calls (they must be live)

const VERSION = 'v1';
const CACHE_NAME = `sales-tracker-${VERSION}`;

const APP_SHELL = [
  './',
  './sales-tracker.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('Precache failed for some assets:', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Supabase API calls (auth, postgrest, realtime)
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    return; // fall through to network
  }

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Network-first for HTML pages (so updates propagate)
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./sales-tracker.html')))
    );
    return;
  }

  // Cache-first for everything else (assets, SDK, fonts)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache successful responses (incl. opaque from CDN)
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
