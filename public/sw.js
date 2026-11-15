/**
 * Service worker: hosts the share target and a minimal app shell cache.
 *
 * A share from another app arrives as a POST to /share-target. The worker writes
 * the URL into the same IndexedDB the app reads (meta key "pendingShare") and
 * redirects to the app, which picks it up on load. No network, no upload.
 */

const DB_NAME = 'wishlist';
const DB_VERSION = 1;
const META = 'meta';
const PENDING_KEY = 'pendingShare';
const SHELL = 'wishlist-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function storePending(payload) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(META, 'readwrite');
      tx.objectStore(META).put(payload, PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

function firstUrl(text, url) {
  for (const value of [url, text]) {
    if (!value) continue;
    const match = String(value).match(/https?:\/\/[^\s]+/);
    if (match) return match[0];
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        const form = await request.formData();
        const shared = firstUrl(form.get('url'), form.get('text') ?? form.get('title'));
        if (shared) {
          try {
            await storePending({ url: shared, at: new Date().toISOString() });
          } catch {
            // Nothing stored means nothing lost: the user still lands in the app.
          }
        }
        return Response.redirect(new URL('./', self.registration.scope).toString(), 303);
      })(),
    );
    return;
  }

  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Network first for navigations, cache as a fallback so the shell opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          return cached ?? caches.match('./').then((entry) => entry ?? Response.error());
        }
      })(),
    );
  }
});
