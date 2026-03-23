/**
 * piano-player.js — Ghép audio + bàn phím + UI (play, progress, bài hát).
 * Module boundary: phụ thuộc PVQ_PianoAudioEngine, PVQ_PianoKeyboard; mount vào root DOM.
 *
 * Khởi tạo: new PVQ_PianoStudioPlayer({ root: HTMLElement, songs?: array })
 * Các control con tìm bằng data-pvq-role trong phạm vi root (không phụ thuộc index.html).
 */
(function () {
  'use strict';

  var ROLES = {
    play: 'play-btn',
    prev: 'prev-btn',
    next: 'next-btn',
    progressFill: 'progress-fill',
    currentTime: 'current-time',
    totalTime: 'total-time',
    songTitle: 'song-title',
    speedSlider: 'speed-slider',
    speedValue: 'speed-value',
    volumeSlider: 'volume-slider',
    volumeValue: 'volume-value',
    repeatToggle: 'repeat-toggle',
    repeatSwitch: 'repeat-switch',
    miniPiano: 'mini-piano',
    songTab: 'song-tab',
  };

  function PianoStudioPlayer(options) {
    options = options || {};
    this.root = options.root || null;
    if (!this.root || typeof this.root.querySelector !== 'function') {
      throw new Error('PVQ_PianoStudioPlayer: options.root phải là một phần tử DOM.');
    }

    this.songsData =
      options.songs ||
      window.PVQ_PIANO_LESSONS ||
      window.PVQ_DEMO_SONGS ||
      [];

    this.audio = new window.PVQ_PianoAudioEngine();
    this.pianoRoot = null;
    this.keys = [];
    this.currentSong = 0;
    this.isPlaying = false;
    this.currentNoteIndex = 0;
    this.speed = 1;
    this.volume = 0.7;
    this.repeat = false;
    this.timeoutId = null;

    this._bindRoleElements();
    this._buildPiano();
    this._bindEvents();
    this.updateSongInfo();
    this.updateTabs();
    this.audio.setVolume(this.volume);
  }

  PianoStudioPlayer.prototype._q = function (role) {
    return this.root.querySelector('[data-pvq-role="' + role + '"]');
  };

  PianoStudioPlayer.prototype._qq = function (role) {
    return this.root.querySelectorAll('[data-pvq-role="' + role + '"]');
  };

  PianoStudioPlayer.prototype._bindRoleElements = function () {
    this.playBtn = this._q(ROLES.play);
    this.prevBtn = this._q(ROLES.prev);
    this.nextBtn = this._q(ROLES.next);
    this.progressFill = this._q(ROLES.progressFill);
    this.currentTimeEl = this._q(ROLES.currentTime);
    this.totalTimeEl = this._q(ROLES.totalTime);
    this.songTitleEl = this._q(ROLES.songTitle);
    this.speedSlider = this._q(ROLES.speedSlider);
    this.speedValue = this._q(ROLES.speedValue);
    this.volumeSlider = this._q(ROLES.volumeSlider);
    this.volumeValue = this._q(ROLES.volumeValue);
    this.repeatToggle = this._q(ROLES.repeatToggle);
    this.repeatSwitch = this._q(ROLES.repeatSwitch);
    this.songTabs = this._qq(ROLES.songTab);
  };

  PianoStudioPlayer.prototype.songs = function () {
    return this.songsData;
  };

  PianoStudioPlayer.prototype._buildPiano = function () {
    var pianoEl = this._q(ROLES.miniPiano);
    var built = window.PVQ_PianoKeyboard.buildMiniKeys(pianoEl);
    this.pianoRoot = built.pianoRoot;
    this.keys = built.keys || [];
  };

  PianoStudioPlayer.prototype._bindEvents = function () {
    var self = this;
    if (!this.playBtn) return;

    this.playBtn.addEventListener('click', function () {
      self.togglePlay();
    });

    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', function () {
        self.prevSong();
      });
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', function () {
        self.nextSong();
      });
    }

    if (this.speedSlider) {
      this.speedSlider.addEventListener('input', function (e) {
        self.speed = parseFloat(e.target.value);
        if (self.speedValue) {
          self.speedValue.textContent = self.speed.toFixed(1) + 'x';
        }
      });
    }

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', function (e) {
        self.volume = parseFloat(e.target.value);
        if (self.volumeValue) {
          self.volumeValue.textContent = Math.round(self.volume * 100) + '%';
        }
        self.audio.setVolume(self.volume);
      });
    }

    if (this.repeatToggle) {
      this.repeatToggle.addEventListener('click', function () {
        self.repeat = !self.repeat;
        self.repeatToggle.classList.toggle('active', self.repeat);
        if (self.repeatSwitch) {
          self.repeatSwitch.classList.toggle('active', self.repeat);
        }
      });
    }

    if (this.songTabs && this.songTabs.length) {
      this.songTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var songIndex = parseInt(tab.dataset.song, 10);
          self.selectSong(songIndex);
        });
      });
    }

    if (this.keys && this.keys.length) {
      this.keys.forEach(function (key) {
        key.addEventListener('click', function () {
          self.audio.playNote(key.dataset.note, 0.3);
          self.highlightKey(key.dataset.note);
        });
      });
    }

    this._setupKeyboardPlay();
  };

  PianoStudioPlayer.prototype.selectSong = function (index) {
    var wasPlaying = this.isPlaying;
    this.stop();
    this.currentSong = index;
    this.currentNoteIndex = 0;
    this.updateSongInfo();
    this.updateTabs();
    this.updateProgress(0);
    if (wasPlaying) {
      this.play();
    }
  };

  PianoStudioPlayer.prototype.updateTabs = function () {
    if (!this.songTabs || !this.songTabs.length) return;
    var self = this;
    this.songTabs.forEach(function (tab, i) {
      tab.classList.toggle('active', i === self.currentSong);
    });
  };

  PianoStudioPlayer.prototype.updateSongInfo = function () {
    var list = this.songs();
    var song = list[this.currentSong];
    if (!song) return;
    if (this.songTitleEl) {
      this.songTitleEl.textContent = song.title;
    }

    var totalDuration = song.notes.reduce(function (sum, n) {
      return sum + n.duration;
    }, 0);
    if (this.totalTimeEl) {
      this.totalTimeEl.textContent = this.formatTime(totalDuration);
    }
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = '0:00';
    }
  };

  PianoStudioPlayer.prototype.formatTime = function (seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  PianoStudioPlayer.prototype.togglePlay = function () {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  };

  PianoStudioPlayer.prototype.play = function () {
    this.isPlaying = true;
    if (this.playBtn) this.playBtn.textContent = '❚❚';
    this.playNextNote();
  };

  PianoStudioPlayer.prototype.pause = function () {
    this.isPlaying = false;
    if (this.playBtn) this.playBtn.textContent = '▶';
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  };

  PianoStudioPlayer.prototype.stop = function () {
    this.pause();
    this.currentNoteIndex = 0;
    this.updateProgress(0);
    this.clearAllKeys();
  };

  PianoStudioPlayer.prototype.playNextNote = function () {
    var self = this;
    if (!this.isPlaying) return;

    var list = this.songs();
    var song = list[this.currentSong];
    if (!song || this.currentNoteIndex >= song.notes.length) {
      if (this.repeat && this.repeatToggle) {
        this.currentNoteIndex = 0;
        this.updateProgress(0);
        if (this.currentTimeEl) this.currentTimeEl.textContent = '0:00';
        this.playNextNote();
        return;
      }
      this.stop();
      return;
    }

    var noteData = song.notes[this.currentNoteIndex];
    var adjustedDuration = noteData.duration / this.speed;

    this.audio.playNote(noteData.note, adjustedDuration);
    this.highlightKey(noteData.note);

    var totalNotes = song.notes.length;
    var progress = ((this.currentNoteIndex + 1) / totalNotes) * 100;
    this.updateProgress(progress);

    var elapsed = 0;
    for (var i = 0; i <= this.currentNoteIndex; i++) {
      elapsed += song.notes[i].duration;
    }
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatTime(elapsed / this.speed);
    }

    this.currentNoteIndex++;

    this.timeoutId = setTimeout(function () {
      self.playNextNote();
    }, adjustedDuration * 1000);
  };

  PianoStudioPlayer.prototype.highlightKey = function (note) {
    this.clearAllKeys();
    var scope = this.pianoRoot;
    if (!scope) return;
    var key = scope.querySelector('.mini-key[data-note="' + note + '"]');
    if (key) {
      key.classList.add('active');
      setTimeout(function () {
        key.classList.remove('active');
      }, 200);
    }
  };

  PianoStudioPlayer.prototype.clearAllKeys = function () {
    if (!this.keys) return;
    this.keys.forEach(function (k) {
      k.classList.remove('active');
    });
  };

  PianoStudioPlayer.prototype.updateProgress = function (percent) {
    if (this.progressFill) this.progressFill.style.width = percent + '%';
  };

  PianoStudioPlayer.prototype.prevSong = function () {
    var list = this.songs();
    if (!list.length) return;
    var newIndex = this.currentSong === 0 ? list.length - 1 : this.currentSong - 1;
    this.selectSong(newIndex);
  };

  PianoStudioPlayer.prototype.nextSong = function () {
    var list = this.songs();
    if (!list.length) return;
    var newIndex = (this.currentSong + 1) % list.length;
    this.selectSong(newIndex);
  };

  PianoStudioPlayer.prototype._setupKeyboardPlay = function () {
    var keyMap = window.PVQ_PianoKeyboard.getKeyMapping();
    var activeKeys = new Set();
    var self = this;

    document.addEventListener('keydown', function (e) {
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        self.togglePlay();
        return;
      }

      var note = keyMap[e.code];
      if (note && !activeKeys.has(e.code)) {
        e.preventDefault();
        activeKeys.add(e.code);
        self.audio.playNote(note, 0.4);
        self.highlightKey(note);
      }
    });

    document.addEventListener('keyup', function (e) {
      if (keyMap[e.code]) {
        activeKeys.delete(e.code);
      }
    });
  };

  window.PVQ_PianoStudioPlayer = PianoStudioPlayer;
})();
