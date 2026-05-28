import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  initializeFirestore,
  persistentLocalCache,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  limit,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// === ЛОГІКА ПЕРЕМИКАННЯ ВКЛАДОК (Сучасний підхід) ===
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    // Отримуємо ID вкладки з data-атрибута кнопки
    const tabId = btn.getAttribute("data-tab");
    if (!tabId) return;

    // 1. Ховаємо всі вкладки
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.classList.remove("active");
    });

    // 2. Знімаємо підсвітку з усіх кнопок меню
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.remove("active");
    });

    // 3. Показуємо потрібну вкладку
    document.getElementById(tabId).classList.add("active");

    // 4. Підсвічуємо натиснуту кнопку
    btn.classList.add("active");

    // 5. Рендеримо вкладку Досягнень при її відкритті
    if (tabId === "tab-achievements" && window.renderAchievementsTab) {
      window.renderAchievementsTab();
    }
  });
});

const app = initializeApp(firebaseConfig);

// Вмикаємо офлайн-пам'ять для бази даних (з fallback для інкогніто)
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (e) {
  // Інкогніто або заблокований IndexedDB — використовуємо пам'ять
  db = initializeFirestore(app, {});
}

const auth = getAuth(app); // Підключаємо Auth

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Помилка збереження сесії:", error);
});
const colRef = collection(db, "workouts");

let isAdmin = false; // Глобальна змінна для перевірки власника

// === ЛОГІКА ТЕМ ===
const themeBtn = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const savedTheme = localStorage.getItem("workoutTheme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
if (themeIcon) themeIcon.src = savedTheme === "dark" ? "assets/icons/sun.svg" : "assets/icons/moon.svg";

themeBtn.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("workoutTheme", newTheme);
  if (themeIcon) themeIcon.src = newTheme === "dark" ? "assets/icons/sun.svg" : "assets/icons/moon.svg";
  // renderUI() removed — theme change is purely CSS, no DOM rebuild needed
});
// === ЛОГІКА ВІКНА "ФУНКЦІОНАЛ" ===
const infoBtn = document.getElementById("infoBtn");
const infoModal = document.getElementById("infoModal");
const closeInfoBtn = document.getElementById("closeInfoBtn");

if (infoBtn && infoModal && closeInfoBtn) {
  infoBtn.addEventListener("click", () => {
    infoModal.classList.add("show");
  });

  closeInfoBtn.addEventListener("click", () => {
    infoModal.classList.remove("show");
  });

  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
      infoModal.classList.remove("show");
    }
  });
}
document.getElementById("workoutDate").valueAsDate = new Date();

// === ЛОГІКА ВІКНА ДОНАТУ ===
const donateBtn = document.getElementById("donateBtn");
const donateModal = document.getElementById("donateModal");
const closeDonateBtn = document.getElementById("closeDonateBtn");

if (donateBtn && donateModal && closeDonateBtn) {
  donateBtn.addEventListener("click", () => {
    donateModal.classList.add("show");
  });

  closeDonateBtn.addEventListener("click", () => {
    donateModal.classList.remove("show");
  });

  donateModal.addEventListener("click", (e) => {
    if (e.target === donateModal) {
      donateModal.classList.remove("show");
    }
  });
}

// === СИСТЕМА АВТОРИЗАЦІЇ ===

// Кнопка "Увійти як адмін" у бургер-меню
{
  const loginSection = document.getElementById("loginSection");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  if (adminLoginBtn && loginSection) {
    adminLoginBtn.addEventListener("click", () => {
      // Закриваємо меню
      document.getElementById("sideMenu")?.classList.remove("open");
      document.getElementById("menuOverlay")?.classList.remove("active");
      document.getElementById("menuTrigger")?.classList.remove("active");
      document.body.style.overflow = "";
      // Показуємо форму
      loginSection.style.display = "block";
      setTimeout(() => {
        loginSection.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("loginEmail")?.focus();
      }, 100);
    });
  }

  // Кнопка експорту
  const exportBtn = document.getElementById("exportRecordsBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      document.getElementById("sideMenu")?.classList.remove("open");
      document.getElementById("menuOverlay")?.classList.remove("active");
      document.getElementById("menuTrigger")?.classList.remove("active");
      document.body.style.overflow = "";
      if (window.showExportModal) window.showExportModal();
    });
  }
}

onAuthStateChanged(auth, (user) => {
  const navPhotos = document.getElementById("nav-photos");
  const weightPanel = document.getElementById("weightAdminPanel");
  const adminSecretBtn = document.getElementById("adminSecretBtn");

  if (user) {
    isAdmin = true;
    localStorage.setItem("isAdmin", "true"); // Прапор для секретного модуля
    document.getElementById("adminPanel").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("loginSection").style.display = "none";
    if (weightPanel) weightPanel.style.display = "block";
    if (navPhotos) navPhotos.style.display = "flex";

  if (adminSecretBtn && localStorage.getItem("isAdmin") === "true") adminSecretBtn.style.display = "flex";
  const adminVisitorsBtn = document.getElementById("adminVisitorsBtn");
  if (adminVisitorsBtn) adminVisitorsBtn.style.display = "flex";
  const adminLoginBtnHide = document.getElementById("adminLoginBtn");
  if (adminLoginBtnHide) adminLoginBtnHide.style.display = "none";
  } else {
    isAdmin = false;
    localStorage.removeItem("isAdmin"); // Знімаємо прапор при виході
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
    if (weightPanel) weightPanel.style.display = "none";

  if (adminSecretBtn) adminSecretBtn.style.display = "none";
  const adminVisitorsBtnHide = document.getElementById("adminVisitorsBtn");
  if (adminVisitorsBtnHide) adminVisitorsBtnHide.style.display = "none";
  const adminLoginBtnShow = document.getElementById("adminLoginBtn");
  if (adminLoginBtnShow) adminLoginBtnShow.style.display = "flex";

    // ХОВАЄМО ВКЛАДКУ ФОТО ТА ВИКИДАЄМО З НЕЇ, ЯКЩО ГІСТЬ
    if (navPhotos) {
      navPhotos.style.display = "none";
      if (document.getElementById("tab-photos").classList.contains("active")) {
        document.querySelector('[data-tab="tab-dashboard"]').click();
      }
    }
  }

  renderUI();
  listenToWorkouts();
  listenToMeta();
  if (window.listenToWeight) window.listenToWeight();
  if (window.listenToPhotos) window.listenToPhotos();
  if (window.renderPhotos) window.renderPhotos();
  if (typeof renderBodyMap === "function") renderBodyMap();
});
{
  const adminSecretBtnEl = document.getElementById("adminSecretBtn");
  if (adminSecretBtnEl) {
    adminSecretBtnEl.addEventListener("click", () => {
      import("./secret_module/secret.js")
        .then((m) => m.openSecretModule())
        .catch(() => {});
    });
  }
}

// Кнопка Увійти
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const loginBtn = document.getElementById("loginBtn");
  const errorMsg = document.getElementById("loginError");

  loginBtn.innerText = "Завантаження...";
  errorMsg.innerText = "";

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // Зберігаємо дані для автологіну
    localStorage.setItem("adminEmail", email);
    localStorage.setItem("adminPass", btoa(pass));
  } catch (error) {
    console.error("Помилка авторизації Firebase:", error.code, error.message);

    let userMessage = "Невірний логін або пароль!";

    if (error.code === "auth/network-request-failed") {
      userMessage = "Відсутнє з'єднання з інтернетом. Перевірте мережу.";
    } else if (error.code === "auth/too-many-requests") {
      userMessage =
        "Забагато спроб входу. Ваш акаунт тимчасово заблоковано, спробуйте пізніше.";
    } else if (error.code === "auth/invalid-email") {
      userMessage = "Введено некоректний формат email.";
    }

    errorMsg.innerText = userMessage;
  } finally {
    loginBtn.innerText = "Увійти";
  }
});

// === АВТОЛОГІН ===
{
  const savedEmail = localStorage.getItem("adminEmail");
  const savedPass = localStorage.getItem("adminPass");
  if (savedEmail && savedPass && !auth.currentUser) {
    signInWithEmailAndPassword(auth, savedEmail, atob(savedPass)).catch(() => {
      // Дані застарілі — очищаємо
      localStorage.removeItem("adminEmail");
      localStorage.removeItem("adminPass");
    });
  }
}

// === Кнопка Вийти ===
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      localStorage.removeItem("adminEmail");
      localStorage.removeItem("adminPass");
      localStorage.removeItem("isAdmin"); // Знімаємо прапор секретного модуля
      await signOut(auth);
      location.reload();
    } catch (error) {
      console.error("Помилка при виході:", error);
    }
  });
}
// === СЛОВНИК ВПРАВ (Єдине джерело правди) ===
const EX = {
  PULLUPS: "Підтягування",
  PUSHUPS: "Відтискання",
  DIPS: "Бруси",
  RUN: "Біг",
  SPRINT: "Спринт",
  SHUTTLE: "Човниковий біг",
  CUSTOM: "custom",
};

let allWorkouts = [];
let myChartInstance = null;
let allGoals = {};
let pedestalData = {};

// Іконки для динамічно згенерованого HTML (img-теги з themed-icon)
const ICONS = {
  cal:      `<img src="assets/icons/calendar.svg"    class="themed-icon js-icon" alt="">`,
  edit:     `<img src="assets/icons/edit.svg"         class="themed-icon js-icon" alt="">`,
  note:     `<img src="assets/icons/note.svg"         class="themed-icon js-icon" alt="">`,
  video:    `<img src="assets/icons/video.svg"        class="themed-icon js-icon" alt="">`,
  crown:    `<img src="assets/icons/crown.svg"        class="themed-icon js-icon" alt="">`,
  bulb:     `<img src="assets/icons/lightbulb.svg"   class="themed-icon js-icon" alt="">`,
  medal:    `<img src="assets/icons/medal.svg"        class="themed-icon js-icon" alt="">`,
  fire:     `<img src="assets/icons/fire.svg"         class="themed-icon js-icon" alt="">`,
  bolt:     `<img src="assets/icons/bolt.svg"         class="themed-icon js-icon" alt="">`,
  trophy:   `🏆`,
  shield:   `<img src="assets/icons/shield.svg"       class="themed-icon js-icon" alt="">`,
  target:   `<img src="assets/icons/target.svg"       class="themed-icon js-icon" alt="">`,
    // Кольорові inline SVG — не потребують themed-icon фільтру
      muscle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="2" y="10" width="3" height="4" rx="1"/><rect x="19" y="10" width="3" height="4" rx="1"/><rect x="5" y="8" width="3" height="8" rx="1"/><rect x="16" y="8" width="3" height="8" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      
        timer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="13" r="7"/><polyline points="12 10 12 13 14 15"/><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="19" y1="5" x2="17" y2="7"/></svg>`,
        
          location: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
          
            chart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><polyline points="4 16 8 12 14 8 18 10 22 7"/><polyline points="19 7 22 7 22 10"/></svg>`,
};
// === КЕШУВАННЯ DOM-ЕЛЕМЕНТІВ (Для продуктивності) ===
const DOM = {
  exSelect: document.getElementById("exSelect"),
  workoutDate: document.getElementById("workoutDate"),
  workoutCount: document.getElementById("workoutCount"),
  addWeight: document.getElementById("addWeight"),
  exMin: document.getElementById("exMin"),
  exSec: document.getElementById("exSec"),
  runDistance: document.getElementById("runDistance"),
  runMin: document.getElementById("runMin"),
  runSec: document.getElementById("runSec"),
  sprintDistance: document.getElementById("sprintDistance"),
  sprintSec: document.getElementById("sprintSec"),
  shuttleScheme: document.getElementById("shuttleScheme"),
  shuttleMin: document.getElementById("shuttleMin"),
  shuttleSecVal: document.getElementById("shuttleSecVal"),
  shuttleMs: document.getElementById("shuttleMs"),
  customEx: document.getElementById("customEx"),
  customResultStr: document.getElementById("customResultStr"),
  customMin: document.getElementById("customMin"),
  customSec: document.getElementById("customSec"),
  workoutNote: document.getElementById("workoutNote"),
  workoutVideoUrl: document.getElementById("workoutVideoUrl"),
  saveBtn: document.getElementById("saveBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  oneRmContainer: document.getElementById("oneRmContainer"),
  statusMsg: document.getElementById("status"),
};

// Тепер статистика бере ключі зі словника
let globalStats = {
  [EX.PULLUPS]: 0,
  [EX.PUSHUPS]: 0,
  [EX.DIPS]: 0,
  [EX.RUN]: 0,
  otherSets: 0,
};

// === ЧОВНИКОВИЙ БІГ: ініціалізація UI ===
let _shuttleUIInit = false;
function _initShuttleUI() {
  if (_shuttleUIInit) return;
  _shuttleUIInit = true;

  ["shuttleMin", "shuttleSecVal", "shuttleMs", "shuttleScheme"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", _updateShuttlePreview);
  });

  // Автоперехід між полями + обмеження значень
  const secEl = document.getElementById("shuttleSecVal");
  const msEl  = document.getElementById("shuttleMs");
  const minEl = document.getElementById("shuttleMin");

  secEl?.addEventListener("input", () => {
    let v = parseInt(secEl.value);
    if (!isNaN(v) && v > 59) { secEl.value = 59; }
    if (!isNaN(v) && secEl.value.length >= 2) msEl?.focus();
  });
  minEl?.addEventListener("input", () => {
    let v = parseInt(minEl.value);
    if (!isNaN(v) && v > 60) minEl.value = 60;
    if (!isNaN(v) && minEl.value.length >= 2) secEl?.focus();
  });
  msEl?.addEventListener("input", () => {
    let v = parseInt(msEl.value);
    if (!isNaN(v) && v > 99) msEl.value = 99;
  });
}

function _updateShuttlePreview() {
  const preview = document.getElementById("shuttlePreview");
  if (!preview) return;
  const scheme = _getShuttleScheme();
  const time = _getShuttleTimeStr();
  preview.textContent = (scheme && time) ? `⏱ ${time} — ${scheme}` : "";
}

