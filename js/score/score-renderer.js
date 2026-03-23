/**
 * score-renderer.js — Bọc OpenSheetMusicDisplay: load chuỗi MusicXML + render SVG.
 * Cần script OSMD (và VexFlow 1.x) đã nạp trước; global: opensheetmusicdisplay.
 */
(function () {
  'use strict';

  /**
   * @param {{ container: HTMLElement }} options
   */
  function ScoreRenderer(options) {
    options = options || {};
    this.container = options.container;
    if (!this.container || typeof this.container.appendChild !== 'function') {
      throw new Error('PVQ_ScoreRenderer: options.container phải là một phần tử DOM.');
    }

    var osmdNs =
      typeof opensheetmusicdisplay !== 'undefined'
        ? opensheetmusicdisplay
        : typeof window !== 'undefined'
          ? window.opensheetmusicdisplay
          : null;

    if (!osmdNs || !osmdNs.OpenSheetMusicDisplay) {
      throw new Error('PVQ_ScoreRenderer: thiếu opensheetmusicdisplay (OSMD).');
    }

    this.osmd = new osmdNs.OpenSheetMusicDisplay(this.container, {
      autoResize: true,
      backend: 'svg',
    });
  }

  /**
   * @param {string} xmlString — MusicXML đầy đủ
   * @returns {Promise<void>}
   */
  ScoreRenderer.prototype.loadAndRender = function (xmlString) {
    var self = this;
    return this.osmd.load(xmlString).then(function () {
      self.osmd.render();
    });
  };

  window.PVQ_ScoreRenderer = ScoreRenderer;
})();
