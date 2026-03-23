/**
 * studio-score-init.js — Chỉ dùng trên piano-studio.html: tải file mẫu + render.
 * Đường dẫn file: thuộc tính data-score-url trên thẻ script (mặc định assets/scores/test-score.musicxml).
 */
(function () {
  'use strict';

  var DEFAULT_SCORE_URL = 'assets/scores/test-score.musicxml';

  function getScript() {
    return document.currentScript;
  }

  function showError(container, message) {
    container.classList.add('pvq-score-error');
    container.textContent = message;
  }

  function run() {
    var script = getScript();
    var url = (script && script.getAttribute('data-score-url')) || DEFAULT_SCORE_URL;
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
    if (!window.PVQ_ScoreLoader || !window.PVQ_ScoreView || !window.PVQ_PlaybackEngine || !window.PVQ_ScoreController) {
      showError(container, 'Thiếu score loader / score view / playback engine / controller.');
      return;
    }

    window.PVQ_ScoreLoader.loadFromUrl(url)
      .then(function (xml) {
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

        return scoreView.loadAndRender(xml).then(function (renderState) {
          playbackEngine.setTimeline(
            renderState.timeline || scoreView.getPlaybackTimeline(),
            renderState.timelineMeta || scoreView.getTimelineMeta()
          );
          return renderState;
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
