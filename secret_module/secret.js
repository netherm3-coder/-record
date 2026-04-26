// ================================================================
//  secret_module/secret.js — Архів v2
//  Firebase: private_logs { timestamp, type, note, is_hardcore, userId }
// ================================================================

import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MEDIA_FILES = [
  "assets/redvid_io_violating_that_throatpussy_of_hers.gif",
  "RDT_20260421_2301107487583688953369648.jpg",
  "RDT_20260421_2304236334329579471223536.jpg",
];

var _keyHandler = null;
var _unsub = null;
var _allLogs = [];

export async function openSecretModule() {
  if (getApps().length === 0 || !getAuth(getApp()).currentUser) { _show404(); return; }
  _showContent();
}

// ================================================================
//  CLIPBOARD EXPORT FOR AI
// ================================================================
function copyAiPrompt() {
  var totalCount = _allLogs.length;
  var hardcoreCount = _allLogs.filter(function (l) { return _isHardcore(l); }).length;
  var now = new Date();

  // R_dop (без впливу +)
  var S = _getStreak(now);
  var sevenAgo = now.getTime() - 7 * 86400000;
  var N_7d = 0;
  _allLogs.forEach(function (l) { if (l.timestamp >= sevenAgo && !_isHardcore(l)) N_7d++; });
  var R_dop = Math.log(S + 1) * 5 - (N_7d * 2.5);
  R_dop = Math.round(R_dop * 100) / 100;

  // Останні 10
  var last10 = _allLogs.slice(0, 10).map(function (l) {
    var d = new Date(l.timestamp);
    var ds = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    var tag = _isHardcore(l) ? " [+]" : "";
    return ds + tag;
  }).join("\n");

  var text = "Дій як нейробіолог. Проаналізуй мої дані.\n" +
    "Метрики: Поточний індекс R_dop=" + R_dop + ", Всього записів " + totalCount +
    ", З них з обтяженням (+) " + hardcoreCount + ".\n" +
    "Стрік (днів без зривів): " + S + "\n" +
    "Останні 10 записів:\n" + last10 + "\n\n" +
    "Завдання: Дай коротку критичну, суху оцінку мого стану. Вкажи на слабкість, якщо динаміка негативна. Без дипломатії.";

  // Clipboard API з fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      _showToast("Скопійовано в буфер");
    }).catch(function () { _fallbackCopy(text); });
  } else {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); _showToast("Скопійовано в буфер"); }
  catch (e) { _showToast("Не вдалось скопіювати"); }
  document.body.removeChild(ta);
}

function _showToast(msg) {
  var old = document.querySelector(".sm-toast");
  if (old) old.remove();
  var el = document.createElement("div");
  el.className = "sm-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add("sm-toast-visible"); });
  setTimeout(function () { el.classList.remove("sm-toast-visible"); setTimeout(function () { el.remove(); }, 300); }, 2000);
}

// ================================================================
//  HELPERS
// ================================================================
function _isHardcore(log) {
  // Підтримка нового поля is_hardcore та старого формату через note
  if (log.is_hardcore === true) return true;
  if (log.note && log.note.indexOf("+") !== -1) return true;
  return false;
}

function _getStreak(now) {
  if (_allLogs.length === 0) return 252;
  // Тільки НЕ-hardcore записи впливають на стрік
  var nonHC = _allLogs.filter(function (l) { return !_isHardcore(l); });
  if (nonHC.length === 0) return 252;
  var lastTs = Math.max.apply(null, nonHC.map(function (l) { return l.timestamp; }));
  var s = Math.floor((now.getTime() - lastTs) / 86400000);
  return s < 0 ? 0 : s;
}

function _fmtDate(ts) {
  var d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." +
    d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function _esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ""; }

