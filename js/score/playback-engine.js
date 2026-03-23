/**
 * playback-engine.js — Playback engine độc lập với OSMD/DOM.
 * Chỉ dùng timeline đã cache sẵn để quản lý state và scheduler.
 */
(function () {
  'use strict';

  function cloneFrame(frame) {
    if (!frame) {
      return null;
    }

    var copy = {};
    Object.keys(frame).forEach(function (key) {
      copy[key] = frame[key];
    });
    return copy;
  }

  function PlaybackEngine() {
    this.timeline = [];
    this.timelineMeta = null;
    this.state = 'idle';
    this.speed = 1;
    this.loopEnabled = false;
    this.range = { start: 0, end: 0, source: 'full' };
    this.currentIndex = 0;
    this.timer = null;
    this.stateChangeHandler = null;
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
  }

  PlaybackEngine.prototype.setStateChangeHandler = function (handler) {
    this.stateChangeHandler = typeof handler === 'function' ? handler : null;
    this.emitState();
  };

  PlaybackEngine.prototype.setTimeline = function (timeline, timelineMeta) {
    this.timeline = Array.isArray(timeline) ? timeline.slice() : [];
    this.timelineMeta = timelineMeta || null;
    this.range = {
      start: 0,
      end: this.timeline.length ? this.timeline.length - 1 : 0,
      source: 'full',
    };
    this.currentIndex = this.range.start;
    this.state = this.timeline.length ? 'stopped' : 'idle';
    this.clearTimer();
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.emitState();
  };

  PlaybackEngine.prototype.setSpeed = function (speed) {
    var value = Number(speed);
    if (!isFinite(value) || value <= 0) {
      return;
    }
    this.speed = value;
    this.emitState();
  };

  PlaybackEngine.prototype.setLoopEnabled = function (enabled) {
    this.loopEnabled = !!enabled;
    this.emitState();
  };

  PlaybackEngine.prototype.setRange = function (startIndex, endIndex, source) {
    if (!this.timeline.length) {
      return;
    }

    var start = Math.max(0, Math.min(this.timeline.length - 1, Number(startIndex) || 0));
    var end = Math.max(0, Math.min(this.timeline.length - 1, Number(endIndex) || 0));
    this.range = {
      start: Math.min(start, end),
      end: Math.max(start, end),
      source: source || 'selection',
    };
    this.currentIndex = this.range.start;
    if (this.state !== 'idle') {
      this.state = 'stopped';
    }
    this.clearTimer();
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.emitState();
  };

  PlaybackEngine.prototype.resetFullRange = function () {
    if (!this.timeline.length) {
      return;
    }
    this.setRange(0, this.timeline.length - 1, 'full');
  };

  PlaybackEngine.prototype.togglePlayPause = function () {
    if (this.state === 'playing') {
      this.pause();
      return;
    }
    this.play();
  };

  PlaybackEngine.prototype.play = function () {
    if (!this.timeline.length) {
      return;
    }

    if (this.state === 'paused') {
      this.state = 'playing';
      this.nextDueAt = performance.now() + this.getFrameDelayMs(this.timeline[this.currentIndex]);
      this.emitState();
      this.scheduleNextTick();
      return;
    }

    if (this.state === 'idle') {
      this.state = 'stopped';
    }

    if (this.currentIndex < this.range.start || this.currentIndex > this.range.end) {
      this.currentIndex = this.range.start;
    }

    this.state = 'playing';
    this.nextDueAt = performance.now() + this.getFrameDelayMs(this.timeline[this.currentIndex]);
    this.emitState();
    this.scheduleNextTick();
  };

  PlaybackEngine.prototype.pause = function () {
    if (this.state !== 'playing') {
      return;
    }
    this.clearTimer();
    this.nextDueAt = 0;
    this.state = 'paused';
    this.emitState();
  };

  PlaybackEngine.prototype.stop = function () {
    if (!this.timeline.length) {
      this.state = 'idle';
      this.emitState();
      return;
    }
    this.clearTimer();
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.state = 'stopped';
    this.currentIndex = this.range.start;
    this.emitState();
  };

  PlaybackEngine.prototype.clearTimer = function () {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  };

  PlaybackEngine.prototype.getFrameDelayMs = function (frame) {
    if (!frame) {
      return 500;
    }

    return Math.max(180, frame.durationMs / this.speed);
  };

  PlaybackEngine.prototype.scheduleNextTick = function () {
    var self = this;
    var frame;
    var delay;
    var now;

    if (this.state !== 'playing') {
      return;
    }

    frame = this.timeline[this.currentIndex];
    if (!frame) {
      this.stop();
      return;
    }

    now = performance.now();
    if (!this.nextDueAt || this.nextDueAt <= now) {
      this.nextDueAt = now + this.getFrameDelayMs(frame);
    }
    delay = Math.max(16, this.nextDueAt - now);
    this.lastDelayMs = delay;
    this.clearTimer();
    this.timer = window.setTimeout(function () {
      self.timer = null;
      self.advance();
    }, delay);
  };

  PlaybackEngine.prototype.advance = function () {
    if (this.state !== 'playing') {
      return;
    }

    if (this.currentIndex >= this.range.end) {
      if (this.loopEnabled) {
        this.currentIndex = this.range.start;
        this.nextDueAt = performance.now() + this.getFrameDelayMs(this.timeline[this.currentIndex]);
        this.emitState();
        this.scheduleNextTick();
        return;
      }
      this.stop();
      return;
    }

    this.currentIndex += 1;
    this.nextDueAt += this.getFrameDelayMs(this.timeline[this.currentIndex]);
    this.emitState();
    this.scheduleNextTick();
  };

  PlaybackEngine.prototype.getCurrentFrame = function () {
    return cloneFrame(this.timeline[this.currentIndex] || null);
  };

  PlaybackEngine.prototype.emitState = function () {
    if (!this.stateChangeHandler) {
      return;
    }

    this.stateChangeHandler({
      state: this.state,
      speed: this.speed,
      loopEnabled: this.loopEnabled,
      canPlay: this.timeline.length > 0,
      rangeStart: this.range.start,
      rangeEnd: this.range.end,
      rangeSource: this.range.source,
      currentIndex: this.currentIndex,
      currentFrame: this.getCurrentFrame(),
      lastDelayMs: this.lastDelayMs,
      timelineMeta: this.timelineMeta,
    });
  };

  window.PVQ_PlaybackEngine = PlaybackEngine;
})();
