// Anouk Fashion Kassa service worker: keeps the app shell available offline.
const CACHE = "kassa-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/~oauth") || url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put("/__shell", c)); return res; })
        .catch(() => caches.match("/__shell").then((r) => r || caches.match(req)))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); } return res; });
      return hit || net;
    })
  );
});
