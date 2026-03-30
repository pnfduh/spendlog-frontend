// sw.js — SpendLog Service Worker
// Scope: / (covers both landing page and /app)

const CACHE_NAME = 'spendlog-v1';
const APP_SHELL = [
  '/',
  '/app',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALL: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── ACTIVATE: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── FETCH: network-first for API calls, cache-first for shell ─────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache API requests — always go to network
  if (url.hostname.includes('railway.app') || url.pathname.startsWith('/api/')) {
    return; // fall through to browser default (network)
  }

  // For navigate requests (opening the app), serve from cache with network fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => {
          // Offline: serve /app for any navigation so the UI still loads
          return caches.match('/app') || caches.match('/');
        })
    );
    return;
  }

  // For static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'SpendLog', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: d,
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  // Open the app page, not the landing page
  e.waitUntil(clients.openWindow('/app'));
});