// ================================================================
//  MAIN CONTENT
// ================================================================
function _showContent() {
  _ensureStyles(); _removeExisting();

  var overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";

  overlay.innerHTML =
    '<div class="sm-shell">' +
      '<div class="sm-header">' +
        '<h2 class="sm-title">Архів</h2>' +
        '<button class="sm-x" id="smX">&times;</button>' +
      '</div>' +
      '<div class="sm-tabs">' +
        '<button class="sm-tab active" data-tab="stats">Статистика</button>' +
        '<button class="sm-tab" data-tab="media">Медіа</button>' +
      '</div>' +
      '<div class="sm-body">' +
        '<div class="sm-panel active" id="smPanelStats"></div>' +
        '<div class="sm-panel" id="smPanelMedia"></div>' +
      '</div>' +
    '</div>';

  // Tabs
  overlay.querySelectorAll(".sm-tab").forEach(function (t) {
    t.addEventListener("click", function () {
      overlay.querySelectorAll(".sm-tab").forEach(function (x) { x.classList.remove("active"); });
      overlay.querySelectorAll(".sm-panel").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      var id = t.dataset.tab;
      overlay.querySelector("#smPanel" + id.charAt(0).toUpperCase() + id.slice(1)).classList.add("active");
    });
  });

  overlay.querySelector("#smX").addEventListener("click", _removeExisting);
  _keyHandler = function (e) { if (e.key === "Escape") _removeExisting(); };
  document.addEventListener("keydown", _keyHandler);

  document.querySelectorAll("body > :not(script):not(style)").forEach(function (el) {
    if (el.id !== "smOverlay") el.style.pointerEvents = "none";
  });

  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  overlay.style.pointerEvents = "auto";
  requestAnimationFrame(function () { overlay.classList.add("sm-visible"); });

  _initMedia(overlay.querySelector("#smPanelMedia"));
  _listenLogs(overlay.querySelector("#smPanelStats"));
}

