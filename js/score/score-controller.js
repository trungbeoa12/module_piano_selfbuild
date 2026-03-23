/**
 * score-controller.js — Sync/controller layer:
 * nối playback engine với score view, cập nhật UI, cursor và scroll.
 */
(function () {
  'use strict';

  function ScoreController(options) {
    options = options || {};
    this.scoreView = options.scoreView;
    this.playbackEngine = options.playbackEngine;
    this.ui = options.ui || {};
    this.lastAutoScrollAt = 0;

    if (!this.scoreView || !this.playbackEngine) {
      throw new Error('PVQ_ScoreController: thiếu scoreView hoặc playbackEngine.');
    }
  }

  ScoreController.prototype.init = function () {
    var self = this;

    this.scoreView.setSelectionChangeHandler(function (state) {
      self.handleSelectionChange(state);
    });
    this.playbackEngine.setStateChangeHandler(function (state) {
      self.handlePlaybackStateChange(state);
    });

    if (this.ui.clearButton) {
      this.ui.clearButton.addEventListener('click', function () {
        self.playbackEngine.stop();
        self.scoreView.clearSelection();
      });
    }

    if (this.ui.playButton) {
      this.ui.playButton.addEventListener('click', function () {
        self.playbackEngine.togglePlayPause();
      });
    }

    if (this.ui.stopButton) {
      this.ui.stopButton.addEventListener('click', function () {
        self.playbackEngine.stop();
      });
    }

    if (this.ui.speedSlider) {
      this.playbackEngine.setSpeed(this.ui.speedSlider.value);
      this.ui.speedSlider.addEventListener('input', function () {
        self.playbackEngine.setSpeed(self.ui.speedSlider.value);
      });
    }

    if (this.ui.loopToggle) {
      this.playbackEngine.setLoopEnabled(this.ui.loopToggle.checked);
      this.ui.loopToggle.addEventListener('change', function () {
        self.playbackEngine.setLoopEnabled(self.ui.loopToggle.checked);
      });
    }
  };

  ScoreController.prototype.handleSelectionChange = function (state) {
    var selection = state.selection;
    var hasSelection = selection.start !== null && selection.end !== null;
    var startLabel = hasSelection ? selection.start + 1 : null;
    var endLabel = hasSelection ? selection.end + 1 : null;
    var range;

    if (this.playbackEngine.state === 'playing' || this.playbackEngine.state === 'paused') {
      this.playbackEngine.stop();
    }

    if (this.ui.selectionText) {
      if (!hasSelection) {
        this.ui.selectionText.textContent =
          state.measures.length > 0
            ? 'Đã nhận ' + state.measures.length + ' ô nhịp. Nhấn 1 ô để bắt đầu, nhấn ô khác để chọn cả đoạn.'
            : 'Chưa lấy được ô nhịp từ score.';
      } else if (selection.start === selection.end) {
        this.ui.selectionText.textContent =
          'Đang chọn ô nhịp ' + startLabel + '. Nhấn thêm một ô khác để mở rộng thành đoạn.';
      } else {
        this.ui.selectionText.textContent =
          'Đang chọn đoạn từ ô ' + startLabel + ' đến ô ' + endLabel + ' (' +
          (selection.end - selection.start + 1) + ' ô nhịp).';
      }
    }

    if (this.ui.clearButton) {
      this.ui.clearButton.disabled = !hasSelection;
    }

    if (hasSelection) {
      range = this.scoreView.findTimelineRangeByMeasure(selection.start, selection.end);
      this.playbackEngine.setRange(range.start, range.end, 'selection');
      return;
    }

    this.playbackEngine.resetFullRange();
  };

  ScoreController.prototype.handlePlaybackStateChange = function (state) {
    this.updatePlaybackUi(state);

    if (!state.canPlay) {
      this.scoreView.hideCursor();
      return;
    }

    if (state.state === 'idle') {
      this.scoreView.hideCursor();
      return;
    }

    if (state.currentFrame) {
      this.scoreView.showCursorAtStep(state.currentFrame);
      this.autoScrollCursorIfNeeded(state.state !== 'playing');
      return;
    }

    this.scoreView.hideCursor();
  };

  ScoreController.prototype.updatePlaybackUi = function (state) {
    var speedLabel = state.speed.toFixed(1) + 'x';
    var sourceText = state.rangeSource === 'selection'
      ? 'đoạn đã chọn'
      : 'toàn bộ bản nhạc';
    var currentMeasureLabel = state.currentFrame ? state.currentFrame.measureIndex + 1 : null;
    var debugSuffix = currentMeasureLabel !== null
      ? ' Ô hiện tại: ' + currentMeasureLabel + '. Delay: ' + Math.round(state.lastDelayMs || 0) + 'ms.'
      : '';

    if (this.ui.speedValue) {
      this.ui.speedValue.textContent = speedLabel;
    }

    if (this.ui.loopToggle) {
      this.ui.loopToggle.checked = !!state.loopEnabled;
      this.ui.loopToggle.disabled = !state.canPlay;
    }

    if (this.ui.playButton) {
      this.ui.playButton.disabled = !state.canPlay;
      this.ui.playButton.textContent = state.state === 'playing' ? 'Pause' : 'Play';
    }

    if (this.ui.stopButton) {
      this.ui.stopButton.disabled = !state.canPlay || state.state === 'idle' || state.state === 'stopped';
    }

    if (!this.ui.playbackText) {
      return;
    }

    if (!state.canPlay) {
      this.ui.playbackText.textContent = 'Chưa sẵn sàng phát sheet nhạc.';
      return;
    }

    if (state.state === 'playing') {
      this.ui.playbackText.textContent =
        'Đang phát ' + sourceText + ' ở tốc độ ' + speedLabel +
        (state.loopEnabled ? ' (đang bật loop).' : '.') + debugSuffix;
      return;
    }

    if (state.state === 'paused') {
      this.ui.playbackText.textContent =
        'Đang tạm dừng ' + sourceText + '. Bấm Play để tiếp tục.' + debugSuffix;
      return;
    }

    this.ui.playbackText.textContent =
      'Sẵn sàng phát ' + sourceText + ' ở tốc độ ' + speedLabel +
      (state.loopEnabled ? ' với loop đã bật.' : '.') + debugSuffix;
  };

  ScoreController.prototype.autoScrollCursorIfNeeded = function (force) {
    var scrollHost = this.scoreView.getScrollHost();
    var state = this.playbackEngine;
    var frame = state.getCurrentFrame();
    var measure;
    var thresholdX = 80;
    var thresholdY = 60;
    var nextLeft;
    var nextTop;
    var shouldScroll = false;
    var now = Date.now();
    var visibleLeft;
    var visibleRight;
    var visibleTop;
    var visibleBottom;

    if (!frame || !scrollHost) {
      return;
    }

    if (!force && now - this.lastAutoScrollAt < 180) {
      return;
    }

    measure = this.scoreView.getMeasureByIndex(frame.measureIndex);
    if (!measure) {
      return;
    }

    nextLeft = scrollHost.scrollLeft;
    nextTop = scrollHost.scrollTop;
    visibleLeft = scrollHost.scrollLeft;
    visibleRight = visibleLeft + scrollHost.clientWidth;
    visibleTop = scrollHost.scrollTop;
    visibleBottom = visibleTop + scrollHost.clientHeight;

    if (force || measure.left + measure.width > visibleRight - thresholdX) {
      nextLeft += (measure.left + measure.width) - (visibleRight - thresholdX);
      shouldScroll = true;
    } else if (measure.left < visibleLeft + thresholdX) {
      nextLeft -= (visibleLeft + thresholdX) - measure.left;
      shouldScroll = true;
    }

    if (force || measure.top + measure.height > visibleBottom - thresholdY) {
      nextTop += (measure.top + measure.height) - (visibleBottom - thresholdY);
      shouldScroll = true;
    } else if (measure.top < visibleTop + thresholdY) {
      nextTop -= (visibleTop + thresholdY) - measure.top;
      shouldScroll = true;
    }

    if (!shouldScroll) {
      return;
    }

    scrollHost.scrollTo({
      left: Math.max(0, nextLeft),
      top: Math.max(0, nextTop),
      behavior: 'auto',
    });
    this.lastAutoScrollAt = now;
  };

  window.PVQ_ScoreController = ScoreController;
})();
