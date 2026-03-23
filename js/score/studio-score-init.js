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

  function updateSelectionUi(state, selectionText, clearButton) {
    var selection = state.selection;
    var measures = state.measures || [];
    var totalMeasures = measures.length;
    var hasSelection = selection.start !== null && selection.end !== null;
    var startLabel = hasSelection ? selection.start + 1 : null;
    var endLabel = hasSelection ? selection.end + 1 : null;

    if (selectionText) {
      if (!hasSelection) {
        selectionText.textContent =
          totalMeasures > 0
            ? 'Đã nhận ' + totalMeasures + ' ô nhịp. Nhấn 1 ô để bắt đầu, nhấn ô khác để chọn cả đoạn.'
            : 'Chưa lấy được ô nhịp từ score.';
      } else if (selection.start === selection.end) {
        selectionText.textContent = 'Đang chọn ô nhịp ' + startLabel + '. Nhấn thêm một ô khác để mở rộng thành đoạn.';
      } else {
        selectionText.textContent =
          'Đang chọn đoạn từ ô ' + startLabel + ' đến ô ' + endLabel + ' (' +
          (selection.end - selection.start + 1) + ' ô nhịp).';
      }
    }

    if (clearButton) {
      clearButton.disabled = !hasSelection;
    }
  }

  function updatePlaybackUi(state, playButton, stopButton, speedValue, playbackText) {
    var speedLabel = state.speed.toFixed(1) + 'x';
    var sourceText = state.rangeSource === 'selection'
      ? 'đoạn từ ô ' + (state.rangeStart + 1) + ' đến ô ' + (state.rangeEnd + 1)
      : 'toàn bộ bản nhạc';

    if (speedValue) {
      speedValue.textContent = speedLabel;
    }

    if (playButton) {
      playButton.disabled = !state.canPlay;
      playButton.textContent = state.status === 'playing' ? 'Pause' : 'Play';
    }

    if (stopButton) {
      stopButton.disabled = !state.canPlay || state.status === 'idle';
    }

    if (!playbackText) {
      return;
    }

    if (!state.canPlay) {
      playbackText.textContent = 'Chưa sẵn sàng phát sheet nhạc.';
      return;
    }

    if (state.status === 'playing') {
      playbackText.textContent = 'Đang phát ' + sourceText + ' ở tốc độ ' + speedLabel + '.';
      return;
    }

    if (state.status === 'paused') {
      playbackText.textContent = 'Đang tạm dừng ' + sourceText + '. Bấm Play để tiếp tục.';
      return;
    }

    playbackText.textContent = 'Sẵn sàng phát ' + sourceText + ' ở tốc độ ' + speedLabel + '.';
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
    var playbackText = document.querySelector('[data-pvq-role="score-playback-text"]');

    if (!container) {
      console.warn('[PVQ Score] Không tìm thấy #pvq-score-container.');
      return;
    }
    if (!window.PVQ_ScoreLoader || !window.PVQ_ScoreRenderer) {
      showError(container, 'Thiếu PVQ_ScoreLoader hoặc PVQ_ScoreRenderer.');
      return;
    }

    window.PVQ_ScoreLoader.loadFromUrl(url)
      .then(function (xml) {
        var renderer = new window.PVQ_ScoreRenderer({ container: container });
        renderer.setSelectionChangeHandler(function (state) {
          updateSelectionUi(state, selectionText, clearButton);
        });
        renderer.setPlaybackStateHandler(function (state) {
          updatePlaybackUi(state, playButton, stopButton, speedValue, playbackText);
        });

        if (clearButton) {
          clearButton.addEventListener('click', function () {
            renderer.clearSelection();
          });
        }

        if (playButton) {
          playButton.addEventListener('click', function () {
            renderer.togglePlayback();
          });
        }

        if (stopButton) {
          stopButton.addEventListener('click', function () {
            renderer.stopPlayback();
          });
        }

        if (speedSlider) {
          renderer.setPlaybackSpeed(speedSlider.value);
          speedSlider.addEventListener('input', function () {
            renderer.setPlaybackSpeed(speedSlider.value);
          });
        }

        return renderer.loadAndRender(xml);
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