// ================================================================
//  MEDIA TAB
// ================================================================
function _initMedia(container) {
  var total = MEDIA_FILES.length;
  var current = 0;
  var tx0 = 0, dragging = false, dx = 0;

  container.innerHTML =
    '<div class="sm-track" id="smTrack">' +
      MEDIA_FILES.map(function (u, i) {
        return '<div class="sm-frame ' + (i === 0 ? "active" : "") + '">' +
          '<div class="sm-spinner"></div>' +
          '<img src="' + u + '" alt="" class="sm-img" draggable="false" onload="this.parentNode.classList.add(\'loaded\')" onerror="this.parentNode.classList.add(\'error\')" />' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div class="sm-dots">' +
      MEDIA_FILES.map(function (_, i) {
        return '<span class="sm-dot ' + (i === 0 ? "active" : "") + '" data-i="' + i + '"></span>';
      }).join("") +
    '</div>';

  var track = container.querySelector("#smTrack");
  var frames = container.querySelectorAll(".sm-frame");
  var dots = container.querySelectorAll(".sm-dot");

  function goTo(idx) {
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;
    frames[current].classList.remove("active"); dots[current].classList.remove("active");
    current = idx;
    frames[current].classList.add("active"); dots[current].classList.add("active");
  }

  track.addEventListener("touchstart", function (e) { tx0 = e.touches[0].clientX; dragging = true; dx = 0; }, { passive: true });
  track.addEventListener("touchmove", function (e) { if (dragging) dx = e.touches[0].clientX - tx0; }, { passive: true });
  track.addEventListener("touchend", function () {
    if (!dragging) return; dragging = false;
    if (Math.abs(dx) > 45) { dx < 0 ? goTo(current + 1) : goTo(current - 1); } dx = 0;
  }, { passive: true });
  track.addEventListener("click", function (e) {
    if (Math.abs(dx) > 8) return;
    var r = track.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    if (x < 0.35) goTo(current - 1); else if (x > 0.65) goTo(current + 1);
  });
  dots.forEach(function (d) { d.addEventListener("click", function (e) { e.stopPropagation(); goTo(parseInt(d.dataset.i)); }); });
  track.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

// ================================================================
//  FIREBASE
// ================================================================
function _listenLogs(statsPanel) {
  var app = getApp(); var db = getFirestore(app);
  var uid = getAuth(app).currentUser.uid;
  var q = query(collection(db, "private_logs"), orderBy("timestamp", "desc"), limit(500));
  _unsub = onSnapshot(q, function (snap) {
    _allLogs = snap.docs
      .map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .filter(function (l) { return l.userId === uid; });
    _renderStats(statsPanel);
  }, function () {
    statsPanel.innerHTML = '<div class="sm-err">Помилка доступу. Перевір Firestore rules для private_logs</div>';
  });
}

// ================================================================
//  STATS PANEL
// ================================================================
function _renderStats(container) {
  var now = new Date();

  // --- Counters ---
  var totalCount = _allLogs.length;
  var hardcoreCount = _allLogs.filter(function (l) { return _isHardcore(l); }).length;

  // --- Heatmap ---
  var heatmap = {};
  _allLogs.forEach(function (l) {
    var d = new Date(l.timestamp);
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (!heatmap[key]) heatmap[key] = { count: 0, notes: [] };
    heatmap[key].count++;
    if (l.note) heatmap[key].notes.push(l.note);
  });

  var cells = [];
  for (var i = 251; i >= 0; i--) {
    var dt = new Date(now); dt.setDate(dt.getDate() - i);
    var key = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    var info = heatmap[key] || { count: 0, notes: [] };
    var lvl = info.count === 0 ? 0 : info.count === 1 ? 1 : info.count === 2 ? 2 : info.count === 3 ? 3 : 4;
    cells.push({ key: key, count: info.count, notes: info.notes, lvl: lvl, dow: dt.getDay() });
  }

  // --- S (clean streak, hardcore NOT counted as reset) ---
  var S = _getStreak(now);

  // --- D_total / D_clean ---
  var D_total, D_clean;
  if (_allLogs.length > 0) {
    var firstTs = Math.min.apply(null, _allLogs.map(function (l) { return l.timestamp; }));
    D_total = Math.ceil((now.getTime() - firstTs) / 86400000) + 1;
    if (D_total > 252) D_total = 252;
    D_clean = D_total - Object.keys(heatmap).length;
  } else { D_total = 1; D_clean = 0; }
  if (D_clean < 0) D_clean = 0;
  var D_ratio = D_total > 0 ? D_clean / D_total : 0;

  // --- R_7d (ТІЛЬКИ не-hardcore записи впливають на формулу) ---
  var sevenDaysAgo = now.getTime() - 7 * 86400000;
  var R_7d = 0;
  _allLogs.forEach(function (l) {
    if (l.timestamp >= sevenDaysAgo && !_isHardcore(l)) R_7d++;
  });

  // --- S_avg ---
  var nonHC = _allLogs.filter(function (l) { return !_isHardcore(l); });
  var sortedAsc = nonHC.slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
  var gaps = [];
  for (var g = 1; g < sortedAsc.length; g++) {
    var gap = Math.floor((sortedAsc[g].timestamp - sortedAsc[g - 1].timestamp) / 86400000);
    if (gap > 0) gaps.push(gap);
  }
  var S_avg = gaps.length > 0 ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : S;

  // --- K_ns (+ НЕ впливає) ---
  var K_ns = Math.pow(D_ratio, 2) * Math.sqrt(S) * 10 - (R_7d * 15);
  K_ns = Math.round(K_ns * 100) / 100;

  // --- R_dop (+ НЕ впливає) ---
  var R_dop = (Math.log(S + 1) * (D_ratio / 1.5)) - (R_7d / (S_avg + 1) * 10);
  R_dop = Math.round(R_dop * 100) / 100;

  var kColor = K_ns < 0 ? "#ef4444" : K_ns > 50 ? "#38bdf8" : "#10b981";
  var rColor = R_dop < 0 ? "#ef4444" : R_dop > 5 ? "#38bdf8" : "#10b981";

  // --- Heatmap HTML ---
  var colors = ["rgba(255,255,255,.04)", "#0e4429", "#006d32", "#26a641", "#39d353"];
  var grid = "";
  cells.forEach(function (c) {
    var notesStr = c.notes.length > 0 ? "\n" + c.notes.join("; ") : "";
    var tip = c.key + (c.count > 0 ? " (" + c.count + ")" : "") + notesStr;
    grid += '<div class="sm-hm-cell" style="background:' + colors[c.lvl] + ';grid-row:' + (c.dow + 1) + '" title="' + _esc(tip) + '"></div>';
  });

  container.innerHTML =
    // Counters
    '<div class="sm-counters">' +
      '<div class="sm-counter-box"><span class="sm-counter-num">' + totalCount + '</span><span class="sm-counter-lbl">всього</span></div>' +
      '<div class="sm-counter-box"><span class="sm-counter-num sm-counter-hc">' + hardcoreCount + '</span><span class="sm-counter-lbl">з (+)</span></div>' +
      '<div class="sm-counter-box"><span class="sm-counter-num sm-counter-streak">' + S + '</span><span class="sm-counter-lbl">стрік (д)</span></div>' +
    '</div>' +

    // Heatmap
    '<div class="sm-section">' +
      '<div class="sm-section-title">Активність (36 тижнів)</div>' +
      '<div class="sm-heatmap">' + grid + '</div>' +
      '<div class="sm-hm-legend">' +
        '<span>менше</span>' +
        colors.map(function (c) { return '<div class="sm-hm-cell" style="background:' + c + '"></div>'; }).join("") +
        '<span>більше</span>' +
      '</div>' +
    '</div>' +

    // Coefficients
    '<div class="sm-coefs">' +
      '<div class="sm-coef-card">' +
        '<div class="sm-coef-top"><span class="sm-coef-label">K<sub>ns</sub></span></div>' +
        '<div class="sm-coef-sub">Нейронна стабільність</div>' +
        '<div class="sm-coef-val" style="color:' + kColor + '">' + K_ns.toFixed(2) + '</div>' +
        '<div class="sm-coef-meta">S=' + S + ' · D=' + D_clean + '/' + D_total + ' · R₇=' + R_7d + '</div>' +
      '</div>' +
      '<div class="sm-coef-card">' +
        '<div class="sm-coef-top"><span class="sm-coef-label">R<sub>dop</sub></span>' +
          '<button class="sm-info-btn" id="smInfoBtn" aria-label="Формула">i</button>' +
        '</div>' +
        '<div class="sm-coef-sub">Дофамінова резистентність</div>' +
        '<div class="sm-coef-val" style="color:' + rColor + '">' + R_dop.toFixed(2) + '</div>' +
        '<div class="sm-coef-meta">ln(' + (S + 1) + ')=' + Math.log(S + 1).toFixed(2) + ' · S<sub>avg</sub>=' + S_avg.toFixed(1) + '</div>' +
      '</div>' +
    '</div>' +

    // Tooltip (hidden by default)
    '<div class="sm-tooltip" id="smTooltip">' +
      'R<sub>dop</sub> = ln(Δt + 1) · 5 − (N<sub>7d</sub> · 2.5)<br>' +
      'Δt — час без зривів (дні)<br>N<sub>7d</sub> — зриви за тиждень<br>' +
      '<b>(+) на розрахунок не впливає</b>' +
    '</div>' +

    // Buttons
    '<div class="sm-add-section">' +
      '<button class="sm-add-btn" id="smAddNow">Зараз</button>' +
      '<button class="sm-add-btn sm-add-manual" id="smAddManual">Вручну</button>' +
    '</div>' +
    '<div class="sm-add-section">' +
      '<button class="sm-add-btn sm-add-ai" id="smAiBtn">Аналізувати дані</button>' +
    '</div>' +

    // Quick form
    '<div class="sm-form sm-hidden-form" id="smQuickForm">' +
      '<div class="sm-form-row">' +
        '<label class="sm-plus"><input type="checkbox" id="smQuickPlus" /><span>+</span></label>' +
        '<input type="text" id="smQuickNote" class="sm-input" placeholder="нотатка" />' +
      '</div>' +
      '<button class="sm-add-btn sm-save" id="smQuickSave">Записати</button>' +
    '</div>' +

    // Manual form
    '<div class="sm-form sm-hidden-form" id="smManualForm">' +
      '<input type="datetime-local" id="smManualDate" class="sm-input" />' +
      '<div class="sm-form-row">' +
        '<label class="sm-plus"><input type="checkbox" id="smManualPlus" /><span>+</span></label>' +
        '<input type="text" id="smManualNote" class="sm-input" placeholder="нотатка" />' +
      '</div>' +
      '<button class="sm-add-btn sm-save" id="smManualSave">Зберегти</button>' +
    '</div>' +

    // Logs
    '<div class="sm-section sm-logs-section">' +
      '<div class="sm-section-title">Останні записи</div>' +
      '<div id="smLogList" class="sm-log-list"></div>' +
    '</div>';

  // --- Events ---
  var db = getFirestore(getApp());
  var uid = getAuth(getApp()).currentUser.uid;

  // Tooltip toggle
  var tipBtn = container.querySelector("#smInfoBtn");
  var tipEl = container.querySelector("#smTooltip");
  if (tipBtn && tipEl) {
    tipBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      tipEl.classList.toggle("sm-tooltip-visible");
    });
    container.addEventListener("click", function () { tipEl.classList.remove("sm-tooltip-visible"); });
  }

  // AI button
  container.querySelector("#smAiBtn").addEventListener("click", copyAiPrompt);

  // "Зараз"
  container.querySelector("#smAddNow").addEventListener("click", function () {
    var q = container.querySelector("#smQuickForm");
    var m = container.querySelector("#smManualForm");
    m.classList.add("sm-hidden-form");
    q.classList.toggle("sm-hidden-form");
  });

  container.querySelector("#smQuickSave").addEventListener("click", async function () {
    var btn = container.querySelector("#smQuickSave");
    if (btn.disabled) return; btn.disabled = true;
    var d = new Date();
    d.setMinutes(d.getMinutes() - (d.getMinutes() % 10), 0, 0);
    var plus = container.querySelector("#smQuickPlus").checked;
    var note = container.querySelector("#smQuickNote").value.trim();
    try {
      await addDoc(collection(db, "private_logs"), {
        timestamp: d.getTime(), type: "reset", note: note, is_hardcore: plus, userId: uid
      });
      container.querySelector("#smQuickForm").classList.add("sm-hidden-form");
      container.querySelector("#smQuickNote").value = "";
      container.querySelector("#smQuickPlus").checked = false;
    } catch (e) { alert("Помилка: " + e.message); } finally { btn.disabled = false; }
  });

  // "Вручну"
  container.querySelector("#smAddManual").addEventListener("click", function () {
    var q = container.querySelector("#smQuickForm");
    var m = container.querySelector("#smManualForm");
    q.classList.add("sm-hidden-form");
    m.classList.toggle("sm-hidden-form");
    if (!m.classList.contains("sm-hidden-form")) {
      var n = new Date();
      container.querySelector("#smManualDate").value =
        n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" +
        String(n.getDate()).padStart(2, "0") + "T" + String(n.getHours()).padStart(2, "0") + ":" +
        String(n.getMinutes()).padStart(2, "0");
    }
  });

  container.querySelector("#smManualSave").addEventListener("click", async function () {
    var btn = container.querySelector("#smManualSave");
    if (btn.disabled) return;
    var val = container.querySelector("#smManualDate").value;
    if (!val) { alert("Вкажи дату та час"); return; }
    btn.disabled = true;
    var plus = container.querySelector("#smManualPlus").checked;
    var note = container.querySelector("#smManualNote").value.trim();
    try {
      await addDoc(collection(db, "private_logs"), {
        timestamp: new Date(val).getTime(), type: "reset", note: note, is_hardcore: plus, userId: uid
      });
      container.querySelector("#smManualForm").classList.add("sm-hidden-form");
      container.querySelector("#smManualNote").value = "";
      container.querySelector("#smManualPlus").checked = false;
    } catch (e) { alert("Помилка: " + e.message); } finally { btn.disabled = false; }
  });

  // --- Logs ---
  _renderLogs(container.querySelector("#smLogList"), db);
}

// ================================================================
//  RENDER LOGS
// ================================================================
function _renderLogs(listEl, db) {
  var recent = _allLogs.slice(0, 20);
  if (recent.length === 0) {
    listEl.innerHTML = '<div class="sm-empty">Записів немає</div>';
    return;
  }

  listEl.innerHTML = recent.map(function (l) {
    var hc = _isHardcore(l);
    var badge = hc ? '<span class="sm-badge-plus">+</span>' : '';
    var noteText = l.note ? l.note.replace(/^\+\s*/, "") : "";
    var noteStr = noteText ? '<span class="sm-log-note">' + _esc(noteText) + '</span>' : '';

    return '<div class="sm-log-item">' +
      '<div class="sm-log-left">' +
        badge +
        '<span class="sm-log-date">' + _fmtDate(l.timestamp) + '</span>' +
        noteStr +
      '</div>' +
      '<button class="sm-log-del" data-id="' + l.id + '" aria-label="Видалити">&times;</button>' +
    '</div>';
  }).join("");

  listEl.querySelectorAll(".sm-log-del").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!confirm("Видалити?")) return;
      try { await deleteDoc(doc(db, "private_logs", btn.dataset.id)); } catch (e) { console.error(e); }
    });
  });
}