function _getShuttleScheme() {
  return document.getElementById("shuttleScheme")?.value.trim() || "";
}

function _getShuttleTimeStr() {
  const min = parseInt(document.getElementById("shuttleMin")?.value || "0") || 0;
  const sec = parseInt(document.getElementById("shuttleSecVal")?.value || "0") || 0;
  const ms  = parseInt(document.getElementById("shuttleMs")?.value  || "0") || 0;
  if (min === 0 && sec === 0 && ms === 0) return "";
  return `${min}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function _getShuttleTotalSec() {
  const min = parseInt(document.getElementById("shuttleMin")?.value || "0") || 0;
  const sec = parseInt(document.getElementById("shuttleSecVal")?.value || "0") || 0;
  const ms  = parseInt(document.getElementById("shuttleMs")?.value  || "0") || 0;
  return min * 60 + sec + ms / 100;
}

window.uiLogic = () => {
  const select = document.getElementById("exSelect").value;
  const custom = document.getElementById("customEx");
  const countBox = document.getElementById("countContainer");
  const timeBox = document.getElementById("timeContainer");
  const customResBox = document.getElementById("customResultContainer");
  const sprintBox = document.getElementById("sprintContainer");
  const shuttleBox = document.getElementById("shuttleContainer");

  if (custom) custom.style.display = select === "custom" ? "block" : "none";
  if (sprintBox) sprintBox.style.display = "none";
  if (shuttleBox) shuttleBox.style.display = "none";

  if (select === "Біг") {
    countBox.style.display = "none";
    timeBox.style.display = "block";
    customResBox.style.display = "none";
  } else if (select === "Спринт") {
    countBox.style.display = "none";
    timeBox.style.display = "none";
    customResBox.style.display = "none";
    if (sprintBox) sprintBox.style.display = "block";
  } else if (select === "Човниковий біг") {
    countBox.style.display = "none";
    timeBox.style.display = "none";
    customResBox.style.display = "none";
    if (shuttleBox) shuttleBox.style.display = "block";
    _initShuttleUI();
  } else if (select === "custom") {
    countBox.style.display = "none";
    timeBox.style.display = "none";
    customResBox.style.display = "block";
  } else {
    countBox.style.display = "block";
    timeBox.style.display = "none";
    customResBox.style.display = "none";
  }
  if (typeof update1RM === "function") update1RM();
};

window.updateDropdowns = () => {
  const dbExercises = [...new Set(allWorkouts.map((w) => w.exercise))];

  // Для додавання: базові типи + кастомні (без бігових варіантів з дистанцією)
  const baseForAdd = [EX.PULLUPS, EX.PUSHUPS, EX.DIPS, EX.RUN, EX.SPRINT, EX.SHUTTLE];
  const customFromDB = dbExercises.filter((ex) => !baseForAdd.includes(ex) && !isRunningExercise(ex));
  const addList = [...baseForAdd, ...customFromDB];

  const labelMap = { [EX.RUN]: "Біг (км)", [EX.SPRINT]: "Спринт (м)", [EX.SHUTTLE]: "Човниковий біг" };

  const exSelect = document.getElementById("exSelect");
  const currentEx = exSelect.value;
  exSelect.innerHTML =
    addList.map((ex) => `<option value="${ex}">${labelMap[ex] || ex}</option>`).join("") +
    `<option value="custom">Інше...</option>`;
  if (addList.includes(currentEx) || currentEx === "custom")
    exSelect.value = currentEx;

  // === ДВОРІВНЕВИЙ ФІЛЬТР ===
  const freq = {};
  allWorkouts.forEach(w => { freq[w.exercise] = (freq[w.exercise] || 0) + 1; });

  function _baseType(ex) {
    if (ex.startsWith("Біг ")) return "Біг";
    if (ex.startsWith("Спринт ")) return "Спринт";
    if (ex.startsWith("Човниковий біг ")) return "Човниковий біг";
    return ex;
  }

  const groups = {};
  dbExercises.forEach(ex => {
    const bt = _baseType(ex);
    if (!groups[bt]) groups[bt] = [];
    groups[bt].push(ex);
  });

  const groupFreq = {};
  Object.keys(groups).forEach(g => {
    groupFreq[g] = groups[g].reduce((s, ex) => s + (freq[ex] || 0), 0);
  });
  const sortedGroups = Object.keys(groups).sort((a, b) => groupFreq[b] - groupFreq[a]);

  const filterType = document.getElementById("filterType");
  const filterSub  = document.getElementById("filterSub");
  if (!filterType || !filterSub) return; // HTML не оновлений — пропускаємо фільтр

  const prevType = filterType.value;
  const prevSub  = filterSub.value;

  filterType.innerHTML = `<option value="">— Вправа —</option>` +
    sortedGroups.map(g => `<option value="${g}">${g}</option>`).join("");

  if (sortedGroups.includes(prevType)) filterType.value = prevType;

  _rebuildSubFilter(groups, prevType, prevSub);
};

// Повторна побудова sub-фільтра
function _rebuildSubFilter(groups, typeVal, prevSub) {
  const filterSub = document.getElementById("filterSub");
  if (!filterSub) return;

  if (!typeVal || !groups) {
    filterSub.style.display = "none";
    return;
  }

  const subs = groups[typeVal] || [];

  // Якщо у цього типу тільки один варіант — субфільтр не потрібен
  if (subs.length <= 1) {
    filterSub.style.display = "none";
    return;
  }

  // Сортуємо дистанції розумно (числа — числово, текст — алфавітно)
  const freq = {};
  allWorkouts.forEach(w => { freq[w.exercise] = (freq[w.exercise] || 0) + 1; });
  const sorted = [...subs].sort((a, b) => {
    const na = parseFloat(a.replace(/[^\d.]/g, "")) || 0;
    const nb = parseFloat(b.replace(/[^\d.]/g, "")) || 0;
    return na - nb;
  });

  filterSub.innerHTML = sorted.map(s =>
    `<option value="${s}">${_subLabel(s, typeVal)}</option>`
  ).join("");
  filterSub.style.display = "block";

  if (subs.includes(prevSub)) filterSub.value = prevSub;
  else filterSub.value = sorted[0];
}

// Скорочена назва для sub: "Біг 5 км" → "5 км"; "Спринт 100 м" → "100 м"; "Човниковий біг 4×9м" → "4×9м"
function _subLabel(ex, base) {
  const trimmed = ex.replace(base, "").trim();
  if (trimmed) return trimmed;
  // Старі записи без схеми
  if (base === "Човниковий біг") return "10×10м (старі)";
  return ex;
}

// Обробник зміни першого рівня фільтра
window.onFilterTypeChange = () => {
  const filterType = document.getElementById("filterType");
  const typeVal = filterType.value;

  function _baseType(ex) {
    if (ex.startsWith("Біг ")) return "Біг";
    if (ex.startsWith("Спринт ")) return "Спринт";
    if (ex.startsWith("Човниковий біг ")) return "Човниковий біг";
    return ex;
  }
  const groups = {};
  allWorkouts.forEach(w => {
    const bt = _baseType(w.exercise);
    if (!groups[bt]) groups[bt] = [];
    if (!groups[bt].includes(w.exercise)) groups[bt].push(w.exercise);
  });

  _rebuildSubFilter(groups, typeVal, "");
  renderUI();
};
// Допоміжна функція для отримання числа з рядка (напр. "15 (2:00)" -> 15, "5.5 км" -> 5.5)
function parseValue(valStr) {
  if (!valStr) return 0;
  const cleanStr = String(valStr).replace(/,/g, "."); // Рятуємо від ком
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}
// НОВА ФУНКЦІЯ: Захист від XSS (шкідливого коду)
window.escapeHTML = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
// === ХЕЛПЕРИ ДЛЯ БІГОВИХ ДИСЦИПЛІН ===
// Визначає, чи це бігова/спринтерська дисципліна
function isRunningExercise(exerciseName) {
  return /^(Біг|Спринт|Човниковий біг)(\s|$)/.test(exerciseName);
}

// Витягує час у секундах з будь-якого формату count
function parseTimeFromCount(countStr) {
  let s = String(countStr).replace(/,/g, ".");

  // Новий shuttle формат: "0:24.50 (4×9м)" → хв:сс.мс
  let shuttleNew = s.match(/^(\d+):(\d+)\.(\d+)\s*\(/);
  if (shuttleNew) {
    let min = parseInt(shuttleNew[1]);
    let sec = parseInt(shuttleNew[2]);
    let ms = parseInt(shuttleNew[3].padEnd(2, "0").slice(0, 2));
    return min * 60 + sec + ms / 100;
  }

  // Старий shuttle: "24.5 с (10х10 м)"
  let oldShuttle = s.match(/^([\d.]+)\s*с\s*\(/);
  if (oldShuttle) return parseFloat(oldShuttle[1]);

  // mm:ss або h:mm:ss (де завгодно у рядку)
  let timeMatch = s.match(/(\d+):(\d+)(?::(\d+))?/);
  if (timeMatch) {
    if (timeMatch[3] !== undefined) {
      return parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
    }
    return parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
  }

  // "12.5 с" або "12.5с"
  let secMatch = s.match(/([\d.]+)\s*с/);
  if (secMatch) return parseFloat(secMatch[1]);
  return 0;
}

// Форматує секунди у хв:сс.мс для человиного бігу
function formatShuttleTime(totalSec) {
  if (totalSec <= 0) return "0:00.00";
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec - Math.floor(totalSec)) * 100);
  return `${min}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

// Витягує дистанцію (км) з count (для Залу Слави)
function parseDistFromCount(countStr) {
  let match = String(countStr).match(/([\d.]+)\s*км/);
  return match ? parseFloat(match[1]) : 0;
}

// Повертає правильне значення для графіка/diff: час (сек) для бігових, вага для силових з вагою, число для решти
function getChartValue(countStr, exerciseName) {
  if (isRunningExercise(exerciseName)) return parseTimeFromCount(countStr);
  // Для записів з додатковою вагою (напр. "5 (+90 кг)") беремо вагу
  const weightMatch = String(countStr).match(/\(\s*\+?\s*([\d.]+)\s*кг\s*\)/i);
  if (weightMatch) return parseFloat(weightMatch[1]);
  return parseValue(countStr);
}

// Чи це запис з додатковою вагою?
function hasAddedWeight(countStr) {
  return /\(\s*\+?\s*[\d.]+\s*кг\s*\)/i.test(String(countStr));
}

// Форматує секунди для осі Y — залежно від типу вправи
function formatChartTime(totalSec, isShuttle) {
  if (isShuttle) return formatShuttleTime(totalSec);
  // Спринт і біг < 60 с: показуємо "13.50 с"
  if (totalSec < 60) {
    const rounded = Math.round(totalSec * 100) / 100;
    return rounded % 1 === 0 ? rounded + " с" : rounded.toFixed(2) + " с";
  }
  // >= 60 с: хв:сс
  return formatSecondsToTime(totalSec);
}

// Форматує секунди у хв:сс або г:хв:сс
function formatSecondsToTime(totalSec) {
  if (totalSec <= 0) return "0:00";
  let hours = Math.floor(totalSec / 3600);
  let min = Math.floor((totalSec % 3600) / 60);
  let sec = Math.round(totalSec % 60);
  if (hours > 0) return `${hours}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// Форматує різницю часу для diff-бейджів
function formatTimeDiff(diffSec) {
  let abs = Math.abs(diffSec);
  let sign = diffSec > 0 ? "+" : "-";
  if (abs < 60) return `${sign}${Math.round(abs * 10) / 10} с`;
  let min = Math.floor(abs / 60);
  let sec = Math.round(abs % 60);
  return `${sign}${min}:${String(sec).padStart(2, "0")}`;
}

// Міграція старих записів (exercise: "Біг" → "Біг 5 км") БЕЗ зміни Firebase
function migrateWorkout(w) {
  let m = { ...w };
  let countStr = String(w.count || "");

  if (w.exercise === EX.RUN) {
    let match = countStr.match(/([\d.]+)\s*км/);
    if (match) m.exercise = `Біг ${match[1]} км`;
  } else if (w.exercise === EX.SPRINT) {
    let match = countStr.match(/([\d.]+)\s*м/);
    if (match) m.exercise = `Спринт ${match[1]} м`;
  } else if (w.exercise === EX.SHUTTLE) {
    // Витягує "10х10" або "4х9" з "10х10 м (24.5 с)" або "24.5 с (10х10 м)"
    let match = countStr.match(/([\dхxХX]+[хxХX][\dхxХX]+)/i);
    if (match) m.exercise = `Човниковий біг ${match[1]}`;
  }

  return m;
}
// НОВА ФУНКЦІЯ: Отримання ваги користувача на конкретну дату
function getWeightAtDate(targetDate) {
  if (typeof allWeights === "undefined" || allWeights.length === 0) return 75;
  if (!targetDate) return allWeights[0].weight;

  // Шукаємо найсвіжіше зважування, яке було ДО або В ДЕНЬ тренування
  let weightRecord = allWeights.find((w) => w.date <= targetDate);

  if (weightRecord) return weightRecord.weight;
  // Якщо тренування старіше за найперше зважування, беремо найстарішу відому вагу
  return allWeights[allWeights.length - 1].weight;
}
// Допоміжна функція для визначення лічильника
function getStatUpdateData(exercise, finalResultStr) {
  let baseEx = [EX.PULLUPS, EX.PUSHUPS, EX.DIPS];
  if (baseEx.includes(exercise)) {
    return { key: exercise, val: parseValue(finalResultStr) };
  }
  // Бігові: "Біг 5 км" → ключ "Біг", значення = дистанція в км
  if (exercise.startsWith("Біг ")) {
    return { key: EX.RUN, val: parseDistFromCount(finalResultStr) };
  }
  // Старий формат без дистанції в назві
  if (exercise === EX.RUN) {
    return { key: EX.RUN, val: parseDistFromCount(finalResultStr) };
  }
  // Спринт/Човниковий — не рахуються в Залі Слави
  if (exercise === EX.SPRINT || exercise === EX.SHUTTLE ||
      exercise.startsWith("Спринт ") || exercise.startsWith("Човниковий біг ")) {
    return { key: EX.SPRINT, val: 0 };
  }
  return { key: "otherSets", val: 1 };
}
// НОВА ФУНКЦІЯ: Силовий та Швидкісний індекс
function calculateIndex(valStr, dateStr, exerciseName) {
  if (!valStr) return 0;
  const cleanStr = String(valStr).replace(/,/g, ".");

  // Якщо передано назву бігової дисципліни — індекс = 1/час (менше часу = вищий індекс)
  if (exerciseName && isRunningExercise(exerciseName)) {
    let timeSec = parseTimeFromCount(cleanStr);
    return timeSec > 0 ? (1 / timeSec) * 10000 : 0;
  }

  // Автодетект для старих записів без exerciseName:
  // Спринт (старий): "100 м (12.5 с)"
  let sprintMatch = cleanStr.match(/([\d.]+)\s*м\s*\(\s*([\d.]+)\s*с?\s*\)/i);
  if (sprintMatch) {
    let timeSec = parseFloat(sprintMatch[2]);
    return timeSec > 0 ? (1 / timeSec) * 10000 : 0;
  }

  // Човниковий (старий): "10х10 м (24.5 с)"
  let shuttleMatch = cleanStr.match(
    /([\dхxХX\s.]+)\s*м\s*\(\s*([\d.]+)\s*с?\s*\)/i,
  );
  if (shuttleMatch) {
    let timeSec = parseFloat(shuttleMatch[2]);
    return timeSec > 0 ? (1 / timeSec) * 10000 : 0;
  }

  // Біг (старий): "5 км (25:00)"
  let runMatch = cleanStr.match(
    /([\d.]+)\s*к?м?\s*\(\s*(?:(\d+):)?(\d+):(\d+)\s*\)/i,
  );
  if (runMatch) {
    let hours = runMatch[2] ? parseInt(runMatch[2]) : 0;
    let min = parseInt(runMatch[3]);
    let sec = parseInt(runMatch[4]);
    let totalSec = hours * 3600 + min * 60 + sec;
    return totalSec > 0 ? (1 / totalSec) * 10000 : 0;
  }

  // Новий формат бігу: "25:00 (5 км)" або "12.5 с (100 м)"
  let newRunMatch = cleanStr.match(/^(\d+):(\d+)(?::(\d+))?\s*\(/);
  if (newRunMatch) {
    let totalSec = newRunMatch[3] !== undefined
      ? parseInt(newRunMatch[1]) * 3600 + parseInt(newRunMatch[2]) * 60 + parseInt(newRunMatch[3])
      : parseInt(newRunMatch[1]) * 60 + parseInt(newRunMatch[2]);
    return totalSec > 0 ? (1 / totalSec) * 10000 : 0;
  }
  let newSprintMatch = cleanStr.match(/^([\d.]+)\s*с\s*\(/);
  if (newSprintMatch) {
    let timeSec = parseFloat(newSprintMatch[1]);
    return timeSec > 0 ? (1 / timeSec) * 10000 : 0;
  }

  // Силові вправи: формула Еплі (без змін)
  let reps = parseFloat(cleanStr) || 0;
  let weightMatch = cleanStr.match(/\(\s*\+?\s*([\d.]+)\s*к?г?\s*\)/i);
  let addedWeight = weightMatch ? parseFloat(weightMatch[1]) : 0;

  let bodyWeight = getWeightAtDate(dateStr);
  let totalWeight = bodyWeight + addedWeight;
  return reps <= 1 ? totalWeight : totalWeight * (1 + reps / 30);
}

// Розрахунок 1ПМ для історії та рекордів
function calculate1RM(valStr, dateStr) {
  if (!valStr) return 0;
  const cleanStr = String(valStr).replace(/,/g, ".");

  let reps = parseFloat(cleanStr) || 0;
  if (reps <= 0) return 0;

  let weightMatch = cleanStr.match(/\(\s*\+?\s*([\d.]+)\s*к?г?\s*\)/i);
  let addedW = weightMatch ? parseFloat(weightMatch[1]) : 0;

  let bodyWeight = getWeightAtDate(dateStr);
  let totalWeight = bodyWeight + addedW;

  let oneRmTotal = reps === 1 ? totalWeight : totalWeight * (1 + reps / 30);
  let predictedAddedW = oneRmTotal - bodyWeight;

  return predictedAddedW > 0 ? Math.round(predictedAddedW * 10) / 10 : 0;
}

// === ПРОГНОЗУВАННЯ 1ПМ (Формула Еплі) ===
window.update1RM = () => {
  const select = document.getElementById("exSelect").value;
  const oneRmContainer = document.getElementById("oneRmContainer");
  if (!oneRmContainer) return;

  // Рахуємо 1ПМ ТІЛЬКИ для базових силових вправ
  const allowedExercises = [EX.PULLUPS, EX.PUSHUPS, EX.DIPS];
  if (!allowedExercises.includes(select)) {
    oneRmContainer.style.display = "none";
    return;
  }

  const reps = parseFloat(document.getElementById("workoutCount").value) || 0;
  const addedW = parseFloat(document.getElementById("addWeight").value) || 0;

  if (reps > 0) {
    // Беремо вагу тіла на обрану дату (або поточну)
    let currentDate = document.getElementById("workoutDate").value;
    let bodyWeight = getWeightAtDate(currentDate);
    let totalWeight = bodyWeight + addedW;

    // Класична силова формула Еплі: 1RM = Weight * (1 + Reps/30)
    let oneRmTotal = reps === 1 ? totalWeight : totalWeight * (1 + reps / 30);

    // Вираховуємо саме ДОДАТКОВУ вагу для 1ПМ
    let predictedAddedW = oneRmTotal - bodyWeight;
    if (predictedAddedW < 0) predictedAddedW = 0;

    document.getElementById("oneRmValue").innerText =
      "+" + Math.round(predictedAddedW * 10) / 10;
    oneRmContainer.style.display = "block";
  } else {
    oneRmContainer.style.display = "none";
  }
};

// Допоміжна функція: YYYY-MM-DD -> DD.MM.YYYY
window.formatDate = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : dateStr;
};
// НОВЕ: Функції для підрахунку "Життя рекорду"
window.getDaysAgo = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.split("-");
  const past = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  past.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = today - past;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

window.formatDaysStanding = (days) => {
  if (days === 0) return "Встановлено сьогодні!";
  let n = Math.abs(days) % 100;
  let n1 = n % 10;
  if (n > 10 && n < 20) return `Тримається ${days} днів`;
  if (n1 > 1 && n1 < 5) return `Тримається ${days} дні`;
  if (n1 === 1) return `Тримається ${days} день`;
  return `Тримається ${days} днів`;
};

// Допоміжна функція: відкрити/закрити нотатку
window.toggleNote = (id) => {
  const el = document.getElementById("note-" + id);
  if (el) el.style.display = el.style.display === "block" ? "none" : "block";
};

// === ЛОГІКА ВІКНА ЦІЛЕЙ ===
let currentGoalExercise = ""; // Пам'ятаємо, для якої вправи ставимо ціль
const goalModal = document.getElementById("goalModal");
const goalInput = document.getElementById("goalInput");

// Відкриття вікна
window.setGoal = (exercise) => {
  if (!isAdmin) {
    alert("Тільки власник може змінювати цілі!");
    return;
  }
  currentGoalExercise = exercise;
  document.getElementById("goalModalTitle").innerText = `🎯 Ціль: ${exercise}`;
  goalInput.value = allGoals[exercise] || ""; // Підставляємо поточну ціль, якщо є
  goalModal.classList.add("show");
  setTimeout(() => goalInput.focus(), 100); // Автоматично ставимо курсор
};

// Закриття вікна
document.getElementById("closeGoalBtn")?.addEventListener("click", () => {
  goalModal.classList.remove("show");
});

// Збереження цілі у Firebase
document.getElementById("saveGoalBtn")?.addEventListener("click", async () => {
  const newGoal = goalInput.value.trim();

  try {
    if (newGoal === "") {
      // Якщо поле порожнє — видаляємо ціль
      await deleteDoc(doc(db, "goals", currentGoalExercise));
    } else {
      const numGoal = parseFloat(newGoal);

      // 🛡️ Броньована перевірка: число > 0, але не більше 1 000 000 (захист від Infinity та аномалій)
      if (!isNaN(numGoal) && numGoal > 0 && numGoal <= 1000000) {
        // Зберігаємо нову ціль
        await setDoc(doc(db, "goals", currentGoalExercise), { value: numGoal });
      } else {
        alert("Будь ласка, введіть реалістичне число (від 0.1 до 1 000 000).");
        return;
      }
    }
    goalModal.classList.remove("show");
  } catch (error) {
    alert("Помилка збереження: " + error.message);
  }
});

// Закриття при кліку поза вікном
if (goalModal) {
  goalModal.addEventListener("click", (e) => {
    if (e.target === goalModal) goalModal.classList.remove("show");
  });
}
// Функція рендеру П'єдесталу (Бере дані з окремого оптимізованого документа)
function renderPedestal() {
  const container = document.getElementById("pedestalContainer");
  const exercises = Object.keys(pedestalData);

  if (exercises.length === 0) {
    container.innerHTML =
      '<div class="empty-state" style="grid-column: 1 / -1;">Ще немає жодного рекорду. Час тренуватись!</div>';
    return;
  }

  // Фільтр: прибираємо Човниковий біг і дозволяємо юзеру вибирати
  const HIDDEN_KEY = "pedestalHidden";
  let hiddenSet = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));

  // Кнопка керування (показується тільки адміну)
  let controlHtml = "";
  if (isAdmin) {
    const btnList = exercises.map(ex => {
      const hidden = hiddenSet.has(ex);
      const safe = escapeHTML(ex);
      const shortLabel = safe
        .replace("Човниковий біг ", "Ч.б. ")
        .replace("Спринт ", "Спринт ")
        .replace("Біг ", "Біг ");
      return `<button class="pedestal-toggle-btn ${hidden ? "" : "active"}" data-ex="${safe}">${shortLabel}</button>`;
    }).join("");
    controlHtml = `
    <div class="pedestal-header-row">
      <span></span>
      <button class="pedestal-settings-btn" id="pedestalSettingsBtn" title="Налаштувати">⚙️ Налаштувати</button>
    </div>
    <div class="pedestal-controls" id="pedestalControls" style="display:none">
      <div class="pedestal-controls-title">Відображати рекорди:</div>
      <div class="pedestal-controls-list">${btnList}</div>
    </div>`;
  }

  let html = "";
  exercises.forEach((ex) => {
    // Пропускаємо приховані та старі Човниковий біг без схеми
    if (hiddenSet.has(ex)) return;
    if (ex === "Човниковий біг") return; // старі записи без схеми

    const maxW = pedestalData[ex];

    // Логіка цілей
    const goal = allGoals[ex];
    let goalHTML = `<button class="goal-btn" onclick="setGoal('${ex}')">+ Задати ціль</button>`;

    if (goal) {
      const goalNum = parseFloat(goal);
      let percent;
      let goalLabel;

      if (isRunningExercise(ex)) {
        let actualTime = parseTimeFromCount(maxW.count);
        percent = actualTime > 0 ? Math.round((goalNum / actualTime) * 100) : 0;
        goalLabel = `Ціль: ${formatSecondsToTime(goalNum)}`;
      } else {
        percent = Math.round((maxW.absoluteMaxReps / goalNum) * 100);
        goalLabel = `Ціль: ${goalNum}`;
      }
      if (percent > 100) percent = 100;

      goalHTML = `
                <div class="goal-header">
                    <span>${goalLabel}</span>
                    <span>${percent}%</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                </div>
                <div style="text-align:right; margin-top:5px;">
                    <button class="goal-btn" style="padding:2px 5px; font-size: 0.65rem;" onclick="setGoal('${ex}')">Змінити</button>
                </div>
            `;
    }

    let icon = ICONS.medal;
    if (ex.startsWith("Біг")) icon = ICONS.bolt;
    if (ex.startsWith("Спринт")) icon = ICONS.bolt;
    if (ex.startsWith("Човниковий")) icon = ICONS.bolt;
    if (ex === "Підтягування") icon = ICONS.trophy;
    if (ex === "Відтискання") icon = ICONS.fire;

    let rmBadge =
      maxW.max1RM > 0
        ? `<div style="font-size: 0.95rem; color: var(--success); font-weight: 800; margin-top: -5px; margin-bottom: 8px; text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);">${ICONS.bulb} 1ПМ: +${maxW.max1RM} кг</div>`
        : "";

    let daysStanding = getDaysAgo(maxW.date);
    let daysBadge = `<div style="font-size: 0.85rem; color: var(--highlight); font-weight: 800; margin-top: 5px; margin-bottom: 10px; background: rgba(245, 158, 11, 0.15); border: 1px dashed var(--highlight); padding: 4px 8px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.1);">
            ${formatDaysStanding(daysStanding)}
        </div>`;

    let safeEx = escapeHTML(ex);
    let safeCount = escapeHTML(maxW.count);

    html += `
            <div class="record-card">
                <div class="record-icon">${icon}</div>
                <div class="record-title">${safeEx}</div>
                <div class="record-value">${safeCount}</div>
                ${rmBadge}
                ${daysBadge}
                <div class="record-date">${maxW.date}</div>
                <div class="goal-container">${goalHTML}</div>
            </div>
        `;
  });

  container.innerHTML = controlHtml + html;

  // Обробники кнопок керування
  if (isAdmin) {
    document.getElementById("pedestalSettingsBtn")?.addEventListener("click", () => {
      const ctrl = document.getElementById("pedestalControls");
      if (ctrl) ctrl.style.display = ctrl.style.display === "none" ? "block" : "none";
    });

    container.querySelectorAll(".pedestal-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const ex = btn.dataset.ex;
        if (hiddenSet.has(ex)) hiddenSet.delete(ex);
        else hiddenSet.add(ex);
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenSet]));
        renderPedestal();
      });
    });
  }
}

// Функція рендеру Глобальної Статистики
// Оновлена функція рендеру Глобальної Статистики (Агрегація)
function renderGlobalStats() {
  const container = document.getElementById("globalStatsContainer");
  if (!container) return;

  // Допоміжна функція для красивого форматування чисел (10000 -> 10 000)
  const fmt = (num) => num.toLocaleString("uk-UA");
  let html = "";

  if (globalStats["Підтягування"] > 0) {
    html += `<div class="stat-card">
                    <div class="stat-title">${ICONS.trophy} Підтягування</div>
                    <div class="stat-value">${fmt(globalStats["Підтягування"])} <span>разів</span></div>
                 </div>`;
  }
  if (globalStats["Відтискання"] > 0) {
    html += `<div class="stat-card">
                    <div class="stat-title">${ICONS.fire} Відтискання</div>
                    <div class="stat-value">${fmt(globalStats["Відтискання"])} <span>разів</span></div>
                 </div>`;
  }
  if (globalStats["Бруси"] > 0) {
    html += `<div class="stat-card">
                    <div class="stat-title">${ICONS.bolt} Бруси</div>
                    <div class="stat-value">${fmt(globalStats["Бруси"])} <span>разів</span></div>
                 </div>`;
  }
  if (globalStats["Біг"] > 0) {
    let runDist = Math.round(globalStats["Біг"] * 10) / 10;
    html += `<div class="stat-card">
                    <div class="stat-title">${ICONS.bolt} Пробіг</div>
                    <div class="stat-value">${fmt(runDist)} <span>км</span></div>
                 </div>`;
  }

  if (html === "") {
    container.innerHTML =
      '<div style="grid-column: span 2; text-align: center; color: var(--text-muted);">Ще немає даних для статистики</div>';
  } else {
    container.innerHTML = html;
  }
}

// --- ФУНКЦІЯ: СПОРТИВНИЙ СТАТУС ---
function renderSportStatus() {
  const card = document.getElementById("sportStatusCard");
  if (!card) return;

  // Беремо останню вагу
  let bodyWeight =
    typeof allWeights !== "undefined" && allWeights.length > 0
      ? allWeights[0].weight
      : 0;

  // Шукаємо найкращий 1ПМ для Підтягувань
  const pullups = allWorkouts.filter((w) => w.exercise === EX.PULLUPS);

  // Якщо ваги немає або підтягувань ще не було, ховаємо картку
  if (bodyWeight === 0 || pullups.length === 0) {
    card.style.display = "none";
    return;
  }

  let max1RM_added = 0;
  pullups.forEach((w) => {
    let rm = calculate1RM(w.count, w.date);
    if (rm > max1RM_added) max1RM_added = rm;
  });

  // Загальний 1ПМ = власна вага + додаткова вага на 1 раз
  let total1RM = bodyWeight + max1RM_added;
  let coef = total1RM / bodyWeight;
  coef = Math.round(coef * 100) / 100;

  let level = "";
  let nextCoef = 0;
  let percent = 0;
  let color = "";

  // Математична модель рангів
  if (coef < 1.2) {
    level = "Рекрут";
    nextCoef = 1.2;
    percent = ((coef - 1.0) / (1.2 - 1.0)) * 100;
    color = "var(--text-muted)";
  } else if (coef < 1.5) {
    level = "Атлет";
    nextCoef = 1.5;
    percent = ((coef - 1.2) / (1.5 - 1.2)) * 100;
    color = "var(--success)";
  } else if (coef < 1.8) {
    level = "КМС";
    nextCoef = 1.8;
    percent = ((coef - 1.5) / (1.8 - 1.5)) * 100;
    color = "var(--highlight)";
  } else {
    level = "Еліта";
    nextCoef = 2.0;
    percent = 100;
    color = "var(--danger)";
  }

  if (percent > 100) percent = 100;
  if (percent < 0) percent = 0;

  document.getElementById("statusLevelName").innerText = level;
  document.getElementById("statusLevelName").style.color = color;
  document.getElementById("statusCoefValue").innerText =
    `Коефіцієнт відносної сили: ${coef}`;
  document.getElementById("statusBarFill").style.width = `${percent}%`;
  document.getElementById("statusBarFill").style.background = color;

  let kgToNext = Math.round(nextCoef * bodyWeight - total1RM);
  if (coef >= 1.8) {
    document.getElementById("statusHint").innerText =
      "Ти досяг абсолютного максимуму! Справжня машина.";
  } else {
    document.getElementById("statusHint").innerText =
      `До наступного звання: +${kgToNext} кг до 1ПМ`;
  }

  card.style.display = "block";
}
// === ПОБУДОВА ГРАФІКА ТРЕНУВАНЬ ===
function updateChart(workouts, filterValue) {
  const canvas = document.getElementById("progressChart");
  const ctx = canvas.getContext("2d");
  const chartCard = canvas.parentElement.parentElement;
  const container = canvas.parentElement;

  // Створюємо преміальну текстову підказку
  let hint = document.getElementById("chartHint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "chartHint";
    hint.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 15px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(16, 185, 129, 0.05)); border: 2px dashed rgba(99, 102, 241, 0.3); border-radius: 20px; pointer-events: none; user-select: none; -webkit-user-select: none; display: none;`;

    hint.innerHTML = `<div style="font-size: 3rem; filter: drop-shadow(0 10px 15px rgba(99,102,241,0.3)); margin-bottom: 10px;">📊</div><div style="color: var(--text-main); font-size: 1.1rem; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 10px;">Загальний графік відпочиває</div><div style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; max-width: 100%;">Обери щось одне (наприклад, <span style="display: inline-block; color: var(--highlight); font-weight: 800; background: rgba(245, 158, 11, 0.15); padding: 2px 8px; border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3); margin: 0 4px;">🦍 Підтягування</span>), щоб побачити динаміку!</div>`;

    container.appendChild(hint);
  }

  // Якщо вибрано "Усі рекорди" або немає тренувань
  if (workouts.length === 0 || !filterValue || filterValue === "none") {
    chartCard.style.display = "block";
    canvas.style.display = "none";
    hint.style.display = "flex";
    return;
  }

  chartCard.style.display = "block";
  canvas.style.display = "block";
  hint.style.display = "none";

  const chartData = [...workouts].reverse();
  const labels = chartData.map((w) => formatDate(w.date));
  const isRunning = workouts.length > 0 && isRunningExercise(workouts[0].exercise);
  const isShuttle = workouts.length > 0 && workouts[0].exercise.startsWith("Човниковий біг");
  // Якщо більшість записів цієї вправи мають додаткову вагу — це вправа з вагою
  const isWeighted = !isRunning && workouts.length > 0
    && workouts.filter(w => hasAddedWeight(w.count)).length > workouts.length / 2;
  const dataPoints = chartData.map((w) => getChartValue(w.count, w.exercise));

  // Знищуємо старий графік при зміні типу (бігові ↔ силові мають різні осі)
  if (myChartInstance) {
    myChartInstance.destroy();
    myChartInstance = null;
  }

  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text-muted").trim() || "#888";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(255,255,255,0.1)";
  const highlightColor = style.getPropertyValue("--accent").trim() || "#6366f1";

  let gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, "rgba(99, 102, 241, 0.5)");
  gradient.addColorStop(1, "rgba(99, 102, 241, 0.0)");

  myChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: (() => {
            // Красива назва: для "Човниковий біг 6×100м" → "6×100м"
            let prettyName = filterValue;
            if (filterValue && filterValue.startsWith("Човниковий біг ")) {
              prettyName = filterValue.replace("Човниковий біг ", "");
            }
            return isRunning ? `Час: ${prettyName}` : `Динаміка: ${prettyName}`;
          })(),
          data: dataPoints,
          borderColor: highlightColor,
          backgroundColor: gradient,
          borderWidth: 4,
          pointBackgroundColor: "#fff",
          pointBorderColor: highlightColor,
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: "Nunito", weight: "bold" },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleFont: { family: "Nunito", size: 14 },
          bodyFont: { family: "Nunito", size: 14 },
          padding: 12,
          cornerRadius: 12,
          callbacks: isRunning ? {
            label: (ctx) => {
              const t = formatChartTime(ctx.parsed.y, isShuttle);
              return `Час: ${t}`;
            }
          } : (isWeighted ? {
            label: (ctx) => `Вага: ${ctx.parsed.y} кг`
          } : undefined),
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { family: "Nunito" } },
          grid: { color: gridColor, drawBorder: false },
        },
        y: {
          ticks: {
            color: textColor,
            font: { family: "Nunito" },
            callback: isRunning
              ? (val) => formatChartTime(val, isShuttle)
              : (isWeighted ? (val) => val + " кг" : undefined),
          },
          grid: { color: gridColor, drawBorder: false, borderDash: [5, 5] },
          beginAtZero: !isRunning,
          reverse: isShuttle, // менший час = вище на графіку
          title: isRunning
            ? { display: true, text: isShuttle ? "Час (хв:сс.мс)" : "Час", color: textColor, font: { family: "Nunito", weight: "bold" } }
            : (isWeighted
                ? { display: true, text: "Вага (кг)", color: textColor, font: { family: "Nunito", weight: "bold" } }
                : undefined),
        },
      },
    },
  });
}
window.renderUI = () => {
  renderPedestal();
  renderGlobalStats();
  renderSportStatus();

  const filterType = document.getElementById("filterType");
  const filterSub  = document.getElementById("filterSub");

  const typeVal = filterType?.value || "";
  const subVal  = (filterSub && filterSub.style.display !== "none") ? filterSub.value : "";

  let filterValue = "";
  if (typeVal) {
    filterValue = subVal || typeVal;
  }

  const container = document.getElementById("timelineContainer");
  if (!container) return;

  const filteredWorkouts = filterValue
    ? allWorkouts.filter(w => w.exercise === filterValue ||
        (!subVal && w.exercise.startsWith(filterValue + " ")))
    : [...allWorkouts].slice(0, 50);

  if (filteredWorkouts.length === 0) {
    requestAnimationFrame(() => {
      container.innerHTML = '<div class="empty-state">Записів не знайдено</div>';
      updateChart([], filterValue || "none");
    });
    return;
  }

  // Розраховуємо, які тренування були особистими рекордами на свій час
  const pbSet = new Set();
  const maxAtTime = {};
  const reversedAll = [...allWorkouts].reverse();
  reversedAll.forEach((w) => {
    let wIndex = calculateIndex(w.count, w.date, w.exercise);
    if (!maxAtTime[w.exercise] || wIndex > maxAtTime[w.exercise]) {
      maxAtTime[w.exercise] = wIndex;
      pbSet.add(w.id);
    }
  });

  let timelineHTML = "";

  // Рендер Таймлайну
  filteredWorkouts.forEach((w, index) => {
    let diffHTML = "";

    if (filterValue && filterValue !== "none" && index < filteredWorkouts.length - 1) {
      let prevW = filteredWorkouts[index + 1];
      let currentVal = getChartValue(w.count, w.exercise);
      let prevVal = getChartValue(prevW.count, prevW.exercise);
      let diff = Math.round((currentVal - prevVal) * 100) / 100;

      if (isRunningExercise(w.exercise)) {
        // Бігові: менше часу = краще = зелений
        if (diff < 0) diffHTML = `<span class="diff-badge">${formatTimeDiff(diff)}</span>`;
        else if (diff > 0) diffHTML = `<span class="diff-badge negative">${formatTimeDiff(diff)}</span>`;
        else diffHTML = `<span class="diff-badge" style="background:var(--border); color:var(--text-muted);">Без змін</span>`;
      } else {
        if (diff > 0) diffHTML = `<span class="diff-badge">+${diff}</span>`;
        else if (diff < 0) diffHTML = `<span class="diff-badge negative">${diff}</span>`;
        else diffHTML = `<span class="diff-badge" style="background:var(--border); color:var(--text-muted);">Без змін</span>`;
      }
    }

    const safeEx = escapeHTML(w.exercise);
    const safeCount = escapeHTML(w.count);

    const exLabel =
      filterValue && filterValue !== "none" ? `` : `<div class="timeline-ex">${safeEx}</div>`;

    let pbCrown = "";
    if (pbSet.has(w.id)) {
      let daysAgo = getDaysAgo(w.date);
      let daysText = daysAgo === 0 ? "Сьогодні!" : `${daysAgo} дн. тому`;
      pbCrown = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-5px);">
                           <span class="pb-crown" title="Особистий рекорд!" style="margin: 0;">${ICONS.crown}</span>
                           <span style="font-size: 0.7rem; color: var(--highlight); font-weight: 900; margin-top: 2px; text-shadow: none; letter-spacing: 0.5px;">${daysText}</span>
                       </div>`;
    }

    let noteIcon = w.note
      ? `<span class="note-toggle" onclick="toggleNote('${w.id}')" title="Відкрити нотатку">${ICONS.note}</span>`
      : "";
    let safeNote = escapeHTML(w.note);
    let noteHTML = w.note
      ? `<div id="note-${w.id}" class="note-content">${safeNote}</div>`
      : "";

    let videoBtn =
      w.videoUrl && isAdmin
        ? `<a href="${w.videoUrl}" target="_blank" class="video-link-btn" title="Дивитися відео">${ICONS.video} Відео</a>`
        : "";

    let resultBtn =
      w.resultUrl
        ? `<a href="${w.resultUrl}" target="_blank" class="result-link-btn" title="Сторінка з результатом">${ICONS.bolt} Результат</a>`
        : "";

    const displayDate = formatDate(w.date);

    let rmVal = calculate1RM(w.count, w.date);
    let allowedEx = ["Підтягування", "Відтискання", "Бруси"];
    let rmBadgeTimeline =
      allowedEx.includes(w.exercise) && rmVal > 0
        ? `<span style="font-size: 0.8rem; color: var(--success); margin-left: 8px; font-weight: 800; border: 1px dashed var(--success); padding: 2px 6px; border-radius: 8px; background: rgba(16, 185, 129, 0.1);" title="Теоретичний 1ПМ">${ICONS.bulb} +${rmVal} кг</span>`
        : "";

    timelineHTML += `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header">
                    <span class="timeline-date">${ICONS.cal} ${displayDate}</span>
                    ${
                      isAdmin
                        ? `
                        <div>
                            <button class="btn-edit" onclick="editEntry('${w.id}')">${ICONS.edit} Редаг.</button>
                            <button class="btn-del" onclick="deleteEntry('${w.id}')">Видалити</button>
                        </div>
                    `
                        : ""
                    }
                </div>
                ${exLabel}
                <div class="timeline-content" style="flex-wrap: wrap;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span class="timeline-val">${safeCount}</span>
                            ${rmBadgeTimeline}
                            ${diffHTML}
                            ${videoBtn}  ${resultBtn}  ${noteIcon}
                        </div>
                        <div style="font-size: 1.5rem;">${pbCrown}</div>
                    </div>
                    ${noteHTML}
                </div>
            </div>`;
  });

  // 🚀 МАГІЯ ОПТИМІЗАЦІЇ: Відкладаємо важкий рендер DOM і графіків до наступного кадру
  requestAnimationFrame(() => {
    container.innerHTML = timelineHTML;
    updateChart(filteredWorkouts, filterValue || "none");
  });
};

// === РОЗУМНЕ ЗАВАНТАЖЕННЯ (ПАГІНАЦІЯ) ===
let workoutLimit = 50; // Скільки записів вантажимо за раз
let unsubscribeWorkouts = null;

window.listenToWorkouts = () => {
  // Якщо вже є активний слухач - відписуємось, щоб не дублювати дані
  if (unsubscribeWorkouts) unsubscribeWorkouts();

  const q = query(colRef, orderBy("date", "desc"), limit(workoutLimit));

  unsubscribeWorkouts = onSnapshot(q, (snapshot) => {
    allWorkouts = snapshot.docs.map((d) => migrateWorkout({ id: d.id, ...d.data() }));
    window.allWorkouts = allWorkouts;
    if (window.checkNewAchievements) window.checkNewAchievements(allWorkouts);
    if (window.renderAchievementsTab && document.getElementById("tab-achievements")?.classList.contains("active")) {
      window.renderAchievementsTab();
    }

    updateDropdowns();
    renderUI();

    // Логіка показу кнопки "Завантажити ще"
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) {
      if (allWorkouts.length === workoutLimit) {
        loadMoreBtn.style.display = "block";
      } else {
        loadMoreBtn.style.display = "none";
      }
    }
    // Завантаження Абсолютних Рекордів (П'єдестал)
    onSnapshot(doc(db, "stats", "pedestal"), (docSnapshot) => {
      if (docSnapshot.exists()) {
        pedestalData = docSnapshot.data();
        renderPedestal(); // Малюємо П'єдестал миттєво!
      }
    });

    document.getElementById("status").innerText = "Хмара синхронізована ✅";
  });
};

window.loadMoreWorkouts = () => {
  workoutLimit += 50;
  listenToWorkouts();
};

listenToWorkouts();

// === ТРЕКЕР ВІДВІДУВАЧІВ ===
{
  const sessionKey = "visitorLogged_" + new Date().toDateString();
  if (!sessionStorage.getItem(sessionKey)) {
    (async () => {
      try {
        let ip = "unknown", country = "", city = "";
        try {
          const res = await fetch("https://ipapi.co/json/");
          if (res.ok) {
            const d = await res.json();
            ip = d.ip || "unknown";
            country = d.country_name || "";
            city = d.city || "";
          }
        } catch (e) {}

        const ua = navigator.userAgent;
        let device = "Desktop", os = "Unknown", browser = "Unknown";

        if (/Android/i.test(ua)) { os = "Android"; device = "Mobile"; }
        else if (/iPhone|iPad|iPod/i.test(ua)) { os = "iOS"; device = "Mobile"; }
        else if (/Windows/i.test(ua)) os = "Windows";
        else if (/Mac OS/i.test(ua)) os = "macOS";
        else if (/Linux/i.test(ua)) os = "Linux";

        if (/Edg/i.test(ua)) browser = "Edge";
        else if (/OPR|Opera/i.test(ua)) browser = "Opera";
        else if (/Brave/i.test(ua)) browser = "Brave";
        else if (/Chrome/i.test(ua)) browser = "Chrome";
        else if (/Firefox/i.test(ua)) browser = "Firefox";
        else if (/Safari/i.test(ua)) browser = "Safari";

        const verMatch = ua.match(/(Chrome|Firefox|Safari|Edg|Opera|OPR)\/(\d+)/);
        const browserVer = verMatch ? verMatch[2] : "";

        // IP як ID документа — кожен IP має один запис, лічильник зростає
        const docId = ip.replace(/[^a-zA-Z0-9.:_-]/g, "_") || "unknown_" + Date.now();
        const ref = doc(db, "visitor_logs", docId);
        const snap = await getDoc(ref);

        const baseData = {
          ip, country, city,
          device, os, browser, browserVer,
          screen: window.screen.width + "x" + window.screen.height,
          referrer: document.referrer || "direct",
          isAdmin: !!auth.currentUser,
          userAgent: ua.substring(0, 250),
          lastVisit: Date.now(),
        };

        if (snap.exists()) {
          // Існуючий IP — оновлюємо лічильник і дані
          const old = snap.data();
          await setDoc(ref, {
            ...baseData,
            visitCount: (old.visitCount || 1) + 1,
            firstVisit: old.firstVisit || old.timestamp || Date.now(),
            timestamp: Date.now(), // для сортування
          });
        } else {
          // Новий IP
          await setDoc(ref, {
            ...baseData,
            visitCount: 1,
            firstVisit: Date.now(),
            timestamp: Date.now(),
          });
        }

        sessionStorage.setItem(sessionKey, "1");
      } catch (err) {
        console.warn("Visitor log failed:", err);
      }
    })();
  }
}

// Завантаження цілей та глобальної статистики
var _goalsUnsub = null;
var _globalUnsub = null;
var _privateLogsUnsub = null;

function listenToMeta() {
  // Знімаємо старі слухачі щоб не дублювати
  if (_goalsUnsub) _goalsUnsub();
  if (_globalUnsub) _globalUnsub();
  if (_privateLogsUnsub) _privateLogsUnsub();

  _goalsUnsub = onSnapshot(collection(db, "goals"), (snapshot) => {
    allGoals = {};
    snapshot.docs.forEach((d) => {
      allGoals[d.id] = d.data().value;
    });
    renderUI();
  });

  _globalUnsub = onSnapshot(doc(db, "stats", "global"), (docSnapshot) => {
    if (docSnapshot.exists()) {
      globalStats = docSnapshot.data();
      renderGlobalStats();
    }
  });

  // Архів — для досягнень. Доступний лише адміну.
  if (auth.currentUser) {
    try {
      const uid = auth.currentUser.uid;
      console.log("🔵 Starting private_logs listener for user:", uid);
      _privateLogsUnsub = onSnapshot(
        query(collection(db, "private_logs"), orderBy("timestamp", "desc"), limit(500)),
        (snap) => {
          window.allPrivateLogs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(l => l.userId === uid);
          console.log("✅ private_logs loaded:", window.allPrivateLogs.length, "записів");
          console.log("📊 S-records:", window.allPrivateLogs.filter(l => l.is_s === true).length);
          if (window.checkNewAchievements) window.checkNewAchievements(window.allWorkouts || []);
          if (window.renderAchievementsTab && document.getElementById("tab-achievements")?.classList.contains("active")) {
            window.renderAchievementsTab();
          }
        },
        (err) => {
          console.error("❌ private_logs listener error:", err);
        }
      );
    } catch (e) {
      console.error("❌ private_logs setup failed:", e);
    }
  } else {
    console.log("⚠️ Not authenticated, skipping private_logs listener");
  }
}
listenToMeta();
let editingId = null; // Змінна, яка пам'ятає, чи ми щось редагуємо

// Функція для очищення форми (Оптимізована)
function clearForm() {
  DOM.workoutCount.value = "";
  DOM.exMin.value = "";
  DOM.exSec.value = "";
  DOM.runDistance.value = "";
  DOM.runMin.value = "";
  DOM.runSec.value = "";
  if (DOM.sprintDistance) DOM.sprintDistance.value = "";
  if (DOM.sprintSec) DOM.sprintSec.value = "";
  DOM.customEx.value = "";
  DOM.customResultStr.value = "";
  DOM.customMin.value = "";
  DOM.customSec.value = "";
  DOM.workoutNote.value = "";
  DOM.workoutVideoUrl.value = "";
  const resultUrlEl = document.getElementById("workoutResultUrl");
  if (resultUrlEl) resultUrlEl.value = "";
  DOM.workoutDate.valueAsDate = new Date();
  // Човниковий
  if (DOM.shuttleMin) DOM.shuttleMin.value = "";
  if (DOM.shuttleSecVal) DOM.shuttleSecVal.value = "";
  if (DOM.shuttleMs) DOM.shuttleMs.value = "";
  const shuttlePreview = document.getElementById("shuttlePreview");
  if (shuttlePreview) shuttlePreview.textContent = "";
  _shuttleUIInit = false; // дозволяємо реінітиалізацію для нового запису

  if (DOM.exSelect) {
    DOM.exSelect.selectedIndex = 0;
    uiLogic();
  }

  if (DOM.oneRmContainer) DOM.oneRmContainer.style.display = "none";
}

// Кнопка скасування редагування
DOM.cancelEditBtn?.addEventListener("click", () => {
  editingId = null;
  DOM.saveBtn.innerText = "Зберегти трофей";
  DOM.cancelEditBtn.style.display = "none";
  clearForm();
});

// НОВА ФУНКЦІЯ РЕДАГУВАННЯ (Оптимізована)
window.editEntry = (id) => {
  if (!isAdmin) return;
  const workout = allWorkouts.find((w) => w.id === id);
  if (!workout) return;

  editingId = id;
  DOM.workoutDate.value = workout.date;
  DOM.workoutNote.value = workout.note || "";
  DOM.workoutVideoUrl.value = workout.videoUrl || "";
  const resultEl = document.getElementById("workoutResultUrl");
  if (resultEl) resultEl.value = workout.resultUrl || "";

  // Визначаємо базовий тип для мігрованих бігових назв
  let baseType = workout.exercise;
  if (workout.exercise.startsWith("Біг ")) baseType = EX.RUN;
  else if (workout.exercise.startsWith("Спринт ")) baseType = EX.SPRINT;
  else if (workout.exercise.startsWith("Човниковий біг ")) baseType = EX.SHUTTLE;

  if ([...DOM.exSelect.options].some((opt) => opt.value === baseType)) {
    DOM.exSelect.value = baseType;
    DOM.customEx.value = "";
  } else {
    DOM.exSelect.value = "custom";
    DOM.customEx.value = workout.exercise;
  }

  // Витягуємо дані
  let countStr = String(workout.count).replace(/,/g, ".");
  let weightMatch = countStr.match(/\(\s*\+?\s*([\d.]+)\s*к?г?\s*\)/i);
  DOM.addWeight.value = weightMatch ? weightMatch[1] : "";

  let tempStr = countStr.replace(/\(\s*\+?\s*[\d.]+\s*к?г?\s*\)/i, "").trim();
  let timeMatch = tempStr.match(/\((.*?)\)/);
  let timeStr = timeMatch ? timeMatch[1] : "";
  let min = "",
    sec = "";

  if (timeStr.includes(":")) {
    let parts = timeStr.split(":");
    if (parts.length === 3) {
      min = String(parseInt(parts[0]) * 60 + parseInt(parts[1]));
      sec = parts[2];
    } else {
      min = parts[0];
      sec = parts[1];
    }
  }
  let valStr = parseFloat(countStr) || "";

  uiLogic();

  if (baseType === EX.RUN) {
    // Підтримка обох форматів: "5 км (25:00)" та "25:00 (5 км)"
    let distMatch = countStr.match(/([\d.]+)\s*км/);
    DOM.runDistance.value = distMatch ? distMatch[1] : "";
    // Витягуємо час mm:ss
    let tMatch = countStr.match(/(\d+):(\d+)/);
    if (tMatch) {
      DOM.runMin.value = tMatch[1];
      DOM.runSec.value = tMatch[2];
    }
  } else if (baseType === EX.SPRINT) {
    // "100 м (12.5 с)" або "12.5 с (100 м)"
    let distMatch = countStr.match(/([\d.]+)\s*м/);
    let secMatch = countStr.match(/([\d.]+)\s*с/);
    if (distMatch) DOM.sprintDistance.value = distMatch[1];
    if (secMatch) DOM.sprintSec.value = secMatch[1];
  } else if (baseType === EX.SHUTTLE) {
    const schemeFromExercise = workout.exercise.replace("Човниковий біг ", "").trim();
    DOM.shuttleScheme.value = schemeFromExercise;
    const newFmt = countStr.match(/^(\d+):(\d+)\.(\d+)/);
    if (newFmt) {
      document.getElementById("shuttleMin").value    = newFmt[1];
      document.getElementById("shuttleSecVal").value = newFmt[2];
      document.getElementById("shuttleMs").value     = newFmt[3];
    } else {
      const oldSec = countStr.match(/([\d.]+)\s*с/);
      if (oldSec) {
        const tot = parseFloat(oldSec[1]);
        document.getElementById("shuttleMin").value    = Math.floor(tot / 60);
        document.getElementById("shuttleSecVal").value = Math.floor(tot % 60);
        document.getElementById("shuttleMs").value     = Math.round((tot % 1) * 100);
      }
    }
    _updateShuttlePreview();
  } else if (DOM.exSelect.value === EX.CUSTOM) {
    DOM.customResultStr.value = valStr;
    DOM.customMin.value = min;
    DOM.customSec.value = sec;
  } else {
    DOM.workoutCount.value = parseFloat(valStr) || "";
    DOM.exMin.value = min;
    DOM.exSec.value = sec;
  }

  DOM.saveBtn.innerText = "Оновити запис";
  DOM.cancelEditBtn.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });

  update1RM();
};

// === 1. THE BUILDER: Валідація та збір даних з форми ===
function buildWorkoutResult(selectType) {
  let exerciseName =
    selectType === "custom"
      ? document.getElementById("customEx").value.trim()
      : selectType;
  let finalResult = "";

  if (selectType === "Біг") {
    const dist = document.getElementById("runDistance").value;
    const minVal = document.getElementById("runMin").value;
    const secVal = document.getElementById("runSec").value;
    if (!dist || (!minVal && !secVal))
      throw new Error("Вкажи відстань та час бігу!");
    // Час первинний, дистанція контекстна
    finalResult = `${minVal || "0"}:${(secVal || "0").padStart(2, "0")} (${dist} км)`;
    exerciseName = `Біг ${dist} км`;
  } else if (selectType === "Спринт") {
    const dist = document.getElementById("sprintDistance").value;
    const sec = document.getElementById("sprintSec").value;
    if (!dist || !sec) throw new Error("Вкажи дистанцію та час!");
    finalResult = `${sec} с (${dist} м)`;
    exerciseName = `Спринт ${dist} м`;
  } else if (selectType === "Човниковий біг") {
    const scheme = _getShuttleScheme();
    const timeStr = _getShuttleTimeStr();
    const totalSec = _getShuttleTotalSec();
    if (!scheme) throw new Error("Вибери схему відрізків!");
    if (totalSec <= 0) throw new Error("Вкажи час (хв:сек.мс)!");
    // Формат: "0:24.50 (4×9м)" — exerciseName: "Човниковий біг 4×9м"
    finalResult = `${timeStr} (${scheme})`;
    exerciseName = `Човниковий біг ${scheme}`;
  } else if (selectType === "custom") {
    const customRes = document.getElementById("customResultStr").value.trim();
    const customMin = document.getElementById("customMin").value;
    const customSec = document.getElementById("customSec").value;
    if (!customRes) throw new Error("Вкажи результат!");
    finalResult =
      customMin || customSec
        ? `${customRes} (${customMin || "0"}:${(customSec || "0").padStart(2, "0")})`
        : customRes;
  } else {
    const count = document.getElementById("workoutCount").value;
    const addW = document.getElementById("addWeight").value;
    const exMin = document.getElementById("exMin").value;
    const exSec = document.getElementById("exSec").value;
    if (!count) throw new Error("Вкажи кількість повторень!");
    if (parseFloat(count) < 0 || parseFloat(addW) < 0)
      throw new Error("Результат не може бути від'ємним!");
    let weightStr = addW ? ` (+${addW} кг)` : "";
    let timeStr =
      exMin || exSec
        ? ` (${exMin || "0"}:${(exSec || "0").padStart(2, "0")})`
        : "";
    finalResult = `${count}${weightStr}${timeStr}`;
  }

  if (!exerciseName) throw new Error("Введіть назву вправи!");

  return { exerciseName, finalResult };
}

// === 2. THE SAVER: Збереження в базу та оновлення статистики (Атомарна транзакція) ===
async function processWorkoutDB(workoutData, currentEditId) {
  const { exerciseName, date, finalResult, noteValue, videoValue, resultValue } =
    workoutData;

  let isRunning = isRunningExercise(exerciseName);
  let newIndex = calculateIndex(finalResult, date, exerciseName);
  let newValueReps = isRunning ? parseTimeFromCount(finalResult) : parseValue(finalResult);
  let new1RM = isRunning ? 0 : calculate1RM(finalResult, date);

  let currentRecord = pedestalData[exerciseName] || {
    index: 0,
    absoluteMaxReps: 0,
  };
  let isRecord = newIndex > currentRecord.index;
  const goalVal = allGoals[exerciseName];
  let isGoalReached;
  if (isRunning) {
    // Ціль = цільовий час (сек). Досягнута, коли фактичний час <= цілі
    isGoalReached = goalVal && newValueReps > 0 && newValueReps <= parseFloat(goalVal) &&
      (currentRecord.absoluteMaxReps === 0 || currentRecord.absoluteMaxReps > parseFloat(goalVal));
  } else {
    isGoalReached = goalVal &&
      newValueReps >= parseFloat(goalVal) &&
      currentRecord.absoluteMaxReps < parseFloat(goalVal);
  }

  const dataToSave = {
    exercise: exerciseName,
    date,
    count: finalResult,
    note: noteValue,
    videoUrl: videoValue,
    resultUrl: resultValue,
  };

  // 🚀 Відкриваємо пакетну транзакцію
  const batch = writeBatch(db);

  // 1. Оновлюємо П'єдестал (додаємо в пакет)
  let shouldUpdatePedestal = isRecord;
  if (!isRecord && !isRunning && newValueReps > currentRecord.absoluteMaxReps) {
    shouldUpdatePedestal = true; // Силові: більше повторень, хоча індекс нижчий
  }

  if (shouldUpdatePedestal) {
    const pedestalRef = doc(db, "stats", "pedestal");
    batch.set(
      pedestalRef,
      {
        [exerciseName]: {
          count: isRecord ? finalResult : currentRecord.count,
          date: isRecord ? date : currentRecord.date,
          index: isRecord ? newIndex : currentRecord.index,
          absoluteMaxReps: isRunning
            ? (isRecord ? newValueReps : currentRecord.absoluteMaxReps)
            : Math.max(newValueReps, currentRecord.absoluteMaxReps),
          max1RM: isRecord ? new1RM : currentRecord.max1RM || 0,
        },
      },
      { merge: true },
    );
  }

  const newStat = getStatUpdateData(exerciseName, finalResult);
  const globalStatRef = doc(db, "stats", "global");

  // 2. Редагування старого або створення нового запису
  if (currentEditId) {
    const workoutRef = doc(db, "workouts", currentEditId);
    const oldWorkout = allWorkouts.find((w) => w.id === currentEditId);
    const oldStat = getStatUpdateData(oldWorkout.exercise, oldWorkout.count);

    batch.update(workoutRef, dataToSave); // Оновлюємо тренування

    // Перераховуємо глобальну статистику
    if (oldStat.key === newStat.key) {
      let diff = newStat.val - oldStat.val;
      if (diff !== 0)
        batch.set(
          globalStatRef,
          { [newStat.key]: increment(diff) },
          { merge: true },
        );
    } else {
      batch.set(
        globalStatRef,
        {
          [oldStat.key]: increment(-oldStat.val),
          [newStat.key]: increment(newStat.val),
        },
        { merge: true },
      );
    }
  } else {
    // Створюємо нове посилання з унікальним ID (замість прямого addDoc)
    const newWorkoutRef = doc(colRef);
    dataToSave.createdAt = Date.now();

    batch.set(newWorkoutRef, dataToSave); // Зберігаємо тренування
    batch.set(
      globalStatRef,
      { [newStat.key]: increment(newStat.val) },
      { merge: true },
    ); // Збільшуємо статистику

    if (isRecord || isGoalReached) {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        zIndex: 9999,
      });
    }
  }

  // 3. Відправляємо весь пакет на сервер ОДНИМ запитом
  await batch.commit();
  syncGlobalStats();
}

// === 3. THE CONTROLLER: Логіка кліку на кнопку збереження ===
document.getElementById("saveBtn").addEventListener("click", async () => {
  if (!isAdmin) return;

  const date = document.getElementById("workoutDate").value;
  if (!date) {
    alert("Обов'язково вкажіть дату тренування!");
    return;
  }

  try {
    // 1. Делегуємо збір даних
    const select = document.getElementById("exSelect").value;
    const { exerciseName, finalResult } = buildWorkoutResult(select);
    const noteValue = document.getElementById("workoutNote").value.trim();
    const videoValue = document.getElementById("workoutVideoUrl").value.trim();
    const resultValue = document.getElementById("workoutResultUrl")?.value.trim() || "";

    // 2. Блокуємо UI
    document.getElementById("saveBtn").disabled = true;
    document.getElementById("status").innerText = "Збереження...";

    // 3. Делегуємо роботу з базою даних
    await processWorkoutDB(
      { exerciseName, date, finalResult, noteValue, videoValue, resultValue },
      editingId,
    );

    // 4. Очищуємо UI
    if (editingId) {
      editingId = null;
      document.getElementById("saveBtn").innerText = "Зберегти трофей";
      document.getElementById("cancelEditBtn").style.display = "none";
    }
    clearForm();

    document.getElementById("status").innerText = "Рекорд збережено 🏆";
    setTimeout(() => {
      document.getElementById("status").innerText = "Хмара синхронізована ✅";
    }, 3000);
  } catch (err) {
    if (err.message && !err.code) {
      // Помилки валідації з нашого Builder'а (генеруються через throw new Error)
      alert(err.message);
    } else if (err.code === "permission-denied") {
      alert(
        "🛡️ Гарна спроба! Ти розблокував форму, але база даних відхилила запит.",
      );
    } else {
      alert("Помилка: " + err.message);
    }
  } finally {
    document.getElementById("saveBtn").disabled = false;
  }
});

// ЕКСПОРТ
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!isAdmin || allWorkouts.length === 0) return;
  let csvContent = "Дата,Вправа,Результат\n";
  allWorkouts.forEach((w) => {
    csvContent += `"${w.date}","${w.exercise}","${w.count}"\n`;
  });
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Рекорди_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
});

// === БЕЗПЕЧНЕ ВИДАЛЕННЯ (Атомарна транзакція) ===
window.deleteEntry = async (id) => {
  if (!isAdmin || !confirm("Видалити цей рекорд?")) return;
  const workout = allWorkouts.find((x) => x.id === id);
  if (workout) {
    try {
      document.getElementById("status").innerText = "Видалення...";

      const batch = writeBatch(db); // Відкриваємо пакетну транзакцію

      const stat = getStatUpdateData(workout.exercise, workout.count);
      const statRef = doc(db, "stats", "global");
      const workoutRef = doc(db, "workouts", id);

      // Додаємо інструкції в пакет (вони ще НЕ відправляються на сервер)
      batch.set(statRef, { [stat.key]: increment(-stat.val) }, { merge: true });
      batch.delete(workoutRef);

      // Виконуємо пакет одним махом
      await batch.commit();

      document.getElementById("status").innerText = "Видалено 🗑️";
      setTimeout(() => {
        document.getElementById("status").innerText = "Хмара синхронізована ✅";
      }, 2000);
    } catch (e) {
      if (e.code === "permission-denied") {
        alert("🛡️ Доступ заборонено! База захищена правилами безпеки.");
      } else {
        alert("Помилка при видаленні: " + e.message);
      }
      document.getElementById("status").innerText = "Помилка видалення ❌";
    }
  }
};

// === ФІНАЛЬНИЙ СКРИПТ СИНХРОНІЗАЦІЇ (Глобальна стата + П'єдестал) ===
window.syncGlobalStats = async () => {
  try {
    document.getElementById("status").innerText =
      "Аналіз всієї історії (це може зайняти час)...";

    // Витягуємо ВСІ тренування без лімітів (тільки для цього скрипта)
    const querySnapshot = await getDocs(collection(db, "workouts"));
    let allW = querySnapshot.docs.map((d) => migrateWorkout({ id: d.id, ...d.data() }));

    let totals = {
      Підтягування: 0,
      Відтискання: 0,
      Бруси: 0,
      Біг: 0,
      otherSets: 0,
    };
    let newPedestal = {};

    allW.forEach((w) => {
      // 1. Рахуємо Зал Слави
      let s = getStatUpdateData(w.exercise, w.count);
      if (totals[s.key] !== undefined) totals[s.key] += s.val;
      else totals[s.key] = s.val;

      // 2. Рахуємо П'єдестал
      let isRunning = isRunningExercise(w.exercise);
      let wIndex = calculateIndex(w.count, w.date, w.exercise);
      let wReps = isRunning ? parseTimeFromCount(w.count) : parseValue(w.count);
      let w1RM = isRunning ? 0 : calculate1RM(w.count, w.date);

      if (!newPedestal[w.exercise] || wIndex > newPedestal[w.exercise].index) {
        newPedestal[w.exercise] = {
          count: w.count,
          date: w.date,
          index: wIndex,
          absoluteMaxReps: wReps,
          max1RM: w1RM,
        };
      } else {
        if (!isRunning && wReps > newPedestal[w.exercise].absoluteMaxReps) {
          newPedestal[w.exercise].absoluteMaxReps = wReps;
        }
      }
    });

    await setDoc(doc(db, "stats", "global"), totals);
    await setDoc(doc(db, "stats", "pedestal"), newPedestal);

    alert("✅ Зал Слави та П'єдестал успішно оптимізовано та оновлено!");
    location.reload();
  } catch (e) {
    console.error("Помилка:", e);
    alert("Помилка доступу. Можливо, ви не авторизовані як власник.");
  }
};
// SERVICE WORKER
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("[SW] Registered, scope:", reg.scope);
        reg.update();
      })
      .catch((err) => console.error("[SW] Registration failed:", err));
  });
}

// === PWA INSTALL PROMPT ===
let _deferredInstall = null;

// Перевіряємо чи встановлено (standalone) — одразу ховаємо кнопку
function _isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
    || document.referrer.includes("android-app://");
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredInstall = e;
  console.log("[PWA] Install prompt ready");
});

window.addEventListener("appinstalled", () => {
  console.log("[PWA] Installed");
  _deferredInstall = null;
  const btn = document.getElementById("installPwaBtn");
  if (btn) btn.style.display = "none";
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("installPwaBtn");
  if (!btn) return;

  // Якщо запущено як встановлений додаток — кнопку не показуємо
  if (_isStandalone()) {
    btn.style.display = "none";
    return;
  }

  btn.addEventListener("click", async () => {
    // Закриваємо меню
    document.getElementById("sideMenu")?.classList.remove("open");
    document.getElementById("menuOverlay")?.classList.remove("active");
    document.getElementById("menuTrigger")?.classList.remove("active");
    document.body.style.overflow = "";

    if (_deferredInstall) {
      // Нативний промпт від Chrome/Edge/Brave
      _deferredInstall.prompt();
      const { outcome } = await _deferredInstall.userChoice;
      console.log("[PWA] User choice:", outcome);
      if (outcome === "accepted") {
        _deferredInstall = null;
        btn.style.display = "none";
      }
    } else {
      // Браузер не дає програмний промпт — показуємо інструкцію
      const ua = navigator.userAgent;
      let msg = "";
      if (/iPhone|iPad|iPod/.test(ua)) {
        msg = "На iPhone (Safari):\n\n1. Натисни кнопку «Поділитись» внизу екрану ⬆️\n2. Вибери «На екран Домівки»\n3. Підтверди «Додати»";
      } else if (/Android/.test(ua)) {
        msg = "На Android:\n\n1. Натисни ⋮ (три крапки) у меню браузера зверху справа\n2. Вибери «Встановити додаток» або «Додати на головний екран»\n3. Підтверди «Встановити»\n\nЯкщо такої опції немає — оновіть сторінку і спробуйте знову через 5 секунд.";
      } else {
        msg = "Натисни на меню браузера (⋮ або ☰) → «Встановити додаток» або «Додати на головний екран»";
      }
      alert(msg);
    }
  });
});
function calculateSobriety() {
  const alcoholStart = new Date(2023, 7, 24); // 24.08.2023 (місяці починаються з 0, тому 7 = серпень)
  const smokingStart = new Date(2024, 7, 24); // 24.08.2024

  function getDiff(startDate) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = today.getTime() - startDate.getTime();
    const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let years = today.getFullYear() - startDate.getFullYear();
    let months = today.getMonth() - startDate.getMonth();
    let days = today.getDate() - startDate.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    // Допоміжна функція для слів (рік/роки/років)
    function getWord(num, w1, w2, w5) {
      let n = Math.abs(num) % 100;
      let n1 = n % 10;
      if (n > 10 && n < 20) return w5;
      if (n1 > 1 && n1 < 5) return w2;
      if (n1 === 1) return w1;
      return w5;
    }

    let text = "";
    if (years > 0) text += `${years}${getWord(years, "р", "р", "р")} `;
    if (months > 0) text += `${months}${getWord(months, "м", "м", "м")} `;
    text += `${days}${getWord(days, "д", "д", "д")}`;

    return { detailed: text.trim(), total: totalDays };
  }

  const alc = getDiff(alcoholStart);
  const smk = getDiff(smokingStart);

  document.getElementById("soberAlcohol").innerText = alc.detailed;
  document.getElementById("soberAlcoholDays").innerText =
    `(Всього: ${alc.total} дн)`;

  document.getElementById("soberSmoking").innerText = smk.detailed;
  document.getElementById("soberSmokingDays").innerText =
    `(Всього: ${smk.total} дн)`;
}

calculateExperience();
calculateSobriety();

// === СИСТЕМА ВІДСТЕЖЕННЯ ВАГИ (ВКЛАДКА 3) ===
const weightColRef = collection(db, "weight");
let allWeights = [];
let weightChartInstance = null;

// Встановлюємо сьогоднішню дату у формі ваги за замовчуванням
const weightDateInput = document.getElementById("weightDate");
if (weightDateInput) weightDateInput.valueAsDate = new Date();
// --- АВТОЗБЕРЕЖЕННЯ ЗРОСТУ ЯК СТАЛОЇ ---
const heightInput = document.getElementById("userHeight");
if (heightInput) {
  // 1. При завантаженні дістаємо зріст із пам'яті браузера
  const savedHeight = localStorage.getItem("userHeight");
  if (savedHeight) heightInput.value = savedHeight;

  // 2. Зберігаємо миттєво, щойно ти змінюєш цифру
  heightInput.addEventListener("input", (e) => {
    localStorage.setItem("userHeight", e.target.value);
    // Одразу перераховуємо ІМТ без необхідності тиснути "Зберегти"
    renderWeightUI();
  });
}

// --- АВТОЗАПОВНЕННЯ ФОРМИ З ОСТАННЬОГО ЗВАЖУВАННЯ ---
window.autofillWeightForm = (force) => {
  if (!allWeights || allWeights.length === 0) return;
  const getVal = (w, key) => {
    // Новий формат — плоский; старий — вкладений в measurements
    if (w[key] !== undefined && parseFloat(w[key]) > 0) return parseFloat(w[key]);
    if (w.measurements && w.measurements[key] !== undefined && parseFloat(w.measurements[key]) > 0)
      return parseFloat(w.measurements[key]);
    return 0;
  };

  const last = allWeights.find(w => {
    const keys = ["neck","shoulders","chest","waist","bicep","thigh","calf","forearm"];
    return keys.some(k => getVal(w, k) > 0);
  }) || allWeights[0];

  const fieldMap = {
    mNeck:        "neck",
    mShoulders:   "shoulders",
    mChest:       "chest",
    mWaist:       "waist",
    mBicep:       "bicep",
    mThigh:       "thigh",
    mCalf:        "calf",
    mForearm:     "forearm",
    mPenisLength: "penisLength",
    mPenisGirth:  "penisGirth",
  };

  Object.entries(fieldMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = getVal(last, key);
    if ((force || !el.value) && val > 0) el.value = val;
  });

  // Зріст
  const heightEl = document.getElementById("userHeight");
  if (heightEl && (force || !heightEl.value) && last.height && parseFloat(last.height) > 0) {
    heightEl.value = parseFloat(last.height);
    localStorage.setItem("userHeight", last.height);
  }

  // Вага тіла
  const weightEl = document.getElementById("weightValue");
  if (weightEl && (force || !weightEl.value) && last.weight && parseFloat(last.weight) > 0) {
    weightEl.value = parseFloat(last.weight);
  }
};

// Викликаємо при перемиканні на вкладку "Вага"
document.querySelectorAll('.nav-btn[data-tab="tab-weight"]').forEach((btn) => {
  btn.addEventListener("click", () => {
    setTimeout(() => { if (window.autofillWeightForm) window.autofillWeightForm(true); }, 50);
  });
});
// Збереження нової ваги
const saveWeightBtn = document.getElementById("saveWeightBtn");
if (saveWeightBtn) {
  saveWeightBtn.addEventListener("click", async () => {
    if (!isAdmin) return;

    const date = document.getElementById("weightDate").value;
    const weight = parseFloat(document.getElementById("weightValue").value);
    const heightVal = document.getElementById("userHeight").value;

    // Збираємо заміри тіла
    const measurements = {
      neck: parseFloat(document.getElementById("mNeck").value) || 0,
      shoulders: parseFloat(document.getElementById("mShoulders").value) || 0,
      chest: parseFloat(document.getElementById("mChest").value) || 0,
      waist: parseFloat(document.getElementById("mWaist").value) || 0,
      bicep: parseFloat(document.getElementById("mBicep").value) || 0,
      thigh: parseFloat(document.getElementById("mThigh").value) || 0,
      calf: parseFloat(document.getElementById("mCalf").value) || 0,
      forearm: parseFloat(document.getElementById("mForearm").value) || 0,
      penisLength: parseFloat(document.getElementById("mPenisLength")?.value) || 0,
      penisGirth: parseFloat(document.getElementById("mPenisGirth")?.value) || 0,
    };

    if (heightVal) localStorage.setItem("userHeight", heightVal);

    if (!date || isNaN(weight) || weight <= 0) {
      alert("Вкажіть правильну дату та вагу (більше 0)!");
      return;
    }

    try {
      document.getElementById("status").innerText = "Збереження даних тіла...";

      const dataToWrite = {
        date: date,
        weight: weight,
        height: parseFloat(heightVal) || 0,
        ...measurements,
        updatedAt: Date.now(),
      };

      if (_editingWeightId) {
        // Режим редагування — оновлюємо існуючий запис
        await setDoc(doc(db, "weight", _editingWeightId), dataToWrite, { merge: true });
        _editingWeightId = null;
        const saveBtn2 = document.getElementById("saveWeightBtn");
        if (saveBtn2) { saveBtn2.textContent = "Зберегти дані тіла"; saveBtn2.style.background = ""; }
        document.getElementById("cancelWeightEditBtn")?.remove();
      } else {
        // Новий запис
        await addDoc(weightColRef, { ...dataToWrite, createdAt: Date.now() });
      }

      document.getElementById("weightValue").value = "";
      // Очищення полів замірів
      [
        "mNeck",
        "mShoulders",
        "mChest",
        "mWaist",
        "mBicep",
        "mThigh",
        "mCalf",
        "mForearm",
      ].forEach((id) => {
        document.getElementById(id).value = "";
      });

      document.getElementById("status").innerText = "Дані тіла оновлено ⚖️";
      setTimeout(() => {
        document.getElementById("status").innerText = "Хмара синхронізована ✅";
      }, 3000);
    } catch (err) {
      alert("Помилка: " + err.message);
    }
  });
}

// Функція видалення запису ваги
window.deleteWeightEntry = async (id) => {
  if (!isAdmin) return;
  if (confirm("Точно видалити цей запис ваги?")) {
    try {
      await deleteDoc(doc(db, "weight", id));
    } catch (err) {
      if (err.code === "permission-denied") {
        alert("🛡️ Доступ заборонено! База захищена правилами безпеки.");
      } else {
        alert("Помилка при видаленні: " + err.message);
      }
    }
  }
};

// Редагування запису ваги — заповнює форму та прокручує до неї
let _editingWeightId = null;
window.editWeightEntry = (id) => {
  if (!isAdmin) return;
  const entry = allWeights.find(w => w.id === id);
  if (!entry) return;

  _editingWeightId = id;

  // Заповнюємо форму
  const weightDateEl = document.getElementById("weightDate");
  if (weightDateEl) weightDateEl.value = entry.date;

  const weightValueEl = document.getElementById("weightValue");
  if (weightValueEl) weightValueEl.value = entry.weight || "";

  const heightEl = document.getElementById("userHeight");
  if (heightEl && entry.height) heightEl.value = entry.height;

  const fieldMap = {
    mNeck: "neck", mShoulders: "shoulders", mChest: "chest",
    mWaist: "waist", mBicep: "bicep", mThigh: "thigh",
    mCalf: "calf", mForearm: "forearm",
    mPenisLength: "penisLength", mPenisGirth: "penisGirth",
  };
  Object.entries(fieldMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el) el.value = entry[key] > 0 ? entry[key] : "";
  });

  // Показуємо кнопку "Скасувати" і міняємо текст кнопки збереження
  const saveBtn = document.getElementById("saveWeightBtn");
  if (saveBtn) {
    saveBtn.textContent = "💾 Оновити запис";
    saveBtn.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
  }

  let cancelBtn = document.getElementById("cancelWeightEditBtn");
  if (!cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.id = "cancelWeightEditBtn";
    cancelBtn.className = "btn-outline-accent";
    cancelBtn.textContent = "✕ Скасувати редагування";
    cancelBtn.style.marginTop = "8px";
    cancelBtn.addEventListener("click", () => {
      _editingWeightId = null;
      if (saveBtn) {
        saveBtn.textContent = "Зберегти дані тіла";
        saveBtn.style.background = "";
      }
      cancelBtn.remove();
      // Відновлюємо автозаповнення
      if (window.autofillWeightForm) window.autofillWeightForm(true);
    });
    saveBtn?.parentNode?.insertBefore(cancelBtn, saveBtn.nextSibling);
  }

  // Прокрутка до форми
  document.getElementById("weightAdminPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

// === РОЗУМНЕ ЗАВАНТАЖЕННЯ ВАГИ (ПАГІНАЦІЯ) ===
let weightLimit = 30; // Вантажимо по 30 записів ваги
let unsubscribeWeight = null;

window.listenToWeight = () => {
  if (unsubscribeWeight) unsubscribeWeight();

  const q = query(weightColRef, orderBy("date", "desc"), limit(weightLimit));

  unsubscribeWeight = onSnapshot(q, (snapshot) => {
    allWeights = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    renderWeightUI();
    if (window.autofillWeightForm) window.autofillWeightForm();

    // Логіка показу кнопки "Завантажити ще"
    const loadMoreBtn = document.getElementById("loadMoreWeightBtn");
    if (loadMoreBtn) {
      if (allWeights.length === weightLimit) {
        loadMoreBtn.style.display = "block";
      } else {
        loadMoreBtn.style.display = "none";
      }
    }
  });
};

window.loadMoreWeight = () => {
  weightLimit += 30;
  listenToWeight();
};

listenToWeight();
let weightHTML = "";

// Рендер історії ваги та графіка
function renderWeightUI() {
  const container = document.getElementById("weightTimelineContainer");
  if (!container) return;
  container.innerHTML = "";

  // Логіка ІМТ (BMI)
  const bmiContainer = document.getElementById("bmiContainer");
  if (bmiContainer) {
    if (allWeights.length > 0) {
      const latestWeight = parseFloat(allWeights[0].weight) || 0;
      const heightCm = parseFloat(localStorage.getItem("userHeight"));

      if (
        !isNaN(heightCm) &&
        heightCm >= 30 &&
        heightCm <= 300 &&
        latestWeight > 0
      ) {
        const heightM = heightCm / 100;
        const bmi = (latestWeight / (heightM * heightM)).toFixed(1);
        let category = "";
        let bClass = "";
        if (bmi < 18.5) {
          category = "Недостатня вага";
          bClass = "bmi-warn";
        } else if (bmi < 25) {
          category = "Норма";
          bClass = "bmi-normal";
        } else if (bmi < 30) {
          category = "Зайва вага";
          bClass = "bmi-warn";
        } else {
          category = "Ожиріння";
          bClass = "bmi-danger";
        }

        bmiContainer.innerHTML = `<div class="bmi-badge ${bClass}">ІМТ: ${bmi} (${category})</div>`;
        document.getElementById("userHeight").value = heightCm;
      } else {
        bmiContainer.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted);">Вкажіть зріст у панелі вище, щоб побачити ІМТ</div>`;
      }
    } else {
      bmiContainer.innerHTML = "";
    }
  }

  if (allWeights.length === 0) {
    container.innerHTML =
      '<div class="empty-state">Ще немає записів ваги. Час зважитися!</div>';
    updateWeightChart();
    return;
  }

  let weightHTML = ""; // Коробка для ваги

  allWeights.forEach((w, index) => {
    let diffHTML = "";
    if (index < allWeights.length - 1) {
      let prevW = allWeights[index + 1];
      let diff = Math.round((w.weight - prevW.weight) * 10) / 10;
      if (diff > 0)
        diffHTML = `<span class="diff-badge negative">+${diff} кг</span>`;
      else if (diff < 0)
        diffHTML = `<span class="diff-badge">${diff} кг</span>`;
      else
        diffHTML = `<span class="diff-badge" style="background:var(--border); color:var(--text-muted);">Без змін</span>`;
    }

    const displayDate = formatDate(w.date);

    weightHTML += `
            <div class="timeline-item">
                <div class="timeline-dot" style="background: var(--highlight); border-color: var(--bg-color); box-shadow: 0 0 10px var(--highlight);"></div>
                <div class="timeline-header">
                    <span class="timeline-date">${ICONS.cal} ${displayDate}</span>
                    <div style="display:flex;gap:6px">
                      ${isAdmin ? `<button class="btn-edit" onclick="editWeightEntry('${w.id}')">✎ Редаг.</button>` : ""}
                      ${isAdmin ? `<button class="btn-del" onclick="deleteWeightEntry('${w.id}')">Видалити</button>` : ""}
                    </div>
                </div>
                <div class="timeline-content">
                    <span class="timeline-val">${w.weight} <span style="font-size: 1rem; color: var(--text-muted);">кг</span> ${diffHTML}</span>
                </div>
            </div>`;
  });

  container.innerHTML = weightHTML; // Вставляємо все за один раз

  // Викликаємо оновлення залежних елементів
  renderUI();
  renderBodyMap();
  updateWeightChart();
}

