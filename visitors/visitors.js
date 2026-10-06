import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  collection, onSnapshot, query, orderBy, limit,
  initializeFirestore, persistentLocalCache,
  doc, deleteDoc, getDocs, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, initializeAuth, onAuthStateChanged,
  browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// УВАГА: visitor_logs може записати будь-хто з інтернету (ключ API публічний).
// Тому КОЖНЕ поле запису — недовірений текст: у HTML лише через esc(),
// числа — лише через num(). Інакше чужий скрипт виконається в сесії адміна.

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
// Сесія входу — у localStorage, як на головній (див. app.js): інакше модуль
// переносив її в IndexedDB, а той браузер іноді чистить — і вхід зникав
let auth;
try {
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence],
  });
} catch (e) {
  auth = getAuth(app);
}

let allVisits = [];
let currentFilter = "all";

// THEME
const themeBtn = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("workoutTheme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
themeBtn.innerText = savedTheme === "dark" ? "☀️" : "🌙";
themeBtn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("workoutTheme", next);
  themeBtn.innerText = next === "dark" ? "☀️" : "🌙";
});

// AUTH GATE
onAuthStateChanged(auth, (user) => {
  const status = document.getElementById("status");
  const content = document.getElementById("visContent");
  const not404 = document.getElementById("vis404");

  if (!user) {
    content.classList.remove("visible");
    not404.classList.add("visible");
    status.style.display = "none";
    return;
  }

  // Адмін
  not404.classList.remove("visible");
  content.classList.add("visible");
  status.innerText = "Завантаження логів...";
  startListening();
});

let unsub = null;
function startListening() {
  if (unsub) return;
  const q = query(collection(db, "visitor_logs"), orderBy("timestamp", "desc"), limit(500));
  unsub = onSnapshot(q, (snap) => {
    allVisits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderList();
    document.getElementById("status").innerText = "Хмара синхронізована";
  }, (err) => {
    console.error("Visitor snapshot:", err);
    document.getElementById("status").innerText = "Помилка: перевір rules для visitor_logs";
  });
}

// FILTERS
document.querySelectorAll(".vis-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".vis-filter").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

// === ОЧИСТИТИ ВСІ ЗАПИСИ ===
const clearAllBtn = document.getElementById("visClearAll");
if (clearAllBtn) {
  clearAllBtn.addEventListener("click", async () => {
    if (allVisits.length === 0) {
      alert("Список вже порожній");
      return;
    }
    if (!confirm("Видалити ВСІ " + allVisits.length + " записів відвідувачів? Дію не можна скасувати.")) return;
    if (!confirm("Точно впевнений? Всі дані про відвідувачів зникнуть назавжди.")) return;

    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "🗑️ Видалення...";

    try {
      // Видаляємо батчами по 400 (Firestore ліміт — 500 операцій на батч)
      const snap = await getDocs(collection(db, "visitor_logs"));
      const docs = snap.docs;
      let deleted = 0;

      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deleted += chunk.length;
        clearAllBtn.textContent = "🗑️ " + deleted + "/" + docs.length;
      }

      clearAllBtn.disabled = false;
      clearAllBtn.textContent = "🗑️ Очистити всі записи";
      // sessionStorage щоб сьогодні не записувати знову одразу
      sessionStorage.removeItem("visitorLogged_" + new Date().toDateString());
      document.getElementById("status").innerText = "Видалено " + deleted + " записів";
      setTimeout(() => { document.getElementById("status").innerText = "Хмара синхронізована"; }, 2500);
    } catch (e) {
      console.error("Clear failed:", e);
      alert("Помилка: " + e.message);
      clearAllBtn.disabled = false;
      clearAllBtn.textContent = "🗑️ Очистити всі записи";
    }
  });
}

