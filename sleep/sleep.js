import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc,
  initializeFirestore, persistentLocalCache, limit, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const auth = getAuth(app);
const colRef = collection(db, "sleep_logs");

let isAdmin = false;
let allSleeps = [];
let editingId = null;
let chartInstance = null;
let currentQuality = 3;

// Автологін
{
  const se = localStorage.getItem("adminEmail");
  const sp = localStorage.getItem("adminPass");
  if (se && sp && !auth.currentUser) {
    signInWithEmailAndPassword(auth, se, atob(sp)).catch(() => {});
  }
}

const QUALITY_EMOJI = { 1: "😩", 2: "😕", 3: "😐", 4: "🙂", 5: "😴" };
const DAY_NAMES = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// === THEME ===
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

// === SIDE MENU ===
{
  const trigger = document.getElementById("sleepMenuTrigger");
  const menu = document.getElementById("sleepSideMenu");
  const closeBtn = document.getElementById("sleepCloseMenu");
  const overlay = document.getElementById("sleepMenuOverlay");
  if (trigger && menu && closeBtn && overlay) {
    const open = () => {
      menu.classList.add("open");
      overlay.classList.add("active");
      trigger.classList.add("active");
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      menu.classList.remove("open");
      overlay.classList.remove("active");
      trigger.classList.remove("active");
      document.body.style.overflow = "";
    };
    trigger.addEventListener("click", () => menu.classList.contains("open") ? close() : open());
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) close();
    });
  }
}

// === AUTH ===
onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  document.getElementById("sleepAdmin").classList.toggle("visible", isAdmin);
  document.getElementById("sleepLoginHint").classList.toggle("visible", !isAdmin);
  renderHistory();
});

// === HELPERS ===
function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h + "г " + (m > 0 ? m + "хв" : "");
}

function fmtTime(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

function fmtTimeOnly(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function escapeHTML(s) {
  return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}

function getDuration(start, end) {
  return Math.max(0, (end - start) / 60000);
}

function toLocalInput(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "T" + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// === LIVE DURATION PREVIEW ===
function updateDurationPreview() {
  const startVal = document.getElementById("sleepStart").value;
  const endVal = document.getElementById("sleepEnd").value;
  const preview = document.getElementById("sleepDurationPreview");
  if (startVal && endVal) {
    const dur = getDuration(new Date(startVal).getTime(), new Date(endVal).getTime());
    if (dur > 0) {
      preview.textContent = "Тривалість: " + fmtDuration(dur);
      preview.style.color = dur >= 420 ? "var(--success)" : "var(--danger)";
    } else {
      preview.textContent = "Час пробудження раніше засипання!";
      preview.style.color = "var(--danger)";
    }
  } else {
    preview.textContent = "Тривалість: —";
    preview.style.color = "var(--text-muted)";
  }
}
document.getElementById("sleepStart").addEventListener("input", updateDurationPreview);
document.getElementById("sleepEnd").addEventListener("input", updateDurationPreview);

// === QUALITY BUTTONS ===
document.querySelectorAll(".sleep-q-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sleep-q-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentQuality = parseInt(btn.dataset.q);
    document.getElementById("sleepQuality").value = String(currentQuality);
  });
});

// === QUICK BUTTONS ===
document.getElementById("sleepQuickToday").addEventListener("click", () => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  yesterday.setHours(23, 0, 0, 0);
  const today = new Date(now);
  today.setHours(7, 0, 0, 0);
  document.getElementById("sleepStart").value = toLocalInput(yesterday);
  document.getElementById("sleepEnd").value = toLocalInput(today);
  updateDurationPreview();
});

document.getElementById("sleepQuickNow").addEventListener("click", () => {
  const now = new Date();
  // Засипання — 8 годин тому, округлено до 10 хв
  const start = new Date(now.getTime() - 8 * 3600000);
  start.setMinutes(start.getMinutes() - (start.getMinutes() % 10), 0, 0);
  // Пробудження — зараз, округлено до 10 хв
  const end = new Date(now);
  end.setMinutes(end.getMinutes() - (end.getMinutes() % 10), 0, 0);
  document.getElementById("sleepStart").value = toLocalInput(start);
  document.getElementById("sleepEnd").value = toLocalInput(end);
  updateDurationPreview();
});

