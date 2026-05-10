// ================================================================
//  achievements.js — Система досягнень
// ================================================================

const MILESTONES = [
  // === СИЛОВІ ===
  { id: "first_pullup", name: "Перший Pull-up", description: "Перший рекорд у підтягуваннях", icon: "🎯", category: "strength", reward: 10,
    condition: (w) => w.some(r => r.exercise === "Підтягування"),
    progress: (w) => w.some(r => r.exercise === "Підтягування") ? 1 : 0 },

  { id: "ten_pullups", name: "10 Підтягувань", description: "Досягнути 10 повторень", icon: "💪", category: "strength", reward: 15,
    condition: (w) => w.some(r => r.exercise === "Підтягування" && parseInt(r.count) >= 10),
    progress: (w) => {
      const max = Math.max(0, ...w.filter(r => r.exercise === "Підтягування").map(r => parseInt(r.count) || 0));
      return Math.min(1, max / 10);
    }},

  { id: "twenty_pullups", name: "20 Підтягувань", description: "Досягнути 20 повторень", icon: "🔥", category: "strength", reward: 25,
    condition: (w) => w.some(r => r.exercise === "Підтягування" && parseInt(r.count) >= 20),
    progress: (w) => {
      const max = Math.max(0, ...w.filter(r => r.exercise === "Підтягування").map(r => parseInt(r.count) || 0));
      return Math.min(1, max / 20);
    }},

  { id: "fifty_pullups", name: "50 Підтягувань", description: "Феноменальні 50 повторень", icon: "🏆", category: "strength", reward: 50,
    condition: (w) => w.some(r => r.exercise === "Підтягування" && parseInt(r.count) >= 50),
    progress: (w) => {
      const max = Math.max(0, ...w.filter(r => r.exercise === "Підтягування").map(r => parseInt(r.count) || 0));
      return Math.min(1, max / 50);
    }},

  { id: "strength_master", name: "Силовий рекордсмен", description: "3+ рекорди в силових дисциплінах", icon: "⚡", category: "strength", reward: 20,
    condition: (w) => {
      const strength = ["Підтягування", "Віджимання", "Бруси"];
      return strength.filter(ex => w.some(r => r.exercise === ex)).length >= 3;
    },
    progress: (w) => {
      const strength = ["Підтягування", "Віджимання", "Бруси"];
      return Math.min(1, strength.filter(ex => w.some(r => r.exercise === ex)).length / 3);
    }},

  { id: "iron_will", name: "Залізна воля", description: "7 днів поспіль з рекордами", icon: "🛡️", category: "strength", reward: 30,
    condition: (w) => calculateStreak(w) >= 7,
    progress: (w) => Math.min(1, calculateStreak(w) / 7) },

  { id: "marathon_30", name: "Марафон 30", description: "30 днів поспіль", icon: "🌟", category: "strength", reward: 75,
    condition: (w) => calculateStreak(w) >= 30,
    progress: (w) => Math.min(1, calculateStreak(w) / 30) },

  { id: "month_titan", name: "Титан місяця", description: "10+ рекордів за один місяць", icon: "👑", category: "strength", reward: 40,
    condition: (w) => maxRecordsInMonth(w) >= 10,
    progress: (w) => Math.min(1, maxRecordsInMonth(w) / 10) },

  // === ШВИДКІСНІ ===
  { id: "sprinter", name: "Спринтер", description: "Перший рекорд у спринті", icon: "⚡", category: "speed", reward: 10,
    condition: (w) => w.some(r => r.exercise && r.exercise.includes("Спринт")),
    progress: (w) => w.some(r => r.exercise && r.exercise.includes("Спринт")) ? 1 : 0 },

  { id: "lightning", name: "Блискавиця", description: "5 рекордів у швидкісних", icon: "🌪️", category: "speed", reward: 30,
    condition: (w) => w.filter(r => r.exercise && (r.exercise.includes("Спринт") || r.exercise.includes("Човниковий"))).length >= 5,
    progress: (w) => Math.min(1, w.filter(r => r.exercise && (r.exercise.includes("Спринт") || r.exercise.includes("Човниковий"))).length / 5) },

  // === ВИТРИВАЛІСТЬ ===
  { id: "marathoner", name: "Марафонець", description: "Перший рекорд у бігу", icon: "🏃", category: "endurance", reward: 10,
    condition: (w) => w.some(r => r.exercise && r.exercise.includes("Біг")),
    progress: (w) => w.some(r => r.exercise && r.exercise.includes("Біг")) ? 1 : 0 },

  { id: "iron_lungs", name: "Залізні легені", description: "10 бігових рекордів", icon: "🫁", category: "endurance", reward: 35,
    condition: (w) => w.filter(r => r.exercise && r.exercise.includes("Біг")).length >= 10,
    progress: (w) => Math.min(1, w.filter(r => r.exercise && r.exercise.includes("Біг")).length / 10) },

  // === ТВЕРЕЗІСТЬ ===
  { id: "sober_7", name: "7 днів тверезості", description: "Тиждень без алкоголю", icon: "🍃", category: "sober", reward: 15,
    condition: (w, sd) => sd >= 7, progress: (w, sd) => Math.min(1, sd / 7) },
  { id: "sober_30", name: "30 днів тверезості", description: "Місяць без алкоголю", icon: "🌱", category: "sober", reward: 30,
    condition: (w, sd) => sd >= 30, progress: (w, sd) => Math.min(1, sd / 30) },
  { id: "sober_100", name: "100 днів", description: "Сотня без зривів", icon: "💚", category: "sober", reward: 75,
    condition: (w, sd) => sd >= 100, progress: (w, sd) => Math.min(1, sd / 100) },
  { id: "sober_365", name: "Рік тверезості", description: "365 днів без зривів", icon: "🏅", category: "sober", reward: 200,
    condition: (w, sd) => sd >= 365, progress: (w, sd) => Math.min(1, sd / 365) },

  // === ЗАГАЛЬНІ ===
  { id: "first_step", name: "Перший крок", description: "Перший рекорд у системі", icon: "🚀", category: "general", reward: 5,
    condition: (w) => w.length >= 1, progress: (w) => Math.min(1, w.length) },

  { id: "collector", name: "Колекціонер", description: "10+ рекордів", icon: "📦", category: "general", reward: 20,
    condition: (w) => w.length >= 10, progress: (w) => Math.min(1, w.length / 10) },

  { id: "archivist", name: "Архіватор", description: "50+ рекордів", icon: "📚", category: "general", reward: 50,
    condition: (w) => w.length >= 50, progress: (w) => Math.min(1, w.length / 50) },

  { id: "historian", name: "Історик", description: "Записи протягом 6+ місяців", icon: "📜", category: "general", reward: 40,
    condition: (w) => spanInMonths(w) >= 6, progress: (w) => Math.min(1, spanInMonths(w) / 6) },

  { id: "comeback", name: "Повернення", description: "Запис після 30+ днів перерви", icon: "🔄", category: "general", reward: 25,
    condition: (w) => hasComeback(w), progress: (w) => hasComeback(w) ? 1 : 0 },

  { id: "diversity", name: "Різноманітність", description: "Записи у 5+ дисциплінах", icon: "🎨", category: "general", reward: 30,
    condition: (w) => new Set(w.map(r => r.exercise)).size >= 5,
    progress: (w) => Math.min(1, new Set(w.map(r => r.exercise)).size / 5) },

  // === ПРОГРЕСІЯ ===
  { id: "improvement", name: "Поліпшення", description: "Побити свій рекорд", icon: "📈", category: "progress", reward: 15,
    condition: (w) => hasImprovement(w), progress: (w) => hasImprovement(w) ? 1 : 0 },

  { id: "win_streak", name: "Серія перемог", description: "Побити рекорд 3 рази", icon: "🎖️", category: "progress", reward: 35,
    condition: (w) => maxImprovements(w) >= 3, progress: (w) => Math.min(1, maxImprovements(w) / 3) },

  { id: "century_pullups", name: "100 підтягувань", description: "Досягнути 100 повторень — легенда", icon: "💎", category: "strength", reward: 150,
    condition: (w) => w.some(r => r.exercise === "Підтягування" && parseInt(r.count) >= 100),
    progress: (w) => {
      const max = Math.max(0, ...w.filter(r => r.exercise === "Підтягування").map(r => parseInt(r.count) || 0));
      return Math.min(1, max / 100);
    }},

  { id: "perfectionist", name: "Перфекціоніст", description: "20+ записів у одній дисципліні", icon: "🎯", category: "progress", reward: 25,
    condition: (w) => maxRecordsPerExercise(w) >= 20, progress: (w) => Math.min(1, maxRecordsPerExercise(w) / 20) },

  // === АРХІВ (private_logs) ===
  { id: "archive_pioneer", name: "Першопроходець", description: "Додати 2 записи в архів за день", icon: "🌱", category: "archive", reward: 10,
    condition: (w, sd, logs) => maxLogsPerDay(logs) >= 2,
    progress: (w, sd, logs) => Math.min(1, maxLogsPerDay(logs) / 2) },

  { id: "archive_focused", name: "Зосереджений", description: "Додати 5 записів в архів за день", icon: "🔬", category: "archive", reward: 25,
    condition: (w, sd, logs) => maxLogsPerDay(logs) >= 5,
    progress: (w, sd, logs) => Math.min(1, maxLogsPerDay(logs) / 5) },

  { id: "archive_obsessed", name: "Одержимий", description: "Додати 10 записів в архів за день", icon: "🌀", category: "archive", reward: 50,
    condition: (w, sd, logs) => maxLogsPerDay(logs) >= 10,
    progress: (w, sd, logs) => Math.min(1, maxLogsPerDay(logs) / 10) },

  { id: "archive_burst", name: "Сплеск", description: "2 записи в архів за 45 хвилин", icon: "⚡", category: "archive", reward: 15,
    condition: (w, sd, logs) => maxLogsInWindow(logs, 45 * 60000) >= 2,
    progress: (w, sd, logs) => Math.min(1, maxLogsInWindow(logs, 45 * 60000) / 2) },

  { id: "archive_storm", name: "Шторм", description: "3 записи в архів за 45 хвилин", icon: "🌪️", category: "archive", reward: 35,
    condition: (w, sd, logs) => maxLogsInWindow(logs, 45 * 60000) >= 3,
    progress: (w, sd, logs) => Math.min(1, maxLogsInWindow(logs, 45 * 60000) / 3) },

  { id: "archive_mythic_s", name: "Сатанинський акт", description: "Зафіксувати запис із рангом «S»", icon: "👹", category: "archive", reward: 500,
    condition: (w, sd, logs) => logs.some(l => l.is_s === true),
    progress: (w, sd, logs) => logs.some(l => l.is_s === true) ? 1 : 0 },
];