function getFiltered() {
  const now = Date.now();
  switch (currentFilter) {
    case "today": {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return allVisits.filter((v) => num(v.timestamp) >= d.getTime());
    }
    case "week":
      return allVisits.filter((v) => num(v.timestamp) >= now - 7 * 86400000);
    case "month":
      return allVisits.filter((v) => num(v.timestamp) >= now - 30 * 86400000);
    default:
      return allVisits;
  }
}

function visits(v) {
  return Math.max(1, Math.floor(num(v.visitCount)) || 1);
}

// STATS
function renderStats() {
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastOf = (v) => num(v.lastVisit) || num(v.timestamp);
  const todayCount = allVisits.filter((v) => lastOf(v) >= today.getTime()).length;
  const weekCount = allVisits.filter((v) => lastOf(v) >= now - 7 * 86400000).length;
  const totalVisits = allVisits.reduce((s, v) => s + visits(v), 0);

  document.getElementById("visTotal").textContent = totalVisits;
  document.getElementById("visToday").textContent = todayCount;
  document.getElementById("visWeek").textContent = weekCount;
  document.getElementById("visUnique").textContent = allVisits.length;
}

// LIST
function renderList() {
  const list = document.getElementById("visList");
  const empty = document.getElementById("visEmpty");
  const filtered = getFiltered();

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("vis-hidden");
    return;
  }
  empty.classList.add("vis-hidden");

  list.innerHTML = filtered.map((v) => {
    const lastTs = num(v.lastVisit) || num(v.timestamp);
    const firstTs = num(v.firstVisit) || num(v.timestamp);
    const d = new Date(lastTs);
    const time = String(d.getDate()).padStart(2, "0") + "." +
      String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + " " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");

    const visitCount = visits(v);
    const firstStr = new Date(firstTs).toLocaleDateString("uk-UA");

    const location = [v.city, v.country].filter(Boolean).join(", ");
    const cls = (v.isAdmin === true ? "is-admin " : "") + (v.device === "Mobile" ? "is-mobile" : "is-desktop");

    // Нові записи: id = "d_" + ID пристрою. Старі (до переходу) — id = IP.
    const isDevice = String(v.id || "").startsWith("d_");
    let tags = isDevice
      ? '<span class="vis-tag" title="ID пристрою">📱 ' + esc(String(v.id).slice(2, 8)) + '</span>'
      : '<span class="vis-tag" title="Запис до переходу на ID пристрою">старий · за IP</span>';
    if (v.isAdmin === true) tags += '<span class="vis-tag vis-tag-admin">АДМІН</span>';
    if (v.os) tags += '<span class="vis-tag vis-tag-os">' + esc(v.os) + '</span>';
    if (v.browser) tags += '<span class="vis-tag vis-tag-browser">' + esc(v.browser) + (v.browserVer ? ' ' + esc(v.browserVer) : '') + '</span>';
    if (v.device) tags += '<span class="vis-tag">' + esc(v.device) + '</span>';
    if (v.screen) tags += '<span class="vis-tag">' + esc(v.screen) + '</span>';

    const visitBadge = visitCount > 1
      ? '<span class="vis-count-badge">×' + visitCount + '</span>'
      : '';

    return '<div class="vis-item ' + cls + '">' +
      '<div class="vis-item-time">Останній: ' + esc(time) + (visitCount > 1 ? ' · вперше: ' + esc(firstStr) : '') + '</div>' +
      '<div class="vis-item-ip">' + esc(v.ip && v.ip !== "unknown" ? v.ip : "IP невідома") + visitBadge + '</div>' +
      (location ? '<div class="vis-item-location">📍 ' + esc(location) + '</div>' : '') +
      '<div class="vis-item-tags">' + tags + '</div>' +
    '</div>';
  }).join("");
}

// Текст із бази → безпечний для innerHTML
function esc(s) {
  if (s === undefined || s === null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Число з бази: будь-що інше → 0
function num(x) {
  if (x && typeof x.toMillis === "function") return x.toMillis(); // Firestore Timestamp
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}
