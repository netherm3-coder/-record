import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc,
  initializeFirestore, persistentLocalCache, limit, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const auth = getAuth(app);
const colRef = collection(db, "fund_deposits");

let isAdmin = false;
let allDeposits = [];
let editingId = null;

// Автологін
{
  const se = localStorage.getItem("adminEmail");
  const sp = localStorage.getItem("adminPass");
  if (se && sp && !auth.currentUser) {
    signInWithEmailAndPassword(auth, se, atob(sp)).catch(() => {});
  }
}

// === ІНФЛЯЦІЙНА МОДЕЛЬ ===
const BASE_GOAL_USD = 200000;
const INFLATION_RATE = 0.04;
const START_DATE = new Date("2025-04-12"); // Дата встановлення цілі

function getAdjustedTarget() {
  const daysElapsed = (Date.now() - START_DATE.getTime()) / (1000 * 60 * 60 * 24);
  return BASE_GOAL_USD * Math.pow(1 + INFLATION_RATE, daysElapsed / 365);
}

// === КУРСИ ===
let rates = {
  usdUah: parseFloat(localStorage.getItem("fund_usdUah")) || 41.5,
  eurUah: parseFloat(localStorage.getItem("fund_eurUah")) || 45.0,
  btcUsd: parseFloat(localStorage.getItem("fund_btcUsd")) || 65000,
  goldPerGram: parseFloat(localStorage.getItem("fund_goldGram")) || 95,
};

function toUSD(amount, currency) {
  switch (currency) {
    case "USD": case "USDT": return amount;
    case "UAH": return amount / rates.usdUah;
    case "EUR": return (amount * rates.eurUah) / rates.usdUah;
    case "BTC": return amount * rates.btcUsd;
    default: return amount / rates.usdUah;
  }
}

async function fetchRates() {
  const st = document.getElementById("status");

  try {
    const r = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
    const d = await r.json();
    if (d?.[0]?.rate) { rates.usdUah = d[0].rate; localStorage.setItem("fund_usdUah", rates.usdUah); }
  } catch (e) {}

  try {
    const r = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json");
    const d = await r.json();
    if (d?.[0]?.rate) { rates.eurUah = d[0].rate; localStorage.setItem("fund_eurUah", rates.eurUah); }
  } catch (e) {}

  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const d = await r.json();
    if (d?.bitcoin?.usd) { rates.btcUsd = d.bitcoin.usd; localStorage.setItem("fund_btcUsd", rates.btcUsd); }
  } catch (e) {}

  try {
    const r = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
    const d = await r.json();
    if (d?.items?.[0]?.xauPrice > 0) {
      rates.goldPerGram = Math.round((d.items[0].xauPrice / 31.1035) * 100) / 100;
      localStorage.setItem("fund_goldGram", rates.goldPerGram);
    }
  } catch (e) {}

  renderDashboard();
  renderRates();
  renderHistory();
  if (st) st.innerText = "Курси оновлено";
}

function renderRates() {
  const container = document.getElementById("fundRates");
  const timeEl = document.getElementById("fundRatesTime");
  if (!container) return;

  container.innerHTML =
    '<div class="fund-rate-item"><div class="fund-rate-pair">USD / UAH</div><div class="fund-rate-val">' + fmtDec(rates.usdUah, 4) + ' ₴</div></div>' +
    '<div class="fund-rate-item"><div class="fund-rate-pair">EUR / UAH</div><div class="fund-rate-val">' + fmtDec(rates.eurUah, 4) + ' ₴</div></div>' +
    '<div class="fund-rate-item"><div class="fund-rate-pair">BTC / USD</div><div class="fund-rate-val">$' + fmt(rates.btcUsd) + '</div></div>' +
    '<div class="fund-rate-item"><div class="fund-rate-pair">Au / USD</div><div class="fund-rate-val">$' + fmtDec(rates.goldPerGram, 2) + ' / г</div></div>';

  if (timeEl) {
    const now = new Date();
    timeEl.textContent = "Оновлено: " + String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
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
  document.getElementById("fundAdmin").classList.toggle("visible", isAdmin);
  const hint = document.getElementById("fundLoginHint");
  if (hint) hint.style.display = isAdmin ? "none" : "block";
  renderHistory();
});

document.getElementById("fundDate").valueAsDate = new Date();

