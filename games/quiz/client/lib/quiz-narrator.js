// One TV host voice per countdown/question/reveal. Stale requests never play over a new phase.
const QUIZ_INTRO_TEXT = 'Welcome to Smallhours Quiz Challenge, Here We go 3...2...1';
// How long a slow clip may take before the browser voice reads instead.
const QUIZ_VOICE_WAIT_MS = { countdown: 2000, question: 3000, reveal: 1500 };

function createQuizNarrator(onSpeaking = () => {}) {
  let currentKey = null;
  let revision = 0;
  let clip = null;
  let waitTimer = null;
  let muted = false;
  let blocked = false;
  let expiresAt = 0;
  let spokenFallback = null;
  let introClip = null;
  let introLoading = false;
  function browserVoice(text, requestRevision, isCountdown) {
    if (requestRevision !== revision || muted || Date.now() >= expiresAt ||
        typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const english = voices.filter(voice => /^en[-_]/i.test(voice.lang));
    utterance.voice = english.find(voice => /Daniel|Ryan|Google UK English Male|Alex/i.test(voice.name)) || english[0] || null;
    utterance.lang = utterance.voice?.lang || 'en-GB';
    utterance.rate = isCountdown ? 1.15 : 1.0;
    utterance.pitch = 0.88;
    utterance.onstart = () => { if (requestRevision === revision) onSpeaking(true); };
    utterance.onend = utterance.onerror = () => { if (requestRevision === revision) onSpeaking(false); };
    spokenFallback = utterance;
    speechSynthesis.speak(utterance);
  }
  function clearWait() {
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  }
  // Without voices (some TV WebViews) a late clip beats no voice at all, so nothing replaces it.
  function canUseBrowserVoice() {
    return typeof setTimeout !== 'undefined' && typeof speechSynthesis !== 'undefined' &&
      typeof SpeechSynthesisUtterance !== 'undefined' && speechSynthesis.getVoices().length > 0;
  }
  function silence() {
    clearWait();
    if (clip) clip.pause();
    if (spokenFallback && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    spokenFallback = null;
    clip = null;
    blocked = false;
    onSpeaking(false);
  }
  function stop() {
    revision++;
    currentKey = null;
    silence();
  }
  function startClip(audio, requestRevision, isCountdown) {
    clip = audio;
    clip.playbackRate = 1;
    if (isCountdown) {
      // Fit the clip's real length to the countdown; the phase change stops it at the end.
      const fitIntro = () => {
        if (requestRevision !== revision || !(clip.duration > 0)) return;
        // A little early, so the last word is not caught by the phase change.
        const remainingSec = Math.max(0.5, (expiresAt - Date.now()) / 1000 - 0.25);
        clip.playbackRate = Math.min(1.6, Math.max(1, Number((clip.duration / remainingSec).toFixed(2))));
      };
      if (clip.duration > 0) fitIntro();
      else clip.onloadedmetadata = fitIntro;
    }
    clip.onended = () => { if (requestRevision === revision) onSpeaking(false); };
    onSpeaking(true);
    clip.play().catch(() => {
      if (requestRevision !== revision) return;
      blocked = true;
      onSpeaking(false);
    });
  }
  async function retry() {
    if (!blocked || muted || !clip || Date.now() >= expiresAt) return;
    const requestRevision = revision;
    try {
      await clip.play();
      blocked = false;
      if (requestRevision === revision) onSpeaking(true);
    } catch { /* next gesture */ }
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
      if (isCountdown && introClip) {
        // Already loaded, so the voice starts with the countdown instead of after a download.
        introClip.currentTime = 0;
        startClip(introClip, requestRevision, true);
        return;
      }
      let replaced = false;
      if (canUseBrowserVoice()) {
        waitTimer = setTimeout(() => {
          waitTimer = null;
          replaced = true;
          browserVoice(text, requestRevision, isCountdown);
        }, QUIZ_VOICE_WAIT_MS[msg.phase] || QUIZ_VOICE_WAIT_MS.question);
      }
      const useBrowserVoice = () => {
        if (replaced || requestRevision !== revision) return;
        clearWait();
        browserVoice(text, requestRevision, isCountdown);
      };
      fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, style: 'game-show' }),
      }).then(async response => {
        if (!response.ok) { useBrowserVoice(); return; }
        const data = await response.json();
        if (replaced || requestRevision !== revision || muted || Date.now() >= expiresAt || !data.url) return;
        clearWait();
        startClip(new Audio(data.url), requestRevision, isCountdown);
      }).catch(useBrowserVoice); // Keep the game moving if the provider is unavailable.
    },
    prepareIntro() {
      if (introClip || introLoading) return;
      introLoading = true;
      fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: QUIZ_INTRO_TEXT, style: 'game-show' }),
      }).then(response => (response.ok ? response.json() : null)).then(data => {
        if (!data?.url) return;
        introClip = new Audio(data.url);
        introClip.preload = 'auto';
      }).catch(() => {}).finally(() => { introLoading = false; });
    },
    setMuted(value) {
      muted = value;
      if (muted) { revision++; silence(); }
    },
    stop,
    retry,
  };
}
