/**
 * audio-engine.js — Web Audio API: tổng hợp nốt đơn giản (triangle + harmonic).
 * Module boundary: không biết DOM piano; chỉ nhận tên nốt + duration.
 */
(function () {
  'use strict';

  function PianoAudioEngine() {
    this.audioCtx = null;
    this.masterGain = null;
    this.volume = 0.7;
  }

  PianoAudioEngine.prototype.init = function () {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = this.volume * 0.6;
    this.masterGain.connect(this.audioCtx.destination);
  };

  PianoAudioEngine.prototype.setVolume = function (value) {
    this.volume = value;
    if (this.masterGain) {
      this.masterGain.gain.value = value * 0.6;
    }
  };

  PianoAudioEngine.prototype.noteToFreq = function (note) {
    var notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var noteName = note.slice(0, -1);
    var octave = parseInt(note.slice(-1), 10);
    var semitone = notes.indexOf(noteName);
    var midiNote = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  };

  PianoAudioEngine.prototype.playNote = function (note, duration) {
    duration = duration || 0.5;
    this.init();
    var freq = this.noteToFreq(note);
    var now = this.audioCtx.currentTime;

    var osc1 = this.audioCtx.createOscillator();
    var osc2 = this.audioCtx.createOscillator();
    var gainNode = this.audioCtx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;

    var oscGain1 = this.audioCtx.createGain();
    var oscGain2 = this.audioCtx.createGain();
    oscGain1.gain.value = 0.6;
    oscGain2.gain.value = 0.15;

    osc1.connect(oscGain1);
    osc2.connect(oscGain2);
    oscGain1.connect(gainNode);
    oscGain2.connect(gainNode);
    gainNode.connect(this.masterGain);

    var attackTime = 0.04;
    var releaseTime = 0.15;
    var noteDuration = duration * 1.1;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.7, now + attackTime);
    gainNode.gain.setValueAtTime(0.7, now + noteDuration - releaseTime);
    gainNode.gain.linearRampToValueAtTime(0, now + noteDuration);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + noteDuration + 0.1);
    osc2.stop(now + noteDuration + 0.1);
  };

  window.PVQ_PianoAudioEngine = PianoAudioEngine;
})();
