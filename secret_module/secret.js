// ================================================================
//  secret_module/secret.js — Архів
// ================================================================

import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc,
  collection, getDocs, addDoc,
  query, orderBy, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const FALLBACK_GIF = "assets/redvid_io_violating_that_throatpussy_of_hers.gif";

// ---------------------------------------------------------------
//  Головна функція — викликається з app.js
// ---------------------------------------------------------------
export async function openSecretModule() {
  if (getApps().length === 0) { _show404(); return; }
  const app = getApp();
  const user = getAuth(app).currentUser;
  if (!user) { _show404(); return; }

  const db = getFirestore(app);
  let gifUrl = FALLBACK_GIF;
  let logs = [];

  try {
    const snap = await getDoc(doc(db, "secret", "content"));
    if (snap.exists() && snap.data().gifUrl) gifUrl = snap.data().gifUrl;
  } catch {}

  try {
    const snap = await getDocs(query(collection(db, "private_logs"), orderBy("timestamp", "asc")));
    logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {}

  _showContent(gifUrl, logs, db, user.uid);
}

// ---------------------------------------------------------------
//  Статистичні обчислення
// ---------------------------------------------------------------
function _dateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function _tsToDate(ts) {
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

function _getStats(logs) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Group entries by date
  const byDay = {};
  for (const log of logs) {
    const key = _dateKey(_tsToDate(log.timestamp));
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(log);
  }

  // Current streak S: consecutive entry-free days going back from today (inclusive)
  let S = 0;
  const check = new Date(todayStart);
  while (S <= 3650) {
    if (byDay[_dateKey(check)]?.length > 0) break;
    S++;
    check.setDate(check.getDate() - 1);
  }

  // D_total, D_clean
  let D_total = 1, D_clean = 1;
  if (logs.length > 0) {
    const firstDay = new Date(_tsToDate(logs[0].timestamp));
    firstDay.setHours(0, 0, 0, 0);
    D_total = Math.max(1, Math.round((todayStart - firstDay) / 86400000) + 1);
    D_clean = Math.max(0, D_total - Object.keys(byDay).length);
  }

  // R_7d: weighted entries in last 7 days ("+" note counts as 0.5)
  const sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  let R_7d = 0;
  for (const log of logs) {
    if (_tsToDate(log.timestamp) >= sevenAgo) {
      R_7d += (log.note && log.note.startsWith("+")) ? 0.5 : 1;
    }
  }

  // S_avg: average gap between consecutive reset days
  const sortedDays = Object.keys(byDay).sort();
  const streaks = [];
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = Math.round((new Date(sortedDays[i]) - new Date(sortedDays[i - 1])) / 86400000);
    if (diff > 1) streaks.push(diff - 1);
  }
  streaks.push(S);
  const S_avg = streaks.length > 0 ? streaks.reduce((a, b) => a + b, 0) / streaks.length : S;

  const D_ratio = D_total > 0 ? D_clean / D_total : 1;

  // K_ns = (D_clean/D_total)^2 × √S × 10 − (R_7d × 15)
  const K_ns = Math.pow(D_ratio, 2) * Math.sqrt(S) * 10 - (R_7d * 15);

  // R_dop = ln(S+1) × (D_ratio/1.5) − (N_7d / (S_avg+1) × 10)
  const R_dop = Math.log(S + 1) * (D_ratio / 1.5) - (R_7d / (S_avg + 1) * 10);

  return { S, D_total, D_clean, D_ratio, R_7d, S_avg, K_ns, R_dop, byDay };
}

