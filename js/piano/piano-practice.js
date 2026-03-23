/**
 * piano-practice.js — Entry khi tự gắn script tay (không dùng piano-loader.js).
 * Nếu dùng piano-loader.js thì KHÔNG thêm file này — sẽ khởi tạo player hai lần.
 */
(function () {
  'use strict';

  function mount() {
    var root = document.querySelector('[data-pvq-piano-root]');
    if (!root) return;

    var songs = window.PVQ_PIANO_LESSONS || window.PVQ_DEMO_SONGS || [];
    new window.PVQ_PianoStudioPlayer({ root: root, songs: songs });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
