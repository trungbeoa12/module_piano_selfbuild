/**
 * score-sync-cache.js — Xây cache đồng bộ measure-level giữa timeline score và thời gian MIDI.
 * Giả định .mxl và .mid export từ cùng một nguồn MuseScore.
 */
(function () {
  'use strict';

  function cloneFrame(frame) {
    var copy = {};
    Object.keys(frame).forEach(function (k) {
      copy[k] = frame[k];
    });
    return copy;
  }

  function getNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function buildTempoSegments(midi) {
    var header = midi && midi.header ? midi.header : {};
    var ppq = getNumber(header.ppq, 480);
    var tempos = Array.isArray(header.tempos) ? header.tempos.slice() : [];
    var segments = [];
    var i;
    var last;
    var quarter;
    var sec;

    if (!tempos.length) {
      tempos = [{ ticks: 0, bpm: 120, time: 0 }];
    }

    tempos.sort(function (a, b) {
      return getNumber(a.ticks, 0) - getNumber(b.ticks, 0);
    });

    if (getNumber(tempos[0].ticks, 0) !== 0) {
      tempos.unshift({ ticks: 0, bpm: getNumber(tempos[0].bpm, 120), time: 0 });
    }

    for (i = 0; i < tempos.length; i += 1) {
      quarter = getNumber(tempos[i].ticks, 0) / Math.max(1, ppq);
      if (i === 0) {
        sec = getNumber(tempos[i].time, 0);
      } else {
        last = segments[segments.length - 1];
        sec = typeof tempos[i].time === 'number'
          ? tempos[i].time
          : last.sec + (quarter - last.quarter) * (60 / last.bpm);
      }
      segments.push({
        quarter: quarter,
        sec: sec,
        bpm: Math.max(20, getNumber(tempos[i].bpm, 120)),
      });
    }

    return segments;
  }

  function secAtQuarter(quarter, tempoSegments) {
    var q = Math.max(0, getNumber(quarter, 0));
    var i;
    var current;
    var next;

    if (!tempoSegments.length) {
      return q * 0.5;
    }

    for (i = 0; i < tempoSegments.length; i += 1) {
      current = tempoSegments[i];
      next = tempoSegments[i + 1];
      if (!next || q < next.quarter) {
        return current.sec + (q - current.quarter) * (60 / current.bpm);
      }
    }

    current = tempoSegments[tempoSegments.length - 1];
    return current.sec + (q - current.quarter) * (60 / current.bpm);
  }

  function buildMeasureSyncTimeline(scoreTimeline, midi) {
    var timeline = Array.isArray(scoreTimeline) ? scoreTimeline : [];
    var tempoSegments = buildTempoSegments(midi);
    var cursorQuarter = 0;
    var i;
    var frame;
    var wholeUnits;
    var quarterDuration;
    var startSec;
    var endSec;
    var result = [];

    if (!timeline.length) {
      return [];
    }

    for (i = 0; i < timeline.length; i += 1) {
      frame = cloneFrame(timeline[i]);
      // OSMD timestamp delta hiện tại của project lưu ở durationBeats nhưng thực tế là "whole-note units".
      // Quy đổi sang quarter-note units để map đúng tempo MIDI: quarter = whole * 4.
      wholeUnits = Math.max(0.0625, getNumber(frame.durationBeats, 0.25));
      quarterDuration = wholeUnits * 4;
      startSec = secAtQuarter(cursorQuarter, tempoSegments);
      endSec = secAtQuarter(cursorQuarter + quarterDuration, tempoSegments);
      frame.startSec = startSec;
      frame.endSec = Math.max(startSec + 0.08, endSec);
      result.push(frame);
      cursorQuarter += quarterDuration;
    }

    return result;
  }

  window.PVQ_ScoreSyncCache = {
    buildMeasureSyncTimeline: buildMeasureSyncTimeline,
  };
})();

