// ================================================================
//  shooting_module/shooting.js — Стрільба (облік боєприпасів)
//  Firestore:
//    shooting_logs  { date, weapon, caliber, ammo_type, count, timestamp, userId,
//                     kind? }  kind: "grenade" — гранати (weapon = назва гранати,
//                     ammo_type = тип, caliber порожній); без kind — набої
//    shooting_specs { type: 'weapon'|'ammo'|'grenade', key, userId, updatedAt, ...fields }
// ================================================================

import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, setDoc, onSnapshot,
  query, orderBy, deleteDoc, doc, limit, deleteField,
  initializeFirestore, persistentLocalCache,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, initializeAuth, onAuthStateChanged,
  browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (e) {
  db = initializeFirestore(app, {});
}
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
const GRENADE_TTX_FIELDS = [
  ["mass_g", "Маса гранати, г"],
  ["explosive_g", "Маса вибухової речовини, г"],
  ["lethal_radius_m", "Радіус вбивчої дії, м"],
  ["throw_range_m", "Дальність кидка, м"],
  ["fuse_delay_s", "Час горіння запалу, с"],
];
function _ttxFields(kind) {
  if (kind === "weapon") return WEAPON_TTX_FIELDS;
  if (kind === "grenade") return GRENADE_TTX_FIELDS;
  return AMMO_TTX_FIELDS;
}

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
// Запис про гранати (решта — набої, зокрема всі старі записи без kind)
function _isGrenade(s) { return !!s && s.kind === "grenade"; }
function _kindOf(s) { return _isGrenade(s) ? "grenade" : "rounds"; }
function _sumCount(list) { return list.reduce((s, x) => s + (parseInt(x.count) || 0), 0); }
// 1 граната, 2 гранати, 5 гранат
function _plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b > 1 && b < 5) return forms[1];
  return forms[2];
}

// ================================================================
//  АВТОПІДБІР СИЛУЕТУ ЗБРОЇ ПО КЛЮЧОВИХ СЛОВАХ
//  Порядок важливий: більш специфічні ключі — раніше.
//  Файли: assets/weapons/<name>.png  (fallback — musket_flint)
// ================================================================
const WEAPON_ICON_RULES = [
  // Пістолети-кулемети
  [["kriss", "vector", "вектор", "крісс", "крис"], "vector"],
  [["p90", "п90", "п-90"], "p90"],
  [["uzi", "узі", "узи"], "uzi"],
  [["mp5", "мп5", "мп-5", "мп 5"], "mp5"],
  [["mp40", "мп40", "мп-40", "mp-40", "мп 40"], "mp40"],
  [["thompson", "томпсон", "томмі", "tommy"], "thompson"],
  // Гранатомети — усі на одну іконку РПГ
  [["rpg", "рпг", "гранатомет", "підствол", "подствол", "гп-25", "гп25",
    "at4", "нлав", "джавелін", "javelin", "муха", "ргд"], "rpg"],
  // Кулемети
  [["fn mag", "fnmag", "мag", "m240", "м240", "m249", "м249", "мінімі", "minimi",
    "пкм", "пкт", "пкп", "рпк", "pkm", "rpk", "кулемет", "браунінг", "browning",
    "дшк", "утьос", "утес", "нсв"], "mg"],
  [["m60", "м60", "м-60"], "m60"],
  // Снайперські / марксманські
  [["barrett", "барретт", "барет", "m82", "м82"], "barrett"],
  [["свд", "svd", "драгунов", "тigr", "тигр", "марксман"], "carbine"],
  [["awm", "awp", "снайп", "sniper", "l96", "мосін", "мосин", "mosin"], "sniper"],
  // Bullpup / особливі
  [["tavor", "тавор", "тар-21", "tar-21", "tar21"], "tavor"],
  [["aug", "ауг", "штайр", "steyr"], "aug"],
  [["famas", "фамас"], "famas"],
  [["g36", "г36", "г-36"], "g36"],
  [["scar", "скар"], "scar"],
  // АК-родина
  [["аксу", "акс-74у", "aksu", "аксу-74"], "aks"],
  [["ак-74", "ак74", "ak-74", "ak74", "ак-12", "ак12", "акс"], "ak"],
  [["ак-47", "ак47", "ak-47", "ak47", "акм", "akm", "ак ", "ак"], "ak"],
  // AR-родина
  [["mk556", "мк556", "мк-556", "mk-556", "mk 556", "мк 556",
    "zbroyar", "збройяр", "збро'яр", "z-15", "z15", "форт-221", "форт221",
    "uar", "уар-15", "wac47", "wac-47", "вак47", "вак-47"], "m4"],
  [["m4", "м4", "м-4", "hk416", "хк416"], "m4"],
  [["m16", "м16", "м-16", "ar-15", "ar15", "ар-15"], "m16"],
  [["fal", "фал", "g3", "г3", "г-3", "фн фал"], "carbine"],
  // Рушниці
  [["обріз", "обрез", "sawed", "sawn"], "sawed_off"],
  [["помпова", "помпа", "pump", "remington", "ремінгтон", "870", "mossberg", "мосберг"], "shotgun_pump"],
  [["рушниц", "дробовик", "shotgun", "12 калібр", "12/76", "гладкоств"], "shotgun"],
  // Гвинтівки болтові / старі
  [["enfield", "енфілд", "lee", "лі-енфілд"], "rifle_bolt"],
  [["мушкет", "musket", "кремн", "flint"], "musket_flint"],
  [["карабін", "карабин", "carbine"], "ar_carbine"],
  [["гвинтівк", "винтовк", "болт", "bolt", "rifle"], "rifle_bolt"],
  // Пістолети / револьвери
  [["glock", "глок", "глок-17", "глок17"], "glock"],
  [["револьвер", "revolver", "colt", "кольт", "python", "магнум", "magnum", "наган"], "revolver"],
  [["пістолет", "пистолет", "pistol", "пм", "тт", "beretta", "берета", "m9", "форт"], "pistol"],
  // ПП загальний
  [["пп", "smg", "автомат"], "smg"],
];

function _weaponIcon(weaponName) {
  const n = _norm(weaponName);
  if (!n) return "musket_flint";
  for (const [keys, icon] of WEAPON_ICON_RULES) {
    for (const k of keys) {
      if (n.includes(k.trim())) return icon;
    }
  }
  return "musket_flint"; // fallback — мушкет
}

// Силует для запису: у гранат — свій значок, у зброї — за назвою
const GRENADE_ICON = "../assets/gear/grenade.png";
function _iconSrc(name, grenade) {
  return grenade ? GRENADE_ICON : "../assets/weapons/" + _weaponIcon(name) + ".png";
}
function _iconImg(cls, name, grenade) {
  return '<img class="' + cls + (grenade ? " sh-icon-grenade" : "") + '" src="' + _iconSrc(name, grenade) + '" alt="" ' +
    'onerror="this.onerror=null;this.src=\'../assets/weapons/musket_flint.png\'" />';
}

// ================================================================
//  СТАН
// ================================================================
let _allShots = [];
let _specsCache = { weapon: {}, ammo: {}, grenade: {} };
let _editingId = null;
let _activeSubTab = "main";
let _statsDirty = true;
let _scrollToEndOnNextRender = false;
let _formKind = "rounds";                       // що зараз записує форма
let _lastEntry = { rounds: null, grenade: null }; // для «Повторити» — окремо