// Побудова графіка маси тіла
function updateWeightChart() {
  const canvas = document.getElementById("weightChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const chartData = [...allWeights].reverse();
  const labels = chartData.map((w) => w.date);
  const dataPoints = chartData.map((w) => w.weight);

  // 🚀 ОПТИМІЗАЦІЯ: Оновлюємо дані, якщо графік вже є
  if (weightChartInstance) {
    weightChartInstance.data.labels = labels;
    weightChartInstance.data.datasets[0].data = dataPoints;
    weightChartInstance.update(); // Плавна анімація коливань ваги
  } else {
    // Створюємо вперше
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text-muted").trim() || "#888";
    const gridColor =
      style.getPropertyValue("--border").trim() || "rgba(255,255,255,0.1)";
    const highlightColor =
      style.getPropertyValue("--highlight").trim() || "#f59e0b";

    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, "rgba(245, 158, 11, 0.5)");
    gradient.addColorStop(1, "rgba(245, 158, 11, 0.0)");

    weightChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Динаміка ваги (кг)",
            data: dataPoints,
            borderColor: highlightColor,
            backgroundColor: gradient,
            borderWidth: 4,
            pointBackgroundColor: "#fff",
            pointBorderColor: highlightColor,
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: "Nunito", weight: "bold" },
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleFont: { family: "Nunito", size: 14 },
            bodyFont: { family: "Nunito", size: 14 },
            padding: 12,
            cornerRadius: 12,
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { family: "Nunito" } },
            grid: { color: gridColor, drawBorder: false },
          },
          y: {
            ticks: { color: textColor, font: { family: "Nunito" } },
            grid: { color: gridColor, drawBorder: false, borderDash: [5, 5] },
            beginAtZero: false,
          },
        },
      },
    });
  }
}

