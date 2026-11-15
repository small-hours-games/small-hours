// Tilt-Ball Arena on the phone: 60 Hz P2P gyro/touch steering + boost.

(function () {
  const WS_INTERVAL_MS = 66;
  const CELLULAR_INTERVAL_MS = 100;
  const P2P_LAN_INTERVAL_MS = 16;
  const MAX_TILT_DEG = 35;
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const tb = {
    active: false,
    phase: 'playing',
    listening: false,
    rawBeta: 0,
    rawGamma: 0,
    zeroBeta: 0,
    zeroGamma: 0,
    x: 0,
    y: 0,
    boostUntil: 0,
    boostCooldownUntil: 0,
    dragging: false,
    pc: null,
    dc: null,
    p2pIsLan: false,
    linkCheckAt: 0,
    lastSendAt: 0,
    lastWsAt: 0,
    sentTimes: [],
    timer: null,
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function isP2pOpen() { return !!(tb.dc && tb.dc.readyState === 'open'); }

  function isCellularLink() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    return conn.type === 'cellular' || conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.effectiveType === 'slow-2g';
  }

  async function refreshLinkQuality() {
    if (!tb.pc || !isP2pOpen() || isCellularLink()) { tb.p2pIsLan = false; return; }
    try {
      const stats = await tb.pc.getStats();
      let activePair = null;
      stats.forEach(r => { if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded')) activePair = r; });
      if (!activePair) return;
      const remote = stats.get(activePair.remoteCandidateId);
      tb.p2pIsLan = Boolean(remote?.candidateType === 'host' && (activePair.currentRoundTripTime == null || activePair.currentRoundTripTime <= 0.025));
    } catch {}
  }

  function currentHz() {
    const now = performance.now();
    tb.sentTimes = tb.sentTimes.filter(t => now - t < 1000);
    return tb.sentTimes.length;
  }

  function updatePadVisual() {
    const dot = document.getElementById('tbPadDot');
    if (dot) {
      dot.style.transform = `translate(${(tb.x * 64).toFixed(1)}px, ${(tb.y * 64).toFixed(1)}px)`;
    }
    const linkPill = document.getElementById('tbLinkPill');
    if (linkPill) {
      const mode = isP2pOpen() ? 'P2P' : 'WS';
      linkPill.textContent = `${mode} · ${currentHz()} Hz`;
    }
    const boostBtn = document.getElementById('tbBoostBtn');
    if (boostBtn) {
      const now = Date.now();
      const cooling = now < tb.boostCooldownUntil;
      boostBtn.disabled = tb.phase !== 'playing' || cooling;
      boostBtn.textContent = cooling ? '⏳ Recharging…' : '⚡ DASH BOOST';
    }
  }

  function sendTilt(force) {
    if (!tb.active || tb.phase !== 'playing') return;
    const now = performance.now();
    const p2p = isP2pOpen();
    if (p2p && now - tb.linkCheckAt >= 2000) {
      tb.linkCheckAt = now;
      refreshLinkQuality();
    }
    const minInterval = isCellularLink() ? CELLULAR_INTERVAL_MS : (p2p && tb.p2pIsLan ? P2P_LAN_INTERVAL_MS : WS_INTERVAL_MS);
    if (!force && now - tb.lastSendAt < minInterval) return;

    tb.lastSendAt = now;
    tb.sentTimes.push(now);
    const boost = Date.now() < tb.boostUntil ? 1 : 0;

    if (p2p) {
      try {
        tb.dc.send(JSON.stringify({ x: tb.x, y: tb.y, boost, ts: Date.now() }));
      } catch {}
    }

    if (!p2p || force || now - tb.lastWsAt >= 400) {
      tb.lastWsAt = now;
      send({ type: 'GAME_ACTION', action: { type: 'setTilt', x: tb.x, y: tb.y, boost } });
    }
    updatePadVisual();
  }

  function onOrient(e) {
    if (tb.dragging) return;
    if (e.beta === null && e.gamma === null) return;
    tb.rawBeta = e.beta ?? 0;
    tb.rawGamma = e.gamma ?? 0;
    tb.x = clamp((tb.rawGamma - tb.zeroGamma) / MAX_TILT_DEG, -1, 1);
    tb.y = clamp((tb.rawBeta - tb.zeroBeta) / MAX_TILT_DEG, -1, 1);
    sendTilt(false);
  }

  function attachPadListeners() {
    const pad = document.getElementById('tbPad');
    if (!pad || pad._tbBound) return;
    pad._tbBound = true;
    const updateFromPointer = e => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const maxR = r.width / 2 - 14;
      const dx = (e.clientX - cx) / maxR;
      const dy = (e.clientY - cy) / maxR;
      const mag = Math.hypot(dx, dy);
      tb.x = mag > 1 ? dx / mag : dx;
      tb.y = mag > 1 ? dy / mag : dy;
      sendTilt(false);
    };
    pad.addEventListener('pointerdown', e => {
      tb.dragging = true;
      pad.setPointerCapture?.(e.pointerId);
      updateFromPointer(e);
    });
    pad.addEventListener('pointermove', e => { if (tb.dragging) updateFromPointer(e); });
    const release = () => {
      if (!tb.dragging) return;
      tb.dragging = false;
      tb.x = 0;
      tb.y = 0;
      sendTilt(true);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
  }

  function attachGyro() {
    if (tb.listening) return;
    tb.listening = true;
    window.addEventListener('deviceorientation', onOrient);
    if (!tb.timer) tb.timer = setInterval(() => sendTilt(true), 250);
  }

  function stopRtc() {
    if (tb.dc) { try { tb.dc.close(); } catch {} tb.dc = null; }
    if (tb.pc) { try { tb.pc.close(); } catch {} tb.pc = null; }
  }

  async function startRtc() {
    if (tb.pc || typeof RTCPeerConnection === 'undefined') return;
    try {
      const pc = new RTCPeerConnection(RTC_CFG);
      tb.pc = pc;
      const dc = pc.createDataChannel('tilt', { ordered: false, maxRetransmits: 0 });
      tb.dc = dc;
      dc.onopen = () => { refreshLinkQuality(); updatePadVisual(); sendTilt(true); };
      dc.onclose = () => updatePadVisual();
      pc.onicecandidate = e => { if (e.candidate) send({ type: 'RTC_SIGNAL', signal: { candidate: e.candidate } }); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'RTC_SIGNAL', signal: { sdp: pc.localDescription } });
    } catch { stopRtc(); }
  }

  async function handleRtcSignal(msg) {
    if (!msg.signal) return;
    if (msg.signal.tbRoundEnd) {
      send({ type: 'GAME_ACTION', action: { type: 'finishRound', ...msg.signal.tbRoundEnd } });
      return;
    }
    if (msg.signal.tbNextRound) {
      send({ type: 'GAME_ACTION', action: { type: 'nextRound' } });
      return;
    }
    if (!tb.pc) return;
    try {
      if (msg.signal.sdp) await tb.pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
      else if (msg.signal.candidate) await tb.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
    } catch {}
  }

  window.tbEnableGyro = async function tbEnableGyro() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { showToast('Gyro permission denied — use touch pad', 'info'); return; }
      }
      attachGyro();
      document.getElementById('tbGyroBtn').textContent = 'Gyro Active ✓';
    } catch {
      attachGyro();
    }
  };

  window.tbZero = function tbZero() {
    tb.zeroBeta = tb.rawBeta;
    tb.zeroGamma = tb.rawGamma;
    tb.x = 0;
    tb.y = 0;
    sendTilt(true);
    showToast('Tilt zeroed!', 'success');
  };

  window.tbBoost = function tbBoost() {
    const now = Date.now();
    if (tb.phase !== 'playing' || now < tb.boostCooldownUntil) return;
    tb.boostUntil = now + 350;
    tb.boostCooldownUntil = now + 2400;
    sendTilt(true);
    setTimeout(updatePadVisual, 2450);
  };

  window.tbNextRound = function tbNextRound() {
    send({ type: 'GAME_ACTION', action: { type: 'nextRound' } });
  };

  function renderTiltBallState(msg) {
    tb.active = msg.phase !== 'finished';
    tb.phase = msg.phase;
    attachPadListeners();
    if (tb.active && !tb.pc) startRtc();

    const needsTap = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    if (!needsTap && !tb.listening) attachGyro();

    document.getElementById('tbRoundPill').textContent = 'R' + msg.round + '/' + msg.maxRounds;
    document.getElementById('tbScorePill').textContent = tcNum(msg.scores?.[state.playerId] || 0) + ' pts';
    const nextBtn = document.getElementById('tbNextBtn');
    const boostBtn = document.getElementById('tbBoostBtn');
    if (nextBtn) nextBtn.hidden = msg.phase !== 'round_over';
    if (boostBtn) boostBtn.hidden = msg.phase !== 'playing';

    const statusText = msg.phase === 'finished'
      ? 'Game Over!'
      : msg.phase === 'round_over'
        ? (msg.lastRoundWinner === state.playerId ? '🏆 You won the round!' : (tcName(msg.lastRoundWinner, msg) || 'Round') + ' won!')
        : 'Tilt to knock rivals off!';
    tcSetStatus('tb', statusText, msg.phase === 'playing');
    document.getElementById('tiltBallSection')?.classList.toggle('tc-my-turn-glow', msg.phase === 'playing');
    updatePadVisual();
  }

  SH.registerGame('tilt-ball', {
    section: 'tiltBallSection',
    render: renderTiltBallState,
    onRtcSignal: handleRtcSignal,
    redraw: updatePadVisual,
    reset() {
      tb.active = false;
      tb.listening = false;
      tb.dragging = false;
      tb.x = 0;
      tb.y = 0;
      window.removeEventListener('deviceorientation', onOrient);
      if (tb.timer) { clearInterval(tb.timer); tb.timer = null; }
      stopRtc();
      document.getElementById('tiltBallSection')?.classList.remove('tc-my-turn-glow');
    },
  });
})();
