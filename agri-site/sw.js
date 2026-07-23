/* Service Worker — מאפשר התקנה כאפליקציה (PWA).
   אסטרטגיה: network-first — תמיד מנסה להביא את הגרסה העדכנית מהרשת (כדי שלא נתקע על גרסה ישנה),
   והמטמון משמש רק כגיבוי כשאין רשת. עדכון SW חדש נכנס לתוקף מיד. */
var CACHE = 'agri-shell-v1';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return; // רק אותו דומיין — לא נוגעים ב-CDN/סופאבייס
  e.respondWith((async function () {
    try {
      var fresh = await fetch(req);
      try { var c = await caches.open(CACHE); c.put(req, fresh.clone()); } catch (x) {}
      return fresh;
    } catch (err) {
      var cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        var idx = await caches.match('./index.html') || await caches.match('./');
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
