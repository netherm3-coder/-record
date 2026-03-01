const CACHE_NAME = "trophy-room-v1";

// Список файлів, які треба зберегти в пам'ять телефону
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon.svg",
];

// Крок 1: Встановлення (завантажуємо файли в кеш)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Кешування файлів...");
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// Крок 2: Перехоплення запитів (Стратегія: Спочатку Мережа, потім Кеш)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Якщо інтернет є і запит успішний - віддаємо свіжий файл
        return response;
      })
      .catch(() => {
        // Якщо інтернету немає - беремо з кешу
        return caches.match(event.request);
      }),
  );
});
