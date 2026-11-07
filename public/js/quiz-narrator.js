// One TV host voice per countdown/question/reveal. Stale requests never play over a new phase.
const QUIZ_INTRO_TEXT = 'Welcome to Smallhours Quiz Challenge, Here We go 3...2...1';
const QUIZ_INTRO_DURATION_SEC = 6.0;

function createQuizNarrator() {
  let currentKey = null;
  let revision = 0;
  let clip = null;
  let endTimer = null;
  let muted = false;
  let blocked = false;
  let expiresAt = 0;
  let spokenFallback = null;
  function browserVoice(text, requestRevision, isCountdown) {
    if (requestRevision !== revision || muted || Date.now() >= expiresAt ||
        typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const english = voices.filter(voice => /^en[-_]/i.test(voice.lang));
    utterance.voice = english.find(voice => /Daniel|Ryan|Google UK English Male|Alex/i.test(voice.name)) || english[0] || null;
    utterance.lang = utterance.voice?.lang || 'en-GB';
    utterance.rate = isCountdown ? 1.35 : 1.18;
    utterance.pitch = 0.88;
    spokenFallback = utterance;
    speechSynthesis.speak(utterance);
  }
  function silence() {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    if (clip) clip.pause();
    if (spokenFallback && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    spokenFallback = null;
    clip = null;
    blocked = false;
  }
  function stop() {
    revision++;
    currentKey = null;
    silence();
  }
  async function retry() {
    if (!blocked || muted || !clip || Date.now() >= expiresAt) return;
    try { await clip.play(); blocked = false; } catch { /* next gesture */ }
  }
  return {
    sync(msg) {
      const q = msg.question;
      const isCountdown = msg.phase === 'countdown' && msg.gameType !== 'music-quiz';
      // Let the song itself ask the Music Quiz question.
      const text = isCountdown ? QUIZ_INTRO_TEXT
        : msg.phase === 'question' && !q?.media ? q?.text
        : msg.phase === 'reveal' && msg.correctAnswer != null ? 'The answer is: ' + msg.correctAnswer : null;
      if (!text) { stop(); return; }
      const key = isCountdown ? 'countdown:intro' : (q?.id || q?.text || '') + ':' + msg.phase;
      if (key === currentKey) return;
      stop();
      currentKey = key;
      const phaseDurationSec = msg.timeLeft ?? (isCountdown ? 5 : msg.phase === 'reveal' ? 4 : 15);
      expiresAt = Date.now() + phaseDurationSec * 1000;
      if (muted) return;
      const requestRevision = revision;
      fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, style: 'game-show' }),
      }).then(async response => {
        if (!response.ok) {
          browserVoice(text, requestRevision, isCountdown);
          return;
        }
        const data = await response.json();
        if (requestRevision !== revision || muted || Date.now() >= expiresAt || !data.url) return;
        clip = new Audio(data.url);
        if (isCountdown) {
          const remainingSec = Math.max(0.5, (expiresAt - Date.now()) / 1000);
          const targetSec = Math.max(2.0, remainingSec - 0.08);
          clip.playbackRate = Math.min(1.6, Math.max(1.0, Number((QUIZ_INTRO_DURATION_SEC / targetSec).toFixed(2))));
          if (typeof setTimeout !== 'undefined') {
            endTimer = setTimeout(() => {
              if (requestRevision === revision) silence();
            }, Math.max(0, expiresAt - Date.now() - 20));
          }
        } else {
          clip.playbackRate = 1.18;
        }
        clip.play().catch(() => { if (requestRevision === revision) blocked = true; });
      }).catch(() => browserVoice(text, requestRevision, isCountdown)); // Keep the game moving if the provider is unavailable.
    },
    setMuted(value) {
      muted = value;
      if (muted) { revision++; silence(); }
    },
    stop,
    retry,
  };
}
