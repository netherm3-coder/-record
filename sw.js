// ================================================================
//  Service Worker v3 — Network First (безпечна стратегія)
// ================================================================
const CACHE_NAME = "records-room-v3";

// Firebase/API — завжди тільки мережа, ніколи кеш
const BYPASS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /firebaseinstallations\.googleapis\.com/,
  /www\.gstatic\.com\/firebasejs/,
  /firebaseapp\.com\//,
  /bank\.gov\.ua/,
  /coingecko\.com/,
  /goldprice\.org/,
];

// INSTALL — просто активуємось, без cache.addAll
// (кеш наповнюється автоматично при першому завантаженні)
self.addEventListener("install", () => self.skipWaiting());

// ACTIVATE — чистимо старі кеші
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  );
});

// FETCH — Network First: спочатку мережа, при помилці — кеш
self.addEventListener("fetch", (event) => {
  var req = event.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  // Firebase API — тільки мережа
  if (BYPASS.some((p) => p.test(req.url))) {
    event.respondWith(fetch(req).catch(() => new Response("offline", { status: 503 })));
    return;
  }

  // Все інше — Network First
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Кешуємо успішні відповіді для офлайну
        if (res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
