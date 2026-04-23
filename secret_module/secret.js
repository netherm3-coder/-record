// ================================================================
//  secret_module/secret.js — Архів (Статистика + Медіа)
//  Firebase: колекція private_logs
// ================================================================

import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MEDIA_FILES = [
  "assets/redvid_io_violating_that_throatpussy_of_hers.gif",
  "assets/RDT_20260421_2301107487583688953369648.jpg",
  "assets/RDT_20260421_2304236334329579471223536.jpg",
];

var _keyHandler = null;
var _unsub = null;
var _allLogs = [];

// ---------------------------------------------------------------
export async function openSecretModule() {
  if (getApps().length === 0 || !getAuth(getApp()).currentUser) {
    _show404(); return;
  }
  _showContent();
}

// ================================================================
//  MAIN CONTENT
// ================================================================
function _showContent() {
  _ensureStyles();
  _removeExisting();

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
      '<div class="sm-body" id="smBody">' +
        '<div class="sm-panel active" id="smPanelStats"></div>' +
        '<div class="sm-panel" id="smPanelMedia"></div>' +
      '</div>' +
    '</div>';

  // Tabs
  var tabs = overlay.querySelectorAll(".sm-tab");
  var panels = overlay.querySelectorAll(".sm-panel");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.remove("active"); });
      panels.forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      overlay.querySelector("#smPanel" + cap(t.dataset.tab)).classList.add("active");
    });
  });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Close
  overlay.querySelector("#smX").addEventListener("click", _removeExisting);
  _keyHandler = function (e) { if (e.key === "Escape") _removeExisting(); };
  document.addEventListener("keydown", _keyHandler);

  // Mount
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add("sm-visible"); });

  // Init content
  _initMedia(overlay.querySelector("#smPanelMedia"));
  _listenLogs(overlay.querySelector("#smPanelStats"));
}

// ================================================================
//  MEDIA TAB (slider)
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
    frames[current].classList.remove("active");
    dots[current].classList.remove("active");
    current = idx;
    frames[current].classList.add("active");
    dots[current].classList.add("active");
  }

  track.addEventListener("touchstart", function (e) { tx0 = e.touches[0].clientX; dragging = true; dx = 0; }, { passive: true });
  track.addEventListener("touchmove", function (e) { if (dragging) dx = e.touches[0].clientX - tx0; }, { passive: true });
  track.addEventListener("touchend", function () {
    if (!dragging) return; dragging = false;
    if (Math.abs(dx) > 45) { dx < 0 ? goTo(current + 1) : goTo(current - 1); }
    dx = 0;
  }, { passive: true });

  track.addEventListener("click", function (e) {
    if (Math.abs(dx) > 8) return;
    var r = track.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    if (x < 0.35) goTo(current - 1);
    else if (x > 0.65) goTo(current + 1);
  });

  dots.forEach(function (d) {
    d.addEventListener("click", function (e) { e.stopPropagation(); goTo(parseInt(d.dataset.i)); });
  });

  track.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

// ================================================================
//  FIREBASE LISTENER
// ================================================================
function _listenLogs(statsPanel) {
  var app = getApp();
  var db = getFirestore(app);
  var uid = getAuth(app).currentUser.uid;
  var q = query(collection(db, "private_logs"), orderBy("timestamp", "desc"), limit(500));

  _unsub = onSnapshot(q, function (snap) {
    _allLogs = snap.docs
      .map(function (d) { return { id: d.id, ...d.data() }; })
      .filter(function (l) { return l.userId === uid; });
    _renderStats(statsPanel);
  });
}

