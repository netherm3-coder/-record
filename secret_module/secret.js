// ================================================================
//  secret_module/secret.js — Архів v2
//  Firebase: private_logs { timestamp, type, note, is_hardcore, userId }
// ================================================================

import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, onSnapshot, query, orderBy, deleteDoc, doc, limit,
  setDoc, updateDoc, deleteField,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MEDIA_FILES = [
  "assets/redvid_io_violating_that_throatpussy_of_hers.gif",
  "assets/RDT_20260421_2301107487583688953369648.jpg",
  "assets/RDT_20260421_2304236334329579471223536.jpg",
  "assets/hrer.gif",
  "assets/rapidsave.com_CMAF_1080.mp4",
  "assets/rapidsave.com_wpfwxrtq7npg1.gif",
  "assets/Final1.mp4",
  "assets/final2.mp4",
];

const MEDIA_PASS = "555";   // код на вкладку «Медіа»
// Код питаємо раз за сесію: закрив і знову відкрив Архів — не питає.
// Закриєш застосунок (вкладку) повністю — спитає знову.
const MEDIA_OK_KEY = "smMediaOk";
var _mediaUnlocked = false;
function _isMediaUnlocked() {
  if (_mediaUnlocked) return true;
  try { return sessionStorage.getItem(MEDIA_OK_KEY) === "1"; } catch (e) { return false; }
}
function _rememberMediaUnlock() {
  _mediaUnlocked = true;
  try { sessionStorage.setItem(MEDIA_OK_KEY, "1"); } catch (e) { /* noop */ }
}
var _keyHandler = null;
var _unsub = null;
var _allLogs = [];
var _manualLoc = null; // країна для форми «Вручну»

export async function openSecretModule() {
  if (getApps().length === 0 || !getAuth(getApp()).currentUser) { _show404(); return; }
  _showContent();
}

