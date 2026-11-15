// After Hours Runner — Synthwave WebAudio SFX
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

  function tone(f1, f2, dur, type, gainVal, delay) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f1, t0);
    if (f2 && f2 !== f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(gainVal || 0.16, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  window.SH_RUNNER_AUDIO = {
    setMuted(m) { muted = !!m; },
    jump() { tone(240, 560, 0.16, 'sine', 0.16); },
    lane() { tone(360, 440, 0.06, 'triangle', 0.09); },
    gem() {
      tone(660, 990, 0.12, 'triangle', 0.15, 0);
      tone(990, 1320, 0.12, 'sine', 0.12, 0.05);
    },
    letter() {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, f * 1.02, 0.14, 'triangle', 0.15, i * 0.05));
    },
    wordComplete() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f, 0.22, 'sawtooth', 0.12, i * 0.07));
    },
    hit() {
      tone(150, 45, 0.25, 'sawtooth', 0.24);
    },
  };
})();