// ================================================================
//  STATISTICS TAB
// ================================================================
function _renderStats(container) {
  var logs = _allLogs;
  var now = new Date();

  // --- Heatmap data (252 days = 36 weeks) ---
  var heatmap = {};
  logs.forEach(function (l) {
    var d = new Date(l.timestamp).toISOString().slice(0, 10);
    heatmap[d] = (heatmap[d] || 0) + 1;
  });

  var cells = [];
  for (var i = 251; i >= 0; i--) {
    var dt = new Date(now); dt.setDate(dt.getDate() - i);
    var key = dt.toISOString().slice(0, 10);
    var count = heatmap[key] || 0;
    var lvl = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
    var dow = dt.getDay();
    cells.push({ key: key, count: count, lvl: lvl, dow: dow });
  }

  // --- Streak calc ---
  var streak = 0;
  var d2 = new Date(now);
  while (true) {
    var k = d2.toISOString().slice(0, 10);
    if (!heatmap[k]) break;
    streak++;
    d2.setDate(d2.getDate() - 1);
  }
  // If nothing today, check yesterday-based streak
  if (streak === 0) {
    var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    d2 = yesterday;
    while (true) {
      var k2 = d2.toISOString().slice(0, 10);
      if (!heatmap[k2]) break;
      streak++;
      d2.setDate(d2.getDate() - 1);
    }
  }

  // --- All streaks for S_avg ---
  var allStreaks = [];
  var tempStreak = 0;
  for (var j = 251; j >= 0; j--) {
    var dt2 = new Date(now); dt2.setDate(dt2.getDate() - j);
    var k3 = dt2.toISOString().slice(0, 10);
    if (heatmap[k3]) {
      if (tempStreak > 0) allStreaks.push(tempStreak);
      tempStreak = 0;
    } else {
      tempStreak++;
    }
  }
  if (tempStreak > 0) allStreaks.push(tempStreak);
  // S_avg = average clean streak (inverted: streaks of NO resets)
  // Actually we need clean streaks (days without logs)
  var S_avg = allStreaks.length > 0 ? allStreaks.reduce(function (a, b) { return a + b; }, 0) / allStreaks.length : 0;

  // --- D_clean / D_total ---
  var D_total = Math.min(252, logs.length > 0 ? Math.ceil((now - new Date(logs[logs.length - 1].timestamp)) / 86400000) + 1 : 1);
  var D_clean = D_total - Object.keys(heatmap).length;
  if (D_clean < 0) D_clean = 0;
  var D_ratio = D_total > 0 ? D_clean / D_total : 0;

  // --- R_7d (last 7 days, with + bonus) ---
  var R_7d = 0;
  var sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  logs.forEach(function (l) {
    if (new Date(l.timestamp) >= sevenDaysAgo) {
      R_7d += (l.note && l.note.includes("+")) ? 0.5 : 1;
    }
  });

  // --- Current clean streak (S) = days since last log ---
  var S = 0;
  if (logs.length > 0) {
    var lastLog = new Date(logs[0].timestamp);
    S = Math.floor((now - lastLog) / 86400000);
  } else {
    S = D_total;
  }
  // --- K_ns = (D_clean/D_total)^2 * sqrt(S) * 10 - (R_7d * 15) ---
  var K_ns = Math.pow(D_ratio, 2) * Math.sqrt(S) * 10 - (R_7d * 15);
  K_ns = Math.round(K_ns * 100) / 100;

  // --- R_dop = (ln(S+1) * D_ratio/1.5) - (N_7d/(S_avg+1) * 10) ---
  var R_dop = (Math.log(S + 1) * (D_ratio / 1.5)) - (R_7d / (S_avg + 1) * 10);
  R_dop = Math.round(R_dop * 100) / 100;

  // --- Colors ---
  var kColor = K_ns < 0 ? "#ef4444" : K_ns > 50 ? "#38bdf8" : "#10b981";
  var rColor = R_dop < 0 ? "#ef4444" : R_dop > 5 ? "#38bdf8" : "#10b981";

  // --- Heatmap HTML ---
  // Group cells by columns (weeks)
  var grid = '';
  for (var ci = 0; ci < cells.length; ci++) {
    var c = cells[ci];
    var colors = ["rgba(255,255,255,.04)", "#0e4429", "#006d32", "#26a641", "#39d353"];
    var bg = colors[c.lvl];
    var tip = c.key + (c.count > 0 ? " (" + c.count + ")" : "");
    grid += '<div class="sm-hm-cell" style="background:' + bg + ';grid-row:' + (c.dow + 1) + '" title="' + tip + '"></div>';
  }

  container.innerHTML =
    // Heatmap
    '<div class="sm-section">' +
      '<div class="sm-section-title">Активність (36 тижнів)</div>' +
      '<div class="sm-heatmap">' + grid + '</div>' +
      '<div class="sm-hm-legend">' +
        '<span style="opacity:.5">Менше</span>' +
        '<div class="sm-hm-cell" style="background:rgba(255,255,255,.04)"></div>' +
        '<div class="sm-hm-cell" style="background:#0e4429"></div>' +
        '<div class="sm-hm-cell" style="background:#006d32"></div>' +
        '<div class="sm-hm-cell" style="background:#26a641"></div>' +
        '<div class="sm-hm-cell" style="background:#39d353"></div>' +
        '<span style="opacity:.5">Більше</span>' +
      '</div>' +
    '</div>' +

    // Coefficients
    '<div class="sm-coefs">' +
      '<div class="sm-coef-card">' +
        '<div class="sm-coef-label">K<sub>ns</sub> Нейронна Стабільність</div>' +
        '<div class="sm-coef-val" style="color:' + kColor + '">' + K_ns.toFixed(2) + '</div>' +
        '<div class="sm-coef-meta">Стрік: ' + S + 'д · Чистих: ' + D_clean + '/' + D_total + ' · R7d: ' + R_7d + '</div>' +
      '</div>' +
      '<div class="sm-coef-card">' +
        '<div class="sm-coef-label">R<sub>dop</sub> Дофамінова Резистентність</div>' +
        '<div class="sm-coef-val" style="color:' + rColor + '">' + R_dop.toFixed(2) + '</div>' +
        '<div class="sm-coef-meta">ln(' + (S + 1) + ')=' + Math.log(S + 1).toFixed(2) + ' · S<sub>avg</sub>=' + S_avg.toFixed(1) + '</div>' +
      '</div>' +
    '</div>' +

    // Add record
    '<div class="sm-add-section">' +
      '<button class="sm-add-btn" id="smAddNow">Зараз</button>' +
      '<button class="sm-add-btn sm-add-manual" id="smAddManual">Вручну</button>' +
    '</div>' +
    '<div class="sm-manual-form" id="smManualForm" style="display:none">' +
      '<input type="datetime-local" id="smManualDate" class="sm-input" />' +
      '<div class="sm-manual-row">' +
        '<label class="sm-plus-label"><input type="checkbox" id="smManualPlus" /> маркер +</label>' +
        '<input type="text" id="smManualNote" class="sm-input sm-input-note" placeholder="нотатка" />' +
      '</div>' +
      '<button class="sm-add-btn sm-add-save" id="smManualSave">Зберегти</button>' +
    '</div>' +

    // Quick + toggle for "Зараз"
    '<div class="sm-quick-opts" id="smQuickOpts" style="display:none">' +
      '<label class="sm-plus-label"><input type="checkbox" id="smQuickPlus" /> маркер +</label>' +
      '<input type="text" id="smQuickNote" class="sm-input sm-input-note" placeholder="нотатка" />' +
      '<button class="sm-add-btn sm-add-save" id="smQuickSave">Записати</button>' +
    '</div>' +

    // History
    '<div class="sm-section" style="margin-top:16px">' +
      '<div class="sm-section-title">Останні записи</div>' +
      '<div id="smLogList" class="sm-log-list"></div>' +
    '</div>';

  // --- Event handlers ---
  var db = getFirestore(getApp());
  var uid = getAuth(getApp()).currentUser.uid;

  // "Зараз" button
  container.querySelector("#smAddNow").addEventListener("click", function () {
    var opts = container.querySelector("#smQuickOpts");
    var manual = container.querySelector("#smManualForm");
    manual.style.display = "none";
    opts.style.display = opts.style.display === "none" ? "flex" : "none";
  });

  container.querySelector("#smQuickSave").addEventListener("click", async function () {
    var now2 = new Date();
    var min = now2.getMinutes();
    now2.setMinutes(min - (min % 10), 0, 0); // Округлення до десятка вниз
    var plus = container.querySelector("#smQuickPlus").checked;
    var note = container.querySelector("#smQuickNote").value.trim();
    if (plus && !note) note = "+";
    else if (plus) note = "+ " + note;
    try {
      await addDoc(collection(db, "private_logs"), {
        timestamp: now2.getTime(), type: "reset", note: note, userId: uid
      });
      container.querySelector("#smQuickOpts").style.display = "none";
      container.querySelector("#smQuickNote").value = "";
      container.querySelector("#smQuickPlus").checked = false;
    } catch (e) { console.error(e); }
  });

  // "Вручну" button
  container.querySelector("#smAddManual").addEventListener("click", function () {
    var form = container.querySelector("#smManualForm");
    var opts = container.querySelector("#smQuickOpts");
    opts.style.display = "none";
    form.style.display = form.style.display === "none" ? "flex" : "none";
    if (form.style.display === "flex") {
      var inp = container.querySelector("#smManualDate");
      var n = new Date();
      inp.value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" +
        String(n.getDate()).padStart(2, "0") + "T" + String(n.getHours()).padStart(2, "0") + ":" +
        String(n.getMinutes()).padStart(2, "0");
    }
  });

  container.querySelector("#smManualSave").addEventListener("click", async function () {
    var val = container.querySelector("#smManualDate").value;
    if (!val) return;
    var ts = new Date(val).getTime();
    var plus = container.querySelector("#smManualPlus").checked;
    var note = container.querySelector("#smManualNote").value.trim();
    if (plus && !note) note = "+";
    else if (plus) note = "+ " + note;
    try {
      await addDoc(collection(db, "private_logs"), {
        timestamp: ts, type: "reset", note: note, userId: uid
      });
      container.querySelector("#smManualForm").style.display = "none";
      container.querySelector("#smManualNote").value = "";
      container.querySelector("#smManualPlus").checked = false;
    } catch (e) { console.error(e); }
  });

  // --- Render log list ---
  var listEl = container.querySelector("#smLogList");
  var recent = _allLogs.slice(0, 20);
  if (recent.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.2);padding:12px">Записів немає</div>';
  } else {
    listEl.innerHTML = recent.map(function (l) {
      var d = new Date(l.timestamp);
      var dateStr = String(d.getDate()).padStart(2, "0") + "." +
        String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + " " +
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      var noteStr = l.note ? ' <span class="sm-log-note">' + _esc(l.note) + '</span>' : '';
      return '<div class="sm-log-item">' +
        '<span class="sm-log-date">' + dateStr + '</span>' + noteStr +
        '<button class="sm-log-del" data-id="' + l.id + '">×</button>' +
      '</div>';
    }).join("");

    listEl.querySelectorAll(".sm-log-del").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Видалити?")) return;
        try { await deleteDoc(doc(db, "private_logs", btn.dataset.id)); } catch (e) { console.error(e); }
      });
    });
  }
}

