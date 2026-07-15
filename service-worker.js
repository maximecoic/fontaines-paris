/* ==========================================================================
   Fontaines Paris — service worker
   App-shell precache + runtime caching for tiles and the open-data API so
   the app keeps working (with the latest known data) when offline or once
   installed on the iOS home screen.
   ========================================================================== */

var VERSION = 'v6';
var SHELL_CACHE = 'fp-shell-' + VERSION;
var DATA_CACHE = 'fp-data-' + VERSION;
var TILE_CACHE = 'fp-tiles-' + VERSION;
var CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE, TILE_CACHE];

var SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.webmanifest',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/markercluster/leaflet.markercluster.js',
  './vendor/markercluster/MarkerCluster.css',
  './vendor/markercluster/MarkerCluster.Default.css',
  './icons/favicon.ico',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return Promise.all(
        SHELL_FILES.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[sw] échec precache', url, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return CURRENT_CACHES.indexOf(key) === -1; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function trimCache(cacheName, maxEntries) {
  caches.open(cacheName).then(function (cache) {
    cache.keys().then(function (keys) {
      if (keys.length > maxEntries) {
        cache.delete(keys[0]).then(function () { trimCache(cacheName, maxEntries); });
      }
    });
  });
}

function networkFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return fetch(request).then(function (response) {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(function () {
      return cache.match(request).then(function (cached) {
        return cached || Promise.reject('offline-no-cache');
      });
    });
  });
}

function cacheFirst(request, cacheName, maxEntries) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
          if (maxEntries) trimCache(cacheName, maxEntries);
        }
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  if (url.hostname === 'opendata.paris.fr') {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname.indexOf('cartocdn.com') !== -1) {
    event.respondWith(cacheFirst(request, TILE_CACHE, 400));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      cacheFirst(request, SHELL_CACHE).catch(function () {
        return caches.match('./index.html');
      })
    );
  }
});