function calculateExperience() {
  // Дата початку: 21.01.2023
  const startDate = new Date(2023, 0, 21);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = today.getTime() - startDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let years = today.getFullYear() - startDate.getFullYear();
  let months = today.getMonth() - startDate.getMonth();
  let days = today.getDate() - startDate.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  function getWordForm(num, word1, word2, word5) {
    let n = Math.abs(num) % 100;
    let n1 = n % 10;
    if (n > 10 && n < 20) return word5;
    if (n1 > 1 && n1 < 5) return word2;
    if (n1 === 1) return word1;
    return word5;
  }

  let detailedText = "";
  if (years > 0)
    detailedText += `${years} ${getWordForm(years, "рік", "роки", "років")} `;
  if (months > 0)
    detailedText += `${months} ${getWordForm(months, "місяць", "місяці", "місяців")} `;
  if (days > 0 || detailedText === "")
    detailedText += `${days} ${getWordForm(days, "день", "дні", "днів")}`;

  const expDetailedEl = document.getElementById("expDetailed");
  const expTotalEl = document.getElementById("expTotalDays");

  if (expDetailedEl && expTotalEl) {
    expDetailedEl.innerText = detailedText.trim();
    expTotalEl.innerText = `(Всього: ${diffDays} ${getWordForm(diffDays, "день", "дні", "днів")})`;
  }
}
// ==========================================
// === СИСТЕМА ФОТО-ПРОГРЕСУ (ГАЛЕРЕЯ) ===
// ==========================================
let allPhotos = [];

