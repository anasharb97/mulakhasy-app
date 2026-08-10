// v3: أهم تصحيح — نجرب الشبكة أولاً (Network First) عشان أي تحديث جديد ينزل فوراً،
// ونستخدم الكاش فقط كخطة احتياطية لو ما فيه إنترنت. وأيضاً نمسح أي كاش قديم بالإصدارات السابقة تلقائياً.
const CACHE_NAME = 'malahithati-v3';
const urlsToCache = ['/', '/index.html', '/app.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
