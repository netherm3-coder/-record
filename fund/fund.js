import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc,
  initializeFirestore, persistentLocalCache, limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// === INIT ===
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const auth = getAuth(app);
const colRef = collection(db, "fund_deposits");

let isAdmin = false;
let allDeposits = [];

// === GOAL ===
const GOAL_USD = 200000;

// === EXCHANGE RATES ===
let rates = {
  usdUah: parseFloat(localStorage.getItem("fund_usdUah")) || 41.5,
  goldPerGram: parseFloat(localStorage.getItem("fund_goldGram")) || 95,
};

async function fetchRates() {
  const statusEl = document.getElementById("status");

  // 1. USD/UAH від НБУ
  try {
    const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
    const data = await res.json();
    if (data && data[0] && data[0].rate) {
      rates.usdUah = data[0].rate;
      localStorage.setItem("fund_usdUah", rates.usdUah);
    }
  } catch (e) {
    console.warn("НБУ API недоступний, використовую кеш:", rates.usdUah);
  }

  // 2. Золото ($/грам) — пробуємо кілька джерел
  try {
    // Frankfurter не підтримує XAU, тому спробуємо goldapi через проксі
    // Якщо не вдалось — кеш або дефолт
    const goldRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
    const goldData = await goldRes.json();
    if (goldData && goldData.items && goldData.items[0]) {
      // Ціна за тройську унцію → за грам (1 oz = 31.1035 g)
      const pricePerOz = goldData.items[0].xauPrice;
      if (pricePerOz > 0) {
        rates.goldPerGram = Math.round((pricePerOz / 31.1035) * 100) / 100;
        localStorage.setItem("fund_goldGram", rates.goldPerGram);
      }
    }
  } catch (e) {
    console.warn("Gold API недоступний, використовую кеш:", rates.goldPerGram);
  }

  renderDashboard();
  if (statusEl) statusEl.innerText = "Курси оновлено ✅";
}

// === THEME ===
const themeBtn = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("workoutTheme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
themeBtn.innerText = savedTheme === "dark" ? "☀️" : "🌙";

themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("workoutTheme", next);
  themeBtn.innerText = next === "dark" ? "☀️" : "🌙";
});

// === AUTH ===
onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  const adminPanel = document.getElementById("fundAdmin");
  const loginHint = document.getElementById("fundLoginHint");

  if (isAdmin) {
    adminPanel.classList.add("visible");
    if (loginHint) loginHint.style.display = "none";
  } else {
    adminPanel.classList.remove("visible");
    if (loginHint) loginHint.style.display = "block";
  }
});

// === DATE DEFAULT ===
document.getElementById("fundDate").valueAsDate = new Date();

// === FORMAT HELPERS ===
function fmt(num) {
  return Math.round(num).toLocaleString("uk-UA");
}

function fmtDec(num, dec) {
  return num.toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : dateStr;
}

// === RENDER DASHBOARD ===
function renderDashboard() {
  // Сумуємо всі грами золота
  let totalGold = 0;
  allDeposits.forEach((d) => { totalGold += d.goldGrams || 0; });

  // Конвертуємо в USD та UAH за поточними курсами
  const totalUSD = totalGold * rates.goldPerGram;
  const totalUAH = totalUSD * rates.usdUah;

  // Ціль у золоті
  const goalGold = GOAL_USD / rates.goldPerGram;
  const percent = goalGold > 0 ? Math.min((totalGold / goalGold) * 100, 100) : 0;

  // Залишок
  const remainUSD = Math.max(GOAL_USD - totalUSD, 0);

  // UI
  document.getElementById("fundGoalDisplay").textContent = `$${fmt(GOAL_USD)}`;
  document.getElementById("fundBarFill").style.width = `${percent}%`;
  document.getElementById("fundPercent").textContent = `${fmtDec(percent, 2)}%`;

  document.getElementById("fundGold").innerHTML = `${fmtDec(totalGold, 1)} <span>г</span>`;
  document.getElementById("fundUSD").textContent = `$${fmt(totalUSD)}`;
  document.getElementById("fundUAH").innerHTML = `${fmt(totalUAH)} <span>₴</span>`;

  document.getElementById("fundRemaining").innerHTML = `Залишилось: <b>$${fmt(remainUSD)}</b> (~${fmt(remainUSD * rates.usdUah)} ₴)`;

  document.getElementById("fundRates").innerHTML =
    `🥇 Au: <b>$${fmtDec(rates.goldPerGram, 2)}</b>/г &nbsp;|&nbsp; 💵 USD: <b>${fmtDec(rates.usdUah, 2)}</b> ₴`;
}