// ================================================================
//  ХЕЛПЕРИ
// ================================================================
function calculateStreak(workouts) {
  if (workouts.length === 0) return 0;
  const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();
  if (dates.length === 0) return 0;
  let streak = 1;
  let prev = new Date(dates[0]);
  for (let i = 1; i < dates.length; i++) {
    const cur = new Date(dates[i]);
    const diff = Math.round((prev - cur) / 86400000);
    if (diff === 1) { streak++; prev = cur; }
    else break;
  }
  return streak;
}

function maxRecordsInMonth(workouts) {
  const buckets = {};
  workouts.forEach(w => {
    if (!w.date) return;
    const m = w.date.substring(0, 7);
    buckets[m] = (buckets[m] || 0) + 1;
  });
  return Math.max(0, ...Object.values(buckets));
}

function spanInMonths(workouts) {
  if (workouts.length === 0) return 0;
  const dates = workouts.map(w => new Date(w.date)).filter(d => !isNaN(d));
  if (dates.length === 0) return 0;
  const min = Math.min(...dates.map(d => d.getTime()));
  const max = Math.max(...dates.map(d => d.getTime()));
  return (max - min) / (30 * 86400000);
}

function hasComeback(workouts) {
  if (workouts.length < 2) return false;
  const sorted = [...workouts].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / 86400000;
    if (diff >= 30) return true;
  }
  return false;
}

