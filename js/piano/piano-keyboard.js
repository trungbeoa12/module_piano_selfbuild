/**
 * piano-keyboard.js — Vẽ phím mini piano trên DOM + map phím máy tính (QWERTY).
 * Module boundary: không phát nhạc; không điều khiển bài hát.
 */
(function () {
  'use strict';

  var whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var blackNotes = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' };

  /**
   * Dựng phím trắng/đen (2 quãng tám mặc định: 4 và 5).
   * @param {HTMLElement} containerEl — phần tử .mini-piano (trống hoặc sẽ bị xóa nội dung)
   * @returns {{ keys: NodeList, pianoRoot: HTMLElement|null }}
   */
  function buildMiniKeys(containerEl) {
    if (!containerEl) {
      return { keys: [], pianoRoot: null };
    }
    var piano = containerEl;
    piano.innerHTML = '';

    var octaves = [4, 5];
    var whiteKeyIndex = 0;

    octaves.forEach(function (octave) {
      whiteNotes.forEach(function (note) {
        var whiteKey = document.createElement('div');
        whiteKey.className = 'mini-key white';
        whiteKey.dataset.note = note + octave;
        piano.appendChild(whiteKey);

        if (blackNotes[note]) {
          var blackKey = document.createElement('div');
          blackKey.className = 'mini-key black';
          blackKey.dataset.note = blackNotes[note] + octave;
          var offset = whiteKeyIndex * 30 + 20;
          blackKey.style.left = offset + 'px';
          piano.appendChild(blackKey);
        }

        whiteKeyIndex++;
      });
    });

    return {
      keys: piano.querySelectorAll('.mini-key'),
      pianoRoot: piano,
    };
  }

  /** Map KeyboardEvent.code → tên nốt (đồng bộ với layout phím đã dựng). */
  function getKeyMapping() {
    return {
      KeyZ: 'C4',
      KeyS: 'C#4',
      KeyX: 'D4',
      KeyD: 'D#4',
      KeyC: 'E4',
      KeyV: 'F4',
      KeyG: 'F#4',
      KeyB: 'G4',
      KeyH: 'G#4',
      KeyN: 'A4',
      KeyJ: 'A#4',
      KeyM: 'B4',
      KeyQ: 'C5',
      Digit2: 'C#5',
      KeyW: 'D5',
      Digit3: 'D#5',
      KeyE: 'E5',
      KeyR: 'F5',
      Digit5: 'F#5',
      KeyT: 'G5',
      Digit6: 'G#5',
      KeyY: 'A5',
      Digit7: 'A#5',
      KeyU: 'B5',
    };
  }

  window.PVQ_PianoKeyboard = {
    buildMiniKeys: buildMiniKeys,
    getKeyMapping: getKeyMapping,
  };
})();
