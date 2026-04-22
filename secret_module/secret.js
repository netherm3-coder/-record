// ================================================================
//  secret_module/secret.js — Прихований модуль "Кімната Рекордів"
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

const MEDIA_FILES = [
  "assets/redvid_io_violating_that_throatpussy_of_hers.gif",
  "RDT_20260421_2301107487583688953369648.jpg",
  "RDT_20260421_2304236334329579471223536.jpg",
];

// ---------------------------------------------------------------
export async function openSecretModule() {
  if (getApps().length === 0) { _show404(); return; }
  const app = getApp();
  const auth = getAuth(app);
  if (!auth.currentUser) { _show404(); return; }
  _showContent();
}

// ---------------------------------------------------------------
function _showContent() {
  _ensureStyles();
  _removeExisting();

  const slidesHTML = navigator.onLine
    ? MEDIA_FILES.map((url, i) =>
        `<img src="${url}" alt="" class="sm-slide ${i === 0 ? "active" : ""}" draggable="false" />`
      ).join("")
    : '<p class="sm-offline">Потрібне з\'єднання з мережею</p>';

  const dotsHTML = MEDIA_FILES.length > 1
    ? '<div class="sm-dots">' + MEDIA_FILES.map((_, i) =>
        `<span class="sm-dot ${i === 0 ? "active" : ""}" data-i="${i}"></span>`
      ).join("") + '</div>'
    : "";

  const counterHTML = MEDIA_FILES.length > 1
    ? '<div class="sm-counter"><span id="smCurrent">1</span> / ' + MEDIA_FILES.length + '</div>'
    : "";

  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";
  document.body.style.overflow = "hidden";

  overlay.innerHTML = `
    <div class="sm-modal" role="dialog" aria-modal="true">
      <button class="sm-close" aria-label="Закрити">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="sm-badge">СЕКРЕТНО</div>
      <h2 class="sm-title">Особистий архів</h2>
      <p class="sm-desc">Цей розділ видно лише тобі.</p>
      <div class="sm-slider" id="smSlider">
        <div class="sm-slides-track">
          ${slidesHTML}
        </div>
        ${counterHTML}
        ${dotsHTML}
      </div>
    </div>
  `;

  // === SLIDER LOGIC ===
  if (navigator.onLine && MEDIA_FILES.length > 1) {
    let currentIndex = 0;
    const slides = overlay.querySelectorAll(".sm-slide");
    const dots = overlay.querySelectorAll(".sm-dot");
    const counterEl = overlay.querySelector("#smCurrent");
    const track = overlay.querySelector(".sm-slides-track");

    function goTo(idx) {
      if (idx < 0) idx = slides.length - 1;
      if (idx >= slides.length) idx = 0;
      slides[currentIndex].classList.remove("active");
      if (dots[currentIndex]) dots[currentIndex].classList.remove("active");
      currentIndex = idx;
      slides[currentIndex].classList.add("active");
      if (dots[currentIndex]) dots[currentIndex].classList.add("active");
      if (counterEl) counterEl.textContent = currentIndex + 1;
    }

    // Dots click
    dots.forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        goTo(parseInt(dot.dataset.i));
      });
    });

    // Swipe (touch)
    let touchStartX = 0;
    let touchStartY = 0;
    let swiping = false;

    track.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      swiping = true;
    }, { passive: true });

    track.addEventListener("touchend", (e) => {
      if (!swiping) return;
      swiping = false;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return; // Мінімальна відстань та не вертикальний свайп
      if (dx < 0) goTo(currentIndex + 1);  // Свайп вліво → наступний
      else goTo(currentIndex - 1);          // Свайп вправо → попередній
    }, { passive: true });

    // Keyboard
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goTo(currentIndex - 1);
      if (e.key === "ArrowRight") goTo(currentIndex + 1);
      if (e.key === "Escape") { _removeExisting(); document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);

    // Tap left/right halves
    track.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 2) goTo(currentIndex - 1);
      else goTo(currentIndex + 1);
    });
  } else {
    const onKey = (e) => {
      if (e.key === "Escape") { _removeExisting(); document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);
  }

  // Close handlers
  overlay.querySelector(".sm-close").addEventListener("click", _removeExisting);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _removeExisting();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("sm-visible"));
}

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
function _removeExisting() {
  const el = document.getElementById("smOverlay");
  if (!el) return;
  document.body.style.overflow = "";
  el.classList.remove("sm-visible");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

// ---------------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById("sm-styles")) return;

  const style = document.createElement("style");
  style.id = "sm-styles";
  style.textContent = `
    .sm-overlay {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0);
      backdrop-filter: blur(0px);
      transition: background .3s ease, backdrop-filter .3s ease;
    }
    .sm-overlay.sm-visible {
      background: rgba(0,0,0,.85);
      backdrop-filter: blur(10px);
    }
    .sm-modal {
      position: relative;
      background: var(--card-bg, #1e293b);
      border: 1px solid rgba(99,102,241,.35);
      border-radius: 20px;
      padding: 32px 24px 24px;
      max-width: 440px; width: 92%;
      text-align: center;
      box-shadow: 0 0 50px rgba(99,102,241,.2);
      opacity: 0; transform: translateY(24px);
      transition: opacity .3s ease, transform .3s ease;
    }
    .sm-overlay.sm-visible .sm-modal {
      opacity: 1; transform: translateY(0);
    }
    .sm-close {
      position: absolute; top: 12px; right: 12px;
      background: transparent; border: none;
      color: var(--text-muted, #94a3b8);
      cursor: pointer; padding: 6px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      transition: color .2s, background .2s;
      z-index: 5;
    }
    .sm-close:hover { color: #fff; background: rgba(255,255,255,.08); }
    .sm-badge {
      display: inline-block; margin-bottom: 14px;
      padding: 3px 12px; border-radius: 20px;
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444; font-size: .65rem;
      font-weight: 800; letter-spacing: .12em;
    }
    .sm-title {
      color: var(--text-main, #f1f5f9);
      font-size: 1.3rem; font-weight: 800;
      margin: 0 0 6px;
    }
    .sm-desc {
      color: var(--text-muted, #94a3b8);
      font-size: .85rem; line-height: 1.5;
      margin-bottom: 18px;
    }

    /* === SLIDER === */
    .sm-slider {
      position: relative;
      user-select: none;
      -webkit-user-select: none;
    }
    .sm-slides-track {
      position: relative;
      width: 100%;
      border-radius: 12px;
      overflow: hidden;
      aspect-ratio: 4 / 3;
      background: rgba(0,0,0,.3);
      cursor: pointer;
    }
    .sm-slide {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      object-fit: contain;
      border-radius: 12px;
      opacity: 0;
      transition: opacity .35s ease;
      pointer-events: none;
    }
    .sm-slide.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* Counter */
    .sm-counter {
      margin-top: 10px;
      font-size: .8rem;
      font-weight: 800;
      color: var(--text-muted, #94a3b8);
      letter-spacing: .5px;
    }

    /* Dots */
    .sm-dots {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 10px;
    }
    .sm-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--border, rgba(255,255,255,.15));
      cursor: pointer;
      transition: background .2s, transform .2s;
    }
    .sm-dot.active {
      background: var(--accent, #6366f1);
      transform: scale(1.3);
    }
    .sm-dot:hover {
      background: var(--accent, #6366f1);
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
