// ================================================================
//  cans_module/cans.js — Колекція банок енергетиків
//
//  Firestore:
//    cans       { status: "have" | "want" | "tasted",
//                 brand, name, volume, series, edition, country, year, barcode,
//                 condition, qty, acquiredDate, place, price, giftFrom,
//                 rating, caffeine, sugar, priority, whereToFind, note,
//                 hasPhoto, fromWish, userId, createdAt, updatedAt }
//    can_photos { kind: "t" | "f", canId, data (JPEG dataURL), userId, updatedAt }
//               id = <canId>_t — мініатюра (~10 КБ) для сітки
//               id = <canId>_f — фото (~100 КБ), вантажиться лише в картці
//
//  Фото стискаються на телефоні й лежать у Firestore:
//  Firebase Storage тепер вимагає тарифу Blaze.
// ================================================================

import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where,
  writeBatch, updateDoc, increment,
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

// Автологін (як на інших сторінках)
{
  const se = localStorage.getItem("adminEmail");
  const sp = localStorage.getItem("adminPass");
  if (se && sp && !auth.currentUser) {
    signInWithEmailAndPassword(auth, se, atob(sp)).catch(() => {});
  }
}

const $ = (id) => document.getElementById(id);

// THEME
const themeBtn = $("themeToggle");
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
//  ДОВІДНИКИ — лише підписи полів. Жодних готових банок:
//  підказки у формі беруться тільки з твоєї власної колекції.
// ================================================================
const STATUS_LABEL = { have: "В колекції", want: "Хочу", tasted: "Куштував" };
const EDITION_LABEL = { regular: "Звичайна", limited: "Лімітка", collab: "Колаб", seasonal: "Сезонна", regional: "Регіональна" };
const EDITION_BADGE = { limited: "Лімітка", collab: "Колаб", seasonal: "Сезон", regional: "Регіон" };
const CONDITION_LABEL = { full: "Повна", empty: "Порожня", bottom: "Відкрита знизу", damaged: "Пошкоджена" };
const SUGAR_LABEL = { sugar: "З цукром", zero: "Без цукру" };
const PRIO_LABEL = { 1: "🔥 Дуже хочу", 2: "⭐ Хочу", 3: "💤 Колись" };
const STD_VOLUMES = [250, 330, 355, 473, 500];
const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

// Назва країни -> ISO-код (для прапорця). Можна вписати й сам код: PL, DE…
const COUNTRIES = {
  "Україна": "UA", "Польща": "PL", "Німеччина": "DE", "Угорщина": "HU", "Чехія": "CZ",
  "Словаччина": "SK", "Австрія": "AT", "Нідерланди": "NL", "Бельгія": "BE", "Франція": "FR",
  "Італія": "IT", "Іспанія": "ES", "Португалія": "PT", "Велика Британія": "GB", "Ірландія": "IE",
  "США": "US", "Канада": "CA", "Румунія": "RO", "Молдова": "MD", "Болгарія": "BG",
  "Хорватія": "HR", "Сербія": "RS", "Словенія": "SI", "Литва": "LT", "Латвія": "LV",
  "Естонія": "EE", "Фінляндія": "FI", "Швеція": "SE", "Норвегія": "NO", "Данія": "DK",
  "Греція": "GR", "Туреччина": "TR", "Грузія": "GE", "Казахстан": "KZ", "Японія": "JP",
  "Китай": "CN", "Південна Корея": "KR", "ОАЕ": "AE", "Ізраїль": "IL", "Швейцарія": "CH",
  "Австралія": "AU", "Чорногорія": "ME", "Боснія і Герцеговина": "BA", "Албанія": "AL",
  "Північна Македонія": "MK", "Кіпр": "CY", "Мальта": "MT", "Люксембург": "LU",
};

// ================================================================
//  ХЕЛПЕРИ
// ================================================================
function _norm(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
function _esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _escAttr(s) { return _esc(s).replace(/"/g, "&quot;"); }
function _todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function _fmtDate(iso) {
  const p = String(iso || "").split("-");
  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso || "");
}
function _num(n) { return (Math.round(n * 100) / 100).toLocaleString("uk-UA"); }
function _money(n) {
  const v = Math.round((parseFloat(n) || 0) * 100) / 100;
  const s = v % 1
    ? v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString("uk-UA");
  return s + " ₴";
}
function _hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}
function _initials(brand) {
  const words = String(brand || "?").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return String(words[0] || "?").slice(0, 2).toUpperCase();
}
function _countryCode(name) {
  const n = String(name || "").trim();
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  const key = Object.keys(COUNTRIES).find((k) => k.toLowerCase() === n.toLowerCase());
  return key ? COUNTRIES[key] : "";
}
function _flag(name) {
  const cc = _countryCode(name);
  if (!cc) return "";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function _qty(c) { return Math.max(1, parseInt(c.qty) || 1); }
function _vol(c) { return parseInt(c.volume) || 0; }
function _title(c) { return (c.brand || "") + " " + (c.name || ""); }
function _dateOf(c) {
  if (c.acquiredDate) return c.acquiredDate;
  if (c.createdAt) {
    const d = new Date(c.createdAt);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  return "";
}
function _isSpecial(c) { return !!EDITION_BADGE[c.edition]; }
function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function _download(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ================================================================
//  СТАН
// ================================================================
let _uid = null;
let _cans = [];
let _thumbs = {};          // canId -> dataURL мініатюри
const _fullCache = {};     // canId -> dataURL повного фото
let _tab = "have";
const _f = {
  sub: "have",
  brand: "",
  q: "",
  sort: localStorage.getItem("cnSort") || "new",
  trade: false,
  wantBrand: "",
};
let _form = { mode: "new", id: null };  // mode: new | edit | buy | promote
let _formStatus = "have";
let _formVolume = 0;       // -1 = «Інший»
let _formRating = 0;
let _formPrio = 2;
let _formPhoto = null;     // { thumb, full }
let _formPhotoRemoved = false;
let _photoBusy = false;
let _saving = false;
let _detailId = null;
let _inited = false;
let _statsDirty = true;
let _monthSel = -1;
let _unsubCans = null;
let _unsubThumbs = null;

// ================================================================
//  AUTH GATE
// ================================================================
onAuthStateChanged(auth, (user) => {
  const status = $("status");
  const content = $("cnContent");
  const nf = $("cn404");

  if (!user) {
    content.classList.remove("visible");
    nf.classList.add("visible");
    status.style.display = "none";
    $("cnFab").hidden = true;
    return;
  }

  _uid = user.uid;
  nf.classList.remove("visible");
  content.classList.add("visible");
  status.style.display = "";
  status.innerText = "Завантаження колекції...";

  if (!_inited) {
    _inited = true;
    _initUI();
  }
  _listen();
});

// ================================================================
//  FIRESTORE
// ================================================================
function _listen() {
  if (_unsubCans) return;

  _unsubCans = onSnapshot(collection(db, "cans"), (snap) => {
    _cans = snap.docs
      .map((d) => Object.assign({ id: d.id }, d.data()))
      .filter((c) => !c.userId || c.userId === _uid);
    _statsDirty = true;
    _renderAll();
    $("status").innerText = "Хмара синхронізована";
  }, (err) => {
    console.error("cans:", err);
    $("cnGrid").innerHTML = '<div class="cn-err">Немає доступу до колекції. Додай у Firestore rules правила для <b>cans</b> і <b>can_photos</b>.</div>';
    $("status").innerText = "Помилка доступу";
  });

  _unsubThumbs = onSnapshot(query(collection(db, "can_photos"), where("kind", "==", "t")), (snap) => {
    const map = {};
    snap.docs.forEach((d) => {
      const x = d.data();
      if (x && x.canId && x.data) map[x.canId] = x.data;
    });
    _thumbs = map;
    _renderHave();
    _renderWant();
    if (_detailId) _refreshDetailThumb();
  }, (err) => console.warn("can_photos:", err));
}

// Запис батчу: не чекаємо сервер довше 2,5 с — офлайн запис уже лежить у кеші
// й піде в хмару, коли з'явиться мережа. Повертає "ok" або "slow".
const SLOW_NOTE = " · офлайн: синхронізується, коли буде мережа";
async function _commit(batch) {
  const p = batch.commit();
  const res = await Promise.race([
    p.then(() => "ok"),
    _sleep(2500).then(() => "slow"),
  ]);
  if (res === "slow") p.catch((err) => _toastErr(err));
  return res;
}

function _toastErr(err) {
  console.error(err);
  if (err && err.code === "permission-denied") {
    _toast("Доступ заборонено — перевір Firestore rules для cans / can_photos", "err");
  } else {
    _toast("Помилка: " + (err && err.message ? err.message : err), "err");
  }
}

// ================================================================
//  ІНІЦІАЛІЗАЦІЯ UI
// ================================================================
function _initUI() {
  // Вкладки
  document.querySelectorAll(".cn-subtab").forEach((b) => {
    b.addEventListener("click", () => _switchTab(b.dataset.tab));
  });

  // Панель колекції
  let searchTimer = null;
  $("cnSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { _f.q = $("cnSearch").value; _renderHave(); }, 120);
  });
  document.querySelectorAll("#cnSubSeg .cn-seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      _f.sub = b.dataset.sub;
      _f.brand = "";
      document.querySelectorAll("#cnSubSeg .cn-seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      _renderHave();
    });
  });
  const sortEl = $("cnSort");
  sortEl.value = _f.sort;
  sortEl.addEventListener("change", () => {
    _f.sort = sortEl.value;
    localStorage.setItem("cnSort", _f.sort);
    _renderHave();
  });
  $("cnTradeToggle").addEventListener("click", () => {
    _f.trade = !_f.trade;
    $("cnTradeToggle").classList.toggle("active", _f.trade);
    _renderHave();
  });
  $("cnBrandChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".cn-chip");
    if (!chip) return;
    _f.brand = chip.dataset.brand === _f.brand ? "" : chip.dataset.brand;
    _renderHave();
  });
  $("cnWantBrandChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".cn-chip");
    if (!chip) return;
    _f.wantBrand = chip.dataset.brand === _f.wantBrand ? "" : chip.dataset.brand;
    _renderWant();
  });

  // Сітка / список — делегування
  $("cnGrid").addEventListener("click", (e) => {
    const tile = e.target.closest(".cn-tile");
    if (tile) _openDetail(tile.dataset.id);
  });
  $("cnWantList").addEventListener("click", (e) => {
    const buy = e.target.closest(".cn-buy-btn");
    if (buy) { e.stopPropagation(); _openForm({ mode: "buy", id: buy.dataset.id }); return; }
    const item = e.target.closest(".cn-want-item");
    if (item) _openDetail(item.dataset.id);
  });
  $("cnCheck").addEventListener("click", (e) => {
    const add = e.target.closest(".cn-check-add");
    if (add) _openForm({ mode: "new", status: "have", barcode: add.dataset.barcode });
    const open = e.target.closest("[data-open]");
    if (open) _openDetail(open.dataset.open);
  });

  // FAB
  $("cnFab").hidden = false;
  $("cnFab").addEventListener("click", () => {
    const st = _tab === "want" ? "want" : (_f.sub === "tasted" ? "tasted" : "have");
    _openForm({ mode: "new", status: st });
  });

  // Шторки
  document.querySelectorAll(".cn-overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest("[data-close]")) _closeOverlay(ov);
    });
  });
  $("cnLightbox").addEventListener("click", () => _closeOverlay($("cnLightbox")));
  window.addEventListener("popstate", _onPopState);

  _initForm();
  _switchTab("have");
}