// Магія: витягуємо ID та генеруємо безвідмовне посилання на картинку
function getDriveDirectLink(url) {
  if (!url) return "";

  // Шукаємо ID файлу в будь-яких форматах посилань Google Диску
  let match =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);

  if (match && match[1]) {
    let fileId = match[1];
    // Використовуємо офіційний сервер мініатюр Google (обходить блокування і вантажить швидше)
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  return url; // якщо це посилання на інший сайт (не Диск), залишаємо як є
}
if (document.getElementById("photoDate")) {
  document.getElementById("photoDate").valueAsDate = new Date();
}

if (document.getElementById("savePhotoBtn")) {
  document
    .getElementById("savePhotoBtn")
    .addEventListener("click", async () => {
      if (!isAdmin) return;

      const date = document.getElementById("photoDate").value;
      const url = document.getElementById("photoUrl").value;

      if (!date || !url) {
        alert("Вкажіть дату та вставте посилання з Google Диску!");
        return;
      }

      try {
        document.getElementById("status").innerText = "Збереження фото...";
        await addDoc(collection(db, "photos"), {
          date: date,
          url: url,
          createdAt: Date.now(),
        });
        document.getElementById("photoUrl").value = "";
        document.getElementById("status").innerText = "Фото додано ✅";
      } catch (err) {
        if (err.code === "permission-denied") {
          alert(
            "🛡️ Доступ заборонено! Тільки власник може додавати фотографії.",
          );
        } else {
          alert("Помилка: " + err.message);
        }
      }
    });
}

