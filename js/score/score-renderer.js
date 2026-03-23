/**
 * score-renderer.js — Bọc OpenSheetMusicDisplay: load chuỗi MusicXML + render SVG.
 * Cần script OSMD (và VexFlow 1.x) đã nạp trước; global: opensheetmusicdisplay.
 */
(function () {
  'use strict';

  function toNumber(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  function mergeRect(bounds, rect) {
    if (!bounds) {
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }

    bounds.left = Math.min(bounds.left, rect.left);
    bounds.top = Math.min(bounds.top, rect.top);
    bounds.right = Math.max(bounds.right, rect.right);
    bounds.bottom = Math.max(bounds.bottom, rect.bottom);
    return bounds;
  }

  /**
   * @param {{ container: HTMLElement }} options
   */
  function ScoreRenderer(options) {
    options = options || {};
    this.container = options.container;
    this.overlay = null;
    this.measures = [];
    this.selection = { anchor: null, start: null, end: null };
    this.selectionChangeHandler = null;
    this.resizeHandler = this.refreshMeasureOverlay.bind(this);
    this.mutationObserver = null;
    this.rebuildScheduled = false;
    this.playbackStateHandler = null;
    this.playbackTimer = null;
    this.playbackSteps = [];
    this.playbackCache = null;
    this.playbackRangeCache = {};
    this.playbackIndex = 0;
    this.playbackStatus = 'idle';
    this.playbackSpeed = 1;
    this.playbackRange = { start: 0, end: 0, source: 'full' };
    this.loopEnabled = false;
    this.lastAutoScrollAt = 0;

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

  ScoreRenderer.prototype.loadAndRender = function (xmlString) {
    var self = this;
    return this.osmd.load(xmlString).then(function () {
      self.osmd.render();
      self.observeDom();
      return new Promise(function (resolve) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            self.buildMeasureOverlay();
            self.rebuildPlaybackCache();
            resolve();
          });
        });
      });
    });
  };

  ScoreRenderer.prototype.setSelectionChangeHandler = function (handler) {
    this.selectionChangeHandler = typeof handler === 'function' ? handler : null;
    this.emitSelectionChange();
  };

  ScoreRenderer.prototype.setPlaybackStateHandler = function (handler) {
    this.playbackStateHandler = typeof handler === 'function' ? handler : null;
    this.emitPlaybackState();
  };

  ScoreRenderer.prototype.getMeasures = function () {
    return this.measures.slice();
  };

  ScoreRenderer.prototype.getSelection = function () {
    return {
      anchor: this.selection.anchor,
      start: this.selection.start,
      end: this.selection.end,
    };
  };

  ScoreRenderer.prototype.clearSelection = function () {
    if (this.playbackStatus !== 'idle') {
      this.stopPlayback(false);
    }
    this.selection.anchor = null;
    this.selection.start = null;
    this.selection.end = null;
    this.paintMeasureSelection();
    this.emitSelectionChange();
  };

  ScoreRenderer.prototype.setPlaybackSpeed = function (speed) {
    var value = Number(speed);
    if (!isFinite(value) || value <= 0) {
      return;
    }

    this.playbackSpeed = value;
    this.emitPlaybackState();
  };

  ScoreRenderer.prototype.togglePlayback = function () {
    if (this.playbackStatus === 'playing') {
      this.pausePlayback();
      return;
    }

    this.startPlayback();
  };

  ScoreRenderer.prototype.setLoopEnabled = function (enabled) {
    this.loopEnabled = !!enabled;
    this.emitPlaybackState();
  };

  ScoreRenderer.prototype.startPlayback = function () {
    var range = this.getActivePlaybackRange();

    if (!this.measures.length) {
      return;
    }

    if (this.playbackStatus === 'paused' && this.playbackSteps.length) {
      this.playbackStatus = 'playing';
      this.emitPlaybackState();
      this.schedulePlaybackStep();
      return;
    }

    this.stopPlayback(false, true);
    this.playbackRange = {
      start: range.start,
      end: range.end,
      source: range.source,
    };
    this.playbackSteps = this.getCachedPlaybackSteps(range.start, range.end);
    if (!this.playbackSteps.length) {
      this.emitPlaybackState();
      return;
    }

    this.setCursorToStep(this.playbackSteps[0]);
    this.playbackIndex = 0;
    this.transitionPlaybackState('playing');
    this.emitPlaybackState();
    this.schedulePlaybackStep();
  };

  ScoreRenderer.prototype.pausePlayback = function () {
    if (this.playbackTimer) {
      window.clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }

    if (this.playbackStatus === 'playing') {
      this.transitionPlaybackState('paused');
      this.emitPlaybackState();
    }
  };

  ScoreRenderer.prototype.stopPlayback = function (emitState, keepState) {
    if (this.playbackTimer) {
      window.clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }

    this.playbackIndex = 0;
    this.playbackSteps = [];
    if (!keepState) {
      this.transitionPlaybackState('stopped');
    }
    this.resetCursorToPlaybackStart();

    if (emitState !== false) {
      this.emitPlaybackState();
    }
  };

  ScoreRenderer.prototype.selectMeasureRange = function (startIndex, endIndex) {
    var start = toNumber(startIndex);
    var end = toNumber(endIndex);
    if (start === null || end === null) {
      return;
    }

    var min = Math.min(start, end);
    var max = Math.max(start, end);
    if (this.playbackStatus !== 'idle') {
      this.stopPlayback(false);
    }
    this.selection.anchor = start;
    this.selection.start = min;
    this.selection.end = max;
    this.paintMeasureSelection();
    this.emitSelectionChange();
  };

  ScoreRenderer.prototype.transitionPlaybackState = function (nextState) {
    var allowed = {
      idle: true,
      playing: true,
      paused: true,
      stopped: true,
    };
    if (!allowed[nextState]) {
      return;
    }
    this.playbackStatus = nextState;
  };

  ScoreRenderer.prototype.handleMeasureClick = function (measureIndex) {
    if (this.playbackStatus !== 'idle') {
      this.stopPlayback(false);
    }
    var current = this.selection;
    if (current.anchor === null || (current.start !== null && current.end !== null && current.start !== current.end)) {
      this.selection.anchor = measureIndex;
      this.selection.start = measureIndex;
      this.selection.end = measureIndex;
    } else if (current.anchor !== null && current.start === current.end) {
      this.selection.start = Math.min(current.anchor, measureIndex);
      this.selection.end = Math.max(current.anchor, measureIndex);
    } else {
      this.selection.anchor = measureIndex;
      this.selection.start = measureIndex;
      this.selection.end = measureIndex;
    }

    this.paintMeasureSelection();
    this.emitSelectionChange();
  };

  ScoreRenderer.prototype.getActivePlaybackRange = function () {
    if (this.selection.start !== null && this.selection.end !== null) {
      return {
        start: this.selection.start,
        end: this.selection.end,
        source: 'selection',
      };
    }

    return {
      start: 0,
      end: this.measures.length ? this.measures[this.measures.length - 1].index : 0,
      source: 'full',
    };
  };

  ScoreRenderer.prototype.buildMeasureOverlay = function () {
    var self = this;

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
      window.addEventListener('resize', this.resizeHandler);
    }

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'pvq-score-overlay';
    this.container.appendChild(this.overlay);

    this.refreshMeasureOverlay();

    this.measures.forEach(function (measure) {
      var hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'pvq-score-measure-hit';
      hit.setAttribute('aria-label', 'Ô nhịp ' + measure.label);
      hit.dataset.measureIndex = String(measure.index);
      hit.title = 'Ô nhịp ' + measure.label;
      hit.style.left = measure.left + 'px';
      hit.style.top = measure.top + 'px';
      hit.style.width = measure.width + 'px';
      hit.style.height = measure.height + 'px';
      hit.addEventListener('click', function () {
        self.handleMeasureClick(measure.index);
      });
      self.overlay.appendChild(hit);
      measure.hit = hit;
    });

    this.paintMeasureSelection();
    this.rebuildPlaybackCache();
    this.emitSelectionChange();
  };

  ScoreRenderer.prototype.observeDom = function () {
    var self = this;

    if (typeof MutationObserver === 'undefined') {
      return;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver(function () {
      var hasSvg = !!self.container.querySelector('svg');
      var hasOverlay = !!self.container.querySelector('.pvq-score-overlay');
      if (hasSvg && !hasOverlay) {
        self.scheduleOverlayRebuild();
      }
    });

    this.mutationObserver.observe(this.container, {
      childList: true,
      subtree: true,
    });
  };

  ScoreRenderer.prototype.scheduleOverlayRebuild = function () {
    var self = this;
    if (this.rebuildScheduled) {
      return;
    }

    this.rebuildScheduled = true;
    window.requestAnimationFrame(function () {
      self.rebuildScheduled = false;
      self.buildMeasureOverlay();
    });
  };

  ScoreRenderer.prototype.refreshMeasureOverlay = function () {
    var hitByIndex = {};
    var containerRect = this.container.getBoundingClientRect();
    var groups = {};
    var nodes = this.container.querySelectorAll('svg g.vf-measure[id]');
    var measureIds = [];
    var i;

    for (i = 0; i < this.measures.length; i += 1) {
      if (this.measures[i].hit) {
        hitByIndex[this.measures[i].index] = this.measures[i].hit;
      }
    }

    for (i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var id = node.id;
      if (!/^\d+$/.test(id)) continue;

      var rect = node.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;

      if (!groups[id]) {
        groups[id] = null;
        measureIds.push(id);
      }
      groups[id] = mergeRect(groups[id], rect);
    }

    measureIds.sort(function (a, b) {
      return Number(a) - Number(b);
    });

    this.measures = measureIds.map(function (id) {
      var bounds = groups[id];
      return {
        index: Number(id),
        label: String(Number(id) + 1),
        left: Math.max(0, bounds.left - containerRect.left),
        top: Math.max(0, bounds.top - containerRect.top),
        width: Math.max(8, bounds.right - bounds.left),
        height: Math.max(8, bounds.bottom - bounds.top),
        hit: hitByIndex[Number(id)] || null,
      };
    });

    if (!this.overlay) {
      return;
    }

    this.overlay.style.width = this.container.scrollWidth + 'px';
    this.overlay.style.height = this.container.scrollHeight + 'px';

    for (i = 0; i < this.measures.length; i += 1) {
      var measure = this.measures[i];
      if (!measure.hit) continue;
      measure.hit.style.left = measure.left + 'px';
      measure.hit.style.top = measure.top + 'px';
      measure.hit.style.width = measure.width + 'px';
      measure.hit.style.height = measure.height + 'px';
    }

    this.paintMeasureSelection();
  };

  ScoreRenderer.prototype.rebuildPlaybackCache = function () {
    var cursor = this.getCursor();
    var iterator;
    var steps = [];
    var seen = {};
    var guard = 0;
    var cursorStepIndex = 0;

    if (!cursor) {
      this.playbackCache = { steps: [], hasSteps: false };
      this.playbackRangeCache = {};
      return;
    }

    cursor.reset();
    cursor.show();
    iterator = this.getCursorIterator();

    while (!this.isIteratorEndReached(iterator) && guard < 15000) {
      var measureIndex = this.readIteratorMeasureIndex(iterator);
      var timestamp = this.readIteratorTimestamp(iterator);
      var key;
      if (measureIndex !== null && timestamp !== null) {
        key = measureIndex + ':' + timestamp;
        if (!seen[key]) {
          seen[key] = true;
          steps.push({
            measureIndex: measureIndex,
            timestamp: timestamp,
            cursorStepIndex: cursorStepIndex,
          });
        }
      }

      cursor.next();
      iterator = this.getCursorIterator();
      cursorStepIndex += 1;
      guard += 1;
    }

    cursor.reset();
    cursor.hide();

    this.playbackCache = {
      steps: steps,
      hasSteps: steps.length > 0,
    };
    this.playbackRangeCache = {};
  };

  ScoreRenderer.prototype.paintMeasureSelection = function () {
    var start = this.selection.start;
    var end = this.selection.end;
    var anchor = this.selection.anchor;
    var i;

    for (i = 0; i < this.measures.length; i += 1) {
      var measure = this.measures[i];
      if (!measure.hit) continue;

      measure.hit.classList.remove('is-selected', 'is-range', 'is-anchor');

      if (anchor === measure.index) {
        measure.hit.classList.add('is-anchor');
      }
      if (start !== null && end !== null && measure.index >= start && measure.index <= end) {
        measure.hit.classList.add('is-range');
      }
      if (start !== null && end !== null && (measure.index === start || measure.index === end)) {
        measure.hit.classList.add('is-selected');
      }
    }
  };

  ScoreRenderer.prototype.emitSelectionChange = function () {
    if (!this.selectionChangeHandler) {
      this.emitPlaybackState();
      return;
    }

    this.selectionChangeHandler({
      measures: this.getMeasures(),
      selection: this.getSelection(),
    });
    this.emitPlaybackState();
  };

  ScoreRenderer.prototype.getCursor = function () {
    return this.osmd.cursor;
  };

  ScoreRenderer.prototype.getCursorIterator = function () {
    var cursor = this.getCursor();
    return cursor.Iterator || cursor.iterator || null;
  };

  ScoreRenderer.prototype.readIteratorMeasureIndex = function (iterator) {
    if (!iterator) {
      return null;
    }

    if (typeof iterator.CurrentMeasureIndex === 'number') {
      return iterator.CurrentMeasureIndex;
    }
    if (typeof iterator.currentMeasureIndex === 'number') {
      return iterator.currentMeasureIndex;
    }
    return null;
  };

  ScoreRenderer.prototype.readIteratorTimestamp = function (iterator) {
    var ts;
    if (!iterator) {
      return null;
    }

    ts = iterator.currentTimeStamp || iterator.CurrentTimeStamp || null;
    if (!ts) {
      return null;
    }

    if (typeof ts.realValue === 'number') {
      return ts.realValue;
    }
    if (typeof ts.RealValue === 'number') {
      return ts.RealValue;
    }
    return null;
  };

  ScoreRenderer.prototype.isIteratorEndReached = function (iterator) {
    if (!iterator) {
      return true;
    }

    if (typeof iterator.endReached === 'boolean') {
      return iterator.endReached;
    }
    if (typeof iterator.EndReached === 'boolean') {
      return iterator.EndReached;
    }
    return false;
  };

  ScoreRenderer.prototype.getCachedPlaybackSteps = function (startMeasure, endMeasure) {
    var key = String(startMeasure) + ':' + String(endMeasure);
    var allSteps;
    var filtered;

    if (!this.playbackCache || !this.playbackCache.hasSteps) {
      this.rebuildPlaybackCache();
    }

    if (this.playbackRangeCache[key]) {
      return this.playbackRangeCache[key].slice();
    }

    allSteps = (this.playbackCache && this.playbackCache.steps) || [];
    filtered = allSteps.filter(function (step) {
      return step.measureIndex >= startMeasure && step.measureIndex <= endMeasure;
    });

    this.playbackRangeCache[key] = filtered.slice();
    return filtered;
  };

  ScoreRenderer.prototype.setCursorToStep = function (targetStep) {
    var cursor = this.getCursor();
    var i;

    if (!targetStep || !cursor) {
      return;
    }

    cursor.reset();
    cursor.show();

    for (i = 0; i < targetStep.cursorStepIndex; i += 1) {
      cursor.next();
    }
    this.autoScrollCursorIntoView(true);
  };

  ScoreRenderer.prototype.resetCursorToPlaybackStart = function () {
    var cursor = this.getCursor();
    var range = this.getActivePlaybackRange();
    var steps = this.getCachedPlaybackSteps(range.start, range.end);

    if (!steps.length) {
      cursor.reset();
      cursor.hide();
      return;
    }

    this.setCursorToStep(steps[0]);
  };

  ScoreRenderer.prototype.autoScrollCursorIntoView = function (force) {
    var cursorElement = this.container.querySelector('.cursor');
    var scrollHost = this.container.closest('.pvq-score-stage') || this.container;
    var now = Date.now();

    if (!cursorElement || !scrollHost) {
      return;
    }

    if (!force && now - this.lastAutoScrollAt < 140) {
      return;
    }

    var cursorRect = cursorElement.getBoundingClientRect();
    var hostRect = scrollHost.getBoundingClientRect();
    var thresholdX = 80;
    var thresholdY = 60;
    var nextLeft = scrollHost.scrollLeft;
    var nextTop = scrollHost.scrollTop;
    var shouldScroll = false;

    if (force || cursorRect.right > hostRect.right - thresholdX) {
      nextLeft += cursorRect.right - (hostRect.right - thresholdX);
      shouldScroll = true;
    } else if (cursorRect.left < hostRect.left + thresholdX) {
      nextLeft -= (hostRect.left + thresholdX) - cursorRect.left;
      shouldScroll = true;
    }

    if (force || cursorRect.bottom > hostRect.bottom - thresholdY) {
      nextTop += cursorRect.bottom - (hostRect.bottom - thresholdY);
      shouldScroll = true;
    } else if (cursorRect.top < hostRect.top + thresholdY) {
      nextTop -= (hostRect.top + thresholdY) - cursorRect.top;
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

  ScoreRenderer.prototype.schedulePlaybackStep = function () {
    var self = this;
    var currentStep;
    var nextStep;
    var delta;
    var delay;

    if (this.playbackStatus !== 'playing') {
      return;
    }

    if (!this.playbackSteps.length) {
      this.stopPlayback();
      return;
    }

    if (this.playbackIndex >= this.playbackSteps.length - 1) {
      if (this.loopEnabled || this.playbackRange.source === 'selection') {
        this.playbackIndex = 0;
        this.setCursorToStep(this.playbackSteps[0]);
        this.emitPlaybackState();
        this.schedulePlaybackStep();
        return;
      }
      this.stopPlayback();
      return;
    }

    currentStep = this.playbackSteps[this.playbackIndex];
    nextStep = this.playbackSteps[this.playbackIndex + 1];
    delta = Math.max(0.25, nextStep.timestamp - currentStep.timestamp);
    delay = Math.max(120, (delta * 4 * 60 * 1000) / (72 * this.playbackSpeed));

    this.playbackTimer = window.setTimeout(function () {
      self.playbackTimer = null;
      self.getCursor().next();
      self.playbackIndex += 1;
      self.autoScrollCursorIntoView(false);
      self.emitPlaybackState();
      self.schedulePlaybackStep();
    }, delay);
  };

  ScoreRenderer.prototype.emitPlaybackState = function () {
    var range = this.getActivePlaybackRange();
    var selectionCount = range.end - range.start + 1;

    if (!this.playbackStateHandler) {
      return;
    }

    this.playbackStateHandler({
      status: this.playbackStatus,
      speed: this.playbackSpeed,
      canPlay: this.measures.length > 0,
      hasSelection: this.selection.start !== null && this.selection.end !== null,
      rangeStart: range.start,
      rangeEnd: range.end,
      rangeCount: selectionCount,
      rangeSource: range.source,
      loopEnabled: this.loopEnabled,
    });
  };

  window.PVQ_ScoreRenderer = ScoreRenderer;
})();
