/**
 * studio-score-init.js — Chỉ dùng trên piano-studio.html:
 * tải score (.musicxml/.mxl) + MIDI (.mid), build sync cache và khởi tạo playback.
 */
(function () {
  'use strict';

  var DEFAULT_SCORE_URL = 'assets/scores/waltz-in-a-minorchopin.mxl';
  var DEFAULT_MIDI_URL = 'sheet_piano/waltz-in-a-minorchopin.mid';

  function getScript() {
    return document.currentScript;
  }

  function showError(container, message) {
    container.classList.add('pvq-score-error');
    container.textContent = message;
  }

  function isMxlFile(url) {
    return /\.mxl(?:$|\?)/i.test(url || '');
  }

  function getMidiCtor() {
    if (typeof window !== 'undefined' && typeof window.Midi === 'function') {
      return window.Midi;
    }
    if (typeof window !== 'undefined' && window.Tone && typeof window.Tone.Midi === 'function') {
      return window.Tone.Midi;
    }
    return null;
  }

  function loadBinary(url) {
    if (window.PVQ_ScoreLoader && typeof window.PVQ_ScoreLoader.loadArrayBufferFromUrl === 'function') {
      return window.PVQ_ScoreLoader.loadArrayBufferFromUrl(url);
    }

    // Fallback tương thích: nếu browser đang giữ bản score-loader cũ, vẫn tự fetch được MIDI.
    return fetch(url).then(function (r) {
      if (!r.ok) {
        throw new Error('Không tải được file: HTTP ' + r.status + ' — ' + url);
      }
      return r.arrayBuffer();
    });
  }

  function run() {
    var script = getScript();
    var url = (script && script.getAttribute('data-score-url')) || DEFAULT_SCORE_URL;
    var midiUrl = (script && script.getAttribute('data-midi-url')) || DEFAULT_MIDI_URL;
    var container = document.getElementById('pvq-score-container');
    var selectionText = document.querySelector('[data-pvq-role="score-selection-text"]');
    var clearButton = document.querySelector('[data-pvq-role="score-clear-btn"]');
    var playButton = document.querySelector('[data-pvq-role="score-play-btn"]');
    var stopButton = document.querySelector('[data-pvq-role="score-stop-btn"]');
    var speedSlider = document.querySelector('[data-pvq-role="score-speed-slider"]');
    var speedValue = document.querySelector('[data-pvq-role="score-speed-value"]');
    var loopToggle = document.querySelector('[data-pvq-role="score-loop-toggle"]');
    var playbackText = document.querySelector('[data-pvq-role="score-playback-text"]');

    if (!container) {
      console.warn('[PVQ Score] Không tìm thấy #pvq-score-container.');
      return;
    }
    if (!window.PVQ_ScoreLoader || !window.PVQ_ScoreView || !window.PVQ_PlaybackEngine || !window.PVQ_ScoreController || !window.PVQ_ScoreSyncCache) {
      showError(container, 'Thiếu score loader / score view / playback engine / controller / sync cache.');
      return;
    }

    var scorePromise = isMxlFile(url) ? Promise.resolve(url) : window.PVQ_ScoreLoader.loadFromUrl(url);
    var scoreView = new window.PVQ_ScoreView({ container: container });
    var playbackEngine = new window.PVQ_PlaybackEngine();
    var controller = new window.PVQ_ScoreController({
      scoreView: scoreView,
      playbackEngine: playbackEngine,
      ui: {
        selectionText: selectionText,
        clearButton: clearButton,
        playButton: playButton,
        stopButton: stopButton,
        speedSlider: speedSlider,
        speedValue: speedValue,
        loopToggle: loopToggle,
        playbackText: playbackText,
      },
    });
    controller.init();

    scorePromise
      .then(function (scoreSource) {
        return scoreView.loadAndRender(scoreSource).then(function (renderState) {
          return renderState;
        });
      })
      .then(function (renderState) {
        return loadBinary(midiUrl).then(function (midiArrayBuffer) {
          var MidiCtor = getMidiCtor();
          var midi;
          var scoreTimeline;
          var syncedTimeline;

          if (!MidiCtor) {
            throw new Error('Thiếu thư viện MIDI parser (Tonejs Midi).');
          }
          midi = new MidiCtor(midiArrayBuffer);
          scoreTimeline = renderState.timeline || scoreView.getPlaybackTimeline();
          syncedTimeline = window.PVQ_ScoreSyncCache.buildMeasureSyncTimeline(scoreTimeline, midi);
          playbackEngine.setSources({
            timeline: syncedTimeline,
            timelineMeta: renderState.timelineMeta || scoreView.getTimelineMeta(),
            midi: midi,
          });
        }).catch(function (midiErr) {
          console.error('[PVQ Score MIDI]', midiErr);
          if (playbackText) {
            playbackText.textContent = 'Đã render bản nhạc nhưng chưa bật playback MIDI: ' + (midiErr.message || String(midiErr));
          }
        });
      })
      .catch(function (err) {
        console.error('[PVQ Score]', err);
        showError(container, err.message || String(err));
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
