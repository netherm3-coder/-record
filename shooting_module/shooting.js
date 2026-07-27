// ================================================================
//  shooting_module/shooting.js — Стрільба (облік боєприпасів)
//  Firestore:
//    shooting_logs  { date, weapon, caliber, ammo_type, count, timestamp, userId }
//    shooting_specs { type: 'weapon'|'ammo', key, userId, updatedAt, ...fields }
// ================================================================

import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, setDoc, onSnapshot,
  query, orderBy, deleteDoc, doc, limit,
  initializeFirestore, persistentLocalCache,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);

// Автологін (як на інших сторінках модуля)
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

// ================================================================
//  ПОЛЯ ТТХ — визначення структури (без готових значень).
//  Всі значення користувач вводить сам через форму редагування ТТХ.
// ================================================================
const WEAPON_TTX_FIELDS = [
  ["caliber_mm", "Калібр, мм"],
  ["sight_range_m", "Прицільна дальність, м"],
  ["direct_shot_range_m", "Дальність прямого пострілу, м"],
  ["rate_of_fire", "Темп стрільби, постр/хв"],
  ["combat_rate", "Бойова швидкострільність, постр/хв"],
  ["muzzle_velocity", "Початкова швидкість кулі, м/с"],
  ["lethal_range_m", "Дальність убійної дії кулі, м"],
  ["max_range_m", "Максимальна дальність польоту кулі, м"],
  ["weight_kg", "Вага, кг"],
];
const AMMO_TTX_FIELDS = [
  ["bullet_diameter_mm", "Діаметр кулі, мм"],
  ["cartridge_mass_g", "Маса патрону, г"],
  ["bullet_mass_g", "Маса кулі, г"],
  ["powder_mass_g", "Маса порохового заряду, г"],
  ["v0_ms", "V0, м/с"],
  ["e0_j", "E0, Дж"],
];

// ================================================================
//  ХЕЛПЕРИ
// ================================================================
function _norm(s) { return String(s || "").trim().toLowerCase(); }
function _esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _escAttr(s) { return _esc(s).replace(/"/g, "&quot;"); }
function _fmtDate(iso) {
  const parts = String(iso).split("-");
  return parts.length === 3 ? parts[2] + "." + parts[1] + "." + parts[0] : iso;
}
function _todayLocal() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function _specDocId(type, key) {
  const clean = String(key).trim().toLowerCase()
    .replace(/[×x]/g, "x")
    .replace(/[^a-zа-яёіїєґ0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return type + "__" + clean;
}

// ================================================================
//  СТАН
// ================================================================
let _allShots = [];
let _specsCache = { weapon: {}, ammo: {} };
let _editingId = null;
let _activeSubTab = "main";
let _statsDirty = true;
let _scrollToEndOnNextRender = false;

// ================================================================
//  AUTH GATE
// ================================================================
onAuthStateChanged(auth, (user) => {
  const status = document.getElementById("status");
  const content = document.getElementById("shContent");
  const not404 = document.getElementById("sh404");

  if (!user) {
    content.classList.remove("visible");
    not404.classList.add("visible");
    status.style.display = "none";
    return;
  }

  not404.classList.remove("visible");
  content.classList.add("visible");
  status.innerText = "Завантаження журналу...";

  _initForm();
  _initSubTabs();
  _initTtxModal();
  _listenShootingLogs();
  _listenShootingSpecs();
});

// ================================================================
//  ІНІЦІАЛІЗАЦІЯ ФОРМИ
// ================================================================
function _initForm() {
  const dateEl = document.getElementById("shDate");
  if (!dateEl.value) dateEl.value = _todayLocal();

  const weaponEl = document.getElementById("shWeapon");
  weaponEl.addEventListener("input", _onWeaponChange);
  weaponEl.addEventListener("change", _onWeaponChange);

  document.getElementById("shSaveBtn").addEventListener("click", _handleSave);
  document.getElementById("shCancelEditBtn").addEventListener("click", _cancelEdit);

  document.getElementById("shCount").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); _handleSave(); }
  });
}

function _onWeaponChange() {
  const weaponEl = document.getElementById("shWeapon");
  const caliberEl = document.getElementById("shCaliber");
  const suggestion = _suggestCaliber(weaponEl.value);
  if (suggestion) caliberEl.value = suggestion;
}

