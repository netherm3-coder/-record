// ================================================================
//  secret_module/secret.js — Прихований модуль "Кімната Рекордів"
//  Доступ: Firebase Auth (тільки залогінений адмін)
//  Контент: URL гіфки зберігається в Firestore → secret/content
// ================================================================

import {
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Fallback GIF (якщо Firestore не налаштовано)
const FALLBACK_GIF = "assets/redvid_io_violating_that_throatpussy_of_hers.gif";

// ---------------------------------------------------------------
//  Головна функція — викликається з app.js
// ---------------------------------------------------------------
export async function openSecretModule() {
  // 1. Отримуємо вже ініціалізований Firebase App (з app.js)
  if (getApps().length === 0) {
    _show404();
    return;
  }
  const app = getApp();
  const auth = getAuth(app);

  // 2. Перевірка Firebase Auth — тільки залогінений користувач
  const user = auth.currentUser;
  if (!user) {
    _show404();
    return;
  }

  // 3. Читаємо URL контенту з Firestore (колекція secret, документ content)
  let gifUrl = FALLBACK_GIF;
  try {
    const db = getFirestore(app);
    const secretSnap = await getDoc(doc(db, "secret", "content"));
    if (secretSnap.exists() && secretSnap.data().gifUrl) {
      gifUrl = secretSnap.data().gifUrl;
    }
  } catch {
    // Якщо Firestore недоступний — використовуємо fallback
  }

  _showContent(gifUrl);
}

// ---------------------------------------------------------------
//  Рендер: основний контент модуля
// ---------------------------------------------------------------
function _showContent(gifUrl) {
  _ensureStyles();
  _removeExisting();

  const mediaBlock = navigator.onLine
    ? `<img src="${gifUrl}" alt="Secret" class="sm-gif" />`
    : `<p class="sm-offline">Цей контент потребує з'єднання з мережею</p>`;

  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";
  overlay.innerHTML = `
    <div class="sm-modal" role="dialog" aria-modal="true">
      <button class="sm-close" aria-label="Закрити">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="sm-badge">СЕКРЕТНО</div>
      <h2 class="sm-title">Особистий архів</h2>
      <p class="sm-desc">
        Цей розділ видно лише тобі.<br>
        Тут зберігається те, що не має бути у стрічці.
      </p>
      ${mediaBlock}
    </div>
  `;

  overlay.querySelector(".sm-close").addEventListener("click", _removeExisting);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _removeExisting();
  });
  const onKey = (e) => {
    if (e.key === "Escape") {
      _removeExisting();
      document.removeEventListener("keydown", onKey);
    }
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
  document.body.style.overflow = "";
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
      pointer-events: all;
      background: rgba(0,0,0,0);
      backdrop-filter: blur(0px);
      transition: background .3s ease, backdrop-filter .3s ease;
      pointer-events: all;
    }
    .sm-overlay.sm-visible {
      background: rgba(0,0,0,.78);
      backdrop-filter: blur(7px);
    }
    .sm-modal {
      position: relative;
      background: var(--card-bg, #1e293b);
      border: 1px solid rgba(99,102,241,.35);
      border-radius: 20px;
      padding: 32px 28px;
      max-width: 440px; width: 90%;
      text-align: center;
      box-shadow: 0 0 50px rgba(99,102,241,.2);
      opacity: 0; transform: translateY(24px);
      transition: opacity .3s ease, transform .3s ease;
    }
    .sm-overlay.sm-visible .sm-modal {
      opacity: 1; transform: translateY(0);
    }
    .sm-close {
      position: absolute; top: 14px; right: 14px;
      background: transparent; border: none;
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
      padding: 6px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      transition: color .2s, background .2s;
    }
    .sm-close:hover { color: #fff; background: rgba(255,255,255,.08); }
    .sm-badge {
      display: inline-block; margin-bottom: 16px;
      padding: 3px 12px; border-radius: 20px;
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444; font-size: .65rem;
      font-weight: 800; letter-spacing: .12em;
    }
    .sm-title {
      color: var(--text-main, #f1f5f9);
      font-size: 1.4rem; font-weight: 800;
      margin: 0 0 10px;
    }
    .sm-desc {
      color: var(--text-muted, #94a3b8);
      font-size: .9rem; line-height: 1.7;
      margin-bottom: 22px;
    }
    .sm-gif {
      width: 100%; max-width: 340px;
      border-radius: 12px;
      border: 1px solid rgba(99,102,241,.2);
    }
    .sm-offline {
      padding: 16px 20px; border-radius: 12px;
      background: rgba(239,68,68,.07);
      border: 1px dashed rgba(239,68,68,.35);
      color: #ef4444; font-size: .9rem; line-height: 1.5;
      margin: 0;
    }
    .sm-modal--404 { padding: 56px 28px; }
    .sm-404-code {
      font-size: 5.5rem; font-weight: 800; line-height: 1;
      color: var(--text-muted, #94a3b8); margin: 0;
    }
    .sm-404-msg {
      color: var(--text-muted, #94a3b8);
      font-size: 1.1rem; margin: 10px 0 0;
      letter-spacing: .05em;
    }
  `;
  document.head.appendChild(style);
}