function _switchTab(tab) {
  _tab = tab;
  document.querySelectorAll(".cn-subtab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("cnPanelHave").classList.toggle("active", tab === "have");
  $("cnPanelWant").classList.toggle("active", tab === "want");
  $("cnPanelStats").classList.toggle("active", tab === "stats");
  $("cnFab").hidden = tab === "stats" || !_inited;
  if (tab === "stats" && _statsDirty) { _renderStats(); _statsDirty = false; }
}

// ================================================================
//  ШТОРКИ + кнопка «Назад» на телефоні закриває шторку, а не сторінку
// ================================================================
const _overlayStack = [];
let _ignorePop = 0;

function _openOverlay(el) {
  if (_overlayStack.includes(el)) return;
  el.classList.add("visible");
  el.setAttribute("aria-hidden", "false");
  _overlayStack.push(el);
  document.body.style.overflow = "hidden";
  el._cnPushed = false;
  try {
    history.pushState({ cnOverlay: _overlayStack.length }, "");
    el._cnPushed = true;
  } catch (e) { /* без історії — просто шторка */ }
}

function _closeOverlay(el, fromPop) {
  const i = _overlayStack.lastIndexOf(el);
  if (i === -1) return;
  _overlayStack.splice(i, 1);
  el.classList.remove("visible");
  el.setAttribute("aria-hidden", "true");
  if (!_overlayStack.length) document.body.style.overflow = "";
  if (el.id === "cnDetail") _detailId = null;
  if (!fromPop && el._cnPushed) {
    _ignorePop++;
    history.back();
  }
  el._cnPushed = false;
}

function _onPopState() {
  if (_ignorePop > 0) { _ignorePop--; return; }
  const top = _overlayStack[_overlayStack.length - 1];
  if (top) _closeOverlay(top, true);
}

// ================================================================
//  ДІАЛОГ ВИБОРУ (замість confirm, коли варіантів більше двох)
// ================================================================
function _choice(msg, options) {
  return new Promise((resolve) => {
    const ov = $("cnDialog");
    const box = $("cnDialogBtns");
    $("cnDialogMsg").textContent = msg;
    box.innerHTML = options.map((o, i) => {
      const cls = o[2] || (i === 0 ? "primary" : (o[0] === "cancel" ? "ghost" : ""));
      return '<button type="button" class="cn-dlg-btn ' + cls + '" data-k="' + _escAttr(o[0]) + '">' + _esc(o[1]) + "</button>";
    }).join("");
    ov.classList.add("visible");
    ov.setAttribute("aria-hidden", "false");
    const done = (k) => {
      ov.classList.remove("visible");
      ov.setAttribute("aria-hidden", "true");
      ov.onclick = null;
      box.innerHTML = "";
      resolve(k);
    };
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => done(b.dataset.k)));
    ov.onclick = (e) => { if (e.target === ov) done("cancel"); };
    const first = box.querySelector("button");
    if (first) first.focus();
  });
}

// ================================================================
//  TOAST
// ================================================================
function _toast(msg, kind) {
  const old = $("cnToast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.id = "cnToast";
  t.className = "cn-toast" + (kind === "err" ? " cn-toast-err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, kind === "err" ? 3800 : 2400);
}

// ================================================================
//  РЕНДЕР
// ================================================================
function _renderAll() {
  const have = _cans.filter((c) => c.status === "have").length;
  const want = _cans.filter((c) => c.status === "want").length;
  $("cnCntHave").textContent = have ? have : "";
  $("cnCntWant").textContent = want ? want : "";
  _renderHave();
  _renderWant();
  if (_tab === "stats") { _renderStats(); _statsDirty = false; }
  if (_detailId) _renderDetail();
  _rebuildDatalists();
}

function _placeholder(c) {
  const h = _hash(_norm(c.brand)) % 360;
  return '<div class="cn-ph" style="--h:' + h + '">' + _esc(_initials(c.brand)) + "</div>";
}

function _imgHtml(c) {
  const t = _thumbs[c.id];
  if (t) return '<img src="' + t + '" alt="" loading="lazy" decoding="async" />';
  if (c.hasPhoto) return '<div class="cn-ph cn-ph-loading"></div>';
  return _placeholder(c);
}

function _brandCounts(list) {
  const map = {};
  list.forEach((c) => {
    const k = _norm(c.brand);
    if (!k) return;
    if (!map[k]) map[k] = { key: k, label: c.brand.trim(), n: 0 };
    map[k].n++;
  });
  return Object.values(map).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "uk"));
}

function _chipsHtml(list, active) {
  const brands = _brandCounts(list);
  if (brands.length < 2 && !active) return "";
  return '<button type="button" class="cn-chip' + (active ? "" : " active") + '" data-brand="">Усі<b>' + list.length + "</b></button>" +
    brands.map((b) =>
      '<button type="button" class="cn-chip' + (active === b.key ? " active" : "") + '" data-brand="' + _escAttr(b.key) + '">' +
        _esc(b.label) + "<b>" + b.n + "</b></button>").join("");
}

function _matches(c, q) {
  const hay = _norm([c.brand, c.name, c.series, c.barcode, c.country, c.place, c.note, c.giftFrom, EDITION_LABEL[c.edition]].join(" "));
  return q.split(" ").every((w) => hay.includes(w));
}

