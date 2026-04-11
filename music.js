// === ФОНОВА МУЗИКА (Спільний плеєр для всіх сторінок) ===
(function () {
  var bgMusic = document.getElementById("bgMusic");
  var musicBtn = document.getElementById("musicToggle");
  var musicSelect = document.getElementById("musicSelect");
  var musicVolume = document.getElementById("musicVolume");
  var musicLabel = document.getElementById("musicLabel");
  var musicVolLabel = document.getElementById("musicVolLabel");

  if (!bgMusic || !musicBtn) return;

  var baseMeta = document.querySelector('meta[name="music-base"]');
  var soundsBase = baseMeta ? baseMeta.content : "sounds/";
  var iconsBase = baseMeta ? baseMeta.content.replace("sounds/", "assets/icons/") : "assets/icons/";

  var playlist = [];
  var currentIndex = -1;
  var wasPlayingBeforeHide = false;
  var pendingResume = false;
  var positionSaver = null;

  // Гучність
  var savedVol = localStorage.getItem("musicVol");
  bgMusic.volume = savedVol ? parseInt(savedVol) / 100 : 0.3;
  if (musicVolume) musicVolume.value = Math.round(bgMusic.volume * 100);
  if (musicVolLabel) musicVolLabel.textContent = Math.round(bgMusic.volume * 100) + "%";

  function getTrackName() {
    return playlist[currentIndex] ? playlist[currentIndex].replace(/\.[^.]+$/, "") : "";
  }

  function updateUI(playing) {
    var img = musicBtn.querySelector(".btn-icon");
    var fallback = musicBtn.querySelector(".btn-fallback");
    if (img) {
      var n = playing ? "pause" : "play";
      img.dataset.retry = "";
      img.src = iconsBase + n + ".svg";
      img.onerror = function () {
        if (!this.dataset.retry) { this.dataset.retry = "1"; this.src = iconsBase + n + ".png"; }
        else { this.remove(); }
      };
    }
    if (fallback) fallback.textContent = playing ? "⏸" : "▶";
    musicBtn.classList.toggle("playing", playing);
    if (musicLabel) musicLabel.textContent = playing ? "🎵 " + getTrackName() : "Музика вимк.";
  }

  // Зберігає позицію кожну секунду поки грає
  function startPositionSaver() {
    stopPositionSaver();
    positionSaver = setInterval(function () {
      if (!bgMusic.paused && playlist[currentIndex]) {
        localStorage.setItem("musicTrack", playlist[currentIndex]);
        localStorage.setItem("musicTime", String(bgMusic.currentTime));
      }
    }, 1000);
  }

  function stopPositionSaver() {
    if (positionSaver) { clearInterval(positionSaver); positionSaver = null; }
  }

  function loadTrack(index, resumeTime) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    bgMusic.src = soundsBase + playlist[index];
    localStorage.setItem("musicTrack", playlist[index]);
    if (musicSelect) musicSelect.value = String(index);
    if (resumeTime > 0) {
      bgMusic.addEventListener("loadedmetadata", function onMeta() {
        bgMusic.currentTime = resumeTime;
        bgMusic.removeEventListener("loadedmetadata", onMeta);
      });
    }
  }

  function playTrack(index) {
    loadTrack(index, 0);
    bgMusic.play().then(function () {
      localStorage.setItem("musicOn", "true");
      pendingResume = false;
      updateUI(true);
      startPositionSaver();
    }).catch(function () {
      pendingResume = true;
    });
  }

  function tryResume() {
    if (!pendingResume || !bgMusic.src) return;
    bgMusic.play().then(function () {
      pendingResume = false;
      updateUI(true);
      startPositionSaver();
    }).catch(function () {});
  }

  function addUnlockListeners() {
    var events = ["click", "touchstart", "keydown", "scroll"];
    function handler() {
      tryResume();
      if (!pendingResume) {
        events.forEach(function (e) { document.removeEventListener(e, handler); });
      }
    }
    events.forEach(function (e) { document.addEventListener(e, handler, { passive: true }); });
  }

  // Завантажуємо плейлист
  fetch(soundsBase + "playlist.json")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (songs) {
      if (!songs.length) return;
      playlist = songs;

      var savedTrack = localStorage.getItem("musicTrack") || "";
      var savedTime = parseFloat(localStorage.getItem("musicTime")) || 0;
      var startIndex = 0;

      // Заповнюємо дропдаун
      if (musicSelect) {
        musicSelect.innerHTML = songs.map(function (s, i) {
          var name = s.replace(/\.[^.]+$/, "");
          if (s === savedTrack) startIndex = i;
          return '<option value="' + i + '"' + (s === savedTrack ? ' selected' : '') + '>' + name + '</option>';
        }).join("");
      }

      if (savedTrack && songs.includes(savedTrack)) {
        startIndex = songs.indexOf(savedTrack);
      } else {
        startIndex = Math.floor(Math.random() * songs.length);
        savedTime = 0;
      }

      loadTrack(startIndex, savedTime);

      // Автовідтворення тільки якщо було увімкнено
      if (localStorage.getItem("musicOn") === "true") {
        bgMusic.play().then(function () {
          pendingResume = false;
          updateUI(true);
          startPositionSaver();
        }).catch(function () {
          pendingResume = true;
          addUnlockListeners();
        });
      }
    })
    .catch(function () {
      if (musicSelect) musicSelect.innerHTML = '<option value="">Немає playlist.json</option>';
    });

  // Play / Pause
  musicBtn.addEventListener("click", function () {
    if (bgMusic.paused) {
      bgMusic.play().then(function () {
        localStorage.setItem("musicOn", "true");
        pendingResume = false;
        updateUI(true);
        startPositionSaver();
      }).catch(function () {});
    } else {
      bgMusic.pause();
      localStorage.setItem("musicOn", "false");
      pendingResume = false;
      updateUI(false);
      stopPositionSaver();
      // Зберігаємо фінальну позицію
      if (playlist[currentIndex]) {
        localStorage.setItem("musicTrack", playlist[currentIndex]);
        localStorage.setItem("musicTime", String(bgMusic.currentTime));
      }
    }
  });

  // Зміна треку
  if (musicSelect) {
    musicSelect.addEventListener("change", function () {
      var idx = parseInt(musicSelect.value);
      if (!isNaN(idx) && playlist[idx]) playTrack(idx);
    });
  }

  // Гучність
  if (musicVolume) {
    musicVolume.addEventListener("input", function (e) {
      bgMusic.volume = e.target.value / 100;
      localStorage.setItem("musicVol", e.target.value);
      if (musicVolLabel) musicVolLabel.textContent = e.target.value + "%";
    });
  }

  // Пауза при згортанні
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      wasPlayingBeforeHide = !bgMusic.paused;
      if (wasPlayingBeforeHide) {
        bgMusic.pause();
        stopPositionSaver();
      }
    } else {
      if (wasPlayingBeforeHide) {
        bgMusic.play().then(function () {
          updateUI(true);
          startPositionSaver();
        }).catch(function () {
          pendingResume = true;
          addUnlockListeners();
        });
      }
    }
  });

  // Додатковий захист — зберігаємо при переході (якщо спрацює)
  window.addEventListener("pagehide", function () {
    if (!bgMusic.paused && playlist[currentIndex]) {
      localStorage.setItem("musicTrack", playlist[currentIndex]);
      localStorage.setItem("musicTime", String(bgMusic.currentTime));
    }
  });
})();