// ---------------------------------------------------------------
//  Рендер: основний контент
// ---------------------------------------------------------------
function _showContent(gifUrl, logs, db, userId) {
  _ensureStyles();
  _removeExisting();

  const stats = _getStats(logs);

  // Activity grid: 36 weeks × 7 days, starting from Sunday of week 36 ago
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gridStart = new Date(today);
  gridStart.setDate(today.getDate() - 35 * 7 - today.getDay());

  let gridCells = "";
  const d = new Date(gridStart);
  for (let i = 0; i < 252; i++) {
    const key = _dateKey(d);
    const entries = stats.byDay[key] || [];
    const isFuture = d > today;
    const level = isFuture ? "f" : entries.length >= 2 ? "2" : entries.length === 1 ? "1" : "0";
    const notes = entries.map(l => l.note).filter(Boolean).join(", ");
    const title = d.toLocaleDateString("uk-UA") + (notes ? ": " + notes : "");
    gridCells += `<div class="sm-cell sm-cell-${level}" title="${title}"></div>`;
    d.setDate(d.getDate() + 1);
  }

  const knsColor = stats.K_ns < 0 ? "#ef4444" : stats.K_ns > 50 ? "#00d4ff" : "#f1f5f9";

  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";
  overlay.innerHTML = `
    <div class="sm-modal" role="dialog" aria-modal="true">
      <button class="sm-close" aria-label="Закрити">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="sm-badge">АРХІВ</div>
      <h2 class="sm-title">Архів</h2>

      <div class="sm-tabs">
        <button class="sm-tab sm-tab-active" data-pane="sm-pane-stats">Статистика</button>
        <button class="sm-tab" data-pane="sm-pane-media">Медіа</button>
      </div>

      <div class="sm-tab-pane sm-pane-active" id="sm-pane-stats">
        <div class="sm-graph-wrap">
          <div class="sm-activity-grid">${gridCells}</div>
        </div>

        <div class="sm-metrics">
          <div class="sm-metric-card">
            <div class="sm-metric-label">K нейронної стабільності</div>
            <div class="sm-metric-value" style="color:${knsColor}">${stats.K_ns.toFixed(2)}</div>
            <div class="sm-metric-sub">Стрік: ${stats.S}д · Чист: ${stats.D_clean}/${stats.D_total}д · −7д: ${stats.R_7d.toFixed(1)}</div>
          </div>
          <div class="sm-metric-card">
            <div class="sm-metric-label">R дофамінової резистентності</div>
            <div class="sm-metric-value">${stats.R_dop.toFixed(2)}</div>
            <div class="sm-metric-sub">Ø стрік: ${stats.S_avg.toFixed(1)}д · D: ${(stats.D_ratio * 100).toFixed(0)}%</div>
          </div>
        </div>

        <div class="sm-add-section">
          <button class="sm-add-btn" id="sm-add-toggle">+ Додати запис</button>
          <div class="sm-add-form" id="sm-add-form" hidden>
            <div class="sm-add-row">
              <button class="sm-btn-action" id="sm-add-now">Зараз</button>
              <div class="sm-manual-row">
                <input type="datetime-local" id="sm-dt-input" class="sm-dt-input">
                <button class="sm-btn-action" id="sm-add-manual">Вручну</button>
              </div>
            </div>
            <div class="sm-plus-row">
              <label class="sm-plus-label">
                <input type="checkbox" id="sm-plus-check"> Маркер «+» (усвідомлений вибір, штраф ×0.5)
              </label>
            </div>
            <input type="text" id="sm-note-input" class="sm-note-input" placeholder="Нотатка (необов'язково)...">
          </div>
        </div>
      </div>

      <div class="sm-tab-pane" id="sm-pane-media">
        ${navigator.onLine
          ? `<img src="${gifUrl}" alt="Secret" class="sm-gif">`
          : `<p class="sm-offline">Цей контент потребує з'єднання з мережею</p>`
        }
      </div>
    </div>
  `;

  // Tab switching
  overlay.querySelectorAll(".sm-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".sm-tab").forEach(b => b.classList.remove("sm-tab-active"));
      overlay.querySelectorAll(".sm-tab-pane").forEach(p => p.classList.remove("sm-pane-active"));
      btn.classList.add("sm-tab-active");
      overlay.querySelector("#" + btn.dataset.pane).classList.add("sm-pane-active");
    });
  });

  // Add entry toggle — pre-fill datetime rounded to nearest 10 min
  const addForm = overlay.querySelector("#sm-add-form");
  overlay.querySelector("#sm-add-toggle").addEventListener("click", () => {
    addForm.hidden = !addForm.hidden;
    if (!addForm.hidden) {
      const now = new Date();
      now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
      overlay.querySelector("#sm-dt-input").value = now.toISOString().slice(0, 16);
    }
  });

  const _saveEntry = async (date) => {
    const rawNote = overlay.querySelector("#sm-note-input").value.trim();
    const plus = overlay.querySelector("#sm-plus-check").checked;
    const note = plus ? ("+ " + rawNote).trim() : rawNote;
    try {
      await addDoc(collection(db, "private_logs"), {
        timestamp: Timestamp.fromDate(date),
        type: "reset",
        note,
        userId,
      });
      _removeExisting();
      openSecretModule();
    } catch (e) {
      console.error("Помилка запису:", e);
    }
  };

  overlay.querySelector("#sm-add-now").addEventListener("click", () => {
    const now = new Date();
    now.setMinutes(Math.floor(now.getMinutes() / 10) * 10, 0, 0);
    _saveEntry(now);
  });

  overlay.querySelector("#sm-add-manual").addEventListener("click", () => {
    const val = overlay.querySelector("#sm-dt-input").value;
    if (val) _saveEntry(new Date(val));
  });

  // Close
  overlay.querySelector(".sm-close").addEventListener("click", _removeExisting);
  overlay.addEventListener("click", e => { if (e.target === overlay) _removeExisting(); });
  const onKey = e => {
    if (e.key === "Escape") { _removeExisting(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);

  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("sm-visible"));
}

// ---------------------------------------------------------------
//  Рендер: 404 — не авторизований
// ---------------------------------------------------------------
function _show404() {
  _ensureStyles();
  _removeExisting();

  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay sm-denied";
  overlay.innerHTML = `
    <div class="sm-modal sm-modal--404">
      <p class="sm-404-code">404</p>
      <p class="sm-404-msg">Not Found</p>
    </div>
  `;

  overlay.addEventListener("click", _removeExisting);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("sm-visible"));
  setTimeout(_removeExisting, 2500);
}

// ---------------------------------------------------------------
//  Прибираємо оверлей з анімацією
// ---------------------------------------------------------------
function _removeExisting() {
  const el = document.getElementById("smOverlay");
  if (!el) return;
  el.classList.remove("sm-visible");
  el.addEventListener("transitionend", () => { el.remove(); document.body.style.overflow = ""; }, { once: true });
}

// ---------------------------------------------------------------
//  CSS — вставляється один раз в <head>
// ---------------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById("sm-styles")) return;

  const style = document.createElement("style");
  style.id = "sm-styles";
  style.textContent = `
    .sm-overlay {
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0);
      backdrop-filter: blur(0px);
      transition: background .3s ease, backdrop-filter .3s ease;
      pointer-events: all;
    }
    .sm-overlay.sm-visible {
      background: rgba(0,0,0,.82);
      backdrop-filter: blur(12px);
    }
    .sm-modal {
      position: relative;
      background: #0d1117;
      border: 1px solid rgba(99,102,241,.3);
      border-radius: 20px;
      padding: 28px 24px 24px;
      max-width: 700px; width: 95%;
      max-height: 90vh;
      overflow-y: auto;
      text-align: left;
      box-shadow: 0 0 60px rgba(99,102,241,.15);
      opacity: 0; transform: translateY(24px);
      transition: opacity .3s ease, transform .3s ease;
    }
    .sm-overlay.sm-visible .sm-modal { opacity: 1; transform: translateY(0); }
    .sm-close {
      position: absolute; top: 14px; right: 14px;
      background: transparent; border: none;
      color: #94a3b8; cursor: pointer;
      padding: 6px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      transition: color .2s, background .2s;
    }
    .sm-close:hover { color: #fff; background: rgba(255,255,255,.08); }
    .sm-badge {
      display: inline-block; margin-bottom: 10px;
      padding: 3px 12px; border-radius: 20px;
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444; font-size: .65rem;
      font-weight: 800; letter-spacing: .12em;
    }
    .sm-title {
      color: #f1f5f9; font-size: 1.4rem; font-weight: 800;
      margin: 0 0 16px;
    }
    .sm-tabs { display: flex; gap: 6px; margin-bottom: 20px; }
    .sm-tab {
      padding: 7px 18px; border-radius: 10px;
      border: 1px solid rgba(99,102,241,.25);
      background: transparent; color: #94a3b8;
      font-size: .85rem; cursor: pointer;
      transition: all .2s;
    }
    .sm-tab:hover { color: #f1f5f9; background: rgba(99,102,241,.1); }
    .sm-tab.sm-tab-active {
      background: rgba(99,102,241,.2);
      border-color: rgba(99,102,241,.6);
      color: #f1f5f9;
    }
    .sm-tab-pane { display: none; }
    .sm-tab-pane.sm-pane-active { display: block; }
    .sm-graph-wrap { overflow-x: auto; padding-bottom: 8px; margin-bottom: 20px; }
    .sm-activity-grid {
      display: grid;
      grid-template-rows: repeat(7, 12px);
      grid-auto-flow: column;
      grid-auto-columns: 12px;
      gap: 3px;
      width: max-content;
    }
    .sm-cell { width: 12px; height: 12px; border-radius: 2px; cursor: default; }
    .sm-cell-0 { background: rgba(255,255,255,.05); }
    .sm-cell-1 { background: #26a641; }
    .sm-cell-2 { background: #006d32; }
    .sm-cell-f { background: transparent; }
    .sm-metrics {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      margin-bottom: 20px;
    }
    @media (max-width: 480px) { .sm-metrics { grid-template-columns: 1fr; } }
    .sm-metric-card {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(99,102,241,.2);
      border-radius: 12px; padding: 14px 16px;
    }
    .sm-metric-label {
      font-size: .72rem; color: #64748b;
      text-transform: uppercase; letter-spacing: .06em;
      margin-bottom: 6px;
    }
    .sm-metric-value {
      font-size: 1.8rem; font-weight: 800;
      color: #f1f5f9; line-height: 1; margin-bottom: 6px;
    }
    .sm-metric-sub { font-size: .72rem; color: #64748b; }
    .sm-add-section { margin-top: 4px; }
    .sm-add-btn {
      width: 100%; padding: 10px; border-radius: 10px;
      border: 1px dashed rgba(99,102,241,.4);
      background: transparent; color: #94a3b8;
      font-size: .9rem; cursor: pointer; transition: all .2s;
    }
    .sm-add-btn:hover { background: rgba(99,102,241,.08); color: #f1f5f9; }
    .sm-add-form { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    .sm-add-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .sm-manual-row { display: flex; gap: 6px; align-items: center; flex: 1; }
    .sm-btn-action {
      padding: 7px 14px; border-radius: 8px;
      border: 1px solid rgba(99,102,241,.4);
      background: rgba(99,102,241,.1); color: #a5b4fc;
      font-size: .85rem; cursor: pointer; white-space: nowrap;
      transition: all .2s;
    }
    .sm-btn-action:hover { background: rgba(99,102,241,.25); color: #f1f5f9; }
    .sm-dt-input {
      flex: 1; padding: 7px 10px; border-radius: 8px;
      border: 1px solid rgba(99,102,241,.3);
      background: rgba(255,255,255,.05); color: #f1f5f9;
      font-size: .85rem;
    }
    .sm-plus-label {
      display: flex; align-items: center; gap: 8px;
      font-size: .82rem; color: #94a3b8; cursor: pointer;
    }
    .sm-note-input {
      width: 100%; padding: 8px 12px; border-radius: 8px;
      border: 1px solid rgba(99,102,241,.25);
      background: rgba(255,255,255,.04); color: #f1f5f9;
      font-size: .85rem; box-sizing: border-box;
    }
    .sm-note-input::placeholder { color: #64748b; }
    .sm-gif {
      width: 100%; max-width: 420px;
      border-radius: 12px;
      border: 1px solid rgba(99,102,241,.2);
      display: block; margin: 0 auto;
    }
    .sm-offline {
      padding: 16px 20px; border-radius: 12px;
      background: rgba(239,68,68,.07);
      border: 1px dashed rgba(239,68,68,.35);
      color: #ef4444; font-size: .9rem; line-height: 1.5; margin: 0;
    }
    .sm-modal--404 { padding: 56px 28px; text-align: center; }
    .sm-404-code {
      font-size: 5.5rem; font-weight: 800; line-height: 1;
      color: #94a3b8; margin: 0;
    }
    .sm-404-msg { color: #94a3b8; font-size: 1.1rem; margin: 10px 0 0; letter-spacing: .05em; }
  `;
  document.head.appendChild(style);
}