// ================================================================
function _show404() {
  _ensureStyles(); _removeExisting();
  var o = document.createElement("div");
  o.id = "smOverlay"; o.className = "sm-overlay";
  o.innerHTML = '<div class="sm-404"><p class="sm-404-code">404</p><p class="sm-404-msg">Not Found</p></div>';
  o.addEventListener("click", _removeExisting);
  document.body.appendChild(o);
  requestAnimationFrame(function () { o.classList.add("sm-visible"); });
  setTimeout(_removeExisting, 2500);
}

function _removeExisting() {
  var el = document.getElementById("smOverlay");
  if (!el) return;
  document.body.style.overflow = "";
  document.querySelectorAll("body > *").forEach(function (e) { if (e.id !== "smOverlay") e.style.pointerEvents = ""; });
  if (_keyHandler) { document.removeEventListener("keydown", _keyHandler); _keyHandler = null; }
  if (_unsub) { _unsub(); _unsub = null; }
  el.classList.remove("sm-visible");
  el.addEventListener("transitionend", function () { el.remove(); }, { once: true });
  setTimeout(function () { var x = document.getElementById("smOverlay"); if (x) x.remove(); }, 500);
}

// ================================================================
//  STYLES
// ================================================================
function _ensureStyles() {
  if (document.getElementById("sm-styles")) return;
  var s = document.createElement("style");
  s.id = "sm-styles";
  s.textContent =
    '.sm-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0);backdrop-filter:blur(0);transition:background .25s,backdrop-filter .25s;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:inherit}' +
    '.sm-overlay.sm-visible{background:rgba(13,17,23,.97);backdrop-filter:blur(12px)}' +
    '.sm-shell{max-width:480px;margin:0 auto;padding:16px;padding-top:calc(16px + env(safe-area-inset-top));padding-bottom:calc(24px + env(safe-area-inset-bottom));min-height:100%;box-sizing:border-box}' +
    '.sm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}' +
    '.sm-title{color:#e6edf3;font-size:1.3rem;font-weight:800;margin:0}' +
    '.sm-x{background:none;border:none;color:rgba(255,255,255,.4);font-size:1.8rem;cursor:pointer;padding:2px 10px;line-height:1;border-radius:8px;-webkit-tap-highlight-color:transparent}' +
    '.sm-x:active{color:#fff;background:rgba(255,255,255,.08)}' +
    '.sm-tabs{display:flex;gap:4px;margin-bottom:14px;background:rgba(255,255,255,.04);border-radius:10px;padding:3px}' +
    '.sm-tab{flex:1;padding:9px 0;border:none;background:none;color:rgba(255,255,255,.4);font-size:.85rem;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all .2s}' +
    '.sm-tab.active{background:rgba(255,255,255,.1);color:#e6edf3}' +
    '.sm-panel{display:none}.sm-panel.active{display:block}' +
    '.sm-section{margin-bottom:14px}' +
    '.sm-section-title{font-size:.7rem;font-weight:800;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}' +
    '.sm-logs-section{margin-top:14px}' +

    /* counters */
    '.sm-counters{display:flex;gap:8px;margin-bottom:14px}' +
    '.sm-counter-box{flex:1;text-align:center;padding:10px 4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:10px}' +
    '.sm-counter-num{display:block;font-size:1.4rem;font-weight:900;color:#e6edf3;line-height:1}' +
    '.sm-counter-hc{color:#f59e0b}' +
    '.sm-counter-streak{color:#10b981}' +
    '.sm-counter-lbl{display:block;font-size:.6rem;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}' +

    /* heatmap */
    '.sm-heatmap{display:grid;grid-template-rows:repeat(7,1fr);grid-auto-flow:column;grid-auto-columns:1fr;gap:2px}' +
    '.sm-hm-cell{aspect-ratio:1;border-radius:2px;min-width:0}' +
    '.sm-hm-legend{display:flex;align-items:center;justify-content:flex-end;gap:3px;font-size:.6rem;color:rgba(255,255,255,.25);margin-top:6px}' +
    '.sm-hm-legend .sm-hm-cell{width:9px;height:9px;flex-shrink:0;aspect-ratio:auto}' +

    /* coefs */
    '.sm-coefs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}' +
    '.sm-coef-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px 10px;text-align:center;min-width:0}' +
    '.sm-coef-top{display:flex;align-items:center;justify-content:center;gap:6px}' +
    '.sm-coef-label{font-size:1.1rem;font-weight:800;color:rgba(255,255,255,.7);line-height:1}' +
    '.sm-coef-sub{font-size:.55rem;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;margin-bottom:10px;line-height:1.3}' +
    '.sm-coef-val{font-size:1.9rem;font-weight:900;line-height:1;margin-bottom:6px}' +
    '.sm-coef-meta{font-size:.55rem;color:rgba(255,255,255,.25);line-height:1.4;overflow:hidden;text-overflow:ellipsis}' +

    /* info button */
    '.sm-info-btn{width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:none;color:rgba(255,255,255,.4);font-size:.65rem;font-weight:800;font-style:italic;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;font-family:Georgia,serif;line-height:1;padding:0}' +
    '.sm-info-btn:active{color:#fff;border-color:rgba(255,255,255,.5)}' +

    /* tooltip */
    '.sm-tooltip{display:none;padding:10px 12px;background:rgba(30,41,59,.95);border:1px solid rgba(99,102,241,.3);border-radius:10px;font-size:.75rem;color:rgba(255,255,255,.6);line-height:1.5;margin-bottom:14px}' +
    '.sm-tooltip-visible{display:block}' +

    /* buttons */
    '.sm-add-section{display:flex;gap:8px;margin-bottom:8px}' +
    '.sm-add-btn{flex:1;padding:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.6);font-size:.85rem;font-weight:700;border-radius:10px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all .15s}' +
    '.sm-add-btn:active:not(:disabled){background:rgba(255,255,255,.1);color:#fff}' +
    '.sm-add-btn:disabled{opacity:.5;cursor:not-allowed}' +
    '.sm-add-manual{border-style:dashed}' +
    '.sm-add-ai{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.25);color:rgba(99,102,241,.8)}' +
    '.sm-add-ai:active{background:rgba(99,102,241,.2);color:#818cf8}' +
    '.sm-save{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3);color:#10b981;margin-top:6px}' +
    '.sm-save:active{background:rgba(16,185,129,.25)}' +

    /* forms */
    '.sm-form{flex-direction:column;gap:8px;margin-bottom:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px}' +
    '.sm-hidden-form{display:none!important}' +
    '.sm-form:not(.sm-hidden-form){display:flex}' +
    '.sm-form-row{display:flex;gap:8px;align-items:center}' +
    '.sm-input{padding:9px 10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);color:#e6edf3;border-radius:8px;font-size:.85rem;font-family:inherit;outline:none;box-sizing:border-box;width:100%;flex:1}' +
    '.sm-input:focus{border-color:rgba(99,102,241,.5)}' +
    '.sm-plus{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.4);font-size:.9rem;cursor:pointer;white-space:nowrap;padding:8px 10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(0,0,0,.2)}' +
    '.sm-plus input{margin:0;cursor:pointer}' +
    '.sm-plus span{font-weight:900;color:rgba(255,255,255,.5)}' +
    '.sm-plus input:checked+span{color:#f59e0b}' +

    /* log list */
    '.sm-log-list{max-height:260px;overflow-y:auto}' +
    '.sm-log-item{display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);gap:8px}' +
    '.sm-log-left{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden}' +
    '.sm-log-date{color:rgba(255,255,255,.45);font-size:.8rem;font-weight:600;white-space:nowrap}' +
    '.sm-log-note{color:rgba(255,255,255,.25);font-style:italic;font-size:.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sm-badge-plus{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:4px;background:rgba(245,158,11,.15);color:#f59e0b;font-size:.7rem;font-weight:900;text-shadow:0 0 6px rgba(245,158,11,.4);flex-shrink:0}' +
    '.sm-log-del{background:none;border:none;color:rgba(255,255,255,.15);font-size:1.4rem;cursor:pointer;min-width:28px;min-height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-tap-highlight-color:transparent;line-height:1;border-radius:6px}' +
    '.sm-log-del:active{color:#ef4444;background:rgba(239,68,68,.1)}' +
    '.sm-empty{text-align:center;color:rgba(255,255,255,.2);padding:14px;font-size:.85rem}' +
    '.sm-err{text-align:center;color:#ef4444;padding:20px;font-size:.9rem}' +

    /* toast */
    '.sm-toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(16,185,129,.9);color:#fff;padding:8px 20px;border-radius:8px;font-size:.85rem;font-weight:700;z-index:10001;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}' +
    '.sm-toast-visible{opacity:1;transform:translateX(-50%) translateY(0)}' +

    /* media */
    '.sm-track{position:relative;width:100%;aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.03);-webkit-tap-highlight-color:transparent;margin-bottom:10px;cursor:pointer}' +
    '.sm-frame{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;pointer-events:none}' +
    '.sm-frame.active{opacity:1;pointer-events:auto}' +
    '.sm-img{max-width:100%;max-height:100%;object-fit:contain;-webkit-user-drag:none;user-select:none;-webkit-user-select:none;opacity:0;transition:opacity .3s}' +
    '.sm-frame.loaded .sm-img{opacity:1}' +
    '.sm-frame.error .sm-img{display:none}' +
    '.sm-frame.error::after{content:"Помилка";color:rgba(255,255,255,.2);font-size:.85rem}' +
    '.sm-spinner{position:absolute;width:24px;height:24px;border:2px solid rgba(255,255,255,.08);border-top-color:rgba(255,255,255,.4);border-radius:50%;animation:smSpin .7s linear infinite}' +
    '.sm-frame.loaded .sm-spinner,.sm-frame.error .sm-spinner{display:none}' +
    '@keyframes smSpin{to{transform:rotate(360deg)}}' +
    '.sm-dots{display:flex;gap:8px;justify-content:center}' +
    '.sm-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.15);cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent}' +
    '.sm-dot.active{background:#fff;width:18px;border-radius:3px}' +

    /* 404 */
    '.sm-404{text-align:center;padding-top:35vh}' +
    '.sm-404-code{font-size:5rem;font-weight:800;color:rgba(255,255,255,.15);margin:0;line-height:1}' +
    '.sm-404-msg{color:rgba(255,255,255,.15);font-size:1rem;margin:8px 0 0}';
  document.head.appendChild(s);
}