// === DEFAULTS ===
{
  const now = new Date();
  const yesterday23 = new Date(now);
  yesterday23.setDate(now.getDate() - 1);
  yesterday23.setHours(23, 0, 0, 0);
  const today7 = new Date(now);
  today7.setHours(7, 0, 0, 0);
  document.getElementById("sleepStart").value = toLocalInput(yesterday23);
  document.getElementById("sleepEnd").value = toLocalInput(today7);
  updateDurationPreview();
}

// === STREAK ===
function calculateStreak() {
  if (allSleeps.length === 0) return 0;
  // Сортуємо за датою
  const sorted = [...allSleeps].sort((a, b) => b.start - a.start);
  let streak = 0;
  for (const s of sorted) {
    if ((s.duration || 0) >= 420) streak++; // 7+ годин
    else break;
  }
  return streak;
}

// === STATS ===
function renderStats() {
  if (allSleeps.length === 0) {
    ["sleepAvgDur", "sleepWeek", "sleepMax", "sleepMin", "sleepAvgBed", "sleepAvgWake"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
    document.getElementById("sleepStreakNum").textContent = "0";
    return;
  }

  const durations = allSleeps.map((s) => s.duration || 0).filter((d) => d > 0);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const max = Math.max.apply(null, durations);
  const min = Math.min.apply(null, durations);

  const weekAgo = Date.now() - 7 * 86400000;
  const weekSleeps = allSleeps.filter((s) => s.start >= weekAgo);
  const weekAvg = weekSleeps.length > 0
    ? weekSleeps.reduce((a, b) => a + (b.duration || 0), 0) / weekSleeps.length
    : 0;

  // Середній час засипання та пробудження
  let bedSum = 0, wakeSum = 0, count = 0;
  allSleeps.forEach((s) => {
    const bed = new Date(s.start);
    const wake = new Date(s.end);
    bedSum += bed.getHours() * 60 + bed.getMinutes();
    wakeSum += wake.getHours() * 60 + wake.getMinutes();
    count++;
  });
  const avgBed = count > 0 ? bedSum / count : 0;
  const avgWake = count > 0 ? wakeSum / count : 0;

  document.getElementById("sleepStreakNum").textContent = String(calculateStreak());
  document.getElementById("sleepAvgDur").textContent = fmtDuration(avg);
  document.getElementById("sleepWeek").textContent = weekSleeps.length > 0 ? fmtDuration(weekAvg) : "—";
  document.getElementById("sleepMax").textContent = fmtDuration(max);
  document.getElementById("sleepMin").textContent = fmtDuration(min);
  document.getElementById("sleepAvgBed").textContent = fmtTimeOnly(avgBed);
  document.getElementById("sleepAvgWake").textContent = fmtTimeOnly(avgWake);
}

// === CHART ===
function renderChart() {
  const canvas = document.getElementById("sleepChart");
  if (!canvas || typeof Chart === "undefined") return;

  const now = new Date();
  const labels = [];
  const data = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400000;

    // Сон який ЗАКІНЧИВСЯ цього дня (тобто ти прокинувся)
    const match = allSleeps.find((s) => s.end >= dayStart && s.end < dayEnd);
    labels.push(String(d.getDate()) + "." + String(d.getMonth() + 1).padStart(2, "0"));
    data.push(match ? Math.round((match.duration || 0) / 60 * 10) / 10 : 0);
  }

  if (chartInstance) chartInstance.destroy();
  const ctx = canvas.getContext("2d");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "rgba(241, 245, 249, 0.6)" : "rgba(15, 23, 42, 0.6)";

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Годин сну",
        data,
        backgroundColor: data.map((v) => v === 0 ? "rgba(99, 102, 241, 0.15)" : v >= 7 ? "#10b981" : v >= 5 ? "#f59e0b" : "#ef4444"),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.parsed.y > 0 ? ctx.parsed.y + " год" : "немає даних"
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 12,
          ticks: { color: textColor, stepSize: 2 },
          grid: { color: "rgba(128, 128, 128, 0.1)" }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      }
    }
  });
}

