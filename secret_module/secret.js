// ================================================================
//  secret.js — Секретний модуль з повноекранним переглядом
// ================================================================

import {
  getApps, getApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const MEDIA_FILES = [
  "assets/redvid_io_violating_that_throatpussy_of_hers.gif",
  "RDT_20260421_2301107487583688953369648.jpg",
  "RDT_20260421_2304236334329579471223536.jpg",
];

let _keyHandler = null;

// ---------------------------------------------------------------
export async function openSecretModule() {
  if (getApps().length === 0) { _show404(); return; }
  if (!getAuth(getApp()).currentUser) { _show404(); return; }
  _showContent();
}

// ---------------------------------------------------------------
function _showContent() {
  _ensureStyles();
  _removeExisting();

  const total = MEDIA_FILES.length;
  let current = 0;
  let touchX0 = 0, touchY0 = 0, dragging = false, dragDx = 0;

  // DOM
  const overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";

  // Повноекранний layout без модального вікна
  overlay.innerHTML = `
    <div class="sm-viewer">
      <div class="sm-topbar">
        <div class="sm-counter" id="smCounter">1 / ${total}</div>
        <button class="sm-close-btn" id="smCloseBtn" aria-label="Закрити">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sm-track" id="smTrack">
        ${MEDIA_FILES.map((url, i) =>
          `<img src="${url}" alt="" class="sm-img ${i === 0 ? "active" : ""}" draggable="false" />`
        ).join("")}
      </div>
      <div class="sm-bottom">
        <div class="sm-dots" id="smDots">
          ${MEDIA_FILES.map((_, i) =>
            `<span class="sm-dot ${i === 0 ? "active" : ""}" data-i="${i}"></span>`
          ).join("")}
        </div>
      </div>
    </div>
  `;

  const track = overlay.querySelector("#smTrack");
  const imgs = overlay.querySelectorAll(".sm-img");
  const dots = overlay.querySelectorAll(".sm-dot");
  const counter = overlay.querySelector("#smCounter");

  // --- Go to slide ---
  function goTo(idx) {
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;
    imgs[current].classList.remove("active");
    dots[current].classList.remove("active");
    current = idx;
    imgs[current].classList.add("active");
    dots[current].classList.add("active");
    counter.textContent = (current + 1) + " / " + total;
  }

  // --- Touch swipe ---
  track.addEventListener("touchstart", function (e) {
    touchX0 = e.touches[0].clientX;
    touchY0 = e.touches[0].clientY;
    dragging = true;
    dragDx = 0;
    // Прибираємо transition під час свайпу для інтерактивності
    imgs.forEach(function (img) { img.style.transition = "none"; });
  }, { passive: true });

  track.addEventListener("touchmove", function (e) {
    if (!dragging) return;
    dragDx = e.touches[0].clientX - touchX0;
    var dy = Math.abs(e.touches[0].clientY - touchY0);
    // Якщо вертикальний скрол — відпускаємо
    if (dy > Math.abs(dragDx) + 10) { dragging = false; dragDx = 0; return; }
    // Візуальний зсув активного слайду
    var activeImg = imgs[current];
    activeImg.style.transform = "translateX(" + dragDx + "px)";
    activeImg.style.opacity = Math.max(0.3, 1 - Math.abs(dragDx) / 400);
  }, { passive: true });

  track.addEventListener("touchend", function () {
    if (!dragging) { dragDx = 0; return; }
    dragging = false;
    // Повертаємо transitions
    imgs.forEach(function (img) {
      img.style.transition = "";
      img.style.transform = "";
      img.style.opacity = "";
    });
    if (Math.abs(dragDx) > 50) {
      if (dragDx < 0) goTo(current + 1);
      else goTo(current - 1);
    }
    dragDx = 0;
  }, { passive: true });

  // --- Tap left/right ---
  track.addEventListener("click", function (e) {
    if (Math.abs(dragDx) > 5) return; // Це був свайп, не тап
    var rect = track.getBoundingClientRect();
    var x = e.clientX - rect.left;
    if (x < rect.width * 0.35) goTo(current - 1);
    else if (x > rect.width * 0.65) goTo(current + 1);
    // Центральна зона — нічого (щоб не переключати випадково)
  });

  // --- Dots ---
  dots.forEach(function (dot) {
    dot.addEventListener("click", function (e) {
      e.stopPropagation();
      goTo(parseInt(dot.dataset.i));
    });
  });

  // --- Keyboard ---
  _keyHandler = function (e) {
    if (e.key === "ArrowLeft") goTo(current - 1);
    else if (e.key === "ArrowRight") goTo(current + 1);
    else if (e.key === "Escape") _removeExisting();
  };
  document.addEventListener("keydown", _keyHandler);

  // --- Close ---
  overlay.querySelector("#smCloseBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    _removeExisting();
  });

  // Клік по темній зоні (поза слайдом)
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay || e.target.classList.contains("sm-viewer")) {
      _removeExisting();
    }
  });

  // --- Mount ---
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add("sm-visible"); });
}

