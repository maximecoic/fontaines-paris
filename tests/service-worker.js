/* Isolated test-only service worker. It intentionally does not cache anything. */
var LAB_VERSION = 'lab-v2';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(cacheNames.map(function (cacheName) {
        return caches.open(cacheName).then(function (cache) {
          return cache.keys().then(function (requests) {
            return Promise.all(requests.filter(function (request) {
              return new URL(request.url).pathname.indexOf('/tests/') === 0;
            }).map(function (request) {
              return cache.delete(request);
            }));
          });
        });
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method === 'GET') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});
