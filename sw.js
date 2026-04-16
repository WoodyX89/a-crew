const CACHE_NAME = 'a-crew-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/schedule.html',
  '/members.html',
  '/overtime.html',
  '/login.html',
  '/navbar.html',
  '/css/style.css',
  '/js/app.js',
  '/assets/logo.png',
  '/favicon.png'
];

// Install - Cache important files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activate - Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch - Serve from cache when offline (Network-first for dynamic pages)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});