function _buildHistoryCaliberMap() {
  const map = {};
  _allShots.forEach((s) => {
    const norm = _norm(s.weapon);
    if (norm && !map[norm] && s.caliber) map[norm] = s.caliber;
  });
  return map;
}

function _suggestCaliber(weaponName) {
  const norm = _norm(weaponName);
  if (!norm) return "";
  const historyMap = _buildHistoryCaliberMap();
  return historyMap[norm] || "";
}

// ================================================================
//  ПІДВКЛАДКИ
// ================================================================
function _initSubTabs() {
  document.querySelectorAll(".sh-subtab").forEach((btn) => {
    btn.addEventListener("click", () => _switchSubTab(btn.dataset.subtab));
  });
}

function _switchSubTab(tab) {
  _activeSubTab = tab;
  document.querySelectorAll(".sh-subtab").forEach((b) => b.classList.toggle("active", b.dataset.subtab === tab));
  document.getElementById("shPanelMain").classList.toggle("active", tab === "main");
  document.getElementById("shPanelStats").classList.toggle("active", tab === "stats");

  if (tab === "stats" && _statsDirty) {
    _renderStatsPanel();
    _statsDirty = false;
  }
}

// ================================================================
//  FIRESTORE: ПІДПИСКИ
// ================================================================
function _listenShootingLogs() {
  const uid = auth.currentUser.uid;
  const q = query(collection(db, "shooting_logs"), orderBy("timestamp", "desc"), limit(3000));
  onSnapshot(q, (snap) => {
    _allShots = snap.docs
      .map((d) => Object.assign({ id: d.id }, d.data()))
      .filter((s) => s.userId === uid);

    _renderList();
    _rebuildDatalists();
    _statsDirty = true;
    if (_activeSubTab === "stats") { _renderStatsPanel(); _statsDirty = false; }

    document.getElementById("status").innerText = "Хмара синхронізована";
  }, () => {
    document.getElementById("shList").innerHTML =
      '<div class="sh-err">Помилка доступу. Перевір Firestore rules для shooting_logs</div>';
  });
}

function _listenShootingSpecs() {
  const uid = auth.currentUser.uid;
  const q = query(collection(db, "shooting_specs"));
  onSnapshot(q, (snap) => {
    const cache = { weapon: {}, ammo: {} };
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.userId !== uid) return;
      if (!cache[data.type]) return;
      const fields = Object.assign({}, data);
      delete fields.type; delete fields.key; delete fields.userId; delete fields.updatedAt;
      cache[data.type][_norm(data.key)] = fields;
    });
    _specsCache = cache;
    if (_activeSubTab === "stats") _renderStatsPanel();
  }, () => {});
}