// Довідник (вантажиться з reference.js при першому відкритті вкладки)
let _ref = null;          // [{ id, section, title, subtitle, blocks }]
let _ammoLoad = {};       // назва зброї -> боєкомплект
let _refLoading = false;
let _refView = { doc: null, query: "", focus: -1 };
let _refSheetInited = false;
let _weaponIndex = [];    // зразки зброї з таблиць довідника
let _grenadeIndex = [];   // ручні гранати з таблиці довідника
let _calibers = [];       // калібри з документів

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
  _initBackgroundPicker();
  _listenShootingLogs();
  _listenShootingSpecs();

  // Довідник у фоні: з нього беруться підказки назв зброї та калібрів
  setTimeout(() => {
    _loadRef().then(() => _rebuildDatalists()).catch(() => {});
  }, 800);
});

// ================================================================
//  ФОНИ СТОРІНКИ
//  ЯК ДОДАТИ НОВИЙ ФОН:
//    1) поклади файл у assets/camo/  (напр. assets/camo/mm14.jpg)
//    2) додай сюди рядок: { id: "mm14", name: "ММ-14", file: "../assets/camo/mm14.jpg" }
//  Більше нічого міняти не треба — з'явиться у списку автоматично.
// ================================================================
const BACKGROUNDS = [
  { id: "none", name: "Без фону",     file: null },
  { id: "camo", name: "Піксель",      file: "../assets/camo/camo.jpg" },
];

function _initBackgroundPicker() {
  const sel = document.getElementById("shBgSelect");
  if (!sel) return;

  sel.innerHTML = BACKGROUNDS
    .map((b) => '<option value="' + b.id + '">' + _esc(b.name) + '</option>')
    .join("");

  const saved = localStorage.getItem("shBgChoice") || "none";
  sel.value = BACKGROUNDS.some((b) => b.id === saved) ? saved : "none";
  _applyBackground(sel.value);

  sel.addEventListener("change", () => {
    localStorage.setItem("shBgChoice", sel.value);
    _applyBackground(sel.value);
  });
}

function _applyBackground(id) {
  const bg = BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
  const root = document.documentElement;
  if (!bg.file) {
    root.classList.remove("sh-bg-on");
    root.style.removeProperty("--sh-bg-url");
  } else {
    root.style.setProperty("--sh-bg-url", 'url("' + bg.file + '")');
    root.classList.add("sh-bg-on");
  }
}

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

  // Набої / Гранати. Уже введене не стирається: якщо почав писати DM51
  // як набої — просто перемикаєш на «Гранати».
  document.querySelectorAll(".sh-kind-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.kind !== _formKind) _setFormKind(btn.dataset.kind);
    });
  });

  // Enter веде до наступного поля, а в останньому — зберігає.
  // У гранат калібру немає — його пропускаємо.
  const chain = () => _formKind === "grenade"
    ? ["shWeapon", "shAmmoType", "shCount"]
    : ["shWeapon", "shCaliber", "shAmmoType", "shCount"];
  ["shWeapon", "shCaliber", "shAmmoType", "shCount"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const c = chain();
      const i = c.indexOf(id);
      if (i === -1 || i === c.length - 1) _handleSave();
      else document.getElementById(c[i + 1])?.focus();
    });
  });

  _setFormKind(_formKind);
}

// Підписи, підказки й списки автодоповнення під тип запису
const KIND_UI = {
  rounds: {
    weapon: "Зброя", weaponPh: "Напр. АКМ", weaponList: "shWeaponList",
    ammo: "Тип набою", ammoPh: "ПС / M855", ammoList: "shAmmoList",
  },
  grenade: {
    weapon: "Граната", weaponPh: "Напр. DM51 A3", weaponList: "shGrenadeList",
    ammo: "Тип гранати", ammoPh: "Бойова / навчальна", ammoList: "shGrenadeTypeList",
  },
};

