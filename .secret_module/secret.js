// ================================================================
//  .secret_module/secret.js — Прихований модуль "Кімната Рекордів"
//  Доступ: адмін (localStorage) + IP-білий список + Easter Egg
// ================================================================

// ---------------------------------------------------------------
//  ★  КОНФІГУРАЦІЯ — редагуй лише цей блок
// ---------------------------------------------------------------
const ALLOWED_IPS = [
  "178.137.76.0",
];
const GIF_URL = "../assets/redvid_io_violating_that_throatpussy_of_hers.gif";
// ---------------------------------------------------------------
//  Головна функція — викликається ззовні (з app.js)
// ---------------------------------------------------------------
export async function openSecretModule() {
  // 1. Перевірка прапора адміна в localStorage
  if (localStorage.getItem("isAdmin") !== "true") {
    _show404();
    return;
  }

  // 2. IP-перевірка
  let ip;
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    const data = await res.json();
    ip = data.ip;
  } catch {
    // Не вдалось визначити IP (офлайн або помилка) → відмовляємо
    _show404();
    return;
  }

  if (!ALLOWED_IPS.includes(ip)) {
    _show404();
    return;
  }

  // 3. Усі перевірки пройдено → показуємо контент
  _showContent();
}

// ---------------------------------------------------------------
//  Рендер: основний контент модуля
// ---------------------------------------------------------------
function _showContent() {
  _ensureStyles();
  _removeExisting();

  // Гіфка лише онлайн; офлайн — текст
  const mediaBlock = navigator.onLine
    ? `<img src="${GIF_URL}" alt="Secret" class="sm-gif" />`
    : `<p class="sm-offline">Цей контент потребує з'єднання з мережею</p>`;

  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";
  overlay.innerHTML = `
    <div class="sm-modal" role="dialog" aria-modal="true">
      <button class="sm-close" aria-label="Закрити">✖</button>
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
  // Клік поза модальним вікном — закрити
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _removeExisting();
  });
  // Escape — закрити
  const onKey = (e) => {
    if (e.key === "Escape") { _removeExisting(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  // Запускаємо анімацію через один кадр, щоб CSS transition спрацював
  requestAnimationFrame(() => overlay.classList.add("sm-visible"));
}

// ---------------------------------------------------------------
//  Рендер: 404 — IP не в списку або не адмін
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
  // Автозакриття через 2.5 с
  setTimeout(_removeExisting, 2500);
}

// ---------------------------------------------------------------
//  Прибираємо оверлей з анімацією
// ---------------------------------------------------------------
function _removeExisting() {
  const el = document.getElementById("smOverlay");
  if (!el) return;
  el.classList.remove("sm-visible");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

// ---------------------------------------------------------------
//  CSS — вставляється один раз в <head>
// ---------------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById("sm-styles")) return;

  const style = document.createElement("style");
  style.id = "sm-styles";
  style.textContent = `
    /* === Overlay === */
    .sm-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0);
      backdrop-filter: blur(0px);
      transition: background .3s ease, backdrop-filter .3s ease;
    }
    .sm-overlay.sm-visible {
      background: rgba(0, 0, 0, .78);
      backdrop-filter: blur(7px);
    }

    /* === Modal card === */
    .sm-modal {
      position: relative;
      background: var(--card-bg, #1e293b);
      border: 1px solid rgba(99, 102, 241, .35);
      border-radius: 20px;
      padding: 32px 28px;
      max-width: 440px; width: 90%;
      text-align: center;
      box-shadow: 0 0 50px rgba(99, 102, 241, .2);
      opacity: 0; transform: translateY(24px);
      transition: opacity .3s ease, transform .3s ease;
    }
    .sm-overlay.sm-visible .sm-modal {
      opacity: 1; transform: translateY(0);
    }

    /* === Close button === */
    .sm-close {
      position: absolute; top: 14px; right: 14px;
      background: transparent; border: none;
      color: var(--text-muted, #94a3b8);
      font-size: 1rem; cursor: pointer;
      padding: 4px 8px; border-radius: 8px;
      transition: color .2s, background .2s;
    }
    .sm-close:hover { color: #fff; background: rgba(255,255,255,.08); }

    /* === Content === */
    .sm-badge {
      display: inline-block; margin-bottom: 16px;
      padding: 3px 12px; border-radius: 20px;
      background: rgba(239, 68, 68, .12);
      border: 1px solid rgba(239, 68, 68, .4);
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
      border: 1px solid rgba(99, 102, 241, .2);
    }
    .sm-offline {
      padding: 16px 20px; border-radius: 12px;
      background: rgba(239, 68, 68, .07);
      border: 1px dashed rgba(239, 68, 68, .35);
      color: #ef4444; font-size: .9rem; line-height: 1.5;
      margin: 0;
    }

    /* === 404 variant === */
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
