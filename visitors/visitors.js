import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  collection, onSnapshot, query, orderBy, limit,
  initializeFirestore, persistentLocalCache,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const auth = getAuth(app);

let allVisits = [];
let currentFilter = "all";

// Автологін
{
  const se = localStorage.getItem("adminEmail");
  const sp = localStorage.getItem("adminPass");
  if (se && sp && !auth.currentUser) {
    signInWithEmailAndPassword(auth, se, atob(sp)).catch(() => {});
  }
}

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

function getFiltered() {
  const now = Date.now();
  switch (currentFilter) {
    case "today":
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return allVisits.filter((v) => v.timestamp >= d.getTime());
    case "week":
      return allVisits.filter((v) => v.timestamp >= now - 7 * 86400000);
    case "month":
      return allVisits.filter((v) => v.timestamp >= now - 30 * 86400000);
    default:
      return allVisits;
  }
}

// STATS
function renderStats() {
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = allVisits.filter((v) => v.timestamp >= today.getTime()).length;
  const weekCount = allVisits.filter((v) => v.timestamp >= now - 7 * 86400000).length;
  const uniqueIPs = new Set(allVisits.map((v) => v.ip).filter((ip) => ip && ip !== "unknown")).size;

  document.getElementById("visTotal").textContent = allVisits.length;
  document.getElementById("visToday").textContent = todayCount;
  document.getElementById("visWeek").textContent = weekCount;
  document.getElementById("visUnique").textContent = uniqueIPs;
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
    const d = new Date(v.timestamp);
    const time = String(d.getDate()).padStart(2, "0") + "." +
      String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + " " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");

    const location = [v.city, v.country].filter(Boolean).join(", ");
    const cls = (v.isAdmin ? "is-admin " : "") + (v.device === "Mobile" ? "is-mobile" : "is-desktop");

    let tags = "";
    if (v.isAdmin) tags += '<span class="vis-tag vis-tag-admin">АДМІН</span>';
    if (v.os) tags += '<span class="vis-tag vis-tag-os">' + esc(v.os) + '</span>';
    if (v.browser) tags += '<span class="vis-tag vis-tag-browser">' + esc(v.browser) + (v.browserVer ? ' ' + v.browserVer : '') + '</span>';
    if (v.device) tags += '<span class="vis-tag">' + esc(v.device) + '</span>';
    if (v.screen) tags += '<span class="vis-tag">' + esc(v.screen) + '</span>';

    return '<div class="vis-item ' + cls + '">' +
      '<div class="vis-item-time">' + time + '</div>' +
      '<div class="vis-item-ip">' + esc(v.ip || "—") + '</div>' +
      (location ? '<div class="vis-item-location">📍 ' + esc(location) + '</div>' : '') +
      '<div class="vis-item-tags">' + tags + '</div>' +
    '</div>';
  }).join("");
}

function esc(s) {
  return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}
