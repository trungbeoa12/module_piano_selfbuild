/**
 * score-view.js — Score layer: chỉ render OSMD, lấy metadata cần thiết,
 * dựng overlay chọn measure, và điều khiển cursor hiển thị.
 * Không chứa playback scheduler.
 */
(function () {
  'use strict';

  var BASE_BPM = 72;

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

  function cloneArray(items) {
    return items.map(function (item) {
      var copy = {};
      Object.keys(item).forEach(function (key) {
        copy[key] = item[key];
      });
      return copy;
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMedian(values) {
    var filtered = values.filter(function (value) {
      return typeof value === 'number' && isFinite(value) && value > 0;
    }).sort(function (a, b) {
      return a - b;
    });

    var mid;
    if (!filtered.length) {
      return 1;
    }

    mid = Math.floor(filtered.length / 2);
    if (filtered.length % 2) {
      return filtered[mid];
    }

    return (filtered[mid - 1] + filtered[mid]) / 2;
  }

  function ScoreView(options) {
    options = options || {};
    this.container = options.container;
    this.overlay = null;
    this.measureNodes = [];
    this.selection = { anchor: null, start: null, end: null };
    this.selectionChangeHandler = null;
    this.resizeHandler = this.refreshMeasureOverlay.bind(this);
    this.timeline = [];
    this.timelineIndexByMeasure = {};
    this.cursorStepIndex = 0;
    this.timelineMeta = {
      baseBpm: BASE_BPM,
      medianMeasureBeats: 1,
      minDurationMs: 400,
      maxDurationMs: 2400,
    };

    if (!this.container || typeof this.container.appendChild !== 'function') {
      throw new Error('PVQ_ScoreView: options.container phải là một phần tử DOM.');
    }

    var osmdNs =
      typeof opensheetmusicdisplay !== 'undefined'
        ? opensheetmusicdisplay
        : typeof window !== 'undefined'
          ? window.opensheetmusicdisplay
          : null;

    if (!osmdNs || !osmdNs.OpenSheetMusicDisplay) {
      throw new Error('PVQ_ScoreView: thiếu opensheetmusicdisplay (OSMD).');
    }

    this.osmd = new osmdNs.OpenSheetMusicDisplay(this.container, {
      autoResize: true,
      backend: 'svg',
    });
  }

  ScoreView.prototype.loadAndRender = function (xmlString) {
    var self = this;
    return this.osmd.load(xmlString).then(function () {
      self.osmd.render();
      return new Promise(function (resolve) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            self.buildMeasureOverlay();
            self.buildTimelineCache();
            self.hideCursor();
          resolve({
              measures: self.getMeasures(),
              timeline: self.getPlaybackTimeline(),
              timelineMeta: self.getTimelineMeta(),
            });
          });
        });
      });
    });
  };

  ScoreView.prototype.setSelectionChangeHandler = function (handler) {
    this.selectionChangeHandler = typeof handler === 'function' ? handler : null;
    this.emitSelectionChange();
  };

  ScoreView.prototype.getMeasures = function () {
    return this.measureNodes.map(function (measure) {
      return {
        index: measure.index,
        label: measure.label,
        left: measure.left,
        top: measure.top,
        width: measure.width,
        height: measure.height,
      };
    });
  };

  ScoreView.prototype.getMeasureByIndex = function (measureIndex) {
    var i;
    for (i = 0; i < this.measureNodes.length; i += 1) {
      if (this.measureNodes[i].index === measureIndex) {
        return {
          index: this.measureNodes[i].index,
          label: this.measureNodes[i].label,
          left: this.measureNodes[i].left,
          top: this.measureNodes[i].top,
          width: this.measureNodes[i].width,
          height: this.measureNodes[i].height,
        };
      }
    }
    return null;
  };

  ScoreView.prototype.getSelection = function () {
    return {
      anchor: this.selection.anchor,
      start: this.selection.start,
      end: this.selection.end,
    };
  };

  ScoreView.prototype.clearSelection = function () {
    this.selection.anchor = null;
    this.selection.start = null;
    this.selection.end = null;
    this.paintSelection();
    this.emitSelectionChange();
  };

  ScoreView.prototype.handleMeasureClick = function (measureIndex) {
    var selection = this.selection;

    if (selection.anchor === null || (selection.start !== null && selection.end !== null && selection.start !== selection.end)) {
      selection.anchor = measureIndex;
      selection.start = measureIndex;
      selection.end = measureIndex;
    } else if (selection.start === selection.end) {
      selection.start = Math.min(selection.anchor, measureIndex);
      selection.end = Math.max(selection.anchor, measureIndex);
    } else {
      selection.anchor = measureIndex;
      selection.start = measureIndex;
      selection.end = measureIndex;
    }

    this.paintSelection();
    this.emitSelectionChange();
  };

  ScoreView.prototype.emitSelectionChange = function () {
    if (!this.selectionChangeHandler) {
      return;
    }

    this.selectionChangeHandler({
      measures: this.getMeasures(),
      selection: this.getSelection(),
    });
  };

  ScoreView.prototype.buildMeasureOverlay = function () {
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

    this.measureNodes.forEach(function (measure) {
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

    this.paintSelection();
    this.emitSelectionChange();
  };

  ScoreView.prototype.refreshMeasureOverlay = function () {
    var existingHits = {};
    var containerRect = this.container.getBoundingClientRect();
    var groups = {};
    var nodes = this.container.querySelectorAll('svg g.vf-measure[id]');
    var measureIds = [];
    var i;

    for (i = 0; i < this.measureNodes.length; i += 1) {
      if (this.measureNodes[i].hit) {
        existingHits[this.measureNodes[i].index] = this.measureNodes[i].hit;
      }
    }

    for (i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var id = node.id;
      if (!/^\d+$/.test(id)) {
        continue;
      }

      var rect = node.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        continue;
      }

      if (!groups[id]) {
        groups[id] = null;
        measureIds.push(id);
      }
      groups[id] = mergeRect(groups[id], rect);
    }

    measureIds.sort(function (a, b) {
      return Number(a) - Number(b);
    });

    this.measureNodes = measureIds.map(function (id) {
      var bounds = groups[id];
      return {
        index: Number(id),
        label: String(Number(id) + 1),
        left: Math.max(0, bounds.left - containerRect.left),
        top: Math.max(0, bounds.top - containerRect.top),
        width: Math.max(8, bounds.right - bounds.left),
        height: Math.max(8, bounds.bottom - bounds.top),
        hit: existingHits[Number(id)] || null,
      };
    });

    if (!this.overlay) {
      return;
    }

    this.overlay.style.width = this.container.scrollWidth + 'px';
    this.overlay.style.height = this.container.scrollHeight + 'px';

    for (i = 0; i < this.measureNodes.length; i += 1) {
      var measure = this.measureNodes[i];
      if (!measure.hit) {
        continue;
      }
      measure.hit.style.left = measure.left + 'px';
      measure.hit.style.top = measure.top + 'px';
      measure.hit.style.width = measure.width + 'px';
      measure.hit.style.height = measure.height + 'px';
    }

    this.paintSelection();
  };

  ScoreView.prototype.paintSelection = function () {
    var start = this.selection.start;
    var end = this.selection.end;
    var anchor = this.selection.anchor;
    var i;

    for (i = 0; i < this.measureNodes.length; i += 1) {
      var measure = this.measureNodes[i];
      if (!measure.hit) {
        continue;
      }

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

  ScoreView.prototype.getCursor = function () {
    return this.osmd.cursor;
  };

  ScoreView.prototype.getCursorIterator = function () {
    var cursor = this.getCursor();
    return cursor ? cursor.Iterator || cursor.iterator || null : null;
  };

  ScoreView.prototype.isIteratorEndReached = function (iterator) {
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

  ScoreView.prototype.readIteratorMeasureIndex = function (iterator) {
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

  ScoreView.prototype.readIteratorTimestamp = function (iterator) {
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

  ScoreView.prototype.buildTimelineCache = function () {
    var cursor = this.getCursor();
    var iterator;
    var steps = [];
    var seenMeasures = {};
    var guard = 0;
    var cursorStepIndex = 0;
    var rawDurations = [];
    var i;

    if (!cursor) {
      this.timeline = [];
      this.timelineIndexByMeasure = {};
      return;
    }

    cursor.reset();
    cursor.show();
    iterator = this.getCursorIterator();

    while (!this.isIteratorEndReached(iterator) && guard < 15000) {
      var measureIndex = this.readIteratorMeasureIndex(iterator);
      var timestamp = this.readIteratorTimestamp(iterator);

      if (measureIndex !== null && timestamp !== null && !seenMeasures[measureIndex]) {
        seenMeasures[measureIndex] = true;
        steps.push({
          timelineIndex: steps.length,
          measureIndex: measureIndex,
          cursorStepIndex: cursorStepIndex,
          timestamp: timestamp,
          durationBeats: 1,
          durationMs: (4 * 60 * 1000) / BASE_BPM,
        });
      }

      cursor.next();
      iterator = this.getCursorIterator();
      cursorStepIndex += 1;
      guard += 1;
    }

    for (i = 0; i < steps.length; i += 1) {
      var nextStep = steps[i + 1];
      var beats = nextStep ? Math.max(0.5, nextStep.timestamp - steps[i].timestamp) : null;
      if (beats === null) {
        beats = i > 0 ? steps[i - 1].durationBeats : 1;
      }
      steps[i].durationBeats = beats;
      rawDurations.push(beats);
      steps[i].rawDurationBeats = beats;
    }

    var medianMeasureBeats = getMedian(rawDurations);
    var minMeasureBeats = Math.max(0.5, medianMeasureBeats * 0.7);
    var maxMeasureBeats = Math.max(minMeasureBeats + 0.25, medianMeasureBeats * 1.35);
    var minDurationMs = Math.round((minMeasureBeats * 4 * 60 * 1000) / BASE_BPM);
    var maxDurationMs = Math.round((maxMeasureBeats * 4 * 60 * 1000) / BASE_BPM);

    for (i = 0; i < steps.length; i += 1) {
      var normalizedBeats = clamp(steps[i].rawDurationBeats, minMeasureBeats, maxMeasureBeats);
      steps[i].durationBeats = normalizedBeats;
      steps[i].durationMs = Math.round((normalizedBeats * 4 * 60 * 1000) / BASE_BPM);
    }

    this.timeline = steps;
    this.timelineIndexByMeasure = {};
    steps.forEach(function (step) {
      this.timelineIndexByMeasure[step.measureIndex] = step.timelineIndex;
    }, this);

    cursor.reset();
    cursor.hide();
    this.cursorStepIndex = 0;
    this.timelineMeta = {
      baseBpm: BASE_BPM,
      medianMeasureBeats: medianMeasureBeats,
      minDurationMs: minDurationMs,
      maxDurationMs: maxDurationMs,
    };
  };

  ScoreView.prototype.getPlaybackTimeline = function () {
    return cloneArray(this.timeline);
  };

  ScoreView.prototype.getTimelineMeta = function () {
    return {
      baseBpm: this.timelineMeta.baseBpm,
      medianMeasureBeats: this.timelineMeta.medianMeasureBeats,
      minDurationMs: this.timelineMeta.minDurationMs,
      maxDurationMs: this.timelineMeta.maxDurationMs,
    };
  };

  ScoreView.prototype.findTimelineRangeByMeasure = function (startMeasure, endMeasure) {
    var start = this.timelineIndexByMeasure[startMeasure];
    var end = this.timelineIndexByMeasure[endMeasure];

    if (typeof start !== 'number' || typeof end !== 'number') {
      if (!this.timeline.length) {
        return { start: 0, end: 0 };
      }
      return {
        start: 0,
        end: this.timeline.length - 1,
      };
    }

    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
    };
  };

  ScoreView.prototype.showCursorAtStep = function (step) {
    var cursor = this.getCursor();
    var delta;
    var i;

    if (!cursor || !step) {
      return;
    }

    if (typeof step.cursorStepIndex !== 'number') {
      return;
    }

    if (step.cursorStepIndex < this.cursorStepIndex) {
      cursor.reset();
      cursor.show();
      this.cursorStepIndex = 0;
    } else {
      cursor.show();
    }

    delta = step.cursorStepIndex - this.cursorStepIndex;
    for (i = 0; i < delta; i += 1) {
      cursor.next();
    }
    this.cursorStepIndex = step.cursorStepIndex;
  };

  ScoreView.prototype.hideCursor = function () {
    var cursor = this.getCursor();
    if (!cursor) {
      return;
    }
    cursor.reset();
    cursor.hide();
    this.cursorStepIndex = 0;
  };

  ScoreView.prototype.getCursorElement = function () {
    return this.container.querySelector('.cursor, img[id^="cursorImg-"]');
  };

  ScoreView.prototype.getScrollHost = function () {
    return this.container.closest('.pvq-score-stage') || this.container;
  };

  window.PVQ_ScoreView = ScoreView;
})();
