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