function hasImprovement(workouts) {
  const byEx = {};
  workouts.forEach(w => {
    if (!byEx[w.exercise]) byEx[w.exercise] = [];
    byEx[w.exercise].push(w);
  });
  for (const ex in byEx) {
    const sorted = [...byEx[ex]].sort((a, b) => new Date(a.date) - new Date(b.date));
    let best = 0;
    for (const w of sorted) {
      const v = parseInt(w.count) || 0;
      if (best > 0 && v > best) return true;
      if (v > best) best = v;
    }
  }
  return false;
}

function maxImprovements(workouts) {
  const byEx = {};
  workouts.forEach(w => {
    if (!byEx[w.exercise]) byEx[w.exercise] = [];
    byEx[w.exercise].push(w);
  });
  let max = 0;
  for (const ex in byEx) {
    const sorted = [...byEx[ex]].sort((a, b) => new Date(a.date) - new Date(b.date));
    let best = 0, count = 0;
    for (const w of sorted) {
      const v = parseInt(w.count) || 0;
      if (best > 0 && v > best) count++;
      if (v > best) best = v;
    }
    if (count > max) max = count;
  }
  return max;
}

function maxRecordsPerExercise(workouts) {
  const buckets = {};
  workouts.forEach(w => { buckets[w.exercise] = (buckets[w.exercise] || 0) + 1; });
  return Math.max(0, ...Object.values(buckets));
}