// ---------------------------------------------------------------
function _show404() {
  _ensureStyles();
  _removeExisting();

  var overlay = document.createElement("div");
  overlay.id = "smOverlay";
  overlay.className = "sm-overlay";
  overlay.innerHTML = '<div class="sm-404"><p class="sm-404-code">404</p><p class="sm-404-msg">Not Found</p></div>';
  overlay.addEventListener("click", _removeExisting);
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add("sm-visible"); });
  setTimeout(_removeExisting, 2500);
}

// ---------------------------------------------------------------
function _removeExisting() {
  var el = document.getElementById("smOverlay");
  if (!el) return;
  document.body.style.overflow = "";
  if (_keyHandler) { document.removeEventListener("keydown", _keyHandler); _keyHandler = null; }
  el.classList.remove("sm-visible");
  el.addEventListener("transitionend", function () { el.remove(); }, { once: true });
  // Fallback якщо transitionend не спрацює
  setTimeout(function () { if (document.getElementById("smOverlay")) el.remove(); }, 500);
}

// ---------------------------------------------------------------
function _ensureStyles() {
  if (document.getElementById("sm-styles")) return;
  var s = document.createElement("style");
  s.id = "sm-styles";
  s.textContent = `
/* === OVERLAY === */
.sm-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(0,0,0,0);
  transition: background .25s ease;
  display: flex; flex-direction: column;
}
.sm-overlay.sm-visible {
  background: rgba(0,0,0,.95);
}

/* === VIEWER (fullscreen layout) === */
.sm-viewer {
  display: flex;
  flex-direction: column;
  width: 100%; height: 100%;
}

/* --- Top bar --- */
.sm-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  flex-shrink: 0;
}
.sm-counter {
  font-size: .85rem;
  font-weight: 800;
  color: rgba(255,255,255,.6);
  letter-spacing: .5px;
}
.sm-close-btn {
  background: none; border: none;
  color: rgba(255,255,255,.6);
  cursor: pointer; padding: 6px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: color .2s, background .2s;
  -webkit-tap-highlight-color: transparent;
}
.sm-close-btn:active { color: #fff; background: rgba(255,255,255,.1); }

/* --- Track (slides area) --- */
.sm-track {
  flex: 1;
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;
}
.sm-img {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity .3s ease, transform .2s ease;
  pointer-events: none;
  -webkit-user-drag: none;
}
.sm-img.active {
  opacity: 1;
  pointer-events: auto;
}

/* --- Bottom bar --- */
.sm-bottom {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
.sm-dots {
  display: flex;
  gap: 10px;
  align-items: center;
}
.sm-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(255,255,255,.25);
  cursor: pointer;
  transition: background .2s, transform .2s, width .2s;
  -webkit-tap-highlight-color: transparent;
}
.sm-dot.active {
  background: #fff;
  width: 20px;
  border-radius: 4px;
}

/* --- 404 --- */
.sm-404 {
  margin: auto;
  text-align: center;
}
.sm-404-code {
  font-size: 5rem; font-weight: 800;
  color: rgba(255,255,255,.3); margin: 0; line-height: 1;
}
.sm-404-msg {
  color: rgba(255,255,255,.3);
  font-size: 1rem; margin: 8px 0 0;
}
  `;
  document.head.appendChild(s);
}