// ================================================================
//  CLIPBOARD EXPORT FOR AI
// ================================================================
function copyAiPrompt() {
  var normal = _normalLogs();
  var totalCount = normal.length;
  var hardcoreCount = normal.filter(function (l) { return _isHardcore(l); }).length;
  var sCount = _allLogs.filter(function (l) { return _isS(l); }).length;
  var now = new Date();

  // R_dop (без впливу + та S)
  var S = _getStreak(now);
  var sevenAgo = now.getTime() - 7 * 86400000;
  var N_7d = 0;
  normal.forEach(function (l) { if (l.timestamp >= sevenAgo && !_isHardcore(l)) N_7d++; });
  var R_dop = (Math.log(S + 1) * 5 - (N_7d * 2.5)) * -1;
  R_dop = Math.round(R_dop * 100) / 100;

  // Останні 10 (без S)
  var last10 = normal.slice(0, 10).map(function (l) {
    var d = new Date(l.timestamp);
    var ds = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    var tag = _isHardcore(l) ? " [+]" : "";
    return ds + tag;
  }).join("\n");

  var text = "Дій як нейробіолог. Проаналізуй мої дані.\n" +
    "Метрики: Поточний індекс R_dop=" + R_dop + ", Всього записів " + totalCount +
    ", З них з обтяженням (+) " + hardcoreCount +
    (sCount > 0 ? ", Окремих S-записів: " + sCount : "") + ".\n" +
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

function _isS(log) {
  return log.is_s === true;
}

function _normalLogs() {
  // Логи без S-рангу — використовуються в усіх формулах
  return _allLogs.filter(function (l) { return !_isS(l); });
}

function _dayStart(ts) {
  var d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function _getStreak(now) {
  // Тільки НЕ-hardcore і НЕ-S записи впливають на стрік
  var nonHC = _allLogs.filter(function (l) { return !_isHardcore(l) && !_isS(l); });
  if (nonHC.length === 0) return _allLogs.length > 0 ? 252 : 0;
  var lastTs = Math.max.apply(null, nonHC.map(function (l) { return l.timestamp; }));
  // Рахуємо КАЛЕНДАРНІ доби, а не сирі 24-годинні проміжки:
  // запис учора о 23:00 і зараз 08:00 — це вже 1 день, а не 0.
  var days = Math.round((_dayStart(now.getTime()) - _dayStart(lastTs)) / 86400000);
  return days < 0 ? 0 : days;
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
        '<button class="sm-tab" data-tab="countries">Країни</button>' +
        '<button class="sm-tab" data-tab="media">Медіа</button>' +
      '</div>' +
      '<div class="sm-body">' +
        '<div class="sm-panel active" id="smPanelStats"></div>' +
        '<div class="sm-panel" id="smPanelCountries"></div>' +
        '<div class="sm-panel" id="smPanelMedia"></div>' +
      '</div>' +
    '</div>';

  // Tabs
  overlay.querySelectorAll(".sm-tab").forEach(function (t) {
    t.addEventListener("click", function () {
      var id = t.dataset.tab;

      // Медіа під кодом — раз за сесію
      if (id === "media" && !_isMediaUnlocked()) {
        _askMediaPass(overlay, function () {
          _rememberMediaUnlock();
          _activateTab(overlay, t, id);
        });
        return;
      }
      _activateTab(overlay, t, id);
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

  // «Назад» на телефоні закриває Архів (і вікна в ньому), а не весь застосунок
  if (!_popBound) { _popBound = true; window.addEventListener("popstate", _onArchivePop); }
  try { history.pushState({ smArchive: 1 }, ""); _histPushed = true; } catch (e) { _histPushed = false; }

  var mediaPanelEl = overlay.querySelector("#smPanelMedia");
  _initMedia(mediaPanelEl);
  _listenLogs(overlay.querySelector("#smPanelStats"));

  // Зупиняємо медіа при перемиканні на вкладку Статистика
  overlay.querySelectorAll(".sm-tab").forEach(function (t) {
    t.addEventListener("click", function () {
      if (t.dataset.tab !== "media" && mediaPanelEl._mediaCleanup) {
        mediaPanelEl._mediaCleanup();
      }
    });
  });
}


// ================================================================
//  ВКЛАДКА «КРАЇНИ»
// ================================================================
function _renderCountries() {
  var panel = document.getElementById("smPanelCountries");
  if (!panel) return;
  if (!panel._locBound) {
    panel._locBound = true;
    _bindLocBar(panel, function () {
      _renderCountries();
      var st = document.getElementById("smPanelStats");
      if (st) _renderStats(st);
    });
  }

  var total = _allLogs.length;
  var abroad = _allLogs.filter(function (l) { return l.country_code && l.country_code !== HOME_CC; });

  if (abroad.length === 0) {
    panel.innerHTML = _locBarHtml() +
      '<div class="sm-cn-empty">' +
        '<div class="sm-cn-empty-icon">🌍</div>' +
        '<div class="sm-cn-empty-title">Поки лише вдома</div>' +
        '<div class="sm-cn-empty-text">Країну записам ставить «Де я зараз». Уже зроблений запис можна ' +
        'виправити — натисни прапорець біля нього у «Статистиці». Всі ' + total + ' записів — домашні.</div>' +
      '</div>';
    return;
  }

  // Групування по країнах
  var byCc = {};
  abroad.forEach(function (l) {
    var cc = l.country_code;
    if (!byCc[cc]) {
      byCc[cc] = { cc: cc, name: l.country || cc, count: 0, first: l.timestamp, last: l.timestamp, cities: {} };
    }
    var g = byCc[cc];
    g.count++;
    if (l.timestamp < g.first) g.first = l.timestamp;
    if (l.timestamp > g.last) g.last = l.timestamp;
    if (l.city) g.cities[l.city] = (g.cities[l.city] || 0) + 1;
  });

  var list = Object.keys(byCc).map(function (k) { return byCc[k]; })
    .sort(function (a, b) { return b.count - a.count; });

  var maxCount = list[0].count;
  var homeCount = total - abroad.length;
  var pctAbroad = total ? Math.round((abroad.length / total) * 100) : 0;

  var head =
    '<div class="sm-cn-head">' +
      '<div class="sm-cn-box"><span class="sm-cn-num">' + list.length + '</span><span class="sm-cn-lbl">країн</span></div>' +
      '<div class="sm-cn-box"><span class="sm-cn-num">' + abroad.length + '</span><span class="sm-cn-lbl">за кордоном</span></div>' +
      '<div class="sm-cn-box"><span class="sm-cn-num">' + pctAbroad + '%</span><span class="sm-cn-lbl">від усіх</span></div>' +
    '</div>' +
    '<div class="sm-cn-home">' + _flag(HOME_CC) + ' Україна — ' + homeCount + ' записів</div>';

  var rows = list.map(function (g) {
    var pct = Math.round((g.count / maxCount) * 100);
    var share = total ? Math.round((g.count / total) * 100) : 0;
    var cityNames = Object.keys(g.cities)
      .sort(function (a, b) { return g.cities[b] - g.cities[a]; })
      .slice(0, 3).join(", ");
    return '<div class="sm-cn-row">' +
      '<div class="sm-cn-row-top">' +
        '<span class="sm-cn-flag">' + _flag(g.cc) + '</span>' +
        '<span class="sm-cn-name">' + _esc(g.name) + '</span>' +
        '<span class="sm-cn-count">' + g.count + ' зап.</span>' +
      '</div>' +
      '<div class="sm-cn-bar"><div class="sm-cn-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="sm-cn-meta">' +
        _fmtShort(g.first) + (g.last !== g.first ? " — " + _fmtShort(g.last) : "") +
        ' · ' + share + '% від усіх' +
        (cityNames ? ' · ' + _esc(cityNames) : "") +
      '</div>' +
    '</div>';
  }).join("");

  panel.innerHTML = _locBarHtml() + head + '<div class="sm-cn-list">' + rows + '</div>';
}

function _fmtShort(ts) {
  var d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "." +
         String(d.getMonth() + 1).padStart(2, "0") + "." +
         String(d.getFullYear()).slice(2);
}

// ================================================================
//  МІСЦЕ ЗАПИСУ — вручну
//  Раніше країну визначав ipapi.co за IP. З українською SIM у роумінгу
//  інтернет іде через Україну, тож закордон записувався як дім (а Brave
//  ще й блокує цей сервіс). Тепер «Де я зараз» ставиш сам — пам'ятається
//  на телефоні; часовий пояс телефона лише підказує, якщо забув перемкнути.
//  Країна зберігається ЛИШЕ для закордонних записів (як і раніше):
//  домашні = всього мінус закордонні.
// ================================================================
var HOME_CC = "UA";
var LOC_KEY = "smLoc";
var LOC_HINT_OFF_KEY = "smLocHintOff";

var COUNTRY_LIST = [
  ["UA", "Україна"], ["PL", "Польща"], ["DE", "Німеччина"], ["CZ", "Чехія"], ["SK", "Словаччина"],
  ["HU", "Угорщина"], ["RO", "Румунія"], ["MD", "Молдова"], ["AT", "Австрія"], ["CH", "Швейцарія"],
  ["NL", "Нідерланди"], ["BE", "Бельгія"], ["LU", "Люксембург"], ["FR", "Франція"], ["IT", "Італія"],
  ["ES", "Іспанія"], ["PT", "Португалія"], ["GB", "Велика Британія"], ["IE", "Ірландія"], ["DK", "Данія"],
  ["NO", "Норвегія"], ["SE", "Швеція"], ["FI", "Фінляндія"], ["EE", "Естонія"], ["LV", "Латвія"],
  ["LT", "Литва"], ["BG", "Болгарія"], ["GR", "Греція"], ["HR", "Хорватія"], ["SI", "Словенія"],
  ["RS", "Сербія"], ["BA", "Боснія і Герцеговина"], ["ME", "Чорногорія"], ["MK", "Північна Македонія"],
  ["AL", "Албанія"], ["MT", "Мальта"], ["CY", "Кіпр"], ["IS", "Ісландія"], ["TR", "Туреччина"],
  ["GE", "Грузія"], ["AM", "Вірменія"], ["AZ", "Азербайджан"], ["KZ", "Казахстан"], ["IL", "Ізраїль"],
  ["AE", "ОАЕ"], ["QA", "Катар"], ["SA", "Саудівська Аравія"], ["EG", "Єгипет"], ["MA", "Марокко"],
  ["TN", "Туніс"], ["TH", "Таїланд"], ["VN", "В'єтнам"], ["ID", "Індонезія"], ["IN", "Індія"],
  ["CN", "Китай"], ["JP", "Японія"], ["KR", "Південна Корея"], ["SG", "Сінгапур"], ["AU", "Австралія"],
  ["NZ", "Нова Зеландія"], ["US", "США"], ["CA", "Канада"], ["MX", "Мексика"], ["BR", "Бразилія"],
  ["AR", "Аргентина"], ["ZA", "ПАР"],
];

// Часовий пояс телефона -> країна (лише для підказки; мережа не потрібна)
var TZ_CC = {
  "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Europe/Uzhgorod": "UA", "Europe/Zaporozhye": "UA", "Europe/Simferopol": "UA",
  "Europe/Warsaw": "PL", "Europe/Berlin": "DE", "Europe/Busingen": "DE", "Europe/Prague": "CZ", "Europe/Bratislava": "SK",
  "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Chisinau": "MD", "Europe/Vienna": "AT", "Europe/Zurich": "CH",
  "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Luxembourg": "LU", "Europe/Paris": "FR", "Europe/Rome": "IT",
  "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Copenhagen": "DK",
  "Europe/Oslo": "NO", "Europe/Stockholm": "SE", "Europe/Helsinki": "FI", "Europe/Tallinn": "EE", "Europe/Riga": "LV",
  "Europe/Vilnius": "LT", "Europe/Sofia": "BG", "Europe/Athens": "GR", "Europe/Zagreb": "HR", "Europe/Ljubljana": "SI",
  "Europe/Belgrade": "RS", "Europe/Sarajevo": "BA", "Europe/Podgorica": "ME", "Europe/Skopje": "MK", "Europe/Tirane": "AL",
  "Europe/Malta": "MT", "Asia/Nicosia": "CY", "Europe/Nicosia": "CY", "Atlantic/Reykjavik": "IS", "Europe/Istanbul": "TR",
  "Asia/Tbilisi": "GE", "Asia/Yerevan": "AM", "Asia/Baku": "AZ", "Asia/Jerusalem": "IL", "Asia/Dubai": "AE",
  "Asia/Qatar": "QA", "Africa/Cairo": "EG", "Asia/Bangkok": "TH", "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
  "Asia/Singapore": "SG", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Toronto": "CA", "America/Vancouver": "CA",
};

function _countryName(cc) {
  for (var i = 0; i < COUNTRY_LIST.length; i++) if (COUNTRY_LIST[i][0] === cc) return COUNTRY_LIST[i][1];
  return cc;
}

function _homeLoc() { return { cc: HOME_CC, name: _countryName(HOME_CC), city: "" }; }

function _normLoc(v) {
  if (!v || !/^[A-Z]{2}$/.test(String(v.cc || ""))) return _homeLoc();
  return { cc: v.cc, name: String(v.name || _countryName(v.cc)).slice(0, 60), city: String(v.city || "").slice(0, 60) };
}

function _getLoc() {
  try { return _normLoc(JSON.parse(localStorage.getItem(LOC_KEY) || "null")); } catch (e) { return _homeLoc(); }
}

function _setLoc(loc) {
  try { localStorage.setItem(LOC_KEY, JSON.stringify(_normLoc(loc))); } catch (e) { /* noop */ }
}

// Поля для запису: {} — вдома
function _locFields(loc) {
  loc = _normLoc(loc);
  if (loc.cc === HOME_CC) return {};
  return { country: loc.name, country_code: loc.cc, city: loc.city || "" };
}

function _locOfLog(l) {
  if (!l || !l.country_code) return _homeLoc();
  return _normLoc({ cc: String(l.country_code).toUpperCase(), name: l.country, city: l.city });
}

function _locLabel(loc) {
  loc = _normLoc(loc);
  return _flag(loc.cc) + " " + loc.name + (loc.cc !== HOME_CC && loc.city ? " · " + loc.city : "");
}

function _tzName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; }
}

// Підказка: часовий пояс телефона каже одне, «Де я зараз» — інше
function _locHint() {
  var tz = _tzName();
  var cc = TZ_CC[tz];
  var loc = _getLoc();
  if (!cc || cc === loc.cc) return null;
  var key = tz + "|" + loc.cc;
  try { if (localStorage.getItem(LOC_HINT_OFF_KEY) === key) return null; } catch (e) { /* noop */ }
  return { cc: cc, key: key };
}

// Блок «Де я зараз» (+ підказка) — у «Статистиці» та «Країнах»
function _locBarHtml() {
  var loc = _getLoc();
  var abroad = loc.cc !== HOME_CC;
  var hint = _locHint();
  return '<div class="sm-loc-wrap">' +
    (hint
      ? '<div class="sm-loc-hint">Часовий пояс телефона — ' + _flag(hint.cc) + ' ' + _esc(_countryName(hint.cc)) + '. ' +
          (hint.cc === HOME_CC ? 'Ти вже вдома?' : 'Ти зараз там?') +
          '<span class="sm-loc-hint-btns">' +
            '<button class="sm-loc-hint-yes" data-cc="' + hint.cc + '">Так</button>' +
            '<button class="sm-loc-hint-no" data-key="' + _esc(hint.key) + '">Ні</button>' +
          '</span>' +
        '</div>'
      : '') +
    '<button class="sm-loc' + (abroad ? ' sm-loc-abroad' : '') + '" data-loc-current="1">' +
      '<span class="sm-loc-flag">' + _flag(loc.cc) + '</span>' +
      '<span class="sm-loc-text">' +
        '<span class="sm-loc-lbl">Де я зараз</span>' +
        '<span class="sm-loc-name">' + _esc(loc.name) + (abroad && loc.city ? ' · ' + _esc(loc.city) : '') +
          (abroad ? '' : ' <span class="sm-loc-home">вдома</span>') + '</span>' +
      '</span>' +
      '<span class="sm-loc-edit">змінити</span>' +
    '</button>' +
  '</div>';
}

// Події блоку «Де я зараз» — делегування, переживає перемальовування
function _bindLocBar(root, rerender) {
  root.addEventListener("click", function (e) {
    var cur = e.target.closest("[data-loc-current]");
    if (cur) {
      _openLocPicker({
        title: "Де я зараз",
        initial: _getLoc(),
        onPick: function (loc) { _setLoc(loc); rerender(); },
      });
      return;
    }
    var yes = e.target.closest(".sm-loc-hint-yes");
    if (yes) {
      _setLoc({ cc: yes.dataset.cc, name: _countryName(yes.dataset.cc), city: "" });
      rerender();
      _showToast("Де я зараз: " + _locLabel(_getLoc()));
      return;
    }
    var no = e.target.closest(".sm-loc-hint-no");
    if (no) {
      try { localStorage.setItem(LOC_HINT_OFF_KEY, no.dataset.key); } catch (err) { /* noop */ }
      rerender();
    }
  });
}

// Вибір країни: опції { title, initial, onPick(loc) }
function _openLocPicker(opts) {
  var overlay = document.getElementById("smOverlay");
  if (!overlay) return;
  var old = overlay.querySelector("#smLocGate");
  if (old) old.remove();

  var sel = _normLoc(opts.initial);

  // Нещодавні країни із записів — угорі списку
  var recent = [];
  _allLogs.forEach(function (l) {
    var cc = l.country_code ? String(l.country_code).toUpperCase() : "";
    if (cc && cc !== HOME_CC && recent.indexOf(cc) === -1 && recent.length < 5) recent.push(cc);
  });
  var cur = _getLoc().cc;
  if (cur !== HOME_CC && recent.indexOf(cur) === -1) recent.unshift(cur);
  var top = [HOME_CC].concat(recent);
  var rest = COUNTRY_LIST.filter(function (c) { return top.indexOf(c[0]) === -1; })
    .sort(function (a, b) { return a[1].localeCompare(b[1], "uk"); });

  function btn(cc, name) {
    return '<button class="sm-pick-c' + (cc === sel.cc ? ' sel' : '') + '" data-cc="' + cc + '" data-name="' + _esc(name) + '">' +
      '<span class="sm-pick-flag">' + _flag(cc) + '</span><span>' + _esc(name) + '</span></button>';
  }

  var g = document.createElement("div");
  g.id = "smLocGate";
  g.className = "sm-pass-gate sm-pick-gate";
  g.innerHTML =
    '<div class="sm-pass-card sm-pick-card">' +
      '<div class="sm-pass-title">' + _esc(opts.title || "Країна") + '</div>' +
      '<input type="search" class="sm-input sm-pick-search" id="smPickSearch" placeholder="Пошук країни" autocomplete="off" />' +
      '<div class="sm-pick-list" id="smPickList">' +
        top.map(function (cc) { return btn(cc, _countryName(cc)); }).join("") +
        '<div class="sm-pick-sep"></div>' +
        rest.map(function (c) { return btn(c[0], c[1]); }).join("") +
      '</div>' +
      '<input type="text" class="sm-input sm-pick-city" id="smPickCity" maxlength="60" placeholder="Місто (необов\'язково)" autocomplete="off" />' +
      '<div class="sm-pass-btns">' +
        '<button class="sm-pass-cancel" id="smPickCancel">Скасувати</button>' +
        '<button class="sm-pass-ok" id="smPickOk">Готово</button>' +
      '</div>' +
    '</div>';
  overlay.appendChild(g);
  requestAnimationFrame(function () { g.classList.add("sm-pass-show"); });

  var city = g.querySelector("#smPickCity");
  city.value = sel.cc !== HOME_CC ? sel.city : "";
  function syncCity() { city.style.display = sel.cc === HOME_CC ? "none" : ""; }
  syncCity();
  var selBtn = g.querySelector(".sm-pick-c.sel");
  if (selBtn) setTimeout(function () { selBtn.scrollIntoView({ block: "nearest" }); }, 30);

  function close() {
    g.classList.remove("sm-pass-show");
    setTimeout(function () { g.remove(); }, 250);
  }

  g.querySelector("#smPickList").addEventListener("click", function (e) {
    var b = e.target.closest(".sm-pick-c");
    if (!b) return;
    if (b.dataset.cc !== sel.cc) city.value = "";
    sel = { cc: b.dataset.cc, name: b.dataset.name, city: "" };
    g.querySelectorAll(".sm-pick-c").forEach(function (x) { x.classList.toggle("sel", x === b); });
    syncCity();
  });
  g.querySelector("#smPickSearch").addEventListener("input", function (e) {
    var q = e.target.value.trim().toLowerCase();
    g.querySelectorAll(".sm-pick-c").forEach(function (x) {
      x.style.display = !q || x.dataset.name.toLowerCase().indexOf(q) !== -1 || x.dataset.cc.toLowerCase() === q ? "" : "none";
    });
    g.querySelector(".sm-pick-sep").style.display = q ? "none" : "";
  });
  g.querySelector("#smPickCancel").addEventListener("click", close);
  g.addEventListener("click", function (e) { if (e.target === g) close(); });
  g.querySelector("#smPickOk").addEventListener("click", function () {
    var loc = _normLoc({ cc: sel.cc, name: sel.name, city: sel.cc === HOME_CC ? "" : city.value.trim() });
    close();
    opts.onPick(loc);
  });
}

// Запис у базу без очікування сервера понад 2,5 с: без мережі запис уже
// лежить у кеші телефона й піде сам, щойно з'явиться зв'язок.
function _fastWrite(promise) {
  return Promise.race([
    promise.then(function () { return "ok"; }),
    new Promise(function (r) { setTimeout(function () { r("slow"); }, 2500); }),
  ]).then(function (res) {
    if (res === "slow") promise.catch(function (e) { _showToast("Помилка синхронізації: " + (e.code || e.message)); });
    return res;
  });
}

// ISO-код -> прапорець 🇵🇱
function _flag(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(
    0x1f1e6 + cc.toUpperCase().charCodeAt(0) - 65,
    0x1f1e6 + cc.toUpperCase().charCodeAt(1) - 65
  );
}

// ================================================================
//  MEDIA TAB
// ================================================================

// Перемикання вкладки
function _activateTab(overlay, tabBtn, id) {
  overlay.querySelectorAll(".sm-tab").forEach(function (x) { x.classList.remove("active"); });
  overlay.querySelectorAll(".sm-panel").forEach(function (x) { x.classList.remove("active"); });
  tabBtn.classList.add("active");
  var panel = overlay.querySelector("#smPanel" + id.charAt(0).toUpperCase() + id.slice(1));
  if (panel) panel.classList.add("active");
}

// Пароль на вкладку «Медіа»
function _askMediaPass(overlay, onOk) {
  var old = overlay.querySelector("#smPassGate");
  if (old) old.remove();

  var g = document.createElement("div");
  g.id = "smPassGate";
  g.className = "sm-pass-gate";
  g.innerHTML =
    '<div class="sm-pass-card">' +
      '<div class="sm-pass-title">Введи код</div>' +
      '<input type="password" id="smPassInput" class="sm-pass-input" inputmode="numeric" ' +
        'autocomplete="off" maxlength="12" placeholder="••••" />' +
      '<div class="sm-pass-err" id="smPassErr"></div>' +
      '<div class="sm-pass-btns">' +
        '<button class="sm-pass-cancel" id="smPassCancel">Скасувати</button>' +
        '<button class="sm-pass-ok" id="smPassOk">Далі</button>' +
      '</div>' +
    '</div>';
  overlay.appendChild(g);
  requestAnimationFrame(function () { g.classList.add("sm-pass-show"); });

  var input = g.querySelector("#smPassInput");
  var err = g.querySelector("#smPassErr");
  setTimeout(function () { input.focus(); }, 120);

  function close() {
    g.classList.remove("sm-pass-show");
    setTimeout(function () { g.remove(); }, 250);
  }
  function submit() {
    if (input.value.trim() === MEDIA_PASS) {
      close();
      onOk();
    } else {
      err.textContent = "Невірний код";
      input.value = "";
      g.querySelector(".sm-pass-card").classList.remove("sm-shake");
      void g.querySelector(".sm-pass-card").offsetWidth; // restart animation
      g.querySelector(".sm-pass-card").classList.add("sm-shake");
      input.focus();
    }
  }

  g.querySelector("#smPassOk").addEventListener("click", submit);
  g.querySelector("#smPassCancel").addEventListener("click", close);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
  g.addEventListener("click", function (e) { if (e.target === g) close(); });
}

function _initMedia(container) {
  var total = MEDIA_FILES.length;
  var current = 0;
  var tx0 = 0, dragging = false, dx = 0;
  var globalMuted = true;          // Звук вимкнений за замовчуванням
  var inactivityTimer = null;
  var INACTIVITY_LIMIT = 34000;    // 34 секунди

  // ---- Визначення типу файлу ----
  function isVideo(url) {
    return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url);
  }

  // ---- Рендер слайдів ----
  // Відео рендеруються без src — завантажуються лише при переході
  function makeFrame(url, active) {
    var cls = "sm-frame" + (active ? " active" : "");
    if (isVideo(url)) {
      return '<div class="' + cls + '" data-src="' + url + '" data-type="video">' +
        '<div class="sm-spinner"></div>' +
        '<video class="sm-img" loop muted playsinline preload="none" ' +
          'oncanplay="this.parentNode.classList.add(\'loaded\')" ' +
          'onerror="this.parentNode.classList.add(\'error\')">' +
        '</video>' +
      '</div>';
    }
    return '<div class="' + cls + '" data-type="image">' +
      '<div class="sm-spinner"></div>' +
      '<img src="' + url + '" alt="" class="sm-img" draggable="false" ' +
        'onload="this.parentNode.classList.add(\'loaded\')" ' +
        'onerror="this.parentNode.classList.add(\'error\')" />' +
    '</div>';
  }

  // SVG динаміка
  var SOUND_ON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>' +
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
    '</svg>';
  var SOUND_OFF_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
    '<line x1="23" y1="9" x2="17" y2="15"/>' +
    '<line x1="17" y1="9" x2="23" y2="15"/>' +
    '</svg>';

  container.innerHTML =
    '<div class="sm-track" id="smTrack">' +
      MEDIA_FILES.map(function (u, i) { return makeFrame(u, i === 0); }).join("") +
    '</div>' +
    '<div class="sm-media-footer">' +
      '<div class="sm-dots" id="smDots">' +
        MEDIA_FILES.map(function (_, i) {
          return '<span class="sm-dot ' + (i === 0 ? "active" : "") + '" data-i="' + i + '"></span>';
        }).join("") +
      '</div>' +
      '<button class="sm-sound-btn" id="smSoundBtn" style="display:none" aria-label="Звук">' +
        SOUND_OFF_SVG +
      '</button>' +
    '</div>';

  var track = container.querySelector("#smTrack");
  var frames = Array.prototype.slice.call(container.querySelectorAll(".sm-frame"));
  var dots = container.querySelectorAll(".sm-dot");
  var soundBtn = container.querySelector("#smSoundBtn");

  // ---- Lazy load відео ----
  function loadVideo(frame) {
    var video = frame.querySelector("video");
    if (!video || video.src) return; // вже завантажено
    var src = frame.dataset.src;
    if (src) video.src = src;
  }

  // ---- Застосувати muted до всіх відео ----
  function applyMute(muted) {
    frames.forEach(function (f) {
      var v = f.querySelector("video");
      if (v) v.muted = muted;
    });
    soundBtn.innerHTML = muted ? SOUND_OFF_SVG : SOUND_ON_SVG;
    soundBtn.classList.toggle("sm-sound-on", !muted);
  }

  // ---- Скинути звук (вимкнути + кнопка) ----
  function muteAll() {
    globalMuted = true;
    applyMute(true);
  }

  // ---- Таймер бездіяльності ----
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function () {
      muteAll();
    }, INACTIVITY_LIMIT);
  }

  // ---- Перехід на слайд ----
  function goTo(idx) {
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;

    // Зупиняємо поточне відео і перемотуємо на початок
    var prevVideo = frames[current].querySelector("video");
    if (prevVideo) {
      prevVideo.pause();
      prevVideo.currentTime = 0;
    }

    frames[current].classList.remove("active");
    dots[current].classList.remove("active");
    current = idx;
    frames[current].classList.add("active");
    dots[current].classList.add("active");

    // Lazy load + запуск нового відео
    var nextVideo = frames[current].querySelector("video");
    var hasVideos = MEDIA_FILES.some(function(u) { return isVideo(u); });

    if (nextVideo) {
      loadVideo(frames[current]);
      nextVideo.muted = globalMuted;
      nextVideo.currentTime = 0;
      nextVideo.play().catch(function () {});
      soundBtn.style.display = "flex";
      resetInactivityTimer();
    } else {
      // Якщо поточний слайд не відео — ховаємо кнопку тільки якщо взагалі немає відео
      if (!hasVideos) soundBtn.style.display = "none";
    }
  }

  // ---- Ініціалізація першого слайду ----
  (function init() {
    // Завантажуємо перший слайд якщо це відео
    var firstVideo = frames[0] && frames[0].querySelector("video");
    if (firstVideo) {
      loadVideo(frames[0]);
      firstVideo.play().catch(function () {});
      soundBtn.style.display = "flex";
      resetInactivityTimer();
    }
    // Попереднє завантаження другого слайду
    if (frames[1] && frames[1].dataset.src) {
      var v = frames[1].querySelector("video");
      if (v) v.src = frames[1].dataset.src;
    }
    // Показати кнопку звуку якщо в списку є відео
    var hasAnyVideo = MEDIA_FILES.some(function(u) { return isVideo(u); });
    if (hasAnyVideo) soundBtn.style.display = "flex";
  })();

  // ---- Кнопка звуку ----
  soundBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    globalMuted = !globalMuted;
    applyMute(globalMuted);

    // Якщо щойно увімкнули звук — скидаємо таймер бездіяльності
    if (!globalMuted) resetInactivityTimer();
  });

  // ---- Свайп ----
  track.addEventListener("touchstart", function (e) {
    tx0 = e.touches[0].clientX; dragging = true; dx = 0;
    if (!globalMuted) resetInactivityTimer();
  }, { passive: true });
  track.addEventListener("touchmove", function (e) {
    if (dragging) dx = e.touches[0].clientX - tx0;
  }, { passive: true });
  track.addEventListener("touchend", function () {
    if (!dragging) return; dragging = false;
    if (Math.abs(dx) > 45) { dx < 0 ? goTo(current + 1) : goTo(current - 1); }
    dx = 0;
  }, { passive: true });

  // ---- Тап по зонах ----
  track.addEventListener("click", function (e) {
    if (Math.abs(dx) > 8) return;
    var r = track.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    if (x < 0.30) { goTo(current - 1); }
    else if (x > 0.70) { goTo(current + 1); }
    if (!globalMuted) resetInactivityTimer();
  });

  // ---- Крапки ----
  dots.forEach(function (d) {
    d.addEventListener("click", function (e) {
      e.stopPropagation();
      goTo(parseInt(d.dataset.i));
    });
  });

  // ---- Довгий тап — заборона контекстного меню ----
  track.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---- Пауза при виході з вкладки / overlay ----
  container._mediaCleanup = function () {
    clearTimeout(inactivityTimer);
    muteAll();
    frames.forEach(function (f) {
      var v = f.querySelector("video");
      if (v) { v.pause(); v.currentTime = 0; }
    });
  };
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
    _renderCountries();
  }, function () {
    statsPanel.innerHTML = '<div class="sm-err">Помилка доступу. Перевір Firestore rules для private_logs</div>';
  });
}