function _esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""; }

// ================================================================
//  404
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

// ================================================================
//  CLEANUP
// ================================================================
function _removeExisting() {
  var el = document.getElementById("smOverlay");
  if (!el) return;
  document.body.style.overflow = "";
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
    /* overlay */
    '.sm-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0);backdrop-filter:blur(0px);transition:background .25s,backdrop-filter .25s;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '.sm-overlay.sm-visible{background:rgba(13,17,23,.97);backdrop-filter:blur(12px)}' +

    /* shell */
    '.sm-shell{max-width:480px;margin:0 auto;padding:16px;padding-top:calc(16px + env(safe-area-inset-top));padding-bottom:calc(16px + env(safe-area-inset-bottom));min-height:100%}' +

    /* header */
    '.sm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}' +
    '.sm-title{color:#e6edf3;font-size:1.3rem;font-weight:800;margin:0;font-family:inherit}' +
    '.sm-x{background:none;border:none;color:rgba(255,255,255,.4);font-size:1.8rem;cursor:pointer;padding:4px 8px;line-height:1;border-radius:8px;-webkit-tap-highlight-color:transparent}' +
    '.sm-x:active{color:#fff;background:rgba(255,255,255,.08)}' +

    /* tabs */
    '.sm-tabs{display:flex;gap:4px;margin-bottom:16px;background:rgba(255,255,255,.05);border-radius:10px;padding:3px}' +
    '.sm-tab{flex:1;padding:8px 0;border:none;background:none;color:rgba(255,255,255,.4);font-size:.85rem;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all .2s}' +
    '.sm-tab.active{background:rgba(255,255,255,.1);color:#e6edf3}' +

    /* panels */
    '.sm-panel{display:none}' +
    '.sm-panel.active{display:block}' +
    '.sm-body{min-height:300px}' +

    /* sections */
    '.sm-section{margin-bottom:16px}' +
    '.sm-section-title{font-size:.75rem;font-weight:800;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}' +

    /* heatmap */
    '.sm-heatmap{display:grid;grid-template-rows:repeat(7,1fr);grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;margin-bottom:6px}' +
    '.sm-hm-cell{aspect-ratio:1;border-radius:2px;min-width:0}' +
    '.sm-hm-legend{display:flex;align-items:center;justify-content:flex-end;gap:3px;font-size:.65rem;color:rgba(255,255,255,.3)}' +
    '.sm-hm-legend .sm-hm-cell{width:10px;height:10px;flex-shrink:0;aspect-ratio:auto}' +

    /* coefficients */
    '.sm-coefs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}' +
    '.sm-coef-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;text-align:center}' +
    '.sm-coef-label{font-size:.65rem;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;line-height:1.3}' +
    '.sm-coef-val{font-size:1.8rem;font-weight:900;line-height:1;margin-bottom:4px;font-family:inherit}' +
    '.sm-coef-meta{font-size:.6rem;color:rgba(255,255,255,.2);line-height:1.4}' +

    /* add buttons */
    '.sm-add-section{display:flex;gap:8px;margin-bottom:8px}' +
    '.sm-add-btn{flex:1;padding:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.6);font-size:.85rem;font-weight:700;border-radius:10px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all .15s}' +
    '.sm-add-btn:active{background:rgba(255,255,255,.1);color:#fff}' +
    '.sm-add-manual{border-style:dashed}' +
    '.sm-add-save{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3);color:#10b981}' +
    '.sm-add-save:active{background:rgba(16,185,129,.3)}' +

    /* manual form */
    '.sm-manual-form{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px}' +
    '.sm-quick-opts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;align-items:center}' +
    '.sm-input{padding:8px 10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);color:#e6edf3;border-radius:8px;font-size:.85rem;font-family:inherit;outline:none;box-sizing:border-box;width:100%}' +
    '.sm-input:focus{border-color:rgba(99,102,241,.5)}' +
    '.sm-input-note{flex:1;min-width:100px}' +
    '.sm-manual-row{display:flex;gap:8px;align-items:center}' +
    '.sm-plus-label{display:flex;align-items:center;gap:4px;color:rgba(255,255,255,.4);font-size:.8rem;white-space:nowrap;cursor:pointer}' +

    /* log list */
    '.sm-log-list{max-height:200px;overflow-y:auto}' +
    '.sm-log-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.8rem}' +
    '.sm-log-date{color:rgba(255,255,255,.4);font-weight:600;white-space:nowrap}' +
    '.sm-log-note{color:rgba(255,255,255,.25);font-style:italic;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sm-log-del{background:none;border:none;color:rgba(255,255,255,.15);font-size:1.1rem;cursor:pointer;padding:2px 6px;flex-shrink:0;-webkit-tap-highlight-color:transparent}' +
    '.sm-log-del:active{color:#ef4444}' +

    /* media tab */
    '.sm-track{position:relative;width:100%;aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.03);-webkit-tap-highlight-color:transparent;margin-bottom:10px}' +
    '.sm-frame{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;pointer-events:none}' +
    '.sm-frame.active{opacity:1;pointer-events:auto}' +
    '.sm-img{max-width:100%;max-height:100%;object-fit:contain;-webkit-user-drag:none;user-select:none;-webkit-user-select:none;opacity:0;transition:opacity .3s}' +
    '.sm-frame.loaded .sm-img{opacity:1}' +
    '.sm-frame.error .sm-img{display:none}' +
    '.sm-frame.error::after{content:"Помилка";color:rgba(255,255,255,.2);font-size:.9rem}' +
    '.sm-spinner{position:absolute;width:24px;height:24px;border:2px solid rgba(255,255,255,.08);border-top-color:rgba(255,255,255,.4);border-radius:50%;animation:smSpin .7s linear infinite}' +
    '.sm-frame.loaded .sm-spinner,.sm-frame.error .sm-spinner{display:none}' +
    '@keyframes smSpin{to{transform:rotate(360deg)}}' +
    '.sm-dots{display:flex;gap:8px;justify-content:center}' +
    '.sm-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.15);cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent}' +
    '.sm-dot.active{background:#fff;width:18px;border-radius:3px}' +

    /* 404 */
    '.sm-404{margin:auto;text-align:center}' +
    '.sm-404-code{font-size:5rem;font-weight:800;color:rgba(255,255,255,.15);margin:0;line-height:1}' +
    '.sm-404-msg{color:rgba(255,255,255,.15);font-size:1rem;margin:8px 0 0}' +

    /* scrollbar */
    '.sm-overlay::-webkit-scrollbar{width:4px}' +
    '.sm-overlay::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}';
  document.head.appendChild(s);
}