function _sorted(list, mode) {
  const arr = list.slice();
  const byName = (a, b) => _norm(a.brand).localeCompare(_norm(b.brand), "uk") || _norm(a.name).localeCompare(_norm(b.name), "uk") || _vol(a) - _vol(b);
  if (mode === "brand") arr.sort(byName);
  else if (mode === "rating") arr.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  else if (mode === "volume") arr.sort((a, b) => _vol(a) - _vol(b) || byName(a, b));
  else arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

// ---------- КОЛЕКЦІЯ ----------
function _renderHave() {
  const grid = $("cnGrid");
  if (!grid) return;
  const base = _cans.filter((c) => c.status === _f.sub);

  if (_f.brand && !base.some((c) => _norm(c.brand) === _f.brand)) _f.brand = "";
  $("cnBrandChips").innerHTML = _chipsHtml(base, _f.brand);

  let list = base;
  if (_f.brand) list = list.filter((c) => _norm(c.brand) === _f.brand);
  if (_f.trade && _f.sub === "have") list = list.filter((c) => _qty(c) > 1);
  const q = _norm(_f.q);
  if (q) list = list.filter((c) => _matches(c, q));
  list = _sorted(list, _f.sort);

  $("cnTradeToggle").hidden = _f.sub !== "have";
  _renderCheck(q);

  if (!_cans.length) {
    grid.innerHTML = '<div class="cn-empty">Колекція порожня.<br>Натисни <b>＋</b> унизу й додай першу банку.</div>';
    return;
  }
  if (!list.length) {
    const msg = q ? "Нічого не знайдено." :
      (_f.trade ? "Дублів на обмін поки немає." :
        (_f.sub === "tasted" ? "Тут будуть енергетики, які куштував, але банку не залишив." : "У колекції поки порожньо."));
    grid.innerHTML = '<div class="cn-empty">' + msg + "</div>";
    return;
  }

  grid.innerHTML = list.map((c) => {
    const left = c.status === "have" && _qty(c) > 1 ? '<span class="cn-b cn-b-qty">×' + _qty(c) + "</span>" : "<span></span>";
    let right = "";
    if (_isSpecial(c)) right = '<span class="cn-b cn-b-ltd">' + EDITION_BADGE[c.edition] + "</span>";
    else if (parseFloat(c.rating) > 0) right = '<span class="cn-b">★' + _num(parseFloat(c.rating)) + "</span>";
    const sub = [c.brand, _vol(c) ? _vol(c) : ""].filter(Boolean).join(" · ");
    // Прапорець — лише для імпорту: українське маркування не підсвічуємо
    const cc = _countryCode(c.country);
    const flag = cc && cc !== "UA" ? '<span class="cn-flag" title="' + _escAttr(c.country) + '">' + _flag(c.country) + "</span>" : "";
    return '<button type="button" class="cn-tile" data-id="' + _escAttr(c.id) + '">' +
      '<div class="cn-tile-img">' + _imgHtml(c) + '<div class="cn-badges">' + left + right + "</div>" + flag + "</div>" +
      '<div class="cn-tile-name">' + _esc(c.name) + "</div>" +
      '<div class="cn-tile-sub">' + _esc(sub) + "</div>" +
    "</button>";
  }).join("");
}

// Перевірка штрихкоду в магазині: вводиш цифри в пошук
function _renderCheck(q) {
  const box = $("cnCheck");
  const code = String(q || "").replace(/\s+/g, "");
  if (!/^\d{8,14}$/.test(code)) { box.hidden = true; box.innerHTML = ""; return; }
  const hits = _cans.filter((c) => String(c.barcode || "").replace(/\s+/g, "") === code);
  box.hidden = false;
  box.className = "cn-check";
  if (!hits.length) {
    box.innerHTML = "🆕 Штрихкоду <b>" + _esc(code) + "</b> у тебе немає." +
      '<br><button type="button" class="cn-check-add" data-barcode="' + _escAttr(code) + '">＋ Додати банку</button>';
    return;
  }
  const have = hits.filter((c) => c.status === "have");
  const want = hits.filter((c) => c.status === "want");
  const tasted = hits.filter((c) => c.status === "tasted");
  const line = (c, extra) => '<span data-open="' + _escAttr(c.id) + '" style="text-decoration:underline dotted;cursor:pointer">' +
    _esc(_title(c)) + (_vol(c) ? " · " + _vol(c) + " мл" : "") + "</span>" + (extra || "");
  const parts = [];
  if (have.length) {
    box.classList.add("cn-check-have");
    parts.push("✅ Вже є: " + have.map((c) => line(c, " ×" + _qty(c))).join(", "));
  }
  if (want.length) {
    if (!have.length) box.classList.add("cn-check-want");
    parts.push("⭐ У «Хочу»: " + want.map((c) => line(c)).join(", "));
  }
  if (tasted.length) parts.push("👅 Куштував: " + tasted.map((c) => line(c, parseFloat(c.rating) > 0 ? " ★" + _num(parseFloat(c.rating)) : "")).join(", "));
  parts.push('<span style="opacity:.75;font-weight:600">Лімітований дизайн може мати той самий штрихкод, що й звичайна банка.</span>');
  box.innerHTML = parts.join("<br>");
}

// ---------- ХОЧУ ----------
function _renderWant() {
  const listEl = $("cnWantList");
  if (!listEl) return;
  const all = _cans.filter((c) => c.status === "want");
  if (_f.wantBrand && !all.some((c) => _norm(c.brand) === _f.wantBrand)) _f.wantBrand = "";
  $("cnWantBrandChips").innerHTML = _chipsHtml(all, _f.wantBrand);

  if (!all.length) {
    listEl.innerHTML = '<div class="cn-empty">Список бажаного порожній.<br>Натисни <b>＋</b> і додай банки, які хочеш знайти.</div>';
    return;
  }
  const list = (_f.wantBrand ? all.filter((c) => _norm(c.brand) === _f.wantBrand) : all)
    .slice()
    .sort((a, b) => (parseInt(a.priority) || 2) - (parseInt(b.priority) || 2) ||
      _norm(a.brand).localeCompare(_norm(b.brand), "uk") || _norm(a.name).localeCompare(_norm(b.name), "uk"));

  let html = "";
  let lastPrio = null;
  list.forEach((c) => {
    const p = parseInt(c.priority) || 2;
    if (p !== lastPrio) {
      lastPrio = p;
      html += '<div class="cn-want-group">' + PRIO_LABEL[p] + "</div>";
    }
    const sub = [_vol(c) ? _vol(c) + " мл" : "", c.series, _isSpecial(c) ? EDITION_LABEL[c.edition] : "", _flag(c.country)]
      .filter(Boolean).join(" · ");
    html += '<div class="cn-want-item" data-id="' + _escAttr(c.id) + '">' +
      '<div class="cn-want-thumb">' + _imgHtml(c) + "</div>" +
      '<div class="cn-want-main">' +
        '<div class="cn-want-name">' + _esc(_title(c)) + "</div>" +
        (sub ? '<div class="cn-want-sub">' + _esc(sub) + "</div>" : "") +
        (c.whereToFind ? '<div class="cn-want-note">📍 ' + _esc(c.whereToFind) + "</div>" : "") +
      "</div>" +
      '<button type="button" class="cn-buy-btn" data-id="' + _escAttr(c.id) + '">✓ Купив</button>' +
    "</div>";
  });
  listEl.innerHTML = html;
}

// ================================================================
//  КАРТКА БАНКИ
// ================================================================
function _openDetail(id) {
  if (!_cans.some((c) => c.id === id)) return;
  _detailId = id;
  _renderDetail();
  _openOverlay($("cnDetail"));
}

function _drow(label, value) {
  if (value === "" || value == null) return "";
  return '<div class="cn-drow"><span class="cn-drow-l">' + label + '</span><span class="cn-drow-v">' + value + "</span></div>";
}

function _renderDetail() {
  const c = _cans.find((x) => x.id === _detailId);
  if (!c) { _closeOverlay($("cnDetail")); return; }

  $("cnDetailTitle").textContent = _title(c);

  const thumb = _thumbs[c.id];
  const full = _fullCache[c.id];
  const photo = (c.hasPhoto || thumb)
    ? '<div class="cn-detail-photo" id="cnDetailPhoto"><img id="cnDetailImg" src="' + (full || thumb || "") + '" alt="" /></div>'
    : '<div class="cn-detail-photo" style="cursor:default">' + _placeholder(c) + "</div>";

  const chips = [
    '<span class="cn-dchip cn-dchip-status">' + STATUS_LABEL[c.status] + "</span>",
    _vol(c) ? '<span class="cn-dchip">' + _vol(c) + " мл</span>" : "",
    c.series ? '<span class="cn-dchip">' + _esc(c.series) + "</span>" : "",
    _isSpecial(c) ? '<span class="cn-dchip cn-dchip-ltd">' + EDITION_LABEL[c.edition] + "</span>" : "",
    c.country ? '<span class="cn-dchip">' + (_flag(c.country) ? _flag(c.country) + " " : "") + _esc(c.country) + "</span>" : "",
    parseInt(c.year) ? '<span class="cn-dchip">' + parseInt(c.year) + "</span>" : "",
    SUGAR_LABEL[c.sugar] ? '<span class="cn-dchip">' + SUGAR_LABEL[c.sugar] + "</span>" : "",
  ].join("");

  const price = parseFloat(c.price) || 0;
  const rating = parseFloat(c.rating) || 0;
  let rows = "";
  if (c.status === "have") {
    const q = _qty(c);
    rows += _drow("Стан", CONDITION_LABEL[c.condition] || "");
    rows += '<div class="cn-drow"><span class="cn-drow-l">Кількість</span><span class="cn-drow-v cn-qty-ctrl">' +
      '<button type="button" id="cnQtyMinus" aria-label="Мінус один"' + (q <= 1 ? " disabled" : "") + ">−</button>" +
      "<span>" + q + (q > 1 ? " (дублів: " + (q - 1) + ")" : "") + "</span>" +
      '<button type="button" id="cnQtyPlus" aria-label="Плюс один">+</button></span></div>';
    rows += _drow("Придбано", c.acquiredDate ? _fmtDate(c.acquiredDate) : "");
    rows += _drow("Де", _esc(c.place || ""));
    rows += _drow("Ціна", price ? _money(price) + (q > 1 ? " × " + q : "") : "");
    rows += _drow("Подарунок від", _esc(c.giftFrom || ""));
  } else if (c.status === "want") {
    rows += _drow("Пріоритет", PRIO_LABEL[parseInt(c.priority) || 2]);
    rows += _drow("Де шукати", _esc(c.whereToFind || ""));
  } else {
    rows += _drow("Куштував", c.acquiredDate ? _fmtDate(c.acquiredDate) : "");
    rows += _drow("Де", _esc(c.place || ""));
    rows += _drow("Ціна", price ? _money(price) : "");
  }
  if (c.status !== "want") rows += _drow("Оцінка смаку", rating ? "★ " + _num(rating) + " / 10" : "");
  rows += _drow("Кофеїн", parseFloat(c.caffeine) ? _num(parseFloat(c.caffeine)) + " мг/100 мл" : "");
  rows += _drow("Штрихкод", _esc(c.barcode || ""));
  if (c.fromWish) rows += _drow("Звідки", "Закрито з «Хочу»");

  let actions = "";
  if (c.status === "want") actions += '<button type="button" class="cn-act-main" data-act="buy">✓ Купив — в колекцію</button>';
  if (c.status === "tasted") actions += '<button type="button" class="cn-act-main" data-act="promote">🥫 Є банка — в колекцію</button>';
  actions += '<button type="button" data-act="edit">✎ Редагувати</button>';
  actions += '<button type="button" class="cn-act-del" data-act="del">🗑 Видалити</button>';

  $("cnDetailBody").innerHTML =
    photo +
    '<div class="cn-detail-chips">' + chips + "</div>" +
    rows +
    (c.note ? '<div class="cn-note-block">' + _esc(c.note) + "</div>" : "") +
    '<div class="cn-detail-actions">' + actions + "</div>";

  const body = $("cnDetailBody");
  body.querySelectorAll("[data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "edit") _openForm({ mode: "edit", id: c.id });
      else if (act === "buy") _openForm({ mode: "buy", id: c.id });
      else if (act === "promote") _openForm({ mode: "promote", id: c.id });
      else if (act === "del") _deleteCan(c.id);
    });
  });
  const minus = $("cnQtyMinus");
  const plus = $("cnQtyPlus");
  if (minus) minus.addEventListener("click", () => _changeQty(c.id, -1));
  if (plus) plus.addEventListener("click", () => _changeQty(c.id, 1));

  const ph = $("cnDetailPhoto");
  if (ph) {
    ph.addEventListener("click", () => {
      const img = $("cnDetailImg");
      if (!img || !img.src) return;
      $("cnLightboxImg").src = img.src;
      _openOverlay($("cnLightbox"));
    });
  }
  if (c.hasPhoto && !full) _loadFullPhoto(c.id);
}