// === Хелпери для Архіву ===
function maxLogsPerDay(logs) {
  if (!logs || logs.length === 0) return 0;
  const buckets = {};
  logs.forEach(l => {
    const d = new Date(l.timestamp);
    const key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
    buckets[key] = (buckets[key] || 0) + 1;
  });
  return Math.max(0, ...Object.values(buckets));
}

function maxLogsInWindow(logs, windowMs) {
  if (!logs || logs.length < 2) return logs ? logs.length : 0;
  const sorted = [...logs].map(l => l.timestamp).sort((a, b) => a - b);
  let max = 1, left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++;
    if (right - left + 1 > max) max = right - left + 1;
  }
  return max;
}

// ================================================================
//  ЛОГІКА ДОСЯГНЕНЬ
// ================================================================
const CATEGORIES = {
  all: "Усі",
  strength: "Силові",
  speed: "Швидкість",
  endurance: "Витривалість",
  sober: "Тверезість",
  archive: "Архів",
  general: "Загальні",
  progress: "Прогресія",
};

function getSobrietyDays() {
  const start = new Date(2023, 7, 24); // 24.08.2023 з app.js
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

window.computeAchievements = (workouts) => {
  const sd = getSobrietyDays();
  const logs = window.allPrivateLogs || [];
  return MILESTONES.map(m => {
    const isUnlocked = m.condition(workouts || [], sd, logs);
    const progress = m.progress(workouts || [], sd, logs);
    return { ...m, isUnlocked, progress };
  });
};

window.renderAchievementsTab = () => {
  const container = document.getElementById("achievementsContainer");
  if (!container) return;

  const workouts = window.allWorkouts || [];
  const achievements = window.computeAchievements(workouts);
  const unlockedCount = achievements.filter(a => a.isUnlocked).length;
  const totalReward = achievements.filter(a => a.isUnlocked).reduce((s, a) => s + a.reward, 0);
  const maxReward = achievements.reduce((s, a) => s + a.reward, 0);

  const filter = container.dataset.filter || "all";
  const sort = container.dataset.sort || "default";

  let filtered = filter === "all" ? achievements : achievements.filter(a => a.category === filter);

  if (sort === "progress") {
    filtered.sort((a, b) => (b.isUnlocked - a.isUnlocked) || (b.progress - a.progress));
  } else if (sort === "reward") {
    filtered.sort((a, b) => b.reward - a.reward);
  }

  const filterBtns = Object.keys(CATEGORIES).map(k =>
    '<button class="ach-filter-btn ' + (k === filter ? 'active' : '') + '" data-filter="' + k + '">' + CATEGORIES[k] + '</button>'
  ).join("");

  const cards = filtered.map(a => {
    if (a.isUnlocked) {
      return '<div class="ach-card unlocked">' +
        '<div class="ach-icon">' + a.icon + '</div>' +
        '<div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.description + '</div>' +
        '<div class="ach-status">✓ Розблоковано</div>' +
        '<div class="ach-reward">+' + a.reward + ' очок</div>' +
      '</div>';
    } else {
      const pct = Math.round(a.progress * 100);
      return '<div class="ach-card locked">' +
        '<div class="ach-icon ach-locked-icon">🔒</div>' +
        '<div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.description + '</div>' +
        '<div class="ach-progress">' +
          '<div class="ach-progress-bar"><div class="ach-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="ach-progress-text">' + pct + '%</div>' +
        '</div>' +
        '<div class="ach-reward locked-reward">+' + a.reward + ' очок</div>' +
      '</div>';
    }
  }).join("");

  container.innerHTML =
    '<div class="ach-header">' +
      '<div class="ach-stats-row">' +
        '<div class="ach-stat-item"><div class="ach-stat-num">' + unlockedCount + '/' + MILESTONES.length + '</div><div class="ach-stat-lbl">розблоковано</div></div>' +
        '<div class="ach-stat-item"><div class="ach-stat-num">' + totalReward + '</div><div class="ach-stat-lbl">очок з ' + maxReward + '</div></div>' +
      '</div>' +
      '<div class="ach-overall-bar"><div class="ach-overall-fill" style="width:' + (unlockedCount / MILESTONES.length * 100) + '%"></div></div>' +
    '</div>' +
    '<div class="ach-filters">' + filterBtns + '</div>' +
    '<div class="ach-grid">' + cards + '</div>';

  // Filter buttons
  container.querySelectorAll(".ach-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.dataset.filter = btn.dataset.filter;
      window.renderAchievementsTab();
    });
  });
};