// === ХЕЛПЕРИ ===
function fmt(n) { return Math.round(n).toLocaleString("uk-UA"); }
function fmtDec(n, d) { return n.toLocaleString("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function formatDate(s) { if (!s) return ""; const p = s.split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : s; }
function escapeHTML(s) { return s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }

function fmtAmount(amount, cur) {
  switch (cur) {
    case "BTC": return fmtDec(amount, 8) + ' <img src="../assets/icone-btc.png" alt="BTC" class="sober-icon">';
    case "UAH": return fmtDec(amount, 2) + " ₴";
    case "USD": return "$" + fmtDec(amount, 2);
    case "EUR": return fmtDec(amount, 2) + " €";
    case "USDT": return fmtDec(amount, 2) + " USDT";
    default: return fmtDec(amount, 2);
  }
}

// === DASHBOARD (Inflation-Adjusted) ===
function renderDashboard() {
  const target = getAdjustedTarget();
  const inflationGrowth = target - BASE_GOAL_USD;

  // Поточна вартість портфеля за живими курсами
  let totalUSD = 0;
  let nominalSaved = 0;

  allDeposits.forEach((d) => {
    const cur = d.currency || "UAH";
    const orig = d.originalAmount || d.amountUAH || 0;

    // Актуальна вартість
    totalUSD += toUSD(orig, cur);

    // Номінальна (скільки було в $ на момент внесення)
    nominalSaved += (d.amountUAH || 0) / (d.rateUSD || rates.usdUah);
  });

  const totalUAH = totalUSD * rates.usdUah;
  const percent = target > 0 ? Math.min((totalUSD / target) * 100, 100) : 0;
  const remainUSD = Math.max(target - totalUSD, 0);
  const portfolioGrowth = totalUSD - nominalSaved;

  // UI
  document.getElementById("fundGoalDisplay").textContent = "$" + fmtDec(target, 2);
  document.getElementById("fundBarFill").style.width = percent + "%";
  document.getElementById("fundPercent").textContent = fmtDec(percent, 4) + "%";
  document.getElementById("fundUSD").textContent = "$" + fmtDec(totalUSD, 2);
  document.getElementById("fundUAH").innerHTML = fmtDec(totalUAH, 2) + ' <span>₴</span>';
  document.getElementById("fundRemaining").innerHTML =
    'Залишилось: <b>$' + fmtDec(remainUSD, 2) + '</b> (~' + fmtDec(remainUSD * rates.usdUah, 2) + ' ₴)';

  // P&L
  const pnlEl = document.getElementById("fundPnL");
  const pnlSign = portfolioGrowth >= 0 ? "+" : "";
  pnlEl.textContent = pnlSign + "$" + fmtDec(portfolioGrowth, 2);
  pnlEl.className = "fund-cur-value " + (portfolioGrowth >= 0 ? "fund-pnl-positive" : "fund-pnl-negative");

  // Warning
  const warnEl = document.getElementById("fundWarning");
  if (warnEl) {
    if (allDeposits.length > 0 && portfolioGrowth < inflationGrowth) {
      warnEl.style.display = "block";
      warnEl.innerHTML =
        'Купівельна сила знижується: інфляція з\'їла <b>$' + fmtDec(inflationGrowth, 2) +
        '</b>, а портфель виріс лише на <b>$' + fmtDec(Math.max(portfolioGrowth, 0), 2) + '</b>';
    } else {
      warnEl.style.display = "none";
    }
  }
}

// === ІСТОРІЯ ===
function renderHistory() {
  const container = document.getElementById("fundTimeline");
  const emptyEl = document.getElementById("fundEmpty");

  if (allDeposits.length === 0) {
    container.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  let html = "";
  allDeposits.forEach((d) => {
    const cur = d.currency || "UAH";
    const origAmount = d.originalAmount || d.amountUAH || 0;
    const noteHTML = d.note ? '<div class="fund-deposit-note">' + escapeHTML(d.note) + '</div>' : "";

    // Актуальна вартість за поточним курсом
    const nowUSD = toUSD(origAmount, cur);
    const nowUAH = nowUSD * rates.usdUah;

    // Номінальний USD на момент внесення
    const thenUSD = (d.amountUAH || 0) / (d.rateUSD || rates.usdUah);
    const pnl = nowUSD - thenUSD;
    const pnlSign = pnl >= 0 ? "+" : "";
    const pnlClass = pnl >= 0 ? "fund-pnl-positive" : "fund-pnl-negative";

    let adminBtns = "";
    if (isAdmin) {
      adminBtns = '<div class="fund-history-actions">' +
        '<button class="btn-edit" onclick="editFundDeposit(\'' + d.id + '\')">✏️</button>' +
        '<button class="btn-del" onclick="deleteFundDeposit(\'' + d.id + '\')">✖</button>' +
        '</div>';
    }

    html += '<div class="fund-history-item">' +
      adminBtns +
      '<div class="fund-deposit-amount">+' + fmtAmount(origAmount, cur) + '</div>' +
      '<div class="fund-deposit-meta">' +
        formatDate(d.date) + ' · $' + fmtDec(nowUSD, 2) + ' · ' + fmtDec(nowUAH, 2) + ' ₴' +
      '</div>' +
      '<div class="fund-deposit-meta" style="font-size:0.7rem;margin-top:2px;">' +
        '<span class="' + pnlClass + '">' + pnlSign + '$' + fmtDec(pnl, 2) + '</span>' +
        ' від внеску ($' + fmtDec(thenUSD, 2) + ')' +
      '</div>' +
      noteHTML +
    '</div>';
  });

  container.innerHTML = html;
}

// === ЗБЕРЕЖЕННЯ ===
document.getElementById("fundSaveBtn").addEventListener("click", async () => {
  if (!isAdmin) return;

  const amount = parseFloat(document.getElementById("fundAmount").value);
  const date = document.getElementById("fundDate").value;
  const note = document.getElementById("fundNote").value.trim();
  const currency = document.getElementById("fundCurrency").value;
  const st = document.getElementById("status");

  if (!amount || amount <= 0 || !date) { alert("Вкажи суму та дату!"); return; }

  const usdAmount = toUSD(amount, currency);

  const data = {
    date, currency,
    originalAmount: amount,
    amountUAH: usdAmount * rates.usdUah,
    rateUSD: rates.usdUah,
    rateEUR: rates.eurUah,
    rateBTC: rates.btcUsd,
    rateGold: rates.goldPerGram,
    note,
  };

  try {
    st.innerText = "Збереження...";
    document.getElementById("fundSaveBtn").disabled = true;

    if (editingId) {
      await updateDoc(doc(db, "fund_deposits", editingId), data);
      cancelEdit();
      st.innerText = "Внесок оновлено";
    } else {
      data.createdAt = Date.now();
      await addDoc(colRef, data);
      st.innerText = "Внесок збережено";
    }

    document.getElementById("fundAmount").value = "";
    document.getElementById("fundNote").value = "";
    document.getElementById("fundDate").valueAsDate = new Date();
    setTimeout(() => { st.innerText = "Хмара синхронізована"; }, 3000);
  } catch (err) {
    alert(err.code === "permission-denied" ? "Доступ заборонено!" : "Помилка: " + err.message);
  } finally {
    document.getElementById("fundSaveBtn").disabled = false;
  }
});

// === РЕДАГУВАННЯ ===
window.editFundDeposit = (id) => {
  if (!isAdmin) return;
  const d = allDeposits.find((x) => x.id === id);
  if (!d) return;

  editingId = id;
  document.getElementById("fundCurrency").value = d.currency || "UAH";
  document.getElementById("fundAmount").value = d.originalAmount || d.amountUAH || "";
  document.getElementById("fundDate").value = d.date || "";
  document.getElementById("fundNote").value = d.note || "";

  document.getElementById("fundFormTitle").textContent = "Редагування внеску";
  document.getElementById("fundSaveBtn").textContent = "Оновити внесок";
  document.getElementById("fundCancelEdit").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function cancelEdit() {
  editingId = null;
  document.getElementById("fundFormTitle").textContent = "Додати внесок";
  document.getElementById("fundSaveBtn").textContent = "Зберегти внесок";
  document.getElementById("fundCancelEdit").style.display = "none";
}

document.getElementById("fundCancelEdit").addEventListener("click", () => {
  cancelEdit();
  document.getElementById("fundAmount").value = "";
  document.getElementById("fundNote").value = "";
  document.getElementById("fundDate").valueAsDate = new Date();
});

// === ВИДАЛЕННЯ ===
window.deleteFundDeposit = async (id) => {
  if (!isAdmin || !confirm("Видалити цей внесок?")) return;
  try { await deleteDoc(doc(db, "fund_deposits", id)); } catch (e) { alert("Помилка: " + e.message); }
};

// === СЛУХАЧ ===
const q = query(colRef, orderBy("date", "desc"), limit(100));
onSnapshot(q, (snapshot) => {
  allDeposits = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderDashboard();
  renderHistory();
  document.getElementById("status").innerText = "Хмара синхронізована";
});

fetchRates();
setInterval(fetchRates, 90 * 1000);

// SERVICE WORKER
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("../sw.js", { scope: "../" })
      .then((reg) => console.log("[SW] Registered (fund), scope:", reg.scope))
      .catch((err) => console.error("[SW] Registration failed:", err));
  });
}

// === БІЧНЕ МЕНЮ ===
{
  const trigger = document.getElementById("fundMenuTrigger");
  const menu = document.getElementById("fundSideMenu");
  const closeBtn = document.getElementById("fundCloseMenu");
  const overlay = document.getElementById("fundMenuOverlay");

  if (trigger && menu && closeBtn && overlay) {
    function openMenu() {
      menu.classList.add("open");
      overlay.classList.add("active");
      trigger.classList.add("active");
      document.body.style.overflow = "hidden";
    }
    function closeMenu() {
      menu.classList.remove("open");
      overlay.classList.remove("active");
      trigger.classList.remove("active");
      document.body.style.overflow = "";
    }
    trigger.addEventListener("click", () => menu.classList.contains("open") ? closeMenu() : openMenu());
    closeBtn.addEventListener("click", closeMenu);
    overlay.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) closeMenu();
    });
  }
}