function _refreshDetailThumb() {
  const img = $("cnDetailImg");
  if (img && !img.getAttribute("src") && _thumbs[_detailId]) img.src = _thumbs[_detailId];
}

async function _loadFullPhoto(id) {
  try {
    const snap = await getDoc(doc(db, "can_photos", id + "_f"));
    if (!snap.exists()) return;
    const data = snap.data().data;
    if (!data) return;
    _fullCache[id] = data;
    if (_detailId === id) {
      const img = $("cnDetailImg");
      if (img) img.src = data;
    }
  } catch (e) {
    console.warn("full photo:", e);
  }
}

function _changeQty(id, delta) {
  const c = _cans.find((x) => x.id === id);
  if (!c) return;
  if (delta < 0 && _qty(c) <= 1) return;
  updateDoc(doc(db, "cans", id), { qty: increment(delta), updatedAt: Date.now() }).catch(_toastErr);
}

async function _deleteCan(id) {
  const c = _cans.find((x) => x.id === id);
  if (!c) return;
  const ch = await _choice("Видалити «" + _title(c).trim() + "»" + (_vol(c) ? " · " + _vol(c) + " мл" : "") + "?",
    [["del", "Видалити", "danger"], ["cancel", "Скасувати"]]);
  if (ch !== "del") return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "cans", id));
    batch.delete(doc(db, "can_photos", id + "_t"));
    batch.delete(doc(db, "can_photos", id + "_f"));
    delete _fullCache[id];
    _closeOverlay($("cnDetail"));
    const r = await _commit(batch);
    _toast("Видалено" + (r === "slow" ? SLOW_NOTE : ""));
  } catch (err) {
    _toastErr(err);
  }
}

// ================================================================
//  ФОРМА
// ================================================================
function _initForm() {
  document.querySelectorAll("#cnStatusSeg .cn-seg-btn").forEach((b) => {
    b.addEventListener("click", () => _setStatus(b.dataset.status));
  });

  document.querySelectorAll("#cnVolChips .cn-vol").forEach((b) => {
    b.addEventListener("click", () => {
      _setVolume(b.dataset.vol === "other" ? -1 : parseInt(b.dataset.vol));
      if (b.dataset.vol === "other") $("cnVolOther").focus();
    });
  });

  document.querySelectorAll("#cnPrioSeg .cn-seg-btn").forEach((b) => {
    b.addEventListener("click", () => _setPrio(parseInt(b.dataset.prio)));
  });

  // Оцінка 1–10 (повторне натискання — скинути)
  const rating = $("cnRating");
  rating.innerHTML = Array.from({ length: 10 }, (_, i) =>
    '<button type="button" data-r="' + (i + 1) + '">' + (i + 1) + "</button>").join("");
  rating.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const r = parseInt(b.dataset.r);
    _setRating(_formRating === r ? 0 : r);
  });

  // Бренд -> підказки назв і серій саме цього бренду
  $("cnBrand").addEventListener("input", _refreshBrandLists);
  $("cnBrandQuick").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("cnBrand").value = b.dataset.brand;
    _refreshBrandLists();
    $("cnName").focus();
  });

  $("cnBarcode").addEventListener("input", _checkBarcodeHint);

  // Фото
  $("cnCamBtn").addEventListener("click", () => $("cnFileCam").click());
  $("cnGalBtn").addEventListener("click", () => $("cnFileGal").click());
  $("cnFileCam").addEventListener("change", (e) => _onPhotoPicked(e.target));
  $("cnFileGal").addEventListener("change", (e) => _onPhotoPicked(e.target));
  $("cnPhotoRemove").addEventListener("click", () => {
    _formPhoto = null;
    _formPhotoRemoved = true;
    _renderPhotoPreview(null);
  });

  // «Додатково» пам'ятає, чи відкрито
  const extra = $("cnExtra");
  try { if (localStorage.getItem("cnExtraOpen") === "1") extra.open = true; } catch (e) { /* noop */ }
  extra.addEventListener("toggle", () => {
    try { localStorage.setItem("cnExtraOpen", extra.open ? "1" : "0"); } catch (e) { /* noop */ }
  });

  $("cnSaveBtn").addEventListener("click", () => _saveForm(false));
  $("cnSaveNextBtn").addEventListener("click", () => _saveForm(true));

  // Enter у полях: бренд -> назва -> зберегти
  $("cnBrand").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("cnName").focus(); } });
  $("cnName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
}

function _setStatus(st) {
  _formStatus = st;
  document.querySelectorAll("#cnStatusSeg .cn-seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.status === st));
  document.querySelectorAll("#cnForm [data-for]").forEach((el) => {
    el.hidden = !el.dataset.for.split(" ").includes(st);
  });
  $("cnDateLabel").textContent = st === "tasted" ? "Коли куштував" : "Дата придбання";
  _checkBarcodeHint();
}

function _setVolume(v) {
  _formVolume = v;
  document.querySelectorAll("#cnVolChips .cn-vol").forEach((b) => {
    const bv = b.dataset.vol === "other" ? -1 : parseInt(b.dataset.vol);
    b.classList.toggle("active", bv === v);
  });
  $("cnVolOther").hidden = v !== -1;
}

function _setPrio(p) {
  _formPrio = p;
  document.querySelectorAll("#cnPrioSeg .cn-seg-btn").forEach((b) => b.classList.toggle("active", parseInt(b.dataset.prio) === p));
}

function _setRating(r) {
  _formRating = r;
  document.querySelectorAll("#cnRating button").forEach((b) => {
    const v = parseInt(b.dataset.r);
    b.classList.toggle("sel", v === r);
    b.classList.toggle("on", r > 0 && v < r);
  });
  $("cnRatingVal").textContent = r ? r + "/10" : "";
}

function _fillDatalist(id, values) {
  const dl = $(id);
  if (dl) dl.innerHTML = values.map((v) => '<option value="' + _escAttr(v) + '"></option>').join("");
}

function _uniqueByFreq(values) {
  const map = {};
  values.forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const k = _norm(s);
    if (!map[k]) map[k] = { v: s, n: 0 };
    map[k].n++;
  });
  return Object.values(map).sort((a, b) => b.n - a.n).map((x) => x.v);
}

