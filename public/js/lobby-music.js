// TV speakers provide the lobby soundtrack; phones stay quiet.
function createLobbyMusic(audio, onPlaybackChange = () => {}) {
  const volume = 0.12;
  const fadeInMs = 1500;
  const fadeOutMs = 1200;
  let active = false;
  let tracks = [];
  let index = 0;
  let loaded = false;
  let loading = null;
  let timer = null;
  let fade = null;
  let buffering = false;
  let motion = false;
  audio.volume = 0;
  function updateMotion() {
    const playing = active && !audio.paused && !audio.muted && !buffering && audio.volume > 0.001;
    if (playing !== motion) { motion = playing; onPlaybackChange(playing); }
  }
  function stopTimer() { clearInterval(timer); timer = null; }
  function tick() {
    if (!fade) return;
    const progress = Math.min(1, Math.max(0, (Date.now() - fade.started) / fade.duration));
    const level = fade.from + (fade.to - fade.from) * progress;
    // Fade the actual track tail, even when duration becomes available late.
    const remaining = Number.isFinite(audio.duration) ? audio.duration - audio.currentTime : Infinity;
    const tail = Math.max(0, Math.min(1, remaining / 2));
    audio.volume = Math.max(0, Math.min(volume, level, volume * tail));
    if (!active && progress === 1) {
      audio.pause();
      stopTimer();
      fade = null;
    }
    updateMotion();
  }
  function fadeTo(target, duration) {
    fade = { from: audio.volume, to: target, started: Date.now(), duration };
    if (!timer) timer = setInterval(tick, 50);
    tick();
  }
  audio.addEventListener('playing', () => {
    buffering = false;
    if (!active) { audio.pause(); return; }
    fadeTo(volume, fadeInMs);
  });
  audio.addEventListener('pause', () => { stopTimer(); updateMotion(); });
  audio.addEventListener('waiting', () => { buffering = true; updateMotion(); });
  audio.addEventListener('timeupdate', tick);
  function retry() {
    if (!active || !tracks.length || !audio.paused) return;
    if (!audio.getAttribute('src')) audio.src = tracks[index];
    audio.play().catch(() => { buffering = true; updateMotion(); });
  }
  audio.addEventListener('ended', () => {
    stopTimer();
    audio.volume = 0;
    fade = null;
    updateMotion();
    if (!active || !tracks.length) return;
    index = (index + 1) % tracks.length;
    audio.src = tracks[index];
    retry();
  });
  return {
    setActive(value) {
      // Broadcasts may repeat the same state; keep the current envelope intact.
      if (value === active) return;
      active = value;
      if (!active) {
        if (!audio.paused && audio.volume > 0) fadeTo(0, fadeOutMs);
        else { stopTimer(); audio.pause(); }
        updateMotion();
        return;
      }
      if (!audio.paused) { fadeTo(volume, fadeInMs); return; }
      if (loaded) { retry(); return; }
      if (!loading) {
        loading = fetch('/api/lobby-music').then(response => {
          if (!response.ok) throw new Error('Music unavailable');
          return response.json();
        }).then(data => {
          tracks = data.tracks || [];
          loaded = true;
          retry(); // A game may have started during the fetch.
        }).catch(() => {}).finally(() => { loading = null; });
      }
    },
    setMuted(value) { audio.muted = value; updateMotion(); },
    retry,
  };
}
