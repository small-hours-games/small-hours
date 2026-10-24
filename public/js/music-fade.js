// Fade from actual playback start, and reach silence at the question deadline.
function createMusicFade(audio) {
  let interval = null;
  let startedAt = null;
  let deadline = null;
  function tick() {
    const now = Date.now();
    const fadeIn = startedAt === null ? 0 : Math.min(1, (now - startedAt) / 1000);
    const fadeOut = deadline === null ? 1 : Math.max(0, Math.min(1, (deadline - now) / 2000));
    audio.volume = Math.max(0, Math.min(fadeIn, fadeOut));
    if (deadline !== null && now >= deadline) stop();
  }
  function stop() {
    clearInterval(interval);
    interval = null;
    audio.volume = 0;
    audio.pause();
  }
  audio.addEventListener('playing', () => {
    if (startedAt === null) startedAt = Date.now();
    tick();
  });
  return {
    start(timeLeft) {
      clearInterval(interval);
      startedAt = null;
      deadline = timeLeft == null ? null : Date.now() + timeLeft * 1000;
      audio.volume = 0;
      interval = setInterval(tick, 50);
    },
    sync(msg) {
      if (msg.phase !== 'question') { stop(); return; }
      if (msg.timeLeft != null) deadline = Date.now() + msg.timeLeft * 1000;
      tick();
    },
    stop,
  };
}