function _rebuildDatalists() {
  const brands = _uniqueByFreq(_cans.map((c) => c.brand));
  _fillDatalist("cnBrandList", brands);
  _fillDatalist("cnPlaceList", _uniqueByFreq(_cans.map((c) => c.place)));
  _fillDatalist("cnGiftList", _uniqueByFreq(_cans.map((c) => c.giftFrom)));
  const countries = _uniqueByFreq(_cans.map((c) => c.country));
  Object.keys(COUNTRIES).forEach((k) => { if (!countries.some((x) => _norm(x) === _norm(k))) countries.push(k); });
  _fillDatalist("cnCountryList", countries);
  $("cnBrandQuick").innerHTML = brands.slice(0, 6).map((b) =>
    '<button type="button" data-brand="' + _escAttr(b) + '">' + _esc(b) + "</button>").join("");
  _refreshBrandLists();
}

function _refreshBrandLists() {
  const b = _norm($("cnBrand").value);
  const same = b ? _cans.filter((c) => _norm(c.brand) === b) : _cans;
  _fillDatalist("cnNameList", _uniqueByFreq(same.map((c) => c.name)));
  _fillDatalist("cnSeriesList", _uniqueByFreq(same.map((c) => c.series)));
}

function _checkBarcodeHint() {
  const hint = $("cnBarcodeHint");
  const code = $("cnBarcode").value.replace(/\s+/g, "");
  if (code.length < 8) { hint.hidden = true; return; }
  const hits = _cans.filter((c) => c.id !== _form.id && String(c.barcode || "").replace(/\s+/g, "") === code);
  if (!hits.length) { hint.hidden = true; return; }
  hint.hidden = false;
  hint.textContent = "Такий штрихкод уже є: " + hits.map((c) =>
    _title(c).trim() + " (" + STATUS_LABEL[c.status] + (c.status === "have" ? " ×" + _qty(c) : "") + ")").join(", ");
}

// ---------- Відкрити форму ----------
// opts: { mode: new|edit|buy|promote, id, status, barcode }
function _openForm(opts) {
  const mode = opts.mode || "new";
  const c = opts.id ? _cans.find((x) => x.id === opts.id) : null;
  if (mode !== "new" && !c) return;
  _form = { mode, id: c ? c.id : null };
  _formPhoto = null;
  _formPhotoRemoved = false;

  if (mode === "new") {
    _resetFields(false);
    _setStatus(opts.status || "have");
    if (opts.barcode) {
      $("cnBarcode").value = opts.barcode;
      $("cnExtra").open = true;
    }
    $("cnFormTitle").textContent = "Нова банка";
  } else {
    _fillFields(c);
    if (mode === "buy" || mode === "promote") {
      _setStatus("have");
      $("cnDate").value = _todayLocal();
      $("cnQty").value = 1;
      if (mode === "buy") $("cnPrice").value = "";
      $("cnFormTitle").textContent = (mode === "buy" ? "Купив: " : "В колекцію: ") + _title(c).trim();
    } else {
      _setStatus(c.status || "have");
      $("cnFormTitle").textContent = "Редагувати";
    }
    _renderPhotoPreview(_fullCache[c.id] || _thumbs[c.id] || null, !!c.hasPhoto);
  }

  $("cnSaveNextBtn").hidden = mode !== "new";
  $("cnSaveBtn").textContent = mode === "buy" || mode === "promote" ? "✓ В колекцію" : "Зберегти";
  _checkBarcodeHint();
  _openOverlay($("cnForm"));
  if (mode === "new" && !opts.barcode) setTimeout(() => ($("cnBrand").value ? $("cnName") : $("cnBrand")).focus(), 320);
}

function _resetFields(keepBatch) {
  // keepBatch = серійне внесення: лишаємо бренд, серію, об'єм, країну, дату, місце, стан
  if (!keepBatch) {
    $("cnBrand").value = "";
    $("cnSeries").value = "";
    $("cnEdition").value = "regular";
    $("cnCountry").value = "";
    $("cnDate").value = _todayLocal();
    $("cnPlace").value = "";
    $("cnCondition").value = "full";
    $("cnSugar").value = "";
    _setVolume(0);
    $("cnVolOther").value = "";
    _setPrio(2);
    $("cnWhere").value = "";
  }
  $("cnName").value = "";
  $("cnYear").value = "";
  $("cnBarcode").value = "";
  $("cnQty").value = 1;
  $("cnPrice").value = "";
  $("cnGift").value = "";
  $("cnCaffeine").value = "";
  $("cnNote").value = "";
  _setRating(0);
  _formPhoto = null;
  _formPhotoRemoved = false;
  _renderPhotoPreview(null);
  _refreshBrandLists();
}

function _fillFields(c) {
  $("cnBrand").value = c.brand || "";
  $("cnName").value = c.name || "";
  const v = _vol(c);
  if (!v) { _setVolume(0); $("cnVolOther").value = ""; }
  else if (STD_VOLUMES.includes(v)) { _setVolume(v); $("cnVolOther").value = ""; }
  else { _setVolume(-1); $("cnVolOther").value = v; }
  $("cnSeries").value = c.series || "";
  $("cnEdition").value = EDITION_LABEL[c.edition] ? c.edition : "regular";
  $("cnCountry").value = c.country || "";
  $("cnYear").value = parseInt(c.year) || "";
  $("cnBarcode").value = c.barcode || "";
  $("cnCondition").value = CONDITION_LABEL[c.condition] ? c.condition : "full";
  $("cnQty").value = _qty(c);
  $("cnDate").value = c.acquiredDate || "";
  $("cnPlace").value = c.place || "";
  $("cnPrice").value = parseFloat(c.price) || "";
  $("cnGift").value = c.giftFrom || "";
  _setRating(Math.round(parseFloat(c.rating) || 0));
  $("cnCaffeine").value = parseFloat(c.caffeine) || "";
  $("cnSugar").value = SUGAR_LABEL[c.sugar] ? c.sugar : "";
  _setPrio(parseInt(c.priority) || 2);
  $("cnWhere").value = c.whereToFind || "";
  $("cnNote").value = c.note || "";
  _refreshBrandLists();
}

function _readForm() {
  const vol = _formVolume === -1 ? (parseInt($("cnVolOther").value) || 0) : _formVolume;
  return {
    status: _formStatus,
    brand: $("cnBrand").value.trim(),
    name: $("cnName").value.trim(),
    volume: vol,
    series: $("cnSeries").value.trim(),
    edition: $("cnEdition").value || "regular",
    country: $("cnCountry").value.trim(),
    year: parseInt($("cnYear").value) || 0,
    barcode: $("cnBarcode").value.replace(/\s+/g, ""),
    condition: $("cnCondition").value || "full",
    qty: Math.min(999, Math.max(1, parseInt($("cnQty").value) || 1)),
    acquiredDate: $("cnDate").value || "",
    place: $("cnPlace").value.trim(),
    price: Math.max(0, parseFloat(String($("cnPrice").value).replace(",", ".")) || 0),
    giftFrom: $("cnGift").value.trim(),
    rating: _formRating,
    caffeine: Math.max(0, parseFloat(String($("cnCaffeine").value).replace(",", ".")) || 0),
    sugar: $("cnSugar").value || "",
    priority: _formPrio,
    whereToFind: $("cnWhere").value.trim(),
    note: $("cnNote").value.trim(),
  };
}