// === РОЗУМНЕ ЗАВАНТАЖЕННЯ ФОТО (ПАГІНАЦІЯ) ===
let photoLimit = 15; // Вантажимо по 15 фото (вони "важчі" для рендеру)
let unsubscribePhotos = null;

window.listenToPhotos = () => {
  if (unsubscribePhotos) unsubscribePhotos();

  const q = query(
    collection(db, "photos"),
    orderBy("date", "desc"),
    limit(photoLimit),
  );

  unsubscribePhotos = onSnapshot(q, (snapshot) => {
    allPhotos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if (typeof renderPhotos === "function") renderPhotos();

    // Логіка показу кнопки "Завантажити ще"
    const loadMoreBtn = document.getElementById("loadMorePhotosBtn");
    if (loadMoreBtn) {
      if (allPhotos.length === photoLimit) {
        loadMoreBtn.style.display = "block";
      } else {
        loadMoreBtn.style.display = "none";
      }
    }
  });
};

window.loadMorePhotos = () => {
  photoLimit += 15;
  listenToPhotos();
};

listenToPhotos();

// Видалення
window.deletePhoto = async (id) => {
  if (!isAdmin || !confirm("Точно видалити це фото з галереї?")) return;
  try {
    await deleteDoc(doc(db, "photos", id));
  } catch (err) {
    if (err.code === "permission-denied") {
      alert("🛡️ Доступ заборонено! База захищена правилами безпеки.");
    } else {
      alert("Помилка при видаленні: " + err.message);
    }
  }
};