// === HISTORY ===
function renderHistory() {
  const container = document.getElementById("sleepTimeline");
  const emptyEl = document.getElementById("sleepEmpty");

  if (allSleeps.length === 0) {
    container.innerHTML = "";
    emptyEl.classList.remove("sleep-hidden");
    renderStats();
    renderChart();
    return;
  }
  emptyEl.classList.add("sleep-hidden");

  let html = "";
  allSleeps.forEach((s) => {
    const dur = s.duration || getDuration(s.start, s.end);
    const quality = s.quality || 3;
    const emoji = QUALITY_EMOJI[quality];
    const noteHTML = s.note ? '<div class="sleep-item-note">' + escapeHTML(s.note) + '</div>' : "";
    const dayName = DAY_NAMES[new Date(s.end).getDay()];

    let actions = "";
    if (isAdmin) {
      actions = '<div class="sleep-item-actions">' +
        '<button class="btn-edit" onclick="editSleep(\'' + s.id + '\')">✏️</button>' +
        '<button class="btn-del" onclick="deleteSleep(\'' + s.id + '\')">✖</button>' +
        '</div>';
    }

    const cls = dur < 360 ? "short" : dur >= 420 ? "healthy" : "";
    html += '<div class="sleep-item ' + cls + '">' +
      actions +
      '<div class="sleep-item-duration"><span class="sleep-item-emoji">' + emoji + '</span>' + fmtDuration(dur) + '</div>' +
      '<div class="sleep-item-times">' + fmtTime(s.start) + ' → ' + fmtTime(s.end) + '</div>' +
      '<span class="sleep-item-day">' + dayName + '</span>' +
      noteHTML +
    '</div>';
  });

  container.innerHTML = html;
  renderStats();
  renderChart();
}

// === SAVE ===
document.getElementById("sleepSaveBtn").addEventListener("click", async () => {
  if (!isAdmin) return;

  const startVal = document.getElementById("sleepStart").value;
  const endVal = document.getElementById("sleepEnd").value;
  const quality = parseInt(document.getElementById("sleepQuality").value);
  const note = document.getElementById("sleepNote").value.trim();
  const st = document.getElementById("status");

  if (!startVal || !endVal) { alert("Вкажи час засипання та пробудження!"); return; }

  const start = new Date(startVal).getTime();
  const end = new Date(endVal).getTime();
  if (end <= start) { alert("Час пробудження має бути після засипання!"); return; }

  const data = {
    start, end,
    duration: getDuration(start, end),
    quality, note,
  };

  const btn = document.getElementById("sleepSaveBtn");
  try {
    st.innerText = "Збереження...";
    btn.disabled = true;

    if (editingId) {
      await updateDoc(doc(db, "sleep_logs", editingId), data);
      cancelEdit();
      st.innerText = "Запис оновлено";
    } else {
      data.createdAt = Date.now();
      await addDoc(colRef, data);
      st.innerText = "Запис збережено";
    }

    document.getElementById("sleepNote").value = "";
    setTimeout(() => { st.innerText = "Хмара синхронізована"; }, 2500);
  } catch (err) {
    alert(err.code === "permission-denied" ? "Доступ заборонено" : "Помилка: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// === EDIT ===
window.editSleep = (id) => {
  if (!isAdmin) return;
  const s = allSleeps.find((x) => x.id === id);
  if (!s) return;

  editingId = id;
  document.getElementById("sleepStart").value = toLocalInput(new Date(s.start));
  document.getElementById("sleepEnd").value = toLocalInput(new Date(s.end));
  const q = s.quality || 3;
  currentQuality = q;
  document.getElementById("sleepQuality").value = String(q);
  document.querySelectorAll(".sleep-q-btn").forEach((b) => {
    b.classList.toggle("active", parseInt(b.dataset.q) === q);
  });
  document.getElementById("sleepNote").value = s.note || "";
  updateDurationPreview();

  document.getElementById("sleepFormTitle").textContent = "Редагування";
  document.getElementById("sleepSaveBtn").textContent = "Оновити";
  document.getElementById("sleepCancelEdit").classList.add("visible");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function cancelEdit() {
  editingId = null;
  document.getElementById("sleepFormTitle").textContent = "Додати запис";
  document.getElementById("sleepSaveBtn").textContent = "Зберегти";
  document.getElementById("sleepCancelEdit").classList.remove("visible");
}

document.getElementById("sleepCancelEdit").addEventListener("click", cancelEdit);

// === DELETE ===
window.deleteSleep = async (id) => {
  if (!isAdmin || !confirm("Видалити цей запис?")) return;
  try { await deleteDoc(doc(db, "sleep_logs", id)); } catch (e) { alert("Помилка: " + e.message); }
};

// === LISTENER ===
const q = query(colRef, orderBy("start", "desc"), limit(100));
onSnapshot(q, (snapshot) => {
  allSleeps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderHistory();
  document.getElementById("status").innerText = "Хмара синхронізована";
}, (err) => {
  console.error("Sleep snapshot error:", err);
  document.getElementById("status").innerText = "Помилка доступу";
});