// ---------- Фото: стиснення на телефоні ----------
async function _onPhotoPicked(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (!/^image\//.test(file.type || "image/")) { _toast("Це не фото", "err"); return; }
  _photoBusy = true;
  const prev = $("cnPhotoPreview");
  prev.className = "cn-photo-preview cn-photo-busy";
  prev.textContent = "Стискаю…";
  try {
    const img = await _decodeImage(file);
    const full = _encode(img, 900, 0.72);
    const thumb = _encode(img, 240, 0.7);
    if (img.close) img.close();
    _formPhoto = { full, thumb };
    _formPhotoRemoved = false;
    _renderPhotoPreview(thumb, true);
  } catch (e) {
    console.error(e);
    _toast("Не вдалося обробити фото", "err");
    _renderPhotoPreview(null);
  } finally {
    _photoBusy = false;
  }
}

async function _decodeImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* fallback нижче */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

// Зменшення з кількох кроків (по половині) — менше «драбинки» на дрібному тексті банки
function _encode(src, maxSide, quality) {
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const tw = Math.max(1, Math.round(w0 * scale));
  const th = Math.max(1, Math.round(h0 * scale));

  let cur = src;
  let cw = w0;
  let ch = h0;
  // Перший крок — одразу до ≤2048 px, щоб не впертися в ліміт canvas на телефоні
  if (Math.max(cw, ch) > 2048 && Math.max(cw, ch) / 2048 > 1) {
    const k = 2048 / Math.max(cw, ch);
    if (cw * k > tw * 2) {
      const c = document.createElement("canvas");
      c.width = Math.round(cw * k);
      c.height = Math.round(ch * k);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cur, 0, 0, c.width, c.height);
      cur = c; cw = c.width; ch = c.height;
    }
  }
  while (cw / 2 >= tw * 1.5) {
    const c = document.createElement("canvas");
    c.width = Math.round(cw / 2);
    c.height = Math.round(ch / 2);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const octx = out.getContext("2d");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, tw, th);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(cur, 0, 0, tw, th);

  let q = quality;
  let url = out.toDataURL("image/jpeg", q);
  while (url.length > 650000 && q > 0.35) {
    q -= 0.1;
    url = out.toDataURL("image/jpeg", q);
  }
  return url;
}

function _renderPhotoPreview(src, hasPhoto) {
  const prev = $("cnPhotoPreview");
  if (src) {
    prev.className = "cn-photo-preview";
    prev.innerHTML = '<img src="' + src + '" alt="" />';
  } else if (hasPhoto && !_formPhotoRemoved) {
    prev.className = "cn-photo-preview cn-ph-loading";
    prev.innerHTML = "";
  } else {
    prev.className = "cn-photo-preview cn-photo-empty";
    prev.textContent = "🥫";
  }
  $("cnPhotoRemove").hidden = !(src || (hasPhoto && !_formPhotoRemoved));
}

// ---------- Дублі / перенос з «Хочу» ----------
function _sameCan(a, b) {
  return _norm(a.brand) === _norm(b.brand) &&
    _norm(a.name) === _norm(b.name) &&
    _vol(a) === _vol(b) &&
    (!a.country || !b.country || _norm(a.country) === _norm(b.country));
}

// Повертає: null — зберегти як новий; "cancel"; { action: "inc" | "transfer", id }
async function _dupCheck(d) {
  const matches = _cans.filter((c) => _sameCan(c, d));
  if (!matches.length) return null;
  const have = matches.find((c) => c.status === "have");
  const want = matches.find((c) => c.status === "want");
  const tasted = matches.find((c) => c.status === "tasted");
  const label = (d.brand + " " + d.name).trim() + " · " + d.volume + " мл";

  if (d.status === "have") {
    if (have) {
      const ch = await _choice("Вже є в колекції: " + label + " (×" + _qty(have) + ").", [
        ["inc", "+" + d.qty + " до наявної"],
        ["new", "Окремий запис (інший дизайн)", ""],
        ["cancel", "Скасувати"],
      ]);
      if (ch === "inc") return { action: "inc", id: have.id };
      return ch === "new" ? null : "cancel";
    }
    if (want) {
      const ch = await _choice(label + " є у «Хочу». Перенести в колекцію?", [
        ["transfer", "Перенести з «Хочу»"],
        ["new", "Окремий запис", ""],
        ["cancel", "Скасувати"],
      ]);
      if (ch === "transfer") return { action: "transfer", id: want.id, fromWish: true };
      return ch === "new" ? null : "cancel";
    }
    if (tasted) {
      const ch = await _choice("Ти вже куштував " + label + ". Перетворити той запис на банку в колекції?", [
        ["transfer", "Так, в колекцію"],
        ["new", "Окремий запис", ""],
        ["cancel", "Скасувати"],
      ]);
      if (ch === "transfer") return { action: "transfer", id: tasted.id };
      return ch === "new" ? null : "cancel";
    }
  }
  if (d.status === "want") {
    const other = want || have;
    if (other) {
      const ch = await _choice((want ? "Вже є у «Хочу»: " : "Вже є в колекції: ") + label + ". Все одно додати в «Хочу»?", [
        ["new", "Додати"],
        ["cancel", "Скасувати"],
      ]);
      return ch === "new" ? null : "cancel";
    }
  }
  if (d.status === "tasted") {
    const other = tasted || have;
    if (other) {
      const ch = await _choice("Вже є запис: " + label + " (" + STATUS_LABEL[other.status] + "). Додати ще один?", [
        ["new", "Додати"],
        ["cancel", "Скасувати"],
      ]);
      return ch === "new" ? null : "cancel";
    }
  }
  return null;
}

// ---------- Збереження ----------
async function _saveForm(next) {
  if (_saving) return;
  if (_photoBusy) { _toast("Зачекай — фото ще стискається"); return; }

  const d = _readForm();
  if (!d.brand) { _toast("Вкажи бренд", "err"); $("cnBrand").focus(); return; }
  if (!d.name) { _toast("Вкажи назву / смак", "err"); $("cnName").focus(); return; }
  if (!d.volume) { _toast("Вкажи об'єм", "err"); return; }
  if (d.volume > 5000) { _toast("Перевір об'єм", "err"); return; }
  if (d.barcode && !/^\d{6,14}$/.test(d.barcode)) {
    _toast("Штрихкод — лише цифри", "err");
    $("cnExtra").open = true;
    $("cnBarcode").focus();
    return;
  }
  if (d.year && (d.year < 1980 || d.year > 2100)) { _toast("Перевір рік випуску", "err"); return; }
  if (d.status !== "want" && d.acquiredDate && d.acquiredDate > _todayLocal()) {
    const ch = await _choice("Дата у майбутньому (" + _fmtDate(d.acquiredDate) + "). Все одно зберегти?", [["ok", "Зберегти"], ["cancel", "Скасувати"]]);
    if (ch !== "ok") return;
  }

  _saving = true;
  const saveBtn = $("cnSaveBtn");
  const nextBtn = $("cnSaveNextBtn");
  saveBtn.disabled = true;
  nextBtn.disabled = true;

  try {
    let targetId = _form.id;
    let fromWish = _form.mode === "buy";
    let transferring = false;
    const now = Date.now();

    if (_form.mode === "new") {
      const res = await _dupCheck(d);
      if (res === "cancel") return;
      if (res && res.action === "inc") {
        const batch = writeBatch(db);
        batch.update(doc(db, "cans", res.id), { qty: increment(d.qty), updatedAt: now });
        const r = await _commit(batch);
        _toast("+" + d.qty + " до наявної: " + (d.brand + " " + d.name).trim() + (r === "slow" ? SLOW_NOTE : ""));
        _afterSave(next);
        return;
      }
      if (res && res.action === "transfer") {
        targetId = res.id;
        transferring = true;
        if (res.fromWish) fromWish = true;
      }
    }

    const ref = targetId ? doc(db, "cans", targetId) : doc(collection(db, "cans"));
    let payload = Object.assign({}, d, { updatedAt: now });
    if (fromWish) payload.fromWish = true;
    if (transferring) {
      // Не затираємо заповнене раніше порожніми полями форми
      Object.keys(payload).forEach((k) => {
        if (k === "status" || k === "qty") return;
        const v = payload[k];
        if (v === "" || v === 0) delete payload[k];
      });
    }

    const batch = writeBatch(db);
    if (_formPhoto) {
      payload.hasPhoto = true;
      batch.set(doc(db, "can_photos", ref.id + "_t"), { kind: "t", canId: ref.id, data: _formPhoto.thumb, userId: _uid, updatedAt: now });
      batch.set(doc(db, "can_photos", ref.id + "_f"), { kind: "f", canId: ref.id, data: _formPhoto.full, userId: _uid, updatedAt: now });
      _fullCache[ref.id] = _formPhoto.full;
      _thumbs[ref.id] = _formPhoto.thumb;
    } else if (_formPhotoRemoved && targetId && _form.mode !== "new") {
      payload.hasPhoto = false;
      batch.delete(doc(db, "can_photos", ref.id + "_t"));
      batch.delete(doc(db, "can_photos", ref.id + "_f"));
      delete _fullCache[ref.id];
      delete _thumbs[ref.id];
    }

    if (targetId) {
      batch.set(ref, payload, { merge: true });
    } else {
      payload = Object.assign(payload, { hasPhoto: !!_formPhoto, userId: _uid, createdAt: now });
      batch.set(ref, payload);
    }

    const r = await _commit(batch);

    const name = (d.brand + " " + d.name).trim();
    const tail = r === "slow" ? SLOW_NOTE : "";
    if (_form.mode === "buy" || _form.mode === "promote" || transferring) _toast("🥫 В колекції: " + name + tail);
    else if (targetId) _toast("Оновлено: " + name + tail);
    else _toast((d.status === "want" ? "⭐ У «Хочу»: " : d.status === "tasted" ? "👅 Куштував: " : "🥫 Додано: ") + name + tail);

    _afterSave(next);
  } catch (err) {
    _toastErr(err);
  } finally {
    _saving = false;
    saveBtn.disabled = false;
    nextBtn.disabled = false;
  }
}

