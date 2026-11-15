// Small Hours Tennis — Procedural WebAudio SFX Engine
(function () {
  'use strict';
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (muted) return null;
    if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function playTone(freq, endFreq, dur, type, gainVal, delay) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }
    g.gain.setValueAtTime(gainVal || 0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playNoise(dur, filterFreq, gainVal) {
    const c = ensureCtx();
    if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq || 900;
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal || 0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start();
  }

  window.SH_TENNIS_AUDIO = {
    setMuted(m) { muted = !!m; },
    hit(power) {
      const p = Math.max(0.7, Math.min(1.6, Number(power) || 1));
      playTone(190 * p, 65, 0.11, 'triangle', 0.28);
      playNoise(0.09, 1200 * p, 0.22);
    },
    smash() {
      playTone(320, 55, 0.18, 'sawtooth', 0.32);
      playNoise(0.14, 1800, 0.32);
    },
    bounce() {
      playTone(150, 75, 0.08, 'sine', 0.16);
    },
    net() {
      playTone(110, 48, 0.14, 'square', 0.14);
      playNoise(0.12, 420, 0.15);
    },
    toss() {
      playTone(340, 560, 0.09, 'sine', 0.12);
    },
    point() {
      playTone(523.25, 523.25, 0.11, 'triangle', 0.16, 0);
      playTone(659.25, 659.25, 0.16, 'triangle', 0.18, 0.09);
    },
    gameWin() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        playTone(f, f, 0.18, 'triangle', 0.18, i * 0.09);
      });
    },
    out() {
      playTone(280, 190, 0.2, 'sawtooth', 0.14, 0);
    },
  };
})();
