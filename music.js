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

  var savedVol = localStorage.getItem("musicVol");
  bgMusic.volume = savedVol ? parseInt(savedVol) / 100 : 0.3;
  if (musicVolume) musicVolume.value = Math.round(bgMusic.volume * 100);
  if (musicVolLabel) musicVolLabel.textContent = Math.round(bgMusic.volume * 100) + "%";

  function getTrackName() {
    return playlist[currentIndex] ? playlist[currentIndex].replace(/\.[^.]+$/, "") : "Музика";
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

  function loadTrack(index, resumeTime) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    bgMusic.src = soundsBase + playlist[index];
    localStorage.setItem("musicTrack", playlist[index]);
    if (musicSelect) musicSelect.value = String(index);
    if (resumeTime > 0) bgMusic.currentTime = resumeTime;
  }

  function playTrack(index) {
    loadTrack(index, 0);
    bgMusic.play().then(function () {
      localStorage.setItem("musicOn", "true");
      updateUI(true);
    }).catch(function () {});
  }

  function startPlayback(resumeTime) {
    if (resumeTime > 0) bgMusic.currentTime = resumeTime;
    bgMusic.play().then(function () {
      updateUI(true);
    }).catch(function () {
      var unlock = function () {
        if (localStorage.getItem("musicOn") === "true") {
          if (resumeTime > 0) bgMusic.currentTime = resumeTime;
          bgMusic.play().then(function () { updateUI(true); }).catch(function () {});
        }
        document.removeEventListener("click", unlock);
      };
      document.addEventListener("click", unlock);
    });
  }

  fetch(soundsBase + "playlist.json")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (songs) {
      if (!songs.length) return;
      playlist = songs;

      var savedTrack = localStorage.getItem("musicTrack") || "";
      var savedTime = parseFloat(localStorage.getItem("musicTime")) || 0;
      var startIndex = 0;

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

      loadTrack(startIndex, 0);

      if (localStorage.getItem("musicOn") === "true") {
        startPlayback(savedTime);
      }

      localStorage.removeItem("musicTime");
    })
    .catch(function () {
      if (musicSelect) musicSelect.innerHTML = '<option value="">Немає playlist.json</option>';
    });

  musicBtn.addEventListener("click", function () {
    if (bgMusic.paused) {
      bgMusic.play().then(function () {
        localStorage.setItem("musicOn", "true");
        updateUI(true);
      }).catch(function () {});
    } else {
      bgMusic.pause();
      localStorage.setItem("musicOn", "false");
      updateUI(false);
    }
  });

  if (musicSelect) {
    musicSelect.addEventListener("change", function () {
      var idx = parseInt(musicSelect.value);
      if (!isNaN(idx) && playlist[idx]) playTrack(idx);
    });
  }

  if (musicVolume) {
    musicVolume.addEventListener("input", function (e) {
      bgMusic.volume = e.target.value / 100;
      localStorage.setItem("musicVol", e.target.value);
      if (musicVolLabel) musicVolLabel.textContent = e.target.value + "%";
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      wasPlayingBeforeHide = !bgMusic.paused;
      if (wasPlayingBeforeHide) bgMusic.pause();
    } else {
      if (wasPlayingBeforeHide) {
        bgMusic.play().then(function () { updateUI(true); }).catch(function () {});
      }
    }
  });

  window.addEventListener("beforeunload", function () {
    if (!bgMusic.paused && playlist[currentIndex]) {
      localStorage.setItem("musicTrack", playlist[currentIndex]);
      localStorage.setItem("musicTime", String(bgMusic.currentTime));
    }
  });
})();