// Відмальовування галереї (Групування по датах)
window.renderPhotos = () => {
  const container = document.getElementById("photoGalleryContainer");
  if (!container) return;

  // ЖОРСТКА ПЕРЕВІРКА ПРИВАТНОСТІ: Гості бачать лише порожнечу
  if (!isAdmin) {
    container.innerHTML = "";
    return;
  }

  // Знімаємо клас сітки з головного контейнера, бо тепер у нас будуть групи
  container.classList.remove("photo-grid");

  if (allPhotos.length === 0) {
    container.innerHTML =
      '<div class="empty-state">Ще немає жодного фото. Час додати перше!</div>';
    return;
  }

  // 1. Групуємо всі фотографії по їхніх датах
  const photosByDate = {};
  const sortedDates = []; // Щоб зберегти правильний порядок від найновіших

  allPhotos.forEach((p) => {
    if (!photosByDate[p.date]) {
      photosByDate[p.date] = [];
      sortedDates.push(p.date);
    }
    photosByDate[p.date].push(p);
  });

  // 2. Будуємо HTML-код: Заголовок дати -> Сітка фотографій цієї дати
  let html = "";
  sortedDates.forEach((dateStr) => {
    html += `
      <div class="photo-date-group">
          <div class="photo-date-header">
              ${ICONS.cal} ${formatDate(dateStr)}
          </div>
          <div class="photo-grid">`;

    // Вставляємо всі фото, які належать до цієї дати
    photosByDate[dateStr].forEach((p) => {
      let directUrl = getDriveDirectLink(p.url);
      html += `
              <div class="photo-card">
                  <img src="${directUrl}" alt="Progress Photo" loading="lazy" onclick="window.open('${p.url}', '_blank')" title="Відкрити оригінал на Диску">
                  <button class="photo-del-btn" onclick="deletePhoto('${p.id}')" title="Видалити">✖</button>
              </div>`;
    });

    html += `
          </div>
      </div>`;
  });

  container.innerHTML = html;
};
function renderBodyMap() {
  const container = document.getElementById("bodyMarkersContainer");
  const mapBox = document.getElementById("bodyMapCard");

  if (!container || allWeights.length === 0 || !isAdmin) {
    if (mapBox) mapBox.style.display = "none";
    return;
  }

  const latest = allWeights[0].measurements;
  const prev = allWeights.length > 1 ? allWeights[1].measurements : null;

  if (!latest || Object.values(latest).every((v) => v === 0)) {
    mapBox.style.display = "none";
    return;
  }

  mapBox.style.display = "block";
  container.innerHTML = "";
  const points = [
    { key: "neck", label: "Шия", x: 50, y: 12 },
    { key: "shoulders", label: "Плечі", x: 25, y: 18 },
    { key: "chest", label: "Груди", x: 50, y: 26 },
    { key: "bicep", label: "Біцепс", x: 22, y: 34 },
    { key: "waist", label: "Талія", x: 50, y: 45 },
    { key: "forearm", label: "Передпліччя", x: 17, y: 46 },
    { key: "thigh", label: "Стегно", x: 38, y: 64 },
    { key: "calf", label: "Гомілка", x: 37, y: 82 },
  ];

  points.forEach((p) => {
    const val = latest[p.key];
    if (val > 0) {
      let diffHTML = "";
      if (prev && prev[p.key] > 0) {
        const diff = (val - prev[p.key]).toFixed(1);
        if (diff > 0)
          diffHTML = `<span class="marker-diff marker-up">▲${diff}</span>`;
        else if (diff < 0)
          diffHTML = `<span class="marker-diff marker-down">▼${Math.abs(diff)}</span>`;
      }

      const el = document.createElement("div");
      el.className = "body-marker";
      el.style.left = p.x + "%";
      el.style.top = p.y + "%";
      el.style.transform = "translate(-50%, -50%)";
      el.setAttribute("data-label", p.label + ": " + val + " см");
      el.innerHTML = `<span>${val}</span>${diffHTML}`;
      container.appendChild(el);
    }
  });
}
// === ЛОГІКА БІЧНОГО МЕНЮ ===
{
  const menuTrigger = document.getElementById("menuTrigger");
  const sideMenu = document.getElementById("sideMenu");
  const closeMenuBtn = document.getElementById("closeMenu");
  const menuOverlay = document.getElementById("menuOverlay");

  if (menuTrigger && sideMenu && closeMenuBtn && menuOverlay) {
    function openMenu() {
      sideMenu.classList.add("open");
      menuOverlay.classList.add("active");
      menuTrigger.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      sideMenu.classList.remove("open");
      menuOverlay.classList.remove("active");
      menuTrigger.classList.remove("active");
      document.body.style.overflow = "";
    }

    menuTrigger.addEventListener("click", () =>
      sideMenu.classList.contains("open") ? closeMenu() : openMenu()
    );
    closeMenuBtn.addEventListener("click", closeMenu);
    menuOverlay.addEventListener("click", closeMenu);

    document.querySelectorAll(".side-menu__item").forEach((item) => {
      if (item.id !== "musicToggle") {
        item.addEventListener("click", closeMenu);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sideMenu.classList.contains("open")) closeMenu();
    });
  }
}
