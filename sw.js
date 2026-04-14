// ================================================================
//  sw.js — Service Worker для PWA "Кімната Рекордів"
//  Стратегія: Cache First → Network fallback
// ================================================================

const CACHE_NAME = "records-room-v1";

// -----------------------------------------------------------------
//  Статичні ресурси, що кешуються під час інсталяції (App Shell)
// -----------------------------------------------------------------
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./music.js",
  "./firebase-config.js",
  "./manifest.json",
  "./sounds/playlist.json",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/money.png",
  "./assets/exit.png",
  "./assets/noalcohol.png",
  "./assets/nosmoking.png",
  "./assets/icone-btc.png",
  "./fund/index.html",
  "./fund/fund.css",
  "./fund/fund.js",
];

// -----------------------------------------------------------------
//  URL-патерни, для яких кеш ОБХОДИТЬСЯ (тільки мережа)
//  — Firebase API, Auth, Firestore
// -----------------------------------------------------------------
const BYPASS_PATTERNS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /firebaseinstallations\.googleapis\.com/,
  /www\.gstatic\.com\/firebasejs/,
  /firebaseapp\.com\/(__\/auth|__\/firebase)/,
];

// ================================================================
//  INSTALL — попереднє кешування App Shell
// ================================================================
self.addEventListener("install", (event) => {
  console.log("[SW] Installing…");

  // Активуємося негайно — не чекаємо закриття вкладок
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Pre-caching App Shell");
        return cache.addAll(PRECACHE_ASSETS);
      })
      .catch((err) => console.error("[SW] Pre-cache failed:", err))
  );
});

// ================================================================
//  ACTIVATE — очищення застарілих версій кешу
// ================================================================
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating…");

  event.waitUntil(
    Promise.all([
      // Захоплюємо всі відкриті вкладки без перезавантаження
      clients.claim(),

      // Видаляємо всі кеші, крім поточної версії
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Deleting outdated cache:", name);
              return caches.delete(name);
            })
        )
      ),
    ])
  );
});

// ================================================================
//  FETCH — Cache First зі стратегією обходу для Firebase
// ================================================================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Пропускаємо не-GET запити (POST/PUT для Firestore, тощо)
  if (request.method !== "GET") return;

  // 2. Пропускаємо не-HTTP(S) запити (chrome-extension://, тощо)
  if (!url.startsWith("http")) return;

  // 3. Firebase — завжди мережа, ніколи кеш
  if (BYPASS_PATTERNS.some((pattern) => pattern.test(url))) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: "offline", message: "Немає з'єднання з мережею" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // 4. Cache First для всіх статичних ресурсів
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Знайдено в кеші → повертаємо миттєво
      if (cachedResponse) {
        return cachedResponse;
      }

      // Не знайдено в кеші → завантажуємо з мережі та зберігаємо
      return fetch(request)
        .then((networkResponse) => {
          // Кешуємо лише валідні відповіді (same-origin або cors)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" || networkResponse.type === "cors")
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Офлайн і ресурсу немає в кеші
          if (request.destination === "document") {
            // Для навігаційних запитів повертаємо збережений index.html
            return caches.match("./index.html");
          }
          // Для інших ресурсів — тихо повертаємо undefined (браузер обробить)
        });
    })
  );
});
