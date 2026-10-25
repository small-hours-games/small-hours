// TV speakers provide the lobby soundtrack; phones stay quiet.
function createLobbyMusic(audio, onPlaybackChange = () => {}) {
  let active = false;
  let tracks = [];
  let index = 0;
  let loaded = false;
  let loading = null;
  audio.volume = 0.12;
  const updateMotion = () => onPlaybackChange(active && !audio.paused && !audio.muted);
  audio.addEventListener('playing', updateMotion);
  audio.addEventListener('pause', () => onPlaybackChange(false));
  audio.addEventListener('waiting', () => onPlaybackChange(false));
  function retry() {
    if (!active || !tracks.length || !audio.paused) return;
    if (!audio.getAttribute('src')) audio.src = tracks[index];
    audio.play().then(updateMotion).catch(() => onPlaybackChange(false)); // Retry on the next gesture if autoplay is blocked.
  }
  audio.addEventListener('ended', () => {
    if (!active || !tracks.length) return;
    index = (index + 1) % tracks.length;
    audio.src = tracks[index];
    retry();
  });
  return {
    setActive(value) {
      active = value;
      if (!active) { audio.pause(); onPlaybackChange(false); return; }
      if (loaded) { retry(); return; }
      if (!loading) {
        loading = fetch('/api/lobby-music').then(response => {
          if (!response.ok) throw new Error('Music unavailable');
          return response.json();
        }).then(data => {
          tracks = data.tracks || [];
          loaded = true;
          retry(); // Checks active again: a game may have started during the fetch.
        }).catch(() => {}).finally(() => { loading = null; });
      }
    },
    setMuted(value) { audio.muted = value; updateMotion(); },
    retry,
  };
}