function _setFormKind(kind) {
  _formKind = kind === "grenade" ? "grenade" : "rounds";
  const ui = KIND_UI[_formKind];
  const card = document.querySelector(".sh-form-card");
  if (card) card.classList.toggle("sh-mode-grenade", _formKind === "grenade");
  document.querySelectorAll(".sh-kind-btn").forEach((b) => {
    const on = b.dataset.kind === _formKind;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const weaponEl = document.getElementById("shWeapon");
  const ammoEl = document.getElementById("shAmmoType");
  document.getElementById("shWeaponLabel").textContent = ui.weapon;
  document.getElementById("shAmmoLabel").textContent = ui.ammo;
  weaponEl.placeholder = ui.weaponPh;
  weaponEl.setAttribute("list", ui.weaponList);
  ammoEl.placeholder = ui.ammoPh;
  ammoEl.setAttribute("list", ui.ammoList);
  _updatePreview();
  _updateRepeatBtn();
}

function _onWeaponChange() {
  const weaponEl = document.getElementById("shWeapon");
  if (_formKind !== "grenade") {
    const suggestion = _suggestCaliber(weaponEl.value);
    if (suggestion) document.getElementById("shCaliber").value = suggestion;
  }
  _updatePreview();
}

// Живе прев'ю силуету
function _updatePreview() {
  const prev = document.getElementById("shWeaponPreview");
  if (!prev) return;
  const name = document.getElementById("shWeapon").value;
  const src = _iconSrc(name, _formKind === "grenade");
  if (!prev.src.endsWith(src.replace("../", ""))) prev.src = src;
  prev.classList.toggle("sh-preview-dim", !name.trim());
}

function _buildHistoryCaliberMap() {
  const map = {};
  _allShots.forEach((s) => {
    if (_isGrenade(s)) return;
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
  const refPanel = document.getElementById("shPanelRef");
  if (refPanel) refPanel.classList.toggle("active", tab === "ref");
  // На довіднику вибір фону лише заважає — ховаємо
  const bgRow = document.querySelector(".sh-bg-row");
  if (bgRow) bgRow.style.display = tab === "ref" ? "none" : "";

  if (tab === "stats" && _statsDirty) {
    _renderStatsPanel();
    _statsDirty = false;
  }
  if (tab === "stats" && !_ref) {
    // Боєкомплект для статистики лежить у довіднику — тягнемо його у фоні
    _loadRef().then(() => { if (_activeSubTab === "stats") _renderStatsPanel(); }).catch(() => {});
  }
  if (tab === "ref") _openRefTab();
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
    _updateRepeatBtn();
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
    const cache = { weapon: {}, ammo: {}, grenade: {} };
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
    // Набої й гранати не складаємо: «120 шт. · 2 гранати»
    const dayRounds = _sumCount(items.filter((x) => !_isGrenade(x)));
    const dayGrenades = _sumCount(items.filter(_isGrenade));
    const totals = [];
    if (dayRounds || !dayGrenades) totals.push(dayRounds + " шт.");
    if (dayGrenades) totals.push(dayGrenades + " " + _plural(dayGrenades, ["граната", "гранати", "гранат"]));

    html += '<div class="sh-day-group">' +
      '<div class="sh-day-header">' +
        '<span class="sh-day-date">' + _esc(_fmtDate(date)) + '</span>' +
        '<span class="sh-day-total">' + totals.join(" · ") + '</span>' +
      '</div>';

    items.forEach((it) => {
      const grenade = _isGrenade(it);
      let mid;
      if (grenade) {
        // Граната: без калібру; тип — просто текст (ТТХ набою до нього не прив'язане)
        mid = it.ammo_type ? ' <span class="sh-sep">|</span> <span class="sh-ammo">' + _esc(it.ammo_type) + '</span>' : '';
      } else {
        mid = ' <span class="sh-sep">|</span> <span class="sh-caliber">' + _esc(it.caliber) + '</span>' +
          (it.ammo_type
            ? ' <span class="sh-sep">|</span> <span class="sh-ammo sh-ammo-link" data-ammotype="' +
              _escAttr(it.ammo_type) + '" data-caliber="' + _escAttr(it.caliber) + '">' + _esc(it.ammo_type) + '</span>'
            : '');
      }
      html += '<div class="sh-entry' + (grenade ? ' sh-entry-grenade' : '') + '">' +
        _iconImg("sh-entry-icon", it.weapon, grenade) +
        '<div class="sh-entry-text">' +
          '<span class="sh-weapon sh-weapon-link" data-weapon="' + _escAttr(it.weapon) + '" data-kind="' + _kindOf(it) + '">' + _esc(it.weapon) + '</span>' +
          mid +
          ' <span class="sh-dash">—</span> <span class="sh-count">' + (parseInt(it.count) || 0) + ' шт.</span>' +
        '</div>' +
        '<div class="sh-entry-actions">' +
          '<button class="sh-mini-btn sh-edit" data-id="' + _escAttr(it.id) + '" title="Редагувати">✎</button>' +
          '<button class="sh-mini-btn sh-del" data-id="' + _escAttr(it.id) + '" title="Видалити">✕</button>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll(".sh-edit").forEach((btn) => btn.addEventListener("click", () => _editEntry(btn.dataset.id)));
  container.querySelectorAll(".sh-del").forEach((btn) => btn.addEventListener("click", () => _deleteEntry(btn.dataset.id)));
  container.querySelectorAll(".sh-weapon-link").forEach((el) => {
    el.addEventListener("click", () => _openTtxModal(el.dataset.kind === "grenade" ? "grenade" : "weapon", el.dataset.weapon, el.dataset.weapon));
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
  const grenadeFreq = {};
  const grenadeTypeFreq = {};
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };

  _allShots.forEach((s) => {
    if (_isGrenade(s)) {
      if (s.weapon) bump(grenadeFreq, s.weapon);
      if (s.ammo_type) bump(grenadeTypeFreq, s.ammo_type);
      return;
    }
    if (s.weapon) bump(weaponFreq, s.weapon);
    if (s.caliber) caliberSet.add(s.caliber);
    if (s.ammo_type) bump(ammoFreq, s.ammo_type);
  });

  const byFreq = (m) => Object.keys(m).sort((a, b) => m[b] - m[a]);
  const weapons = byFreq(weaponFreq);
  const calibers = Array.from(caliberSet).sort();
  const grenades = byFreq(grenadeFreq);

  // Спочатку — те, що вже є у твоєму журналі, далі — зразки з довідника
  const withRef = (own, ref) => own.concat(ref.filter((n) => !own.some((w) => _refKey(w) === _refKey(n))));

  _fillDatalist("shWeaponList", withRef(weapons, _weaponIndex.map((w) => w.name)));
  _fillDatalist("shCaliberList", withRef(calibers, _calibers));
  _fillDatalist("shAmmoList", byFreq(ammoFreq));
  _fillDatalist("shGrenadeList", withRef(grenades, _grenadeIndex.map((g) => g.name)));
  _fillDatalist("shGrenadeTypeList", byFreq(grenadeTypeFreq));
}

function _fillDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = values.map((v) => '<option value="' + _escAttr(v) + '"></option>').join("");
}

// ================================================================
//  TOAST — підтвердження дій
// ================================================================
function _toast(msg, kind) {
  const old = document.getElementById("shToast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.id = "shToast";
  t.className = "sh-toast" + (kind === "err" ? " sh-toast-err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("sh-toast-show"));
  setTimeout(() => {
    t.classList.remove("sh-toast-show");
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

function _toastErr(err) {
  console.error(err);
  if (err && err.code === "permission-denied") _toast("Доступ заборонено — перевір Firestore rules", "err");
  else _toast("Помилка: " + (err && err.message ? err.message : err), "err");
}

// Запис у базу: сервер чекаємо не довше 2,5 с. Без мережі (полігон) запис
// уже лежить у кеші телефона й сам піде в хмару, коли з'явиться зв'язок, —
// форма не висить на «Збереження...». "ok" — сервер прийняв, "slow" — офлайн.
const OFFLINE_NOTE = " · офлайн, синхронізується пізніше";
async function _commit(promise) {
  const res = await Promise.race([
    promise.then(() => "ok"),
    new Promise((r) => setTimeout(() => r("slow"), 2500)),
  ]);
  if (res === "slow") promise.catch(_toastErr);
  return res;
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

  const grenade = _formKind === "grenade";
  const date = dateEl.value || _todayLocal();
  const weapon = weaponEl.value.trim();
  const caliber = grenade ? "" : caliberEl.value.trim();
  const ammo_type = ammoEl.value.trim();
  const count = parseInt(countEl.value);

  if (!weapon) { _toast(grenade ? "Вкажи гранату" : "Вкажи зброю", "err"); weaponEl.focus(); return; }
  if (!grenade && !caliber) { _toast("Вкажи калібр", "err"); caliberEl.focus(); return; }
  if (!count || count <= 0) { _toast(grenade ? "Вкажи кількість гранат" : "Вкажи кількість набоїв", "err"); countEl.focus(); return; }
  if (count > (grenade ? 1000 : 100000)) { _toast("Забагато — перевір кількість", "err"); countEl.focus(); return; }
  if (date > _todayLocal()) {
    if (!confirm("Дата у майбутньому (" + _fmtDate(date) + "). Все одно зберегти?")) { dateEl.focus(); return; }
  }

  const uid = auth.currentUser.uid;
  saveBtn.disabled = true;
  saveBtn.textContent = "Збереження...";

  try {
    if (_editingId) {
      // Тип можна змінити й у старому записі (набої → гранати і навпаки)
      const res = await _commit(updateDoc(doc(db, "shooting_logs", _editingId), {
        date, weapon, caliber, ammo_type, count, updatedAt: Date.now(),
        kind: grenade ? "grenade" : deleteField(),
      }));
      _editingId = null;
      document.getElementById("shCancelEditBtn").style.display = "none";
      _toast("Запис оновлено" + (res === "slow" ? OFFLINE_NOTE : ""));
    } else {
      const data = { date, weapon, caliber, ammo_type, count, timestamp: Date.now(), userId: uid, createdAt: Date.now() };
      if (grenade) data.kind = "grenade";
      _scrollToEndOnNextRender = true;
      let res;
      try {
        res = await _commit(addDoc(collection(db, "shooting_logs"), data));
      } catch (err) {
        _scrollToEndOnNextRender = false;
        throw err;
      }
      _toast("Записано: " + weapon + " — " + count + " шт." + (res === "slow" ? OFFLINE_NOTE : ""));
    }
    // Запам'ятовуємо для кнопки «Повторити останній» — окремо для набоїв і гранат
    _lastEntry[grenade ? "grenade" : "rounds"] = { date, weapon, caliber, ammo_type, count };
    _resetFormFields();
    _updateRepeatBtn();
  } catch (err) {
    _toastErr(err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = _editingId ? "💾 Оновити запис" : "Записати";
  }
}

// Останній запис того типу, що зараз у формі
function _lastOfKind(kind) {
  return _lastEntry[kind] || _allShots.find((s) => _kindOf(s) === kind) || null;
}

// Кнопка «Повторити останній» — швидке додавання однотипних записів
function _updateRepeatBtn() {
  const btn = document.getElementById("shRepeatBtn");
  if (!btn) return;
  const kind = _formKind;
  const src = _lastOfKind(kind);
  if (!src || !src.weapon) { btn.style.display = "none"; return; }
  btn.style.display = "block";
  btn.textContent = "↻ Повторити: " + src.weapon +
    (src.ammo_type ? " · " + src.ammo_type : "") + " · " + src.count + " шт.";
  btn.onclick = () => {
    if (_formKind !== kind) _setFormKind(kind);
    document.getElementById("shWeapon").value = src.weapon || "";
    document.getElementById("shCaliber").value = kind === "grenade" ? "" : (src.caliber || "");
    document.getElementById("shAmmoType").value = src.ammo_type || "";
    document.getElementById("shCount").value = src.count || "";
    _onWeaponChange();
    document.getElementById("shCount").focus();
    _toast("Поля заповнено — перевір і тисни «Записати»");
  };
}

function _resetFormFields() {
  const weaponEl = document.getElementById("shWeapon");
  const caliberEl = document.getElementById("shCaliber");
  const ammoEl = document.getElementById("shAmmoType");
  const countEl = document.getElementById("shCount");
  weaponEl.value = ""; caliberEl.value = ""; ammoEl.value = ""; countEl.value = "";
  document.getElementById("shSaveBtn").textContent = "Записати";
  _updatePreview();
  weaponEl.focus();
}

function _editEntry(id) {
  const entry = _allShots.find((s) => s.id === id);
  if (!entry) return;

  _editingId = id;
  _setFormKind(_kindOf(entry));
  document.getElementById("shDate").value = entry.date;
  document.getElementById("shWeapon").value = entry.weapon || "";
  document.getElementById("shCaliber").value = entry.caliber || "";
  document.getElementById("shAmmoType").value = entry.ammo_type || "";
  document.getElementById("shCount").value = entry.count;
  _updatePreview();

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
    const res = await _commit(deleteDoc(doc(db, "shooting_logs", id)));
    if (_editingId === id) _cancelEdit();
    if (res === "slow") _toast("Видалено" + OFFLINE_NOTE);
  } catch (err) {
    _toastErr(err);
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

  // Гранати — окремим блоком: у «Загальний настріл», калібри й «По зброї» не потрапляють
  const rounds = _allShots.filter((s) => !_isGrenade(s));
  const grenades = _allShots.filter(_isGrenade);
  let html = "";
  if (rounds.length) {
    html += _renderStatsOverview(rounds) +
      '<div class="sh-stats-section-title">Розподіл за калібрами</div>' +
      _renderCaliberBars(rounds) +
      '<div class="sh-stats-section-title">По зброї</div>' +
      '<div class="sh-weapon-cards">' + _renderWeaponCards(rounds) + '</div>';
  }
  if (grenades.length) {
    html += '<div class="sh-stats-section-title">Гранати</div>' + _renderGrenadeStats(grenades);
  }
  panel.innerHTML = html;

  panel.querySelectorAll(".sh-weapon-link").forEach((el) => {
    el.addEventListener("click", () => _openTtxModal(el.dataset.kind === "grenade" ? "grenade" : "weapon", el.dataset.weapon, el.dataset.weapon));
  });
  panel.querySelectorAll(".sh-ammo-link").forEach((el) => {
    el.addEventListener("click", () => _openAmmoTtx(el.dataset.ammotype, el.dataset.caliber));
  });
}

function _renderStatsOverview(rounds) {
  return '<div class="sh-stats-overview">' +
    '<div class="sh-stat-box sh-stat-big"><div class="sh-stat-num">' + _sumCount(rounds) + '</div><div class="sh-stat-lbl">Загальний настріл</div></div>' +
    '<div class="sh-stat-box"><div class="sh-stat-num">' + rounds.length + '</div><div class="sh-stat-lbl">Кількість сесій</div></div>' +
  '</div>';
}

function _renderGrenadeStats(list) {
  const byName = {};
  list.forEach((s) => {
    const norm = _norm(s.weapon);
    if (!byName[norm]) byName[norm] = { name: s.weapon, sessions: 0, count: 0, types: {} };
    const g = byName[norm];
    const n = parseInt(s.count) || 0;
    g.sessions += 1;
    g.count += n;
    const t = s.ammo_type && s.ammo_type.trim() ? s.ammo_type.trim() : "(без типу)";
    g.types[t] = (g.types[t] || 0) + n;
  });
  const cards = Object.values(byName).sort((a, b) => b.count - a.count).map((g) => {
    const chips = Object.keys(g.types).sort((a, b) => g.types[b] - g.types[a])
      .map((t) => '<span class="sh-ammo-chip">' + g.types[t] + ' ' + _esc(t) + '</span>').join(" ");
    return '<div class="sh-weapon-card sh-grenade-card">' +
      '<div class="sh-weapon-card-top">' +
        _iconImg("sh-card-icon", g.name, true) +
        '<span class="sh-weapon-card-name sh-weapon-link" data-weapon="' + _escAttr(g.name) + '" data-kind="grenade">' + _esc(g.name) + '</span>' +
      '</div>' +
      '<div class="sh-weapon-card-stats">' + g.sessions + ' ' + _plural(g.sessions, ["метання", "метання", "метань"]) +
        '<span class="sh-dot">•</span>' + g.count + ' шт.</div>' +
      '<div class="sh-weapon-card-ammo">' + chips + '</div>' +
    '</div>';
  }).join("");

  return '<div class="sh-stats-overview">' +
      '<div class="sh-stat-box sh-stat-big"><div class="sh-stat-num">' + _sumCount(list) + '</div><div class="sh-stat-lbl">Кинуто гранат</div></div>' +
      '<div class="sh-stat-box"><div class="sh-stat-num">' + list.length + '</div><div class="sh-stat-lbl">Кількість метань</div></div>' +
    '</div>' +
    '<div class="sh-weapon-cards">' + cards + '</div>';
}

function _renderCaliberBars(rounds) {
  const totalRounds = _sumCount(rounds);
  if (totalRounds === 0) return "";

  const byCaliber = {};
  rounds.forEach((s) => {
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

function _renderWeaponCards(rounds) {
  const byWeapon = {};
  rounds.forEach((s) => {
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
        _iconImg("sh-card-icon", w.name, false) +
        '<span class="sh-weapon-card-name sh-weapon-link" data-weapon="' + _escAttr(w.name) + '" data-kind="rounds">' + _esc(w.name) + '</span>' +
        '<span class="sh-weapon-card-caliber sh-ammo-link" data-ammotype="" data-caliber="' + _escAttr(w.caliber) + '">' + _esc(w.caliber) + '</span>' +
      '</div>' +
      '<div class="sh-weapon-card-stats">' + w.sessions + ' ' + _plural(w.sessions, ["стрільба", "стрільби", "стрільб"]) +
        '<span class="sh-dot">•</span>' + w.rounds + ' шт.' + _bkBadge(w) + '</div>' +
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
  const at = (ammoType || "").trim();
  const cal = (caliber || "").trim();
  // Ключ = "калібр · тип", інакше «ПС» для 7,62×39 і 5,45×39 злипнуться в один запис ТТХ
  const key = at ? (cal + " · " + at) : cal;
  const displayName = at ? (at + " (" + cal + ")") : cal;
  _openTtxModal("ammo", key, displayName, cal);
}

let _ttxCurrent = null;
function _openTtxModal(kind, key, displayName, fallbackCaliber) {
  _ttxCurrent = { kind, key, displayName, fallbackCaliber };
  const mark = kind === "weapon" ? "🔫 " : kind === "grenade" ? "💣 " : "🧿 ";
  document.getElementById("shTtxTitle").textContent = mark + displayName;

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
  const fields = _ttxFields(kind);
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

  body.innerHTML = rowsHtml +
    '<button class="sh-ttx-edit-btn" id="shTtxEditBtn">✎ Редагувати ТТХ</button>' +
    '<button class="sh-ttx-ref-btn" id="shTtxRefBtn">📖 Знайти в довіднику</button>';
  document.getElementById("shTtxEditBtn").addEventListener("click", () => {
    _renderTtxEdit(kind, key, data, fallbackCaliber, false);
  });
  document.getElementById("shTtxRefBtn").addEventListener("click", () => _refFind(_ttxRefQuery()));
}

// Що шукати в довіднику для відкритої картки ТТХ
function _ttxRefQuery() {
  if (!_ttxCurrent) return "";
  if (_ttxCurrent.kind !== "ammo") return _ttxCurrent.key || _ttxCurrent.displayName;
  return _ttxCurrent.fallbackCaliber || _ttxCurrent.displayName || "";
}

function _renderTtxEdit(kind, key, currentData, fallbackCaliber, isNew) {
  const fields = _ttxFields(kind);
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

  body.innerHTML = stubNote +
    '<button class="sh-af-btn" id="shTtxAfBtn">📥 Узяти з довідника</button>' +
    rowsHtml +
    '<button class="sh-save-btn" id="shTtxSaveBtn">💾 Зберегти ТТХ</button>' +
    '<button class="sh-ttx-ref-btn" id="shTtxRefBtn">📖 Подивитись у довіднику</button>' +
    (isNew ? "" : '<button class="sh-cancel-btn" id="shTtxCancelBtn" style="display:block">✕ Скасувати</button>');

  document.getElementById("shTtxSaveBtn").addEventListener("click", () => _saveTtx(kind, key, fallbackCaliber));
  document.getElementById("shTtxRefBtn").addEventListener("click", () => _refFind(_ttxRefQuery()));
  document.getElementById("shTtxAfBtn").addEventListener("click", () => _openTtxAutofill(kind, key, fallbackCaliber));
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
    const res = await _commit(setDoc(doc(db, "shooting_specs", docId), payload));
    if (!_specsCache[kind]) _specsCache[kind] = {};
    _specsCache[kind][_norm(key)] = values;
    _renderTtxView(kind, key, values, fallbackCaliber);
    if (res === "slow") _toast("ТТХ збережено" + OFFLINE_NOTE);
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

// ================================================================
//  ДОВІДНИК
//  Дані — у reference.js (ТТХ зброї, боєприпаси, приціли, техніка,
//  конспект з вогневої підготовки). Файл вантажиться один раз, коли
//  вперше відкривається вкладка «Довідник» або «Статистика».
// ================================================================
function _loadRef() {
  if (_ref) return Promise.resolve(_ref);
  if (_refLoading) return _refLoading;
  _refLoading = import("./reference.js").then((mod) => {
    _ref = mod.REFERENCE || [];
    _ammoLoad = mod.AMMO_LOAD || {};
    _weaponIndex = mod.WEAPON_INDEX || [];
    _grenadeIndex = _buildGrenadeIndex(_ref);
    _calibers = mod.CALIBERS || [];
    _refLoading = null;
    return _ref;
  }).catch((e) => {
    _refLoading = null;
    console.error("reference.js:", e);
    throw e;
  });
  return _refLoading;
}

// Ручні гранати з таблиці довідника: колонки «ТТХ ручних гранат · РГД-5» тощо
function _buildGrenadeIndex(ref) {
  const out = [];
  (ref || []).forEach((d) => d.blocks.forEach((b, bi) => {
    if (b.t !== "table") return;
    if (!/ручн\S*\s+гранат/i.test((b.caption || "") + " " + (b.header[0] || ""))) return;
    b.header.forEach((h, col) => {
      if (col === 0) return;
      const name = String(h).split("·").pop().trim();
      if (!name || out.some((x) => _refKey(x.name) === _refKey(name))) return;
      out.push({ name, doc: d.id, bi, col });
    });
  }));
  return out;
}

function _openRefTab() {
  const panel = document.getElementById("shPanelRef");
  if (!panel) return;
  if (!_ref) {
    panel.innerHTML = '<div class="sh-empty">Завантаження довідника…</div>';
    _loadRef().then(() => {
      if (_activeSubTab === "ref") _renderRef();
    }).catch(() => {
      panel.innerHTML = '<div class="sh-err">Довідник не завантажився. Перевір, що файл <b>reference.js</b> лежить поряд із shooting.js.</div>';
    });
    return;
  }
  _renderRef();
}

// Каркас вкладки будуємо один раз, далі оновлюємо лише тіло — щоб
// поле пошуку не втрачало фокус під час набору.
function _renderRef() {
  const panel = document.getElementById("shPanelRef");
  if (!panel) return;
  if (panel.dataset.built !== "1") {
    panel.innerHTML =
      '<div class="sh-ref-top">' +
        '<button id="shRefBack" class="sh-ref-back" style="display:none">← Розділи</button>' +
        '<input type="search" id="shRefSearch" class="sh-input sh-ref-search" placeholder="Пошук: АК-74, темп стрільби, РПГ-26…" autocomplete="off" enterkeyhint="search" />' +
      "</div>" +
      '<div id="shRefBody"></div>';
    panel.dataset.built = "1";

    let t = null;
    const input = document.getElementById("shRefSearch");
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        _refView.query = input.value;
        _refView.focus = -1;
        if (_norm(_refView.query).length >= 2) _refView.doc = null;
        _renderRefBody();
      }, 160);
    });
    document.getElementById("shRefBack").addEventListener("click", () => {
      _refView.doc = null;
      _refView.focus = -1;
      _renderRefBody();
    });
    document.getElementById("shRefBody").addEventListener("click", _onRefBodyClick);
    _initRefSheet();
  }
  const inp = document.getElementById("shRefSearch");
  if (inp && inp.value !== _refView.query) inp.value = _refView.query;
  _renderRefBody();
}

function _renderRefBody() {
  const body = document.getElementById("shRefBody");
  const back = document.getElementById("shRefBack");
  if (!body) return;
  const q = _norm(_refView.query);

  if (_refView.doc) {
    back.style.display = "block";
    body.innerHTML = _refDocHtml(_refView.doc);
    if (_refView.focus >= 0) {
      const el = body.querySelector('[data-bi="' + _refView.focus + '"]');
      if (el) {
        el.classList.add("sh-ref-hit");
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
    }
    return;
  }
  back.style.display = "none";
  body.innerHTML = q.length >= 2 ? _refSearchHtml(q) : _refHomeHtml();
}

function _refHomeHtml() {
  const sections = [];
  _ref.forEach((d) => {
    let s = sections.find((x) => x.name === d.section);
    if (!s) { s = { name: d.section, docs: [] }; sections.push(s); }
    s.docs.push(d);
  });
  return sections.map((s) =>
    '<div class="sh-stats-section-title">' + _esc(s.name) + "</div>" +
    s.docs.map((d) =>
      '<button type="button" class="sh-ref-card" data-doc="' + _escAttr(d.id) + '">' +
        '<div class="sh-ref-card-title">' + _esc(d.title) + "</div>" +
        (d.subtitle ? '<div class="sh-ref-card-sub">' + _esc(d.subtitle) + "</div>" : "") +
        '<div class="sh-ref-card-meta">' + _refDocMeta(d) + "</div>" +
      "</button>").join("")
  ).join("");
}

function _refDocMeta(d) {
  const tables = d.blocks.filter((b) => b.t === "table").length;
  const texts = d.blocks.filter((b) => b.t !== "table").length;
  const parts = [];
  if (tables) parts.push(tables + " табл.");
  if (texts) parts.push(texts + " абз.");
  return parts.join(" · ");
}

function _refBlockText(b) {
  if (b.t === "table") {
    return [b.caption || ""].concat(b.header, b.rows.map((r) => r.join(" "))).join(" ");
  }
  return b.v;
}

function _refSearchHtml(q) {
  const words = q.split(" ").filter(Boolean);
  const hits = [];
  _ref.forEach((d) => {
    d.blocks.forEach((b, bi) => {
      if (b.t === "table") {
        const rows = [];
        const headHit = words.every((w) => _norm(b.header.join(" ") + " " + (b.caption || "")).includes(w));
        b.rows.forEach((r) => {
          if (words.every((w) => _norm(r.join(" ")).includes(w))) rows.push(r);
        });
        if (rows.length || headHit) {
          hits.push({ doc: d, bi, kind: "table",
            title: b.caption || d.title,
            snippet: rows.slice(0, 3).map((r) => r.filter(Boolean).slice(0, 4).join(" · ").replace(/\n/g, " ")).join(" | ") ||
              b.header.filter(Boolean).slice(0, 5).join(" · ") });
        }
      } else if (words.every((w) => _norm(b.v).includes(w))) {
        hits.push({ doc: d, bi, kind: "text", title: d.title, snippet: b.v.slice(0, 160) });
      }
    });
  });
  if (!hits.length) return '<div class="sh-empty">Нічого не знайдено. Спробуй іншу назву або частину слова.</div>';
  return '<div class="sh-ref-found">Знайдено: ' + hits.length + "</div>" +
    hits.slice(0, 60).map((h) =>
      '<button type="button" class="sh-ref-hit-card" data-doc="' + _escAttr(h.doc.id) + '" data-bi="' + h.bi + '">' +
        '<div class="sh-ref-hit-doc">' + _esc(h.doc.title) + "</div>" +
        '<div class="sh-ref-hit-title">' + (h.kind === "table" ? "📊 " : "") + _esc(h.title) + "</div>" +
        '<div class="sh-ref-hit-snippet">' + _esc(h.snippet) + "</div>" +
      "</button>").join("");
}

function _refDocHtml(docId) {
  const d = _ref.find((x) => x.id === docId);
  if (!d) return '<div class="sh-empty">Розділ не знайдено.</div>';
  return '<div class="sh-ref-doc-title">' + _esc(d.title) + "</div>" +
    (d.subtitle ? '<div class="sh-ref-doc-sub">' + _esc(d.subtitle) + "</div>" : "") +
    d.blocks.map((b, bi) => {
      if (b.t === "h") return '<div class="sh-ref-h" data-bi="' + bi + '">' + _esc(b.v) + "</div>";
      if (b.t === "p") return '<div class="sh-ref-p" data-bi="' + bi + '">' + _esc(b.v) + "</div>";
      return _refTableHtml(b, bi);
    }).join("");
}

function _refTableHtml(tbl, bi) {
  const head = "<tr>" + tbl.header.map((h, i) =>
    '<th class="' + (i === 0 ? "sh-rt-first" : "") + '">' + _esc(h) + "</th>").join("") + "</tr>";
  const rows = tbl.rows.map((r, ri) =>
    '<tr data-row="' + ri + '">' + r.map((c, i) =>
      '<td class="' + (i === 0 ? "sh-rt-first" : "") + '">' + _esc(c) + "</td>").join("") + "</tr>").join("");
  return '<div class="sh-rt-block" data-bi="' + bi + '">' +
    (tbl.caption ? '<div class="sh-rt-caption">' + _esc(tbl.caption) + "</div>" : "") +
    (tbl.header.length >= 3
      ? '<button type="button" class="sh-rt-col-btn" data-bi="' + bi + '">📋 Показати один зразок вертикально</button>'
      : "") +
    '<div class="sh-rt-scroll"><table class="sh-rt">' + head + rows + "</table></div>" +
    '<div class="sh-rt-hint">Натисни на рядок таблиці — розгорнеться вертикально</div>' +
    "</div>";
}

function _onRefBodyClick(e) {
  const hit = e.target.closest(".sh-ref-hit-card");
  if (hit) {
    _refView.doc = hit.dataset.doc;
    _refView.focus = parseInt(hit.dataset.bi);
    _renderRefBody();
    return;
  }
  const card = e.target.closest(".sh-ref-card");
  if (card) {
    _refView.doc = card.dataset.doc;
    _refView.focus = -1;
    _renderRefBody();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const colBtn = e.target.closest(".sh-rt-col-btn");
  if (colBtn) { _openRefColPicker(parseInt(colBtn.dataset.bi)); return; }
  const tr = e.target.closest(".sh-rt tr[data-row]");
  if (tr) {
    const block = tr.closest(".sh-rt-block");
    _openRefRow(parseInt(block.dataset.bi), parseInt(tr.dataset.row));
  }
}

function _refTable(bi) {
  const d = _ref.find((x) => x.id === _refView.doc);
  if (!d) return null;
  const b = d.blocks[bi];
  return b && b.t === "table" ? b : null;
}

function _refPairsHtml(pairs) {
  const rows = pairs.filter((p) => String(p[1]).trim() !== "").map((p) =>
    '<div class="sh-ttx-row"><span class="sh-ttx-label">' + _esc(p[0]) + '</span><span class="sh-ttx-val">' + _esc(p[1]) + "</span></div>").join("");
  return rows || '<div class="sh-empty">Порожньо.</div>';
}

function _openRefRow(bi, ri) {
  const tbl = _refTable(bi);
  if (!tbl) return;
  const row = tbl.rows[ri];
  if (!row) return;
  const title = (row[0] || tbl.caption || "Рядок").replace(/\n/g, " · ");
  const pairs = row.map((c, i) => [tbl.header[i] || "", c]).slice(1);
  _openRefSheet(title, _refPairsHtml(pairs));
}

function _openRefColPicker(bi) {
  const tbl = _refTable(bi);
  if (!tbl) return;
  const items = tbl.header.map((h, i) => ({ h, i })).slice(1).filter((x) => x.h.trim());
  const html = items.map((x) =>
    '<button type="button" class="sh-ref-pick" data-bi="' + bi + '" data-col="' + x.i + '">' + _esc(x.h.replace(/\n/g, " · ")) + "</button>").join("");
  _openRefSheet(tbl.caption || "Оберіть зразок", '<div class="sh-ref-picks">' + html + "</div>");
}

function _openRefCol(bi, col) {
  const tbl = _refTable(bi);
  if (!tbl) return;
  const title = (tbl.header[col] || "").replace(/\n/g, " · ");
  const pairs = tbl.rows.map((r) => [r[0] || "", r[col] || ""]);
  _openRefSheet(title, _refPairsHtml(pairs));
}

function _initRefSheet() {
  if (_refSheetInited) return;
  _refSheetInited = true;
  const ov = document.getElementById("shRefSheet");
  if (!ov) return;
  document.getElementById("shRefSheetClose").addEventListener("click", _closeRefSheet);
  ov.addEventListener("click", (e) => { if (e.target === ov) _closeRefSheet(); });
  document.getElementById("shRefSheetBody").addEventListener("click", (e) => {
    const af = e.target.closest(".sh-af-pick");
    if (af) {
      const res = _autofillAmmo(parseInt(af.dataset.ri));
      if (res) _showAutofillSheet("ammo", res); else _toast("У рядку немає числових даних", "err");
      return;
    }
    if (e.target.closest("#shAfApply")) { _applyAutofill(); return; }
    const pick = e.target.closest(".sh-ref-pick");
    if (pick && pick.dataset.col !== undefined) _openRefCol(parseInt(pick.dataset.bi), parseInt(pick.dataset.col));
  });
}

function _openRefSheet(title, bodyHtml) {
  _initRefSheet();
  document.getElementById("shRefSheetTitle").textContent = title;
  document.getElementById("shRefSheetBody").innerHTML = bodyHtml;
  document.getElementById("shRefSheet").classList.add("sh-ttx-visible");
}

function _closeRefSheet() {
  document.getElementById("shRefSheet").classList.remove("sh-ttx-visible");
}

// Перехід із ТТХ у довідник: шукаємо зброю або набій за назвою
function _refFind(queryText) {
  _closeTtxModal();
  _refView = { doc: null, query: String(queryText || "").trim(), focus: -1 };
  _switchSubTab("ref");
  const inp = document.getElementById("shRefSearch");
  if (inp) inp.value = _refView.query;
  if (_ref) _renderRefBody();
}

// Боєкомплект для зброї з журналу (з таблиці БК довідника)
function _bkFor(weaponName) {
  const n = _norm(weaponName).replace(/[\s"'«»]/g, "");
  if (!n) return null;
  let best = null;
  Object.keys(_ammoLoad || {}).forEach((k) => {
    const kn = _norm(k).replace(/[\s"'«»]/g, "");
    if (!kn) return;
    if (n === kn || n.startsWith(kn) || kn.startsWith(n)) {
      if (!best || kn.length > best.kn.length) best = { kn, name: k, data: _ammoLoad[k] };
    }
  });
  return best && best.data && best.data.at > 0 ? best : null;
}

// Значок «скільки це боєкомплектів» у картці зброї (дані з таблиці БК довідника)
function _bkBadge(w) {
  const bk = _bkFor(w.name);
  if (!bk) return "";
  const n = w.rounds / bk.data.at;
  const txt = n >= 10 ? Math.round(n) : (Math.round(n * 10) / 10).toString().replace(".", ",");
  return '<span class="sh-dot">•</span><span class="sh-bk" title="Боєкомплект при зброї для ' + _escAttr(bk.name) +
    ": " + bk.data.at + ' шт.">≈ ' + txt + " БК</span>";
}

// ================================================================
//  АВТОЗАПОВНЕННЯ ТТХ ІЗ ДОВІДНИКА
//  Значення в документах часто складені («440/460», «3.3/5.0»),
//  тому нічого не підставляється мовчки: спершу показуємо, що саме
//  візьмемо, з якого рядка таблиці, і лише після підтвердження
//  вставляємо у форму. Зберігає ТТХ, як і раніше, тільки ти.
// ================================================================
function _refKey(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[\s«»"“”'’()]/g, "");
}

const TTX_MAP_WEAPON = [
  [/вбив|убійн/i, "lethal_range_m"],
  [/макс.{0,6}дальн.{0,6}польоту|мах\.?\s*дальн/i, "max_range_m"],
  [/калібр/i, "caliber_mm"],
  [/прицільн.{0,25}дальн/i, "sight_range_m"],
  [/прям.{0,6}постріл|пр\s*постр/i, "direct_shot_range_m"],
  [/темп\s*стрільби/i, "rate_of_fire"],
  [/бойова\s*швидкострільн|скорострільн|б[.\\/]?\s*шв/i, "combat_rate"],
  [/поч.{0,6}швидк|початкова\s*швидк/i, "muzzle_velocity"],
  [/^вага|^маса(?!\s*кулі)/i, "weight_kg"],
];

const TTX_MAP_AMMO = [
  [/^калібр\s*d/i, "bullet_diameter_mm"],
  [/вага\s*патрону/i, "cartridge_mass_g"],
  [/вага\s*кулі/i, "bullet_mass_g"],
  [/вага\s*пороху/i, "powder_mass_g"],
  [/початкова\s*швидкість/i, "v0_ms"],
  [/енергія/i, "e0_j"],
];

// Таблиця «Ручні гранати»: «Маса ящика з гранатами» сюди не потрапляє
const TTX_MAP_GRENADE = [
  [/маса\s*заряджен|^маса\s*гранат/i, "mass_g"],
  [/вибухов/i, "explosive_g"],
  [/радіус/i, "lethal_radius_m"],
  [/дальність\s*кидка/i, "throw_range_m"],
  [/час\s*горіння|сповільн/i, "fuse_delay_s"],
];

// Перше число з клітинки. Мінус не беремо: від'ємних ТТХ немає, а «До-25»
// чи «3,2-4,2» — це діапазони, не знак.
function _firstNumber(text) {
  const m = String(text).replace(/ /g, " ").match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0].replace(",", "."));
  return isFinite(v) ? v : null;
}

function _fieldLabel(kind, field) {
  const hit = _ttxFields(kind).find((f) => f[0] === field);
  return hit ? hit[1] : field;
}

function _refTableAt(docId, bi) {
  const d = _ref && _ref.find((x) => x.id === docId);
  const b = d && d.blocks[bi];
  return b && b.t === "table" ? { doc: d, table: b } : null;
}

// Зброя / граната: шукаємо колонку зразка в таблицях довідника
function _refIndexMatch(index, name) {
  const n = _refKey(name);
  if (!n || !index.length) return null;
  let exact = null;
  let partial = null;
  index.forEach((w) => {
    const k = _refKey(w.name);
    if (k === n) { if (!exact) exact = w; return; }
    if (!partial && n.length >= 3 && k.length >= 3 && (k.startsWith(n) || n.startsWith(k))) partial = w;
  });
  return exact || partial;
}

// Значення з колонки зразка: рядки таблиці → поля ТТХ за картою map
function _autofillColumn(kind, hit, map) {
  if (!hit) return null;
  const at = _refTableAt(hit.doc, hit.bi);
  if (!at) return null;
  const used = {};
  const items = [];
  at.table.rows.forEach((r) => {
    const label = String(r[0] || "").replace(/\n/g, " ");
    const raw = String(r[hit.col] || "").trim();
    if (!raw || raw === "-" || raw === "—") return;
    const rule = map.find((m) => m[0].test(label));
    if (!rule || used[rule[1]]) return;
    const value = _firstNumber(raw);
    if (value === null) return;
    used[rule[1]] = true;
    items.push({ field: rule[1], label: _fieldLabel(kind, rule[1]), value, raw, srcLabel: label });
  });
  return items.length ? { source: at.doc.title + " · " + hit.name, items } : null;
}

function _autofillWeapon(name) {
  return _autofillColumn("weapon", _refIndexMatch(_weaponIndex, name), TTX_MAP_WEAPON);
}

function _autofillGrenade(name) {
  return _autofillColumn("grenade", _refIndexMatch(_grenadeIndex, name), TTX_MAP_GRENADE);
}

// Набої: таблиця «Характеристики патронів»
function _ammoTable() {
  const d = _ref && _ref.find((x) => x.id === "ammo");
  if (!d) return null;
  const tables = d.blocks.map((b, bi) => ({ b, bi })).filter((x) => x.b.t === "table");
  const hit = tables.find((x) => /характеристики патронів/i.test(x.b.caption || "")) || tables[1];
  return hit ? { doc: d, table: hit.b } : null;
}

function _ammoCandidates(caliberText) {
  const at = _ammoTable();
  if (!at) return [];
  const digits = String(caliberText).replace(/\D/g, "");
  const base = (String(caliberText).match(/\d{1,2}[.,]\d{1,2}/) || [""])[0].replace(".", ",");
  const calCol = at.table.header.findIndex((h) => /^калібр/i.test(h));
  const exact = [];
  const loose = [];
  at.table.rows.forEach((r, ri) => {
    const nameDigits = (String(r[0]).match(/^[\d.,]+/) || [""])[0].replace(/\D/g, "");
    if (digits && nameDigits && (nameDigits === digits || nameDigits.startsWith(digits) || digits.startsWith(nameDigits))) {
      exact.push(ri);
      return;
    }
    if (base && calCol > 0 && String(r[calCol]).replace(".", ",").trim() === base) loose.push(ri);
  });
  return exact.length ? exact : loose;
}

function _autofillAmmo(ri) {
  const at = _ammoTable();
  if (!at) return null;
  const row = at.table.rows[ri];
  if (!row) return null;
  const used = {};
  const items = [];
  at.table.header.forEach((h, ci) => {
    if (ci === 0) return;
    const label = String(h || "").replace(/\n/g, " ");
    const raw = String(row[ci] || "").trim();
    if (!raw || raw === "-" || raw === "—") return;
    const rule = TTX_MAP_AMMO.find((m) => m[0].test(label));
    if (!rule || used[rule[1]]) return;
    const value = _firstNumber(raw);
    if (value === null) return;
    used[rule[1]] = true;
    items.push({ field: rule[1], label: _fieldLabel("ammo", rule[1]), value, raw, srcLabel: label });
  });
  return items.length ? { source: "Характеристики патронів · " + String(row[0]).replace(/\n/g, " "), items } : null;
}

function _openTtxAutofill(kind, key, fallbackCaliber) {
  if (!_ref) {
    _toast("Довідник ще вантажиться…");
    _loadRef().then(() => _openTtxAutofill(kind, key, fallbackCaliber)).catch(() => _toast("Довідник не завантажився", "err"));
    return;
  }
  if (kind === "weapon" || kind === "grenade") {
    const res = kind === "weapon" ? _autofillWeapon(key) : _autofillGrenade(key);
    if (!res) { _toast("У довіднику немає такого зразка", "err"); return; }
    _showAutofillSheet(kind, res);
    return;
  }
  const cands = _ammoCandidates(fallbackCaliber || key);
  if (!cands.length) { _toast("У довіднику немає такого калібру", "err"); return; }
  if (cands.length === 1) {
    const res = _autofillAmmo(cands[0]);
    if (!res) { _toast("У рядку немає числових даних", "err"); return; }
    _showAutofillSheet(kind, res);
    return;
  }
  const at = _ammoTable();
  const html = '<div class="sh-af-src">Кілька патронів цього калібру — обери потрібний:</div>' +
    '<div class="sh-ref-picks">' + cands.map((ri) =>
      '<button type="button" class="sh-ref-pick sh-af-pick" data-ri="' + ri + '">' +
        _esc(String(at.table.rows[ri][0]).replace(/\n/g, " ")) + "</button>").join("") + "</div>";
  _openRefSheet("Вибір патрона", html);
}

function _showAutofillSheet(kind, res) {
  const rows = res.items.map((it) =>
    '<label class="sh-af-row">' +
      '<input type="checkbox" class="sh-af-cb" checked data-field="' + _escAttr(it.field) + '" data-value="' + _escAttr(it.value) + '" />' +
      '<span class="sh-af-main">' +
        '<span class="sh-af-name">' + _esc(it.label) + "</span>" +
        '<span class="sh-af-src-row">' + _esc(it.srcLabel) + ": «" + _esc(it.raw) + "»</span>" +
      "</span>" +
      '<span class="sh-af-val">' + _esc(it.value) + "</span>" +
    "</label>").join("");
  _openRefSheet("Узяти з довідника", 
    '<div class="sh-af-src">' + _esc(res.source) + "</div>" + rows +
    '<div class="sh-af-note">Значення беруться першим числом із клітинки. Якщо в документі стоїть «440/460», у поле піде 440 — решту вписуй сам.</div>' +
    '<button class="sh-save-btn" id="shAfApply">Вставити у форму</button>');
}

function _applyAutofill() {
  const boxes = document.querySelectorAll("#shRefSheetBody .sh-af-cb");
  let n = 0;
  boxes.forEach((b) => {
    if (!b.checked) return;
    const input = document.querySelector('.sh-ttx-input[data-field="' + b.dataset.field + '"]');
    if (!input) return;
    input.value = b.dataset.value;
    n++;
  });
  _closeRefSheet();
  _toast(n ? "Підставлено значень: " + n + " — перевір і тисни «Зберегти ТТХ»" : "Нічого не вибрано");
}
