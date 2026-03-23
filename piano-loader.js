/**
 * piano-loader.js — Điểm vào duy nhất để nhúng module vào site khác.
 * Hiện tại file này chỉ nhúng piano widget; score viewer đang sống riêng ở piano-studio.html.
 * Nếu sau này cần embed cả score, có thể mở rộng loader để mount thêm vùng score và nhận data-score-url.
 *
 * Cách dùng (đặt mount TRƯỚC script, hoặc dùng defer):
 *   <div id="pvq-piano-mount"></div>
 *   <script src="/đường-dẫn/module_piano_self_build/piano-loader.js" data-mount="#pvq-piano-mount" defer></script>
 *
 * Thuộc tính tùy chọn trên thẻ script:
 *   data-mount     — selector vùng chèn HTML (mặc định: #pvq-piano-mount)
 *   data-base      — URL thư mục module kết thúc bằng / (mặc định: thư mục chứa piano-loader.js)
 *   data-no-fonts  — có giá trị bất kỳ thì không inject Google Fonts (site bạn đã có font)
 */
(function () {
  'use strict';

  var GOOGLE_FONTS =
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&display=swap';

  function findLoaderScript() {
    var sc = document.currentScript;
    if (sc && sc.src) return sc;
    var all = document.querySelectorAll('script[src*="piano-loader.js"]');
    return all.length ? all[all.length - 1] : null;
  }

  function ensureTrailingSlash(url) {
    return url.endsWith('/') ? url : url + '/';
  }

  function injectCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function injectFonts() {
    injectCss(GOOGLE_FONTS);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Không tải được: ' + src));
      };
      document.body.appendChild(s);
    });
  }

  function run() {
    var script = findLoaderScript();
    if (!script || !script.src) {
      console.error('[PVQ Piano] Không tìm thấy piano-loader.js trên trang.');
      return;
    }

    var explicitBase = script.getAttribute('data-base');
    var baseUrl = explicitBase
      ? ensureTrailingSlash(new URL(explicitBase, window.location.href).href)
      : ensureTrailingSlash(new URL('.', script.src).href);

    var mountSel = script.getAttribute('data-mount') || '#pvq-piano-mount';
    var mount = document.querySelector(mountSel);
    if (!mount) {
      console.error('[PVQ Piano] Không tìm thấy mount:', mountSel);
      return;
    }

    if (!script.hasAttribute('data-no-fonts')) {
      injectFonts();
    }

    injectCss(baseUrl + 'css/piano-widget.css');

    var partialUrl = baseUrl + 'piano-widget.partial.html';

    fetch(partialUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + partialUrl);
        return r.text();
      })
      .then(function (html) {
        mount.innerHTML = html;
        return loadScript(baseUrl + 'js/data/piano-lessons.js');
      })
      .then(function () {
        return loadScript(baseUrl + 'js/piano/audio-engine.js');
      })
      .then(function () {
        return loadScript(baseUrl + 'js/piano/piano-keyboard.js');
      })
      .then(function () {
        return loadScript(baseUrl + 'js/piano/piano-player.js');
      })
      .then(function () {
        var root = mount.querySelector('[data-pvq-piano-root]');
        if (!root || !window.PVQ_PianoStudioPlayer) {
          throw new Error('Thiếu [data-pvq-piano-root] hoặc PVQ_PianoStudioPlayer.');
        }
        new window.PVQ_PianoStudioPlayer({
          root: root,
          songs: window.PVQ_PIANO_LESSONS || window.PVQ_DEMO_SONGS || [],
        });
      })
      .catch(function (err) {
        console.error('[PVQ Piano]', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
