/**
 * TOGETHER — Service Worker (PWA)
 * Enables offline shell caching and home-screen installability on Android (Chrome, Brave, etc.) and Desktop.
 */

const CACHE_NAME = 'together-pwa-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './pairing.html',
  './dashboard.html',
  './manifest.json',
  './css/style.css',
  './css/animation.css',
  './css/responsive.css',
  './js/firebase-config.js',
  './js/notifications.js',
  './js/auth.js',
  './js/pairing.js',
  './js/location.js',
  './js/map.js',
  './js/dashboard.js',
  './js/app.js',
  './assets/icons/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/avatars/avatar-1.svg',
  './assets/avatars/avatar-2.svg',
  './assets/avatars/avatar-3.svg',
  './assets/avatars/avatar-4.svg',
  './assets/avatars/avatar-5.svg',
  './assets/avatars/avatar-6.svg'
];

// Install: Cache Shell Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Pre-cache skipped some items:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network First with Cache Fallback for navigation and static assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip Firebase Realtime Database and external APIs from SW caching
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // Network First Strategy
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

