/**
 * score-loader.js — Tải nội dung MusicXML (chuỗi) qua fetch.
 * Không phụ thuộc OSMD; dùng cho file .musicxml trong repo hoặc cùng origin.
 */
(function () {
  'use strict';

  /**
   * @param {string} url — Đường dẫn tương đối hoặc tuyệt đối tới file .musicxml
   * @returns {Promise<string>}
   */
  function loadFromUrl(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) {
        throw new Error('Không tải được bản nhạc: HTTP ' + r.status + ' — ' + url);
      }
      return r.text();
    });
  }

  window.PVQ_ScoreLoader = {
    loadFromUrl: loadFromUrl,
  };
})();