// === RENDER HISTORY ===
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
    const usdAtTime = d.rateUSD ? (d.amountUAH / d.rateUSD) : 0;
    const noteHTML = d.note ? `<div class="fund-deposit-note">${escapeHTML(d.note)}</div>` : "";
    const deleteBtn = isAdmin
      ? `<button class="btn-del" onclick="deleteFundDeposit('${d.id}')" style="position:absolute;top:10px;right:10px;">✖</button>`
      : "";

    html += `
      <div class="fund-history-item" style="position:relative;">
        ${deleteBtn}
        <div class="fund-deposit-amount">+${fmt(d.amountUAH)} ₴</div>
        <div class="fund-deposit-meta">
          🗓️ ${formatDate(d.date)} &nbsp;|&nbsp; ~$${fmt(usdAtTime)} &nbsp;|&nbsp; ${fmtDec(d.goldGrams || 0, 2)} г Au
        </div>
        <div class="fund-deposit-meta" style="font-size:0.7rem; margin-top:2px;">
          Курс: $${fmtDec(d.rateUSD || 0, 2)}/₴ &nbsp; Au $${fmtDec(d.rateGold || 0, 2)}/г
        </div>
        ${noteHTML}
      </div>`;
  });

  container.innerHTML = html;
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// === SAVE DEPOSIT ===
document.getElementById("fundSaveBtn").addEventListener("click", async () => {
  if (!isAdmin) return;

  const amount = parseFloat(document.getElementById("fundAmount").value);
  const date = document.getElementById("fundDate").value;
  const note = document.getElementById("fundNote").value.trim();
  const statusEl = document.getElementById("status");

  if (!amount || amount <= 0 || !date) {
    alert("Вкажи суму та дату!");
    return;
  }

  // Конвертуємо в золото за поточними курсами
  const usdAmount = amount / rates.usdUah;
  const goldGrams = usdAmount / rates.goldPerGram;

  try {
    statusEl.innerText = "Збереження...";
    document.getElementById("fundSaveBtn").disabled = true;

    await addDoc(colRef, {
      date,
      amountUAH: amount,
      rateUSD: rates.usdUah,
      rateGold: rates.goldPerGram,
      goldGrams: Math.round(goldGrams * 10000) / 10000,
      note,
      createdAt: Date.now(),
    });

    document.getElementById("fundAmount").value = "";
    document.getElementById("fundNote").value = "";
    document.getElementById("fundDate").valueAsDate = new Date();
    statusEl.innerText = "Внесок збережено 🏠";
    setTimeout(() => { statusEl.innerText = "Хмара синхронізована ✅"; }, 3000);
  } catch (err) {
    if (err.code === "permission-denied") {
      alert("🛡️ Доступ заборонено!");
    } else {
      alert("Помилка: " + err.message);
    }
  } finally {
    document.getElementById("fundSaveBtn").disabled = false;
  }
});

// === DELETE ===
window.deleteFundDeposit = async (id) => {
  if (!isAdmin || !confirm("Видалити цей внесок?")) return;
  try {
    await deleteDoc(doc(db, "fund_deposits", id));
  } catch (err) {
    alert("Помилка: " + err.message);
  }
};

// === LISTEN TO DATA ===
const q = query(colRef, orderBy("date", "desc"), limit(100));
onSnapshot(q, (snapshot) => {
  allDeposits = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderDashboard();
  renderHistory();
  document.getElementById("status").innerText = "Хмара синхронізована ✅";
});

// === INIT RATES ===
fetchRates();
// Оновлюємо курси кожні 30 хвилин
setInterval(fetchRates, 30 * 60 * 1000);
