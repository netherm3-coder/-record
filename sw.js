const CACHE_NAME = "records-room-v5";

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

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

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

self.addEventListener("fetch", (event) => {
  var req = event.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  if (BYPASS.some((p) => p.test(req.url))) {
    event.respondWith(fetch(req).catch(() => new Response("offline", { status: 503 })));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
