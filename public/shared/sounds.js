/* ═══════════════════════════════════════════════════════════════════════════
   Game Night — Sound Effects (Web Audio API, zero external files)
   ═══════════════════════════════════════════════════════════════════════════ */

window.GNSound = (() => {
  let ctx = null;
  let muted = false;
  let masterGain = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function dest() {
    getCtx();
    return masterGain;
  }

  function setMuted(m) { muted = m; }
  function isMuted() { return muted; }

  function setVolume(v) {
    getCtx();
    masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ── Oscillator helpers ───────────────────────────────────────────────────

  function tone(freq, duration, type = 'sine', vol = 0.5, delay = 0) {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(dest());
    osc.start(t);
    osc.stop(t + duration);
  }

  function noise(duration, vol = 0.15, delay = 0) {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime + delay;
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(gain);
    gain.connect(dest());
    src.start(t);
    src.stop(t + duration);
  }

  // ── Sound library ────────────────────────────────────────────────────────

  function correct() {
    // Happy ascending arpeggio
    tone(523, 0.12, 'sine', 0.5, 0);        // C5
    tone(659, 0.12, 'sine', 0.5, 0.08);     // E5
    tone(784, 0.15, 'sine', 0.6, 0.16);     // G5
    tone(1047, 0.25, 'triangle', 0.4, 0.24); // C6
  }

  function wrong() {
    // Sad descending buzz
    tone(300, 0.15, 'sawtooth', 0.25, 0);
    tone(250, 0.2, 'sawtooth', 0.2, 0.1);
    tone(200, 0.35, 'sawtooth', 0.15, 0.2);
  }

  function tick() {
    // Short click
    tone(800, 0.04, 'sine', 0.3);
    noise(0.02, 0.08);
  }

  function countdownBeep() {
    // Attention beep
    tone(880, 0.15, 'sine', 0.4);
  }

  function countdownFinal() {
    // Higher double beep for "go!"
    tone(1047, 0.1, 'sine', 0.5, 0);
    tone(1319, 0.15, 'sine', 0.5, 0.1);
    tone(1568, 0.25, 'sine', 0.6, 0.2);
  }

  function whoosh() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(dest());
    osc.start(t);
    osc.stop(t + 0.2);
    noise(0.12, 0.06);
  }

  function pop() {
    noise(0.06, 0.2);
    tone(600, 0.06, 'sine', 0.3);
  }

  function join() {
    // Friendly join sound
    tone(440, 0.08, 'sine', 0.3, 0);
    tone(554, 0.08, 'sine', 0.3, 0.06);
    tone(660, 0.12, 'sine', 0.3, 0.12);
  }

  function ready() {
    // Quick ready confirmation
    tone(660, 0.06, 'triangle', 0.3, 0);
    tone(880, 0.1, 'triangle', 0.3, 0.06);
  }

  function select() {
    // UI selection click
    tone(700, 0.04, 'sine', 0.2);
  }

  function fanfare() {
    // Victory fanfare
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    const durations = [0.1, 0.1, 0.1, 0.15, 0.1, 0.15, 0.4];
    let t = 0;
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], durations[i] + 0.05, 'triangle', 0.4, t);
      t += durations[i];
    }
  }

  function streak() {
    // Fire streak sound - quick escalating
    tone(440, 0.06, 'sine', 0.3, 0);
    tone(660, 0.06, 'sine', 0.35, 0.05);
    tone(880, 0.06, 'sine', 0.4, 0.1);
    tone(1100, 0.12, 'sine', 0.35, 0.15);
  }

  function powerup() {
    // Power-up activation
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(dest());
    osc.start(t);
    osc.stop(t + 0.35);
    noise(0.08, 0.1, 0.15);
  }

  function timerWarning() {
    // Urgent ticking
    tone(1000, 0.03, 'square', 0.2, 0);
    tone(1000, 0.03, 'square', 0.2, 0.15);
  }

  function gameOver() {
    // Dramatic game over
    tone(523, 0.2, 'triangle', 0.4, 0);
    tone(440, 0.2, 'triangle', 0.35, 0.2);
    tone(349, 0.2, 'triangle', 0.3, 0.4);
    tone(262, 0.5, 'triangle', 0.35, 0.6);
  }

  function reveal() {
    // Drumroll-ish reveal
    for (let i = 0; i < 6; i++) {
      noise(0.04, 0.12, i * 0.06);
    }
    tone(523, 0.2, 'triangle', 0.3, 0.4);
  }

  // ── Init on first user interaction ───────────────────────────────────────

  function init() {
    getCtx();
  }

  return {
    init, setMuted, isMuted, setVolume,
    correct, wrong, tick, countdownBeep, countdownFinal,
    whoosh, pop, join, ready, select,
    fanfare, streak, powerup, timerWarning,
    gameOver, reveal
  };
})();

// Auto-init on first touch/click
document.addEventListener('click', () => GNSound.init(), { once: true });
document.addEventListener('touchstart', () => GNSound.init(), { once: true });