function _afterSave(next) {
  if (next && _form.mode === "new") {
    _resetFields(true);
    _form = { mode: "new", id: null };
    $("cnName").focus();
    return;
  }
  _closeOverlay($("cnForm"));
}

// ================================================================
//  СТАТИСТИКА
// ================================================================
function _renderStats() {
  const panel = $("cnPanelStats");
  if (!panel) return;
  if (!_cans.length) {
    panel.innerHTML = '<div class="cn-empty">Статистика з\'явиться, щойно додаси першу банку.</div>' + _backupHtml();
    _bindBackup();
    return;
  }

  const have = _cans.filter((c) => c.status === "have");
  const want = _cans.filter((c) => c.status === "want");
  const tasted = _cans.filter((c) => c.status === "tasted");
  const physical = have.reduce((s, c) => s + _qty(c), 0);
  const dupes = have.reduce((s, c) => s + (_qty(c) - 1), 0);
  const rated = _cans.filter((c) => c.status !== "want" && parseFloat(c.rating) > 0);
  const spent = have.reduce((s, c) => s + (parseFloat(c.price) || 0) * _qty(c), 0) +
    tasted.reduce((s, c) => s + (parseFloat(c.price) || 0), 0);

  const tile = (val, lbl) => '<div class="cn-stat"><div class="cn-stat-val">' + val + '</div><div class="cn-stat-lbl">' + lbl + "</div></div>";
  let html = '<div class="cn-tiles">' +
    tile(have.length, "унікальних банок") +
    tile(physical, "банок фізично") +
    tile(dupes, "дублів на обмін") +
    tile(want.length, "у «Хочу»") +
    tile(rated.length, "оцінено на смак") +
    tile(spent ? Math.round(spent).toLocaleString("uk-UA") + "<small>₴</small>" : "—", "витрачено") +
  "</div>";

  // --- Бренди (одна серія — один колір, підписи — текстом) ---
  const brands = _brandCounts(have);
  if (brands.length) {
    const max = brands[0].n;
    html += '<div class="cn-sec-title">Бренди в колекції</div><div class="cn-card"><div class="cn-bars">' +
      brands.map((b) => {
        const pct = Math.round((b.n / have.length) * 100);
        return '<div><div class="cn-bar-head"><span>' + _esc(b.label) + "</span><span>" + b.n + " · " + pct + "%</span></div>" +
          '<div class="cn-bar-track"><div class="cn-bar-fill" style="width:' + (b.n / max * 100).toFixed(1) + '%"></div></div></div>';
      }).join("") + "</div></div>";
  }

  // --- Повнота серій: є / (є + хочу) по брендах ---
  const series = {};
  _cans.forEach((c) => {
    if (c.status !== "have" && c.status !== "want") return;
    const k = _norm(c.brand);
    if (!series[k]) series[k] = { label: c.brand.trim(), have: 0, want: 0, fromWish: 0 };
    series[k][c.status]++;
    if (c.status === "have" && c.fromWish) series[k].fromWish++;
  });
  // Показуємо бренди, де є «Хочу» або вже закриті бажання (100%)
  const withWant = Object.values(series).filter((s) => s.want > 0 || s.fromWish > 0)
    .sort((a, b) => (b.have / (b.have + b.want)) - (a.have / (a.have + a.want)) || b.have - a.have);
  html += '<div class="cn-sec-title">Повнота серій</div>';
  if (withWant.length) {
    html += '<div class="cn-sec-note">Скільки з бажаного вже зібрано: є / (є + у «Хочу»).</div>' +
      '<div class="cn-card"><div class="cn-bars">' +
      withWant.map((s) => {
        const total = s.have + s.want;
        return '<div><div class="cn-bar-head"><span>' + _esc(s.label) + "</span><span>" + s.have + " / " + total + "</span></div>" +
          '<div class="cn-bar-track"><div class="cn-bar-fill" style="width:' + (s.have / total * 100).toFixed(1) + '%"></div></div></div>';
      }).join("") + "</div></div>";
  } else {
    html += '<div class="cn-sec-note">Додай банки в «Хочу» — тут з\'явиться, скільки лишилось до повної серії кожного бренду.</div>';
  }

  // --- Країни маркування ---
  const byCountry = {};
  have.forEach((c) => {
    const k = _norm(c.country);
    if (!k) return;
    if (!byCountry[k]) byCountry[k] = { label: c.country.trim(), n: 0 };
    byCountry[k].n++;
  });
  const countries = Object.values(byCountry).sort((a, b) => b.n - a.n);
  const noCountry = have.filter((c) => !_norm(c.country)).length;
  if (countries.length) {
    html += '<div class="cn-sec-title">Країни маркування · ' + countries.length + '</div><div class="cn-card"><div class="cn-list-rows">' +
      countries.map((x) => '<div class="cn-lrow"><span class="cn-lrow-l">' + (_flag(x.label) || "🏳️") + " " + _esc(x.label) +
        '</span><span class="cn-lrow-v">' + x.n + "</span></div>").join("") +
      (noCountry ? '<div class="cn-lrow"><span class="cn-lrow-l" style="color:var(--text-muted)">Не вказано</span><span class="cn-lrow-v">' + noCountry + "</span></div>" : "") +
      "</div></div>";
  }

  // --- Тип випуску та об'єми ---
  const byEdition = {};
  have.forEach((c) => { const e = EDITION_LABEL[c.edition] ? c.edition : "regular"; byEdition[e] = (byEdition[e] || 0) + 1; });
  const byVol = {};
  have.forEach((c) => { const v = _vol(c); if (v) byVol[v] = (byVol[v] || 0) + 1; });
  html += '<div class="cn-sec-title">Тип випуску</div><div class="cn-pills">' +
    Object.keys(EDITION_LABEL).filter((k) => byEdition[k]).map((k) =>
      '<span class="cn-pill">' + EDITION_LABEL[k] + "<span>" + byEdition[k] + "</span></span>").join("") + "</div>";
  const vols = Object.keys(byVol).map(Number).sort((a, b) => a - b);
  if (vols.length) {
    html += '<div class="cn-sec-title">Об\'єми</div><div class="cn-pills">' +
      vols.map((v) => '<span class="cn-pill">' + v + " мл<span>" + byVol[v] + "</span></span>").join("") + "</div>";
  }

  // --- Смак ---
  if (rated.length) {
    const top = rated.slice().sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating) || (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);
    html += '<div class="cn-sec-title">Найсмачніші</div><div class="cn-card"><div class="cn-list-rows">' +
      top.map((c) => '<div class="cn-lrow"><span class="cn-lrow-l">' + _esc(_title(c)) + '</span><span class="cn-lrow-v">★ ' +
        _num(parseFloat(c.rating)) + "</span></div>").join("") + "</div></div>";

    const byBrand = {};
    rated.forEach((c) => {
      const k = _norm(c.brand);
      if (!byBrand[k]) byBrand[k] = { label: c.brand.trim(), sum: 0, n: 0 };
      byBrand[k].sum += parseFloat(c.rating);
      byBrand[k].n++;
    });
    const avg = Object.values(byBrand).filter((b) => b.n >= 2).sort((a, b) => b.sum / b.n - a.sum / a.n);
    if (avg.length) {
      html += '<div class="cn-sec-title">Середня оцінка бренду</div><div class="cn-card"><div class="cn-list-rows">' +
        avg.map((b) => '<div class="cn-lrow"><span class="cn-lrow-l">' + _esc(b.label) + '</span><span class="cn-lrow-v">★ ' +
          (b.sum / b.n).toFixed(1).replace(".", ",") + " · " + b.n + " оцін.</span></div>").join("") + "</div></div>";
    }
  }

  // --- Кофеїн ---
  const caf = _cans.filter((c) => parseFloat(c.caffeine) > 0);
  if (caf.length) {
    const strongest = caf.slice().sort((a, b) => parseFloat(b.caffeine) - parseFloat(a.caffeine))[0];
    const avgCaf = caf.reduce((s, c) => s + parseFloat(c.caffeine), 0) / caf.length;
    html += '<div class="cn-sec-title">Кофеїн</div><div class="cn-card"><div class="cn-list-rows">' +
      '<div class="cn-lrow"><span class="cn-lrow-l">Найміцніша: ' + _esc(_title(strongest)) + '</span><span class="cn-lrow-v">' +
        _num(parseFloat(strongest.caffeine)) + " мг/100 мл</span></div>" +
      '<div class="cn-lrow"><span class="cn-lrow-l">Середнє по ' + caf.length + ' банк.</span><span class="cn-lrow-v">' +
        avgCaf.toFixed(1).replace(".", ",") + " мг/100 мл</span></div>" +
      "</div></div>";
  }

  // --- Поповнення за 12 місяців ---
  html += _monthsHtml(have);

  html += _backupHtml();
  panel.innerHTML = html;
  _bindMonths(have);
  _bindBackup();
}