// Toast при розблокуванні
window._lastUnlockedIds = JSON.parse(localStorage.getItem("unlockedAch") || "[]");

window.checkNewAchievements = (workouts) => {
  const achievements = window.computeAchievements(workouts);
  const currentlyUnlocked = achievements.filter(a => a.isUnlocked).map(a => a.id);
  const newly = currentlyUnlocked.filter(id => !window._lastUnlockedIds.includes(id));

  newly.forEach(id => {
    const m = MILESTONES.find(x => x.id === id);
    if (m) showAchToast(m);
  });

  if (newly.length > 0) {
    window._lastUnlockedIds = currentlyUnlocked;
    localStorage.setItem("unlockedAch", JSON.stringify(currentlyUnlocked));
  }
};

function showAchToast(m) {
  const t = document.createElement("div");
  t.className = "ach-toast";
  t.innerHTML = '<div class="ach-toast-icon">' + m.icon + '</div>' +
    '<div class="ach-toast-body">' +
      '<div class="ach-toast-title">🎉 Розблоковано!</div>' +
      '<div class="ach-toast-name">' + m.name + '</div>' +
      '<div class="ach-toast-reward">+' + m.reward + ' очок</div>' +
    '</div>';
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("visible"));
  setTimeout(() => {
    t.classList.remove("visible");
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

// ================================================================
//  ЕКСПОРТ
// ================================================================
window.exportRecordsToCSV = (records) => {
  const headers = ["Дата", "Дисципліна", "Результат", "Доп. вага", "Час", "Нотатка"];
  const rows = records.map(r => [
    r.date || "",
    r.exercise || "",
    r.count || "",
    r.addWeight || "",
    r.time || "",
    (r.note || "").replace(/[\r\n]+/g, " "),
  ]);
  const csv = [headers, ...rows].map(row =>
    row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")
  ).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const fname = "records_" + new Date().toISOString().slice(0, 10) + ".csv";
  link.href = URL.createObjectURL(blob);
  link.download = fname;
  link.click();
  URL.revokeObjectURL(link.href);
};

window.exportRecordsToPDF = async (records) => {
  if (typeof window.jspdf === "undefined") {
    alert("Бібліотека jsPDF ще завантажується. Спробуй за секунду.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica");

  // Шапка
  pdf.setFillColor(99, 102, 241);
  pdf.rect(0, 0, 210, 30, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.text("MY RECORDS", 105, 15, { align: "center" });
  pdf.setFontSize(11);
  pdf.text("Records Room - Report " + new Date().toLocaleDateString("uk-UA"), 105, 23, { align: "center" });

  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(13);
  pdf.text("Statistics", 14, 42);

  const exercises = new Set(records.map(r => r.exercise)).size;
  const dates = records.map(r => r.date).filter(Boolean).sort();
  const period = dates.length > 0 ? dates[0] + " — " + dates[dates.length - 1] : "—";

  pdf.setFontSize(10);
  pdf.text("Total records: " + records.length, 14, 50);
  pdf.text("Disciplines: " + exercises, 14, 56);
  pdf.text("Period: " + period, 14, 62);

  // Таблиця
  pdf.setFontSize(13);
  pdf.text("Records List", 14, 76);

  pdf.setFontSize(9);
  pdf.setFillColor(230, 230, 235);
  pdf.rect(14, 80, 182, 7, "F");
  pdf.text("Date", 16, 85);
  pdf.text("Exercise", 45, 85);
  pdf.text("Result", 110, 85);
  pdf.text("Weight", 145, 85);
  pdf.text("Time", 175, 85);

  let y = 92;
  for (const r of records) {
    if (y > 280) { pdf.addPage(); y = 20; }
    pdf.text(String(r.date || "—"), 16, y);
    pdf.text(transliterate(r.exercise || "—").substring(0, 28), 45, y);
    pdf.text(String(r.count || "—"), 110, y);
    pdf.text(String(r.addWeight || "—"), 145, y);
    pdf.text(String(r.time || "—"), 175, y);
    y += 6;
  }

  pdf.save("records_" + new Date().toISOString().slice(0, 10) + ".pdf");
};

// Транслітерація для PDF (jsPDF без UTF-8)
function transliterate(s) {
  if (!s) return "";
  const map = {
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh','з':'z',
    'и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p',
    'р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
    'ь':'','ю':'iu','я':'ia',
    'А':'A','Б':'B','В':'V','Г':'H','Ґ':'G','Д':'D','Е':'E','Є':'Ye','Ж':'Zh','З':'Z',
    'И':'Y','І':'I','Ї':'Yi','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P',
    'Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch',
    'Ь':'','Ю':'Yu','Я':'Ya'
  };
  return s.split("").map(c => map[c] !== undefined ? map[c] : c).join("");
}

// ================================================================
//  МОДАЛЬНЕ ВІКНО ЕКСПОРТУ
// ================================================================
window.showExportModal = () => {
  const old = document.getElementById("exportModal");
  if (old) old.remove();

  const m = document.createElement("div");
  m.id = "exportModal";
  m.className = "modal-overlay";
  m.innerHTML =
    '<div class="card modal-content modal-content-sm">' +
      '<div class="modal-header">' +
        '<div class="section-title">📥 Експорт рекордів</div>' +
        '<button class="btn-del modal-close-btn" id="exportClose">✕</button>' +
      '</div>' +
      '<p class="export-info">Виберіть формат файлу для завантаження. Експортуються всі ваші ' +
        (window.allWorkouts ? window.allWorkouts.length : 0) + ' записів.</p>' +
      '<div class="export-btns">' +
        '<button class="primary-btn export-btn-csv" id="expCsv">📊 CSV</button>' +
        '<button class="primary-btn export-btn-pdf" id="expPdf">📄 PDF</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add("show"));

  function close() { m.classList.remove("show"); setTimeout(() => m.remove(), 300); }

  document.getElementById("exportClose").addEventListener("click", close);
  m.addEventListener("click", e => { if (e.target === m) close(); });

  document.getElementById("expCsv").addEventListener("click", () => {
    window.exportRecordsToCSV(window.allWorkouts || []);
    close();
  });
  document.getElementById("expPdf").addEventListener("click", async () => {
    await window.exportRecordsToPDF(window.allWorkouts || []);
    close();
  });
};