// ================================================================
//  ЖУРНАЛ (ГОЛОВНА)
// ================================================================
function _renderList() {
  const container = document.getElementById("shList");
  if (!container) return;

  if (_allShots.length === 0) {
    container.innerHTML = '<div class="sh-empty">Ще немає записів. Додай перший настріл вище.</div>';
    return;
  }

  const groups = {};
  _allShots.forEach((s) => {
    if (!groups[s.date]) groups[s.date] = [];
    groups[s.date].push(s);
  });

  // Хронологічний порядок — як у польовому щоденнику: старіші дати зверху
  const dates = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let html = "";
  dates.forEach((date) => {
    const items = groups[date].slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const dayTotal = items.reduce((s, x) => s + (parseInt(x.count) || 0), 0);

    html += '<div class="sh-day-group">' +
      '<div class="sh-day-header">' +
        '<span class="sh-day-date">' + _fmtDate(date) + '</span>' +
        '<span class="sh-day-total">' + dayTotal + ' шт.</span>' +
      '</div>';

    items.forEach((it) => {
      const ammoSeg = it.ammo_type
        ? ' <span class="sh-sep">|</span> <span class="sh-ammo sh-ammo-link" data-ammotype="' +
          _escAttr(it.ammo_type) + '" data-caliber="' + _escAttr(it.caliber) + '">' + _esc(it.ammo_type) + '</span>'
        : '';
      html += '<div class="sh-entry">' +
        '<div class="sh-entry-text">' +
          '<span class="sh-weapon sh-weapon-link" data-weapon="' + _escAttr(it.weapon) + '">' + _esc(it.weapon) + '</span>' +
          ' <span class="sh-sep">|</span> <span class="sh-caliber">' + _esc(it.caliber) + '</span>' +
          ammoSeg +
          ' <span class="sh-dash">—</span> <span class="sh-count">' + (parseInt(it.count) || 0) + ' шт.</span>' +
        '</div>' +
        '<div class="sh-entry-actions">' +
          '<button class="sh-mini-btn sh-edit" data-id="' + it.id + '" title="Редагувати">✎</button>' +
          '<button class="sh-mini-btn sh-del" data-id="' + it.id + '" title="Видалити">✕</button>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll(".sh-edit").forEach((btn) => btn.addEventListener("click", () => _editEntry(btn.dataset.id)));
  container.querySelectorAll(".sh-del").forEach((btn) => btn.addEventListener("click", () => _deleteEntry(btn.dataset.id)));
  container.querySelectorAll(".sh-weapon-link").forEach((el) => {
    el.addEventListener("click", () => _openTtxModal("weapon", el.dataset.weapon, el.dataset.weapon));
  });
  container.querySelectorAll(".sh-ammo-link").forEach((el) => {
    el.addEventListener("click", () => _openAmmoTtx(el.dataset.ammotype, el.dataset.caliber));
  });

  if (_scrollToEndOnNextRender) {
    _scrollToEndOnNextRender = false;
    requestAnimationFrame(() => container.scrollIntoView({ behavior: "smooth", block: "end" }));
  }
}

// ================================================================
//  АВТОДОПОВНЕННЯ
// ================================================================
function _rebuildDatalists() {
  const weaponFreq = {};
  const caliberSet = new Set();
  const ammoFreq = {};

  _allShots.forEach((s) => {
    if (s.weapon) weaponFreq[s.weapon] = (weaponFreq[s.weapon] || 0) + 1;
    if (s.caliber) caliberSet.add(s.caliber);
    if (s.ammo_type) ammoFreq[s.ammo_type] = (ammoFreq[s.ammo_type] || 0) + 1;
  });

  const weapons = Object.keys(weaponFreq).sort((a, b) => weaponFreq[b] - weaponFreq[a]);
  const calibers = Array.from(caliberSet).sort();
  const ammoTypes = Object.keys(ammoFreq).sort((a, b) => ammoFreq[b] - ammoFreq[a]);

  _fillDatalist("shWeaponList", weapons);
  _fillDatalist("shCaliberList", calibers);
  _fillDatalist("shAmmoList", ammoTypes);
}

function _fillDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = values.map((v) => '<option value="' + _escAttr(v) + '"></option>').join("");
}

// ================================================================
//  ЗБЕРЕЖЕННЯ / РЕДАГУВАННЯ / ВИДАЛЕННЯ ЗАПИСІВ
// ================================================================
async function _handleSave() {
  const dateEl = document.getElementById("shDate");
  const weaponEl = document.getElementById("shWeapon");
  const caliberEl = document.getElementById("shCaliber");
  const ammoEl = document.getElementById("shAmmoType");
  const countEl = document.getElementById("shCount");
  const saveBtn = document.getElementById("shSaveBtn");

  const date = dateEl.value || _todayLocal();
  const weapon = weaponEl.value.trim();
  const caliber = caliberEl.value.trim();
  const ammo_type = ammoEl.value.trim();
  const count = parseInt(countEl.value);

  if (!weapon) { alert("Вкажи зброю!"); weaponEl.focus(); return; }
  if (!caliber) { alert("Вкажи калібр!"); caliberEl.focus(); return; }
  if (!count || count <= 0) { alert("Вкажи кількість набоїв (більше 0)!"); countEl.focus(); return; }

  const uid = auth.currentUser.uid;
  saveBtn.disabled = true;
  saveBtn.textContent = "Збереження...";

  try {
    if (_editingId) {
      await updateDoc(doc(db, "shooting_logs", _editingId), {
        date, weapon, caliber, ammo_type, count, updatedAt: Date.now(),
      });
      _editingId = null;
      document.getElementById("shCancelEditBtn").style.display = "none";
    } else {
      await addDoc(collection(db, "shooting_logs"), {
        date, weapon, caliber, ammo_type, count,
        timestamp: Date.now(), userId: uid, createdAt: Date.now(),
      });
      _scrollToEndOnNextRender = true;
    }
    _resetFormFields();
  } catch (err) {
    if (err.code === "permission-denied") {
      alert("🛡️ Доступ заборонено! Перевір Firestore rules для shooting_logs.");
    } else {
      alert("Помилка збереження: " + err.message);
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = _editingId ? "💾 Оновити запис" : "Записати";
  }
}

function _resetFormFields() {
  const weaponEl = document.getElementById("shWeapon");
  const caliberEl = document.getElementById("shCaliber");
  const ammoEl = document.getElementById("shAmmoType");
  const countEl = document.getElementById("shCount");
  weaponEl.value = ""; caliberEl.value = ""; ammoEl.value = ""; countEl.value = "";
  document.getElementById("shSaveBtn").textContent = "Записати";
  weaponEl.focus();
}

function _editEntry(id) {
  const entry = _allShots.find((s) => s.id === id);
  if (!entry) return;

  _editingId = id;
  document.getElementById("shDate").value = entry.date;
  document.getElementById("shWeapon").value = entry.weapon;
  document.getElementById("shCaliber").value = entry.caliber;
  document.getElementById("shAmmoType").value = entry.ammo_type || "";
  document.getElementById("shCount").value = entry.count;

  document.getElementById("shSaveBtn").textContent = "💾 Оновити запис";
  document.getElementById("shCancelEditBtn").style.display = "inline-block";

  _switchSubTab("main");
  document.querySelector(".sh-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _cancelEdit() {
  _editingId = null;
  document.getElementById("shCancelEditBtn").style.display = "none";
  _resetFormFields();
}

async function _deleteEntry(id) {
  if (!confirm("Видалити цей запис?")) return;
  try {
    await deleteDoc(doc(db, "shooting_logs", id));
    if (_editingId === id) _cancelEdit();
  } catch (err) {
    if (err.code === "permission-denied") {
      alert("🛡️ Доступ заборонено! Перевір Firestore rules для shooting_logs.");
    } else {
      alert("Помилка видалення: " + err.message);
    }
  }
}

// ================================================================
//  СТАТИСТИКА
// ================================================================
function _renderStatsPanel() {
  const panel = document.getElementById("shPanelStats");
  if (!panel) return;

  if (_allShots.length === 0) {
    panel.innerHTML = '<div class="sh-empty">Ще немає даних для статистики. Додай перший запис на вкладці «Головна».</div>';
    return;
  }

  panel.innerHTML =
    _renderStatsOverview() +
    '<div class="sh-stats-section-title">Розподіл за калібрами</div>' +
    _renderCaliberBars() +
    '<div class="sh-stats-section-title">По зброї</div>' +
    '<div class="sh-weapon-cards">' + _renderWeaponCards() + '</div>';

  panel.querySelectorAll(".sh-weapon-link").forEach((el) => {
    el.addEventListener("click", () => _openTtxModal("weapon", el.dataset.weapon, el.dataset.weapon));
  });
  panel.querySelectorAll(".sh-ammo-link").forEach((el) => {
    el.addEventListener("click", () => _openAmmoTtx(el.dataset.ammotype, el.dataset.caliber));
  });
}

function _renderStatsOverview() {
  const totalRounds = _allShots.reduce((s, x) => s + (parseInt(x.count) || 0), 0);
  return '<div class="sh-stats-overview">' +
    '<div class="sh-stat-box sh-stat-big"><div class="sh-stat-num">' + totalRounds + '</div><div class="sh-stat-lbl">Загальний настріл</div></div>' +
    '<div class="sh-stat-box"><div class="sh-stat-num">' + _allShots.length + '</div><div class="sh-stat-lbl">Кількість сесій</div></div>' +
  '</div>';
}

function _renderCaliberBars() {
  const totalRounds = _allShots.reduce((s, x) => s + (parseInt(x.count) || 0), 0);
  if (totalRounds === 0) return "";

  const byCaliber = {};
  _allShots.forEach((s) => {
    const c = s.caliber || "Невідомо";
    byCaliber[c] = (byCaliber[c] || 0) + (parseInt(s.count) || 0);
  });
  const calibers = Object.keys(byCaliber).sort((a, b) => byCaliber[b] - byCaliber[a]);

  return '<div class="sh-caliber-bars">' + calibers.map((c) => {
    const count = byCaliber[c];
    const pct = Math.round((count / totalRounds) * 100);
    return '<div class="sh-cal-bar-row">' +
      '<div class="sh-cal-bar-label"><span>' + _esc(c) + '</span><span>' + count + ' шт. (' + pct + '%)</span></div>' +
      '<div class="sh-cal-bar-track"><div class="sh-cal-bar-fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }).join("") + '</div>';
}

function _renderWeaponCards() {
  const byWeapon = {};
  _allShots.forEach((s) => {
    const norm = _norm(s.weapon);
    if (!byWeapon[norm]) byWeapon[norm] = { name: s.weapon, caliber: s.caliber, sessions: 0, rounds: 0, ammo: {} };
    const w = byWeapon[norm];
    w.sessions += 1;
    w.rounds += (parseInt(s.count) || 0);
    const atKey = s.ammo_type && s.ammo_type.trim() ? s.ammo_type.trim() : "(без типу)";
    w.ammo[atKey] = (w.ammo[atKey] || 0) + (parseInt(s.count) || 0);
  });

  const weapons = Object.values(byWeapon).sort((a, b) => b.rounds - a.rounds);
  if (weapons.length === 0) return '<div class="sh-empty">Ще немає даних.</div>';

  return weapons.map((w) => {
    const ammoEntries = Object.keys(w.ammo).sort((a, b) => w.ammo[b] - w.ammo[a]);
    const ammoHtml = ammoEntries.map((at) => {
      const cnt = w.ammo[at];
      const clickable = at !== "(без типу)";
      const cls = clickable ? "sh-ammo-chip sh-ammo-link" : "sh-ammo-chip";
      const attrs = clickable
        ? ' data-ammotype="' + _escAttr(at) + '" data-caliber="' + _escAttr(w.caliber) + '"'
        : '';
      return '<span class="' + cls + '"' + attrs + '>' + cnt + ' ' + _esc(at) + '</span>';
    }).join(" ");

    return '<div class="sh-weapon-card">' +
      '<div class="sh-weapon-card-top">' +
        '<span class="sh-weapon-card-name sh-weapon-link" data-weapon="' + _escAttr(w.name) + '">' + _esc(w.name) + '</span>' +
        '<span class="sh-weapon-card-caliber sh-ammo-link" data-ammotype="" data-caliber="' + _escAttr(w.caliber) + '">' + _esc(w.caliber) + '</span>' +
      '</div>' +
      '<div class="sh-weapon-card-stats">' + w.sessions + ' стрільб<span class="sh-dot">•</span>' + w.rounds + ' шт.</div>' +
      '<div class="sh-weapon-card-ammo">' + ammoHtml + '</div>' +
    '</div>';
  }).join("");
}

// ================================================================
//  ТТХ — МОДАЛЬНЕ ВІКНО
// ================================================================
function _initTtxModal() {
  document.getElementById("shTtxClose").addEventListener("click", _closeTtxModal);
  document.getElementById("shTtxOverlay").addEventListener("click", (e) => {
    if (e.target.id === "shTtxOverlay") _closeTtxModal();
  });
}

function _closeTtxModal() {
  document.getElementById("shTtxOverlay").classList.remove("sh-ttx-visible");
}

function _openAmmoTtx(ammoType, caliber) {
  const key = ammoType && ammoType.trim() ? ammoType.trim() : caliber;
  const displayName = ammoType && ammoType.trim() ? (ammoType + " (" + caliber + ")") : caliber;
  _openTtxModal("ammo", key, displayName, caliber);
}

function _openTtxModal(kind, key, displayName, fallbackCaliber) {
  document.getElementById("shTtxTitle").textContent = (kind === "weapon" ? "🔫 " : "🧿 ") + displayName;

  const data = _getSpecValues(kind, key, fallbackCaliber);
  if (data) {
    _renderTtxView(kind, key, data, fallbackCaliber);
  } else {
    _renderTtxEdit(kind, key, {}, fallbackCaliber, true);
  }

  document.getElementById("shTtxOverlay").classList.add("sh-ttx-visible");
}

function _getSpecValues(kind, key, fallbackCaliber) {
  const normKey = _norm(key);
  if (_specsCache[kind] && _specsCache[kind][normKey]) return _specsCache[kind][normKey];

  if (kind === "ammo" && fallbackCaliber) {
    const normCal = _norm(fallbackCaliber);
    if (_specsCache.ammo && _specsCache.ammo[normCal]) return _specsCache.ammo[normCal];
  }
  return null;
}

function _renderTtxView(kind, key, data, fallbackCaliber) {
  const fields = kind === "weapon" ? WEAPON_TTX_FIELDS : AMMO_TTX_FIELDS;
  const body = document.getElementById("shTtxBody");

  const rowsHtml = fields.map((f) => {
    let val = data[f[0]];
    let calcNote = "";
    if (kind === "ammo" && f[0] === "e0_j" && (val === undefined || val === null || val === "")) {
      if (data.bullet_mass_g && data.v0_ms) {
        val = Math.round(0.5 * (parseFloat(data.bullet_mass_g) / 1000) * Math.pow(parseFloat(data.v0_ms), 2));
        calcNote = ' <span class="sh-ttx-calc">(розраховано)</span>';
      }
    }
    const display = (val === undefined || val === null || val === "") ? "—" : val;
    return '<div class="sh-ttx-row"><span class="sh-ttx-label">' + f[1] + '</span><span class="sh-ttx-val">' + display + calcNote + '</span></div>';
  }).join("");

  body.innerHTML = rowsHtml + '<button class="sh-ttx-edit-btn" id="shTtxEditBtn">✎ Редагувати ТТХ</button>';
  document.getElementById("shTtxEditBtn").addEventListener("click", () => {
    _renderTtxEdit(kind, key, data, fallbackCaliber, false);
  });
}

function _renderTtxEdit(kind, key, currentData, fallbackCaliber, isNew) {
  const fields = kind === "weapon" ? WEAPON_TTX_FIELDS : AMMO_TTX_FIELDS;
  const body = document.getElementById("shTtxBody");

  const stubNote = isNew
    ? '<div class="sh-ttx-stub-note">Дані відсутні в базі. Заповни ТТХ нижче — вони збережуться і будуть доступні надалі.</div>'
    : "";

  const rowsHtml = fields.map((f) => {
    const val = currentData[f[0]];
    const v = (val === undefined || val === null) ? "" : val;
    return '<div class="sh-ttx-edit-row"><label class="sh-ttx-edit-label">' + f[1] + '</label>' +
      '<input type="number" step="any" class="sh-input sh-ttx-input" data-field="' + f[0] + '" value="' + _escAttr(v) + '" /></div>';
  }).join("");

  body.innerHTML = stubNote + rowsHtml +
    '<button class="sh-save-btn" id="shTtxSaveBtn">💾 Зберегти ТТХ</button>' +
    (isNew ? "" : '<button class="sh-cancel-btn" id="shTtxCancelBtn" style="display:block">✕ Скасувати</button>');

  document.getElementById("shTtxSaveBtn").addEventListener("click", () => _saveTtx(kind, key, fallbackCaliber));
  const cancelBtn = document.getElementById("shTtxCancelBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => _renderTtxView(kind, key, currentData, fallbackCaliber));
}

async function _saveTtx(kind, key, fallbackCaliber) {
  const inputs = document.querySelectorAll(".sh-ttx-input");
  const values = {};
  inputs.forEach((inp) => {
    const f = inp.dataset.field;
    const v = inp.value.trim();
    if (v !== "") values[f] = parseFloat(v);
  });

  const uid = auth.currentUser.uid;
  const docId = _specDocId(kind, key);
  const saveBtn = document.getElementById("shTtxSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Збереження...";

  try {
    const payload = Object.assign({ type: kind, key: key, userId: uid, updatedAt: Date.now() }, values);
    await setDoc(doc(db, "shooting_specs", docId), payload);
    if (!_specsCache[kind]) _specsCache[kind] = {};
    _specsCache[kind][_norm(key)] = values;
    _renderTtxView(kind, key, values, fallbackCaliber);
  } catch (err) {
    if (err.code === "permission-denied") {
      alert("🛡️ Доступ заборонено! Перевір Firestore rules для shooting_specs.");
    } else {
      alert("Помилка збереження ТТХ: " + err.message);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 Зберегти ТТХ";
  }
}