// ================================================================
//  STATS PANEL
// ================================================================
function _renderStats(container) {
  var now = new Date();
  var normal = _normalLogs(); // Без S-записів

  // --- Counters ---
  var totalCount = normal.length;
  var hardcoreCount = normal.filter(function (l) { return _isHardcore(l); }).length;
  var sCount = _allLogs.filter(function (l) { return _isS(l); }).length;

  // --- Heatmap (тільки звичайні записи, без S) ---
  var heatmap = {};
  normal.forEach(function (l) {
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

  // --- S (clean streak) ---
  var S = _getStreak(now);

  // --- D_total / D_clean ---
  var D_total, D_clean;
  if (normal.length > 0) {
    var firstTs = Math.min.apply(null, normal.map(function (l) { return l.timestamp; }));
    D_total = Math.ceil((now.getTime() - firstTs) / 86400000) + 1;
    if (D_total > 252) D_total = 252;
    D_clean = D_total - Object.keys(heatmap).length;
  } else { D_total = 1; D_clean = 0; }
  if (D_clean < 0) D_clean = 0;
  var D_ratio = D_total > 0 ? D_clean / D_total : 0;

  // --- R_7d (без + та S) ---
  var sevenDaysAgo = now.getTime() - 7 * 86400000;
  var R_7d = 0;
  normal.forEach(function (l) {
    if (l.timestamp >= sevenDaysAgo && !_isHardcore(l)) R_7d++;
  });

  // --- S_avg ---
  var nonHC = normal.filter(function (l) { return !_isHardcore(l); });
  var sortedAsc = nonHC.slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
  var gaps = [];
  for (var g = 1; g < sortedAsc.length; g++) {
    var gap = Math.floor((sortedAsc[g].timestamp - sortedAsc[g - 1].timestamp) / 86400000);
    if (gap > 0) gaps.push(gap);
  }
  var S_avg = gaps.length > 0 ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : S;

  // --- K_ns (+ НЕ впливає) ---
  var K_ns = (Math.pow(D_ratio, 2) * Math.sqrt(S) * 10 - (R_7d * 15)) * -1;
  K_ns = Math.round(K_ns * 100) / 100;

  // --- R_dop (+ НЕ впливає) ---
  var R_dop = ((Math.log(S + 1) * (D_ratio / 1.5)) - (R_7d / (S_avg + 1) * 10)) * -1;
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
      (sCount > 0 ? '<div class="sm-counter-box sm-counter-s-box"><span class="sm-counter-num sm-counter-s">' + sCount + '</span><span class="sm-counter-lbl">S-ранг</span></div>' : '') +
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

    // Де я зараз
    _locBarHtml() +

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
        '<label class="sm-plus sm-rank-s"><input type="checkbox" id="smQuickS" /><span>S</span></label>' +
        '<input type="text" id="smQuickNote" class="sm-input" placeholder="нотатка" />' +
      '</div>' +
      '<button class="sm-add-btn sm-save" id="smQuickSave">Записати</button>' +
    '</div>' +

    // Manual form
    '<div class="sm-form sm-hidden-form" id="smManualForm">' +
      '<input type="datetime-local" id="smManualDate" class="sm-input" />' +
      '<button class="sm-loc-mini" id="smManualLoc"></button>' +
      '<div class="sm-form-row">' +
        '<label class="sm-plus"><input type="checkbox" id="smManualPlus" /><span>+</span></label>' +
        '<label class="sm-plus sm-rank-s"><input type="checkbox" id="smManualS" /><span>S</span></label>' +
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

  if (!container._locBound) {
    container._locBound = true;
    _bindLocBar(container, function () { _renderStats(container); _renderCountries(); });
  }

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
    var isS = container.querySelector("#smQuickS").checked;
    var note = container.querySelector("#smQuickNote").value.trim();
    var loc = _getLoc();
    try {
      var res = await _fastWrite(setDoc(doc(collection(db, "private_logs")), Object.assign({
        timestamp: d.getTime(), type: "reset", note: note,
        is_hardcore: plus, is_s: isS, userId: uid
      }, _locFields(loc))));
      var qf = container.querySelector("#smQuickForm");
      if (qf) {
        qf.classList.add("sm-hidden-form");
        container.querySelector("#smQuickNote").value = "";
        container.querySelector("#smQuickPlus").checked = false;
        container.querySelector("#smQuickS").checked = false;
      }
      _showToast("Записано" + (loc.cc !== HOME_CC ? " · " + _locLabel(loc) : "") + (res === "slow" ? " · офлайн" : ""));
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
      // Країна для цього запису — за замовчуванням «Де я зараз», можна змінити
      _manualLoc = _getLoc();
      container.querySelector("#smManualLoc").textContent = _locLabel(_manualLoc) + " ▾";
    }
  });

  container.querySelector("#smManualLoc").addEventListener("click", function () {
    _openLocPicker({
      title: "Країна запису",
      initial: _manualLoc || _getLoc(),
      onPick: function (loc) {
        _manualLoc = loc;
        var b = container.querySelector("#smManualLoc");
        if (b) b.textContent = _locLabel(loc) + " ▾";
      },
    });
  });

  container.querySelector("#smManualSave").addEventListener("click", async function () {
    var btn = container.querySelector("#smManualSave");
    if (btn.disabled) return;
    var val = container.querySelector("#smManualDate").value;
    if (!val) { alert("Вкажи дату та час"); return; }
    btn.disabled = true;
    var plus = container.querySelector("#smManualPlus").checked;
    var isS = container.querySelector("#smManualS").checked;
    var note = container.querySelector("#smManualNote").value.trim();
    var loc = _manualLoc || _getLoc();
    try {
      var ts = new Date(val).getTime();
      var res = await _fastWrite(setDoc(doc(collection(db, "private_logs")), Object.assign({
        timestamp: ts, type: "reset", note: note,
        is_hardcore: plus, is_s: isS, userId: uid
      }, _locFields(loc))));
      var mf = container.querySelector("#smManualForm");
      if (mf) {
        mf.classList.add("sm-hidden-form");
        container.querySelector("#smManualNote").value = "";
        container.querySelector("#smManualPlus").checked = false;
        container.querySelector("#smManualS").checked = false;
      }
      _manualLoc = null;
      _showToast("Збережено" + (loc.cc !== HOME_CC ? " · " + _locLabel(loc) : "") + (res === "slow" ? " · офлайн" : ""));
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
    var isS = _isS(l);
    var plusBadge = hc ? '<span class="sm-badge-plus">+</span>' : '';
    var sBadge = isS ? '<span class="sm-badge-s">S</span>' : '';
    var noteText = l.note ? l.note.replace(/^\+\s*/, "") : "";
    var noteStr = noteText ? '<span class="sm-log-note">' + _esc(noteText) + '</span>' : '';
    var itemClass = "sm-log-item" + (isS ? " sm-log-mythic" : "");
    var lloc = _locOfLog(l);
    var locBtn = '<button class="sm-log-loc' + (lloc.cc === HOME_CC ? ' sm-log-loc-home' : '') + '" data-loc-id="' + _esc(l.id) + '" ' +
      'aria-label="Країна запису: ' + _esc(lloc.name) + '" title="' + _esc(_locLabel(lloc)) + '">' + _flag(lloc.cc) + '</button>';

    return '<div class="' + itemClass + '">' +
      '<div class="sm-log-left">' +
        sBadge + plusBadge +
        '<span class="sm-log-date">' + _fmtDate(l.timestamp) + '</span>' +
        noteStr +
      '</div>' +
      locBtn +
      '<button class="sm-log-del" data-id="' + _esc(l.id) + '" aria-label="Видалити">&times;</button>' +
    '</div>';
  }).join("");

  // Країна вже зробленого запису — виправити вручну
  listEl.querySelectorAll(".sm-log-loc").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.dataset.locId;
      var log = _allLogs.find(function (x) { return x.id === id; });
      if (!log) return;
      _openLocPicker({
        title: "Країна запису " + _fmtDate(log.timestamp),
        initial: _locOfLog(log),
        onPick: function (loc) {
          var upd = loc.cc === HOME_CC
            ? { country: deleteField(), country_code: deleteField(), city: deleteField() }
            : _locFields(loc);
          _fastWrite(updateDoc(doc(db, "private_logs", id), upd)).then(function (res) {
            _showToast("Країну змінено: " + _locLabel(loc) + (res === "slow" ? " · офлайн" : ""));
          }).catch(function (e) { alert("Помилка: " + e.message); });
        },
      });
    });
  });

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