function _monthBuckets(have) {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ y: d.getFullYear(), m: d.getMonth(), key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), n: 0 });
  }
  have.forEach((c) => {
    const key = String(_dateOf(c)).slice(0, 7);
    const b = buckets.find((x) => x.key === key);
    if (b) b.n++;
  });
  return buckets;
}

function _monthsHtml(have) {
  const buckets = _monthBuckets(have);
  const total = buckets.reduce((s, b) => s + b.n, 0);
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const maxIdx = buckets.reduce((bi, b, i) => (b.n > buckets[bi].n ? i : bi), 0);
  const last = buckets.length - 1;
  const cols = buckets.map((b, i) => {
    const h = b.n ? Math.max(4, Math.round((b.n / max) * 100)) : 0;
    // Підписуємо лише максимум і поточний місяць; решта — по натисканню
    const label = b.n && (i === maxIdx || i === last) ? '<span class="cn-col-val">' + b.n + "</span>" : "";
    return '<div class="cn-col' + (b.n ? "" : " zero") + (i === _monthSel ? " sel" : "") + '" data-i="' + i + '" title="' +
      MONTHS_FULL[b.m] + " " + b.y + ": " + b.n + '">' + label +
      '<div class="cn-col-bar" style="height:' + h + '%"></div></div>';
  }).join("");
  const labels = buckets.map((b) => "<span>" + MONTHS[b.m] + "</span>").join("");
  return '<div class="cn-sec-title">Поповнення колекції</div><div class="cn-card cn-months">' +
    '<div class="cn-months-readout" id="cnMonthReadout">' + _monthReadout(buckets, _monthSel, total) + "</div>" +
    '<div class="cn-cols">' + cols + '</div><div class="cn-col-labels">' + labels + "</div></div>";
}

function _monthReadout(buckets, i, total) {
  if (i >= 0 && buckets[i]) {
    const b = buckets[i];
    return MONTHS_FULL[b.m] + " " + b.y + ": " + b.n + " <span>нових банок</span>";
  }
  return "За 12 місяців: " + total + " <span>нових банок · натисни на стовпчик</span>";
}

function _bindMonths(have) {
  const cols = document.querySelectorAll("#cnPanelStats .cn-col");
  if (!cols.length) return;
  const buckets = _monthBuckets(have);
  const total = buckets.reduce((s, b) => s + b.n, 0);
  cols.forEach((col) => {
    col.addEventListener("click", () => {
      const i = parseInt(col.dataset.i);
      _monthSel = _monthSel === i ? -1 : i;
      cols.forEach((x) => x.classList.toggle("sel", parseInt(x.dataset.i) === _monthSel));
      $("cnMonthReadout").innerHTML = _monthReadout(buckets, _monthSel, total);
    });
  });
}

// ================================================================
//  РЕЗЕРВНА КОПІЯ: CSV (таблиця) і JSON (усе, з фото) + відновлення
// ================================================================
function _backupHtml() {
  return '<div class="cn-sec-title">Резервна копія</div>' +
    '<div class="cn-backup">' +
      '<button type="button" id="cnExpCsv">📊 Таблиця CSV</button>' +
      '<button type="button" id="cnExpJson">💾 Повна копія JSON</button>' +
      '<button type="button" id="cnImpJson" class="cn-restore">⬆ Відновити з JSON</button>' +
    "</div>";
}

function _bindBackup() {
  const csv = $("cnExpCsv");
  const json = $("cnExpJson");
  const imp = $("cnImpJson");
  if (csv) csv.addEventListener("click", _exportCSV);
  if (json) json.addEventListener("click", _exportJSON);
  if (imp) imp.addEventListener("click", () => $("cnFileImport").click());
  const file = $("cnFileImport");
  if (file && !file.dataset.bound) {
    file.dataset.bound = "1";
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (f) _importJSON(f);
    });
  }
}

function _exportCSV() {
  if (!_cans.length) { _toast("Колекція порожня"); return; }
  const headers = ["Статус", "Бренд", "Назва", "Об'єм, мл", "Серія", "Тип випуску", "Країна", "Рік", "Штрихкод",
    "Стан", "Кількість", "Дата", "Де", "Ціна, ₴", "Подарунок від", "Оцінка", "Кофеїн, мг/100 мл", "Цукор",
    "Пріоритет", "Де шукати", "Нотатка"];
  const order = { have: 0, want: 1, tasted: 2 };
  const rows = _cans.slice().sort((a, b) => (order[a.status] - order[b.status]) ||
    _norm(a.brand).localeCompare(_norm(b.brand), "uk") || _norm(a.name).localeCompare(_norm(b.name), "uk"))
    .map((c) => [
      STATUS_LABEL[c.status] || c.status, c.brand, c.name, _vol(c) || "", c.series, EDITION_LABEL[c.edition] || "",
      c.country, parseInt(c.year) || "", c.barcode, c.status === "have" ? (CONDITION_LABEL[c.condition] || "") : "",
      c.status === "have" ? _qty(c) : "", c.acquiredDate, c.place, parseFloat(c.price) || "", c.giftFrom,
      parseFloat(c.rating) || "", parseFloat(c.caffeine) || "", SUGAR_LABEL[c.sugar] || "",
      c.status === "want" ? PRIO_LABEL[parseInt(c.priority) || 2] : "", c.whereToFind, String(c.note || "").replace(/[\r\n]+/g, " "),
    ]);
  const csv = [headers].concat(rows).map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\n");
  _download("cans_" + _todayLocal() + ".csv", new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  _toast("Таблицю збережено");
}

async function _exportJSON() {
  if (!_cans.length) { _toast("Колекція порожня"); return; }
  const btn = $("cnExpJson");
  if (btn) { btn.disabled = true; btn.textContent = "Збираю фото…"; }
  try {
    const snap = await getDocs(collection(db, "can_photos"));
    const photos = {};
    snap.docs.forEach((d) => {
      const x = d.data();
      if (!x || !x.canId || !x.data) return;
      if (!photos[x.canId]) photos[x.canId] = {};
      photos[x.canId][x.kind === "f" ? "f" : "t"] = x.data;
    });
    const payload = {
      app: "records-room/cans",
      version: 1,
      exportedAt: new Date().toISOString(),
      cans: _cans.map((c) => Object.assign({}, c)),
      photos,
    };
    _download("cans_backup_" + _todayLocal() + ".json", new Blob([JSON.stringify(payload)], { type: "application/json" }));
    _toast("Копію збережено: " + _cans.length + " банок");
  } catch (err) {
    _toastErr(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Повна копія JSON"; }
  }
}

async function _importJSON(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    _toast("Файл не читається як JSON", "err");
    return;
  }
  if (!data || data.app !== "records-room/cans" || !Array.isArray(data.cans)) {
    _toast("Це не резервна копія банок", "err");
    return;
  }
  const items = data.cans.filter((c) => c && typeof c.id === "string" && c.id && !/[\/]/.test(c.id) && c.brand);
  if (!items.length) { _toast("У файлі немає банок", "err"); return; }
  const ch = await _choice("Відновити " + items.length + " банок з файлу від " +
    _fmtDate(String(data.exportedAt || "").slice(0, 10)) + "? Записи з тими самими ID буде перезаписано, решта колекції не зміниться.",
    [["ok", "Відновити"], ["cancel", "Скасувати"]]);
  if (ch !== "ok") return;

  const photos = data.photos || {};
  let batch = writeBatch(db);
  let ops = 0;
  let bytes = 0;
  let done = 0;
  try {
    for (const c of items) {
      const rest = Object.assign({}, c);
      delete rest.id;
      rest.userId = _uid;
      const ph = photos[c.id] || {};
      rest.hasPhoto = !!(ph.t || ph.f);
      batch.set(doc(db, "cans", c.id), rest);
      ops++; bytes += 2000;
      if (typeof ph.t === "string" && ph.t.startsWith("data:image/")) {
        batch.set(doc(db, "can_photos", c.id + "_t"), { kind: "t", canId: c.id, data: ph.t, userId: _uid, updatedAt: Date.now() });
        ops++; bytes += ph.t.length;
      }
      if (typeof ph.f === "string" && ph.f.startsWith("data:image/")) {
        batch.set(doc(db, "can_photos", c.id + "_f"), { kind: "f", canId: c.id, data: ph.f, userId: _uid, updatedAt: Date.now() });
        ops++; bytes += ph.f.length;
      }
      done++;
      if (ops >= 400 || bytes > 3500000) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0; bytes = 0;
        $("status").innerText = "Відновлено " + done + " / " + items.length;
      }
    }
    if (ops) await batch.commit();
    $("status").innerText = "Хмара синхронізована";
    _toast("Відновлено: " + done + " банок");
  } catch (err) {
    _toastErr(err);
  }
}
