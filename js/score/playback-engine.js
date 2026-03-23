/**
 * playback-engine.js — Playback layer cho MIDI, độc lập với OSMD/DOM.
 * Dùng MIDI làm nguồn timing/audio, còn score sync chạy theo sync cache đo theo measure.
 */
(function () {
  'use strict';

  function PlaybackEngine() {
    this.timeline = []; // Sync cache theo measure
    this.timelineMeta = null;
    this.noteEvents = [];
    this.midiDurationSec = 0;
    this.state = 'idle';
    this.speed = 1;
    this.loopEnabled = false;
    this.range = { start: 0, end: 0, source: 'full' };
    this.currentIndex = 0;
    this.timer = null;
    this.schedulerTimer = null;
    this.stateChangeHandler = null;
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.startWallTimeMs = 0;
    this.playbackOffsetSec = 0;
    this.lastScheduledSec = -1;
    this.lookAheadSec = 0.18;
    this.schedulerIntervalMs = 40;
    this.audioCtx = null;
    this.masterGain = null;
    this.outputGain = 0.35;
  }

  PlaybackEngine.prototype.setStateChangeHandler = function (handler) {
    this.stateChangeHandler = typeof handler === 'function' ? handler : null;
    this.emitState();
  };

  PlaybackEngine.prototype.setTimeline = function (timeline, timelineMeta) {
    this.setSources({
      timeline: timeline,
      timelineMeta: timelineMeta,
      midi: null,
    });
  };

  PlaybackEngine.prototype.setSources = function (sources) {
    sources = sources || {};
    var midi = sources.midi || null;
    var parsedMidi = this.parseMidi(midi);

    this.timeline = Array.isArray(sources.timeline) ? sources.timeline.slice() : [];
    this.timelineMeta = sources.timelineMeta || null;
    this.noteEvents = parsedMidi.noteEvents;
    this.midiDurationSec = parsedMidi.durationSec;
    this.range = {
      start: 0,
      end: this.timeline.length ? this.timeline.length - 1 : 0,
      source: 'full',
    };
    this.currentIndex = this.range.start;
    this.state = this.timeline.length && this.noteEvents.length ? 'stopped' : 'idle';
    this.clearTimer();
    this.clearScheduler();
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.playbackOffsetSec = 0;
    this.lastScheduledSec = -1;
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
    if (!this.timeline.length || !this.noteEvents.length) {
      return;
    }

    if (this.state === 'paused') {
      this.state = 'playing';
      this.startWallTimeMs = performance.now();
      this.lastScheduledSec = this.playbackOffsetSec;
      this.nextDueAt = performance.now() + this.getFrameDelayMs(this.timeline[this.currentIndex]);
      this.emitState();
      this.startScheduler();
      return;
    }

    if (this.state === 'idle') {
      this.state = 'stopped';
    }

    if (this.currentIndex < this.range.start || this.currentIndex > this.range.end) {
      this.currentIndex = this.range.start;
    }

    this.state = 'playing';
    this.playbackOffsetSec = this.getCurrentFrameStartSec();
    this.startWallTimeMs = performance.now();
    this.lastScheduledSec = this.playbackOffsetSec;
    this.nextDueAt = performance.now() + this.getFrameDelayMs(this.timeline[this.currentIndex]);
    this.emitState();
    this.startScheduler();
  };

  PlaybackEngine.prototype.pause = function () {
    if (this.state !== 'playing') {
      return;
    }
    this.clearTimer();
    this.clearScheduler();
    this.playbackOffsetSec = this.getCurrentTimeSec();
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
    this.clearScheduler();
    this.nextDueAt = 0;
    this.lastDelayMs = 0;
    this.state = 'stopped';
    this.currentIndex = this.range.start;
    this.playbackOffsetSec = this.getCurrentFrameStartSec();
    this.lastScheduledSec = this.playbackOffsetSec;
    this.emitState();
  };

  PlaybackEngine.prototype.clearTimer = function () {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  };

  PlaybackEngine.prototype.clearScheduler = function () {
    if (this.schedulerTimer) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  };

  PlaybackEngine.prototype.getFrameDelayMs = function (frame) {
    if (!frame) {
      return 500;
    }

    return Math.max(180, frame.durationMs / this.speed);
  };

  PlaybackEngine.prototype.getCurrentFrameStartSec = function () {
    var frame = this.timeline[this.currentIndex];
    return frame ? frame.startSec || 0 : 0;
  };

  PlaybackEngine.prototype.getCurrentTimeSec = function () {
    var elapsedMs;
    if (this.state !== 'playing') {
      return this.playbackOffsetSec;
    }
    elapsedMs = Math.max(0, performance.now() - this.startWallTimeMs);
    return this.playbackOffsetSec + (elapsedMs / 1000) * this.speed;
  };

  PlaybackEngine.prototype.startScheduler = function () {
    var self = this;
    this.clearScheduler();
    this.schedulerTimer = window.setInterval(function () {
      self.schedulerTick();
    }, this.schedulerIntervalMs);
  };

  PlaybackEngine.prototype.schedulerTick = function () {
    var nowSec;
    var windowStart;
    var windowEnd;
    var loopStartSec;
    var loopEndSec;
    var i;
    var ev;

    if (this.state !== 'playing') {
      return;
    }

    nowSec = this.getCurrentTimeSec();
    loopStartSec = this.timeline[this.range.start] ? this.timeline[this.range.start].startSec : 0;
    loopEndSec = this.timeline[this.range.end]
      ? this.timeline[this.range.end].endSec
      : this.midiDurationSec;

    if (this.loopEnabled && nowSec >= loopEndSec) {
      this.seekToTime(loopStartSec);
      return;
    }

    windowStart = Math.max(this.lastScheduledSec, nowSec - 0.03);
    windowEnd = nowSec + this.lookAheadSec;
    for (i = 0; i < this.noteEvents.length; i += 1) {
      ev = this.noteEvents[i];
      if (ev.timeSec < windowStart || ev.timeSec >= windowEnd) {
        continue;
      }
      if (ev.timeSec < loopStartSec || ev.timeSec >= loopEndSec) {
        continue;
      }
      this.playMidiNote(ev);
    }
    this.lastScheduledSec = windowEnd;

    // Keep cursor/index aligned with the exact same time source driving audio scheduling.
    // This prevents UI cursor drift/jitter caused by a separate setTimeout-based pipeline.
    var beforeIndex = this.currentIndex;
    this.updateCurrentIndexFromTime(nowSec);
    if (beforeIndex !== this.currentIndex) {
      this.emitState();
    }
  };

  PlaybackEngine.prototype.seekToTime = function (timeSec) {
    this.playbackOffsetSec = Math.max(0, timeSec);
    this.startWallTimeMs = performance.now();
    this.lastScheduledSec = this.playbackOffsetSec;
    this.updateCurrentIndexFromTime(this.playbackOffsetSec);
    this.emitState();
  };

  PlaybackEngine.prototype.updateCurrentIndexFromTime = function (timeSec) {
    var i;
    if (!this.timeline.length) {
      this.currentIndex = 0;
      return;
    }
    for (i = 0; i < this.timeline.length; i += 1) {
      if (timeSec >= this.timeline[i].startSec && timeSec < this.timeline[i].endSec) {
        this.currentIndex = i;
        return;
      }
    }
    this.currentIndex = this.timeline.length - 1;
  };

  PlaybackEngine.prototype.ensureAudio = function () {
    if (this.audioCtx) {
      return;
    }
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = this.outputGain;
    this.masterGain.connect(this.audioCtx.destination);
  };

  PlaybackEngine.prototype.midiToFreq = function (midiNumber) {
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
  };

  PlaybackEngine.prototype.playMidiNote = function (event) {
    var freq;
    var now;
    var osc;
    var gain;
    var attack = 0.01;
    var release = 0.06;
    var durationSec;

    this.ensureAudio();
    freq = this.midiToFreq(event.midi);
    now = this.audioCtx.currentTime;
    durationSec = Math.max(0.04, Math.min(1.5, event.durationSec || 0.2));

    osc = this.audioCtx.createOscillator();
    gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime((event.velocity || 0.6) * 0.35, now + attack);
    gain.gain.setValueAtTime((event.velocity || 0.6) * 0.3, now + Math.max(attack, durationSec - release));
    gain.gain.linearRampToValueAtTime(0, now + durationSec);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.03);
  };

  PlaybackEngine.prototype.scheduleNextTick = function () {
    // Legacy setTimeout-based scheduler (kept in file lịch sử) is disabled.
    // We drive both audio scheduling + cursor/UI progression in schedulerTick() now.
    return;
  };

  PlaybackEngine.prototype.advance = function () {
    // No-op: legacy pipeline disabled.
    return;
  };

  PlaybackEngine.prototype.getCurrentFrame = function () {
    var frame = this.timeline[this.currentIndex] || null;
    if (!frame) {
      return null;
    }
    var copy = {};
    Object.keys(frame).forEach(function (k) {
      copy[k] = frame[k];
    });
    return copy;
  };

  PlaybackEngine.prototype.parseMidi = function (midiInput) {
    var noteEvents = [];
    var durationSec = 0;
    var tracks;
    var i;
    var j;
    var note;

    if (!midiInput || !midiInput.tracks || !midiInput.tracks.length) {
      return { noteEvents: [], durationSec: 0 };
    }

    tracks = midiInput.tracks;
    for (i = 0; i < tracks.length; i += 1) {
      if (!tracks[i].notes) {
        continue;
      }
      for (j = 0; j < tracks[i].notes.length; j += 1) {
        note = tracks[i].notes[j];
        noteEvents.push({
          timeSec: Number(note.time) || 0,
          durationSec: Number(note.duration) || 0.2,
          midi: Number(note.midi) || 60,
          velocity: Number(note.velocity) || 0.7,
        });
      }
    }

    noteEvents.sort(function (a, b) {
      return a.timeSec - b.timeSec;
    });

    if (typeof midiInput.duration === 'number' && isFinite(midiInput.duration)) {
      durationSec = midiInput.duration;
    } else if (noteEvents.length) {
      durationSec = noteEvents[noteEvents.length - 1].timeSec + noteEvents[noteEvents.length - 1].durationSec;
    }

    return {
      noteEvents: noteEvents,
      durationSec: Math.max(0, durationSec),
    };
  };

  PlaybackEngine.prototype.emitState = function () {
    if (!this.stateChangeHandler) {
      return;
    }

    this.stateChangeHandler({
      state: this.state,
      speed: this.speed,
      loopEnabled: this.loopEnabled,
      canPlay: this.timeline.length > 0 && this.noteEvents.length > 0,
      rangeStart: this.range.start,
      rangeEnd: this.range.end,
      rangeSource: this.range.source,
      currentIndex: this.currentIndex,
      currentFrame: this.getCurrentFrame(),
      currentTimeSec: this.getCurrentTimeSec(),
      lastDelayMs: this.lastDelayMs,
      timelineMeta: this.timelineMeta,
    });
  };

  window.PVQ_PlaybackEngine = PlaybackEngine;
})();
