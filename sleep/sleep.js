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

// Автологін
{
  const se = localStorage.getItem("adminEmail");
  const sp = localStorage.getItem("adminPass");
  if (se && sp && !auth.currentUser) {
    signInWithEmailAndPassword(auth, se, atob(sp)).catch(() => {});
  }
}

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

function escapeHTML(s) {
  return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}

function getDuration(start, end) {
  return Math.max(0, (end - start) / 60000);
}

const QUALITY_LABELS = { 5: "Відмінно", 4: "Добре", 3: "Нормально", 2: "Погано", 1: "Жахливо" };

// === LIVE DURATION PREVIEW ===
function updateDurationPreview() {
  const startVal = document.getElementById("sleepStart").value;
  const endVal = document.getElementById("sleepEnd").value;
  const preview = document.getElementById("sleepDurationPreview");
  if (startVal && endVal) {
    const dur = getDuration(new Date(startVal).getTime(), new Date(endVal).getTime());
    if (dur > 0) {
      preview.textContent = "Тривалість: " + fmtDuration(dur);
      preview.style.display = "block";
    } else {
      preview.textContent = "Час пробудження раніше ніж засипання!";
    }
  } else {
    preview.textContent = "Тривалість: —";
  }
}
document.getElementById("sleepStart").addEventListener("input", updateDurationPreview);
document.getElementById("sleepEnd").addEventListener("input", updateDurationPreview);

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

function toLocalInput(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "T" + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// === STATS ===
function renderStats() {
  if (allSleeps.length === 0) {
    ["sleepAvgDur", "sleepWeek", "sleepMax", "sleepMin"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
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

  document.getElementById("sleepAvgDur").textContent = fmtDuration(avg);
  document.getElementById("sleepWeek").textContent = weekSleeps.length > 0 ? fmtDuration(weekAvg) : "—";
  document.getElementById("sleepMax").textContent = fmtDuration(max);
  document.getElementById("sleepMin").textContent = fmtDuration(min);
}

// === HISTORY ===
function renderHistory() {
  const container = document.getElementById("sleepTimeline");
  const emptyEl = document.getElementById("sleepEmpty");

  if (allSleeps.length === 0) {
    container.innerHTML = "";
    emptyEl.classList.remove("sleep-hidden");
    return;
  }
  emptyEl.classList.add("sleep-hidden");

  let html = "";
  allSleeps.forEach((s) => {
    const dur = s.duration || getDuration(s.start, s.end);
    const quality = s.quality || 3;
    const noteHTML = s.note ? '<div class="sleep-item-note">' + escapeHTML(s.note) + '</div>' : "";

    let actions = "";
    if (isAdmin) {
      actions = '<div class="sleep-item-actions">' +
        '<button class="btn-edit" onclick="editSleep(\'' + s.id + '\')">✏️</button>' +
        '<button class="btn-del" onclick="deleteSleep(\'' + s.id + '\')">✖</button>' +
        '</div>';
    }

    html += '<div class="sleep-item">' +
      actions +
      '<div class="sleep-item-duration">' + fmtDuration(dur) + '</div>' +
      '<div class="sleep-item-times">' + fmtTime(s.start) + ' → ' + fmtTime(s.end) + '</div>' +
      '<span class="sleep-item-quality sleep-q-' + quality + '">' + QUALITY_LABELS[quality] + '</span>' +
      noteHTML +
    '</div>';
  });

  container.innerHTML = html;
  renderStats();
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
  if (end <= start) { alert("Час пробудження має бути після часу засипання!"); return; }

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
  document.getElementById("sleepQuality").value = String(s.quality || 3);
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