var _histPushed = false;
var _ignorePop = 0;
var _popBound = false;

function _onArchivePop() {
  if (_ignorePop > 0) { _ignorePop--; return; }
  var ov = document.getElementById("smOverlay");
  if (!ov || !_histPushed) return;
  // Спершу закриваємо вікно всередині (вибір країни, код) — Архів лишається
  var gate = ov.querySelector("#smLocGate, #smPassGate");
  if (gate) {
    gate.remove();
    try { history.pushState({ smArchive: 1 }, ""); } catch (e) { _histPushed = false; }
    return;
  }
  _histPushed = false;
  _removeExisting(true);
}

function _removeExisting(fromPop) {
  var el = document.getElementById("smOverlay");
  if (!el) return;
  if (fromPop !== true && _histPushed) {
    _histPushed = false;
    _ignorePop++;
    try { history.back(); } catch (e) { _ignorePop--; }
  }
  document.body.style.overflow = "";
  document.querySelectorAll("body > *").forEach(function (e) { if (e.id !== "smOverlay") e.style.pointerEvents = ""; });
  if (_keyHandler) { document.removeEventListener("keydown", _keyHandler); _keyHandler = null; }
  if (_unsub) { _unsub(); _unsub = null; }
  // Код на «Медіа» тут більше не скидаємо — він живе до кінця сесії

  // Зупиняємо всі відео та скидаємо звук перед закриттям
  var mediaPanel = el.querySelector("#smPanelMedia");
  if (mediaPanel && mediaPanel._mediaCleanup) mediaPanel._mediaCleanup();

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
    '.sm-cn-head{display:flex;gap:8px;margin-bottom:12px}' +
    '.sm-cn-box{flex:1;text-align:center;padding:12px 4px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);border-radius:12px}' +
    '.sm-cn-num{display:block;font-size:1.4rem;font-weight:900;color:#38bdf8;line-height:1}' +
    '.sm-cn-lbl{font-size:.6rem;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;font-weight:700;display:block}' +
    '.sm-cn-home{font-size:.8rem;color:rgba(255,255,255,.45);font-weight:700;padding:8px 12px;background:rgba(255,255,255,.04);border-radius:10px;margin-bottom:14px}' +
    '.sm-cn-list{display:flex;flex-direction:column;gap:12px}' +
    '.sm-cn-row{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:11px 12px}' +
    '.sm-cn-row-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}' +
    '.sm-cn-flag{font-size:1.3rem;line-height:1}' +
    '.sm-cn-name{flex:1;font-size:.9rem;font-weight:800;color:#e6edf3}' +
    '.sm-cn-count{font-size:.8rem;font-weight:800;color:#38bdf8}' +
    '.sm-cn-bar{height:6px;background:rgba(0,0,0,.3);border-radius:3px;overflow:hidden}' +
    '.sm-cn-fill{height:100%;background:linear-gradient(90deg,#0284c7,#38bdf8);border-radius:3px}' +
    '.sm-cn-meta{font-size:.68rem;color:rgba(255,255,255,.35);margin-top:6px;font-weight:600}' +
    '.sm-cn-empty{text-align:center;padding:40px 20px}' +
    '.sm-cn-empty-icon{font-size:3rem;opacity:.35;margin-bottom:10px}' +
    '.sm-cn-empty-title{color:#e6edf3;font-size:1rem;font-weight:800;margin-bottom:8px}' +
    '.sm-cn-empty-text{color:rgba(255,255,255,.4);font-size:.8rem;line-height:1.5;max-width:280px;margin:0 auto}' +
    '.sm-pass-gate{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);opacity:0;transition:opacity .22s}' +
    '.sm-pass-gate.sm-pass-show{opacity:1}' +
    '.sm-pass-card{width:min(300px,86vw);background:#161b22;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6)}' +
    '.sm-pass-card.sm-shake{animation:smShake .35s}' +
    '@keyframes smShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}' +
    '.sm-pass-title{color:#e6edf3;font-size:.95rem;font-weight:800;margin-bottom:14px}' +
    '.sm-pass-input{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid rgba(255,255,255,.15);color:#e6edf3;padding:12px;border-radius:10px;font-size:1.4rem;text-align:center;letter-spacing:.4em;font-family:inherit}' +
    '.sm-pass-input:focus{outline:none;border-color:#6366f1}' +
    '.sm-pass-err{color:#f43f5e;font-size:.75rem;font-weight:700;min-height:16px;margin-top:8px}' +
    '.sm-pass-btns{display:flex;gap:8px;margin-top:12px}' +
    '.sm-pass-btns button{flex:1;padding:10px;border-radius:10px;font-family:inherit;font-weight:800;font-size:.85rem;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.sm-pass-cancel{background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5)}' +
    '.sm-pass-ok{background:#6366f1;border:none;color:#fff}' +
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

    /* S-rank — міфічний */
    '.sm-rank-s span{color:#ef4444!important;text-shadow:0 0 8px rgba(239,68,68,.5)}' +
    '.sm-rank-s input:checked + span{color:#fff!important;text-shadow:0 0 12px rgba(239,68,68,.9),0 0 4px #fff}' +

    '.sm-counter-s{background:linear-gradient(45deg,#ef4444,#f59e0b,#ef4444,#dc2626);background-size:300% 300%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:smShimmer 3s ease infinite}' +
    '.sm-counter-s-box{border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.05)}' +
    '@keyframes smShimmer{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}' +

    '.sm-badge-s{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:5px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:.75rem;font-weight:900;flex-shrink:0;box-shadow:0 0 12px rgba(239,68,68,.6),inset 0 1px 0 rgba(255,255,255,.3);text-shadow:0 1px 2px rgba(0,0,0,.5);letter-spacing:.5px;font-family:Georgia,serif;font-style:italic}' +

    '.sm-log-mythic{position:relative;background:rgba(239,68,68,.04);border-radius:10px;padding:8px 10px!important;margin:6px -4px;border-bottom:none!important;overflow:hidden;animation:smMythicGlow 4s ease-in-out infinite}' +
    '.sm-log-mythic::before{content:"";position:absolute;inset:0;border-radius:10px;padding:2px;background:linear-gradient(45deg,#ef4444,#f59e0b,#ef4444,#dc2626,#ef4444,#7f1d1d,#ef4444);background-size:300% 300%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:smShimmer 3s linear infinite;pointer-events:none}' +
    '@keyframes smMythicGlow{0%,100%{box-shadow:0 0 8px rgba(239,68,68,.15)}50%{box-shadow:0 0 20px rgba(239,68,68,.4)}}' +
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
    'video.sm-img{pointer-events:none;background:#000}' +
    '.sm-frame.loaded .sm-img{opacity:1}' +
    '.sm-frame.error .sm-img{display:none}' +
    '.sm-frame.error::after{content:"Помилка";color:rgba(255,255,255,.2);font-size:.85rem}' +
    '.sm-spinner{position:absolute;width:24px;height:24px;border:2px solid rgba(255,255,255,.08);border-top-color:rgba(255,255,255,.4);border-radius:50%;animation:smSpin .7s linear infinite}' +
    '.sm-frame.loaded .sm-spinner,.sm-frame.error .sm-spinner{display:none}' +
    '@keyframes smSpin{to{transform:rotate(360deg)}}' +
    '.sm-media-footer{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;position:relative}' +
    '.sm-dots{display:flex;gap:8px;justify-content:center}' +
    '.sm-sound-btn{display:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:rgba(255,255,255,.45);cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:all .2s;padding:0;position:absolute;right:0}' +
    '.sm-sound-btn:active{background:rgba(255,255,255,.12);color:#fff}' +
    '.sm-sound-btn.sm-sound-on{border-color:rgba(99,102,241,.6);color:#818cf8;background:rgba(99,102,241,.15)}' +
    '.sm-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.15);cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent}' +
    '.sm-dot.active{background:#fff;width:18px;border-radius:3px}' +

    /* 404 */
    '.sm-404{text-align:center;padding-top:35vh}' +
    '.sm-404-code{font-size:5rem;font-weight:800;color:rgba(255,255,255,.15);margin:0;line-height:1}' +
    '.sm-404-msg{color:rgba(255,255,255,.15);font-size:1rem;margin:8px 0 0}' +

    /* «Де я зараз» */
    '.sm-loc-wrap{margin-bottom:10px}' +
    '.sm-loc{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:10px;cursor:pointer;font-family:inherit;text-align:left;-webkit-tap-highlight-color:transparent}' +
    '.sm-loc:active{background:rgba(255,255,255,.07)}' +
    '.sm-loc-abroad{border-color:rgba(56,189,248,.4);background:rgba(56,189,248,.08)}' +
    '.sm-loc-flag{font-size:1.35rem;line-height:1;flex-shrink:0}' +
    '.sm-loc-text{display:flex;flex-direction:column;min-width:0;flex:1}' +
    '.sm-loc-lbl{font-size:.58rem;font-weight:800;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.8px}' +
    '.sm-loc-name{font-size:.88rem;font-weight:800;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sm-loc-abroad .sm-loc-name{color:#7dd3fc}' +
    '.sm-loc-home{font-size:.62rem;font-weight:700;color:rgba(255,255,255,.3);margin-left:4px}' +
    '.sm-loc-edit{font-size:.7rem;font-weight:800;color:rgba(255,255,255,.4);flex-shrink:0}' +
    '.sm-loc-hint{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:.75rem;font-weight:700;line-height:1.4;color:#fde68a;padding:8px 10px;margin-bottom:6px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px}' +
    '.sm-loc-hint-btns{display:inline-flex;gap:6px;margin-left:auto}' +
    '.sm-loc-hint-btns button{padding:4px 12px;border-radius:8px;font-family:inherit;font-weight:800;font-size:.75rem;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.sm-loc-hint-yes{background:#f59e0b;border:none;color:#1c1303}' +
    '.sm-loc-hint-no{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6)}' +
    '.sm-loc-mini{align-self:flex-start;padding:7px 10px;border:1px dashed rgba(56,189,248,.35);background:rgba(56,189,248,.06);color:#7dd3fc;border-radius:8px;font-family:inherit;font-weight:700;font-size:.8rem;cursor:pointer;-webkit-tap-highlight-color:transparent}' +

    /* вибір країни */
    '.sm-pick-card{width:min(360px,92vw);max-height:86vh;display:flex;flex-direction:column;gap:10px;text-align:left;box-sizing:border-box}' +
    '.sm-pick-card .sm-pass-title{margin-bottom:0;text-align:center}' +
    '.sm-pick-card .sm-input{flex:none}' +
    '.sm-pick-list{overflow-y:auto;flex:1 1 auto;min-height:120px;max-height:46vh;display:flex;flex-direction:column;gap:2px;margin:0 -4px;padding:0 4px;overscroll-behavior:contain}' +
    '.sm-pick-c{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid transparent;background:none;color:#e6edf3;border-radius:8px;font-family:inherit;font-size:.88rem;font-weight:700;text-align:left;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent}' +
    '.sm-pick-c:active{background:rgba(255,255,255,.06)}' +
    '.sm-pick-c.sel{background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.45);color:#7dd3fc}' +
    '.sm-pick-flag{font-size:1.2rem;line-height:1}' +
    '.sm-pick-sep{height:1px;background:rgba(255,255,255,.08);margin:6px 0;flex-shrink:0}' +
    '.sm-pick-card .sm-pass-btns{margin-top:0}' +

    /* прапорець біля запису */
    '.sm-log-loc{background:none;border:none;font-size:1rem;line-height:1;cursor:pointer;min-width:28px;min-height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:6px;padding:0;-webkit-tap-highlight-color:transparent}' +
    '.sm-log-loc-home{opacity:.3;filter:grayscale(1)}' +
    '.sm-log-loc:active{background:rgba(255,255,255,.08)}';
  document.head.appendChild(s);
}
