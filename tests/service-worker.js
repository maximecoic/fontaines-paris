/* Isolated test-only service worker. It intentionally does not cache anything. */
var LAB_VERSION = 'lab-v1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  if (event.request.method === 'GET') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});
