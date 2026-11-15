// Sensor Lab on the phone: captures gyro, accel, touch, screen, battery & network
// and streams 60 Hz over WebRTC P2P DataChannel (with 15 Hz WebSocket fallback).

(function () {
  const WS_INTERVAL_MS = 66;       // ~15 Hz over WebSocket / P2P WAN (safely under 30 msg/s limit)
  const CELLULAR_INTERVAL_MS = 100; // ~10 Hz on 4G/5G/cellular or high-RTT links
  const P2P_LAN_INTERVAL_MS = 14;  // ~60 Hz direct LAN P2P UDP over RTCDataChannel (with rAF jitter margin)
  const WS_KEEPALIVE_MS = 500;     // 2 Hz WS state sync while P2P is active
  const MOTION_SMOOTH_ALPHA = 0.35; // EMA factor for noisy MEMS accel / rotRate
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const sl = {
    active: false,
    permission: 'idle', // idle | granted | denied | unsupported | manual
    listening: false,
    rawOrient: null,
    zero: { alpha: 0, beta: 0, gamma: 0 },
    accel: null,
    accelG: null,
    rotRate: null,
    touches: 0,
    batteryLevel: null,
    batteryCharging: null,
    seq: 0,
    sentTimes: [],
    lastSendAt: 0,
    lastWsAt: 0,
    dirty: false,
    rafId: null,
    timer: null,
    simActive: false,
    pc: null,
    dc: null,
    remoteDescSet: false,
    pendingIce: [],
    rtcRetryTimer: null,
    p2pState: 'off', // off | connecting | open | closed
    p2pIsLan: false,
    linkCheckAt: 0,
    lastCapsKey: '',
    lastHudAt: 0,
  };

  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  function smoothVec3(prev, next, alpha = MOTION_SMOOTH_ALPHA) {
    if (!prev) return { x: round2(next.x), y: round2(next.y), z: round2(next.z) };
    return {
      x: round2(prev.x + (next.x - prev.x) * alpha),
      y: round2(prev.y + (next.y - prev.y) * alpha),
      z: round2(prev.z + (next.z - prev.z) * alpha),
    };
  }

  function smoothRotRate(prev, next, alpha = MOTION_SMOOTH_ALPHA) {
    if (!prev) return { alpha: round1(next.alpha), beta: round1(next.beta), gamma: round1(next.gamma) };
    return {
      alpha: round1(prev.alpha + (next.alpha - prev.alpha) * alpha),
      beta: round1(prev.beta + (next.beta - prev.beta) * alpha),
      gamma: round1(prev.gamma + (next.gamma - prev.gamma) * alpha),
    };
  }

  function normAngle(deg) {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }

  function currentOrient() {
    if (!sl.rawOrient) return null;
    return {
      alpha: round1(((sl.rawOrient.alpha - sl.zero.alpha) % 360 + 360) % 360),
      beta: round1(Math.max(-180, Math.min(180, normAngle(sl.rawOrient.beta - sl.zero.beta)))),
      gamma: round1(Math.max(-180, Math.min(180, normAngle(sl.rawOrient.gamma - sl.zero.gamma)))),
      absolute: !!sl.rawOrient.absolute,
    };
  }

  function currentDevice() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      screenOrient: screen.orientation?.type || null,
      screenAngle: screen.orientation?.angle ?? null,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      maxTouch: navigator.maxTouchPoints || 0,
      touches: sl.touches,
      batteryLevel: sl.batteryLevel,
      batteryCharging: sl.batteryCharging,
      netType: conn?.effectiveType || null,
      netRtt: conn?.rtt ?? null,
      hasGyro: !!sl.rawOrient && !sl.simActive,
      hasAccel: !!(sl.accel || sl.accelG),
    };
  }

  function currentHz() {
    const now = performance.now();
    sl.sentTimes = sl.sentTimes.filter(t => now - t < 1000);
    return sl.sentTimes.length;
  }

  function isP2pOpen() {
    return !!(sl.dc && sl.dc.readyState === 'open');
  }

  function updateLocalPreview(forceHud = false) {
    const orient = currentOrient();
    const phoneEl = document.getElementById('slPhoneLocal');
    const horizonEl = document.getElementById('slLocalHorizon');
    const readoutEl = document.getElementById('slLocalReadout');
    const hzPill = document.getElementById('slHzPill');
    const permPill = document.getElementById('slPermPill');
    const capsEl = document.getElementById('slLocalCaps');

    if (phoneEl && orient) {
      phoneEl.style.transform = `rotateX(${orient.beta}deg) rotateY(${orient.gamma}deg) rotateZ(${-orient.alpha}deg)`;
    }
    if (horizonEl && orient) {
      horizonEl.style.transform = `translate(${Math.max(-24, Math.min(24, orient.gamma * 0.4))}px, ${Math.max(-24, Math.min(24, orient.beta * 0.4))}px)`;
    }

    const now = performance.now();
    if (!forceHud && now - sl.lastHudAt < 120) return;
    sl.lastHudAt = now;

    if (hzPill) {
      const mode = isP2pOpen() ? 'P2P' : 'WS';
      hzPill.textContent = `${mode} · ${currentHz()} Hz`;
    }
    if (permPill) permPill.textContent = isP2pOpen() ? `${sl.permission} · P2P` : sl.permission;

    const enableBtn = document.getElementById('slEnableBtn');
    if (enableBtn) {
      const showEnable = !sl.listening && (sl.permission === 'tap-enable' || sl.permission === 'denied');
      enableBtn.hidden = !showEnable;
    }

    if (readoutEl) {
      if (orient) {
        readoutEl.textContent = `α ${orient.alpha}° · β ${orient.beta}° · γ ${orient.gamma}°`;
      } else {
        readoutEl.textContent = sl.permission === 'denied'
          ? 'Sensor permission denied'
          : (sl.listening ? 'Waiting for sensor data…' : 'Tap "Enable Sensors" or use sliders below');
      }
    }
    if (capsEl) {
      const dev = currentDevice();
      const items = [
        ['P2P', isP2pOpen()],
        ['Gyro', dev.hasGyro],
        ['Accel', dev.hasAccel],
        ['Touch ' + dev.maxTouch, dev.maxTouch > 0],
        ['Bat ' + (dev.batteryLevel != null ? dev.batteryLevel + '%' : '—'), dev.batteryLevel != null],
        ['Net ' + (dev.netType || '—'), !!dev.netType],
      ];
      const capsKey = items.map(([l, ok]) => l + ':' + (ok ? 1 : 0)).join('|');
      if (capsKey !== sl.lastCapsKey) {
        sl.lastCapsKey = capsKey;
        capsEl.innerHTML = items.map(([label, ok]) =>
          '<span class="sl-cap ' + (ok ? 'sl-cap-ok' : 'sl-cap-no') + '">' + (ok ? '✓ ' : '· ') + escapeHtml(label) + '</span>'
        ).join('');
      }
    }
  }

  function buildPayload() {
    return {
      orient: currentOrient(),
      accel: sl.accel,
      accelG: sl.accelG,
      rotRate: sl.rotRate,
      device: currentDevice(),
      hz: currentHz(),
      seq: sl.seq,
      clientTs: Date.now(),
      permission: sl.permission,
    };
  }

  function isCellularLink() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.type === 'cellular') return true;
    return conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.effectiveType === 'slow-2g';
  }

  async function refreshLinkQuality() {
    if (!sl.pc || !isP2pOpen()) {
      sl.p2pIsLan = false;
      return;
    }
    if (isCellularLink()) {
      sl.p2pIsLan = false;
      return;
    }
    try {
      const stats = await sl.pc.getStats();
      let selectedId = null;
      let nominatedPair = null;
      let succeededPair = null;
      stats.forEach(report => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedId = report.selectedCandidatePairId;
        } else if (report.type === 'candidate-pair') {
          if (report.nominated) nominatedPair = report;
          else if (report.state === 'succeeded') succeededPair = report;
        }
      });
      const activePair = (selectedId && stats.get(selectedId)) || nominatedPair || succeededPair;
      if (!activePair) return;
      const remote = stats.get(activePair.remoteCandidateId);
      const rtt = activePair.currentRoundTripTime;
      const isHost = remote?.candidateType === 'host';
      sl.p2pIsLan = Boolean(isHost && (rtt == null || rtt <= 0.025));
    } catch { /* keep conservative rate */ }
  }

  function targetIntervalMs() {
    const p2p = isP2pOpen();
    if (isCellularLink()) return CELLULAR_INTERVAL_MS;
    if (p2p && sl.p2pIsLan) return P2P_LAN_INTERVAL_MS;
    return WS_INTERVAL_MS;
  }

  function sendSnapshot(force) {
    if (!sl.active) return;
    const now = performance.now();
    const p2p = isP2pOpen();
    if (p2p && now - sl.linkCheckAt >= 2000) {
      sl.linkCheckAt = now;
      refreshLinkQuality();
    }
    const minInterval = targetIntervalMs();
    if (!force && (!sl.dirty || now - sl.lastSendAt < minInterval)) return;

    sl.dirty = false;
    sl.lastSendAt = now;
    sl.seq += 1;
    sl.sentTimes.push(now);
    const payload = buildPayload();

    if (p2p) {
      try {
        sl.dc.send(JSON.stringify({ ...payload, transport: 'p2p' }));
      } catch { /* fallback to WS below */ }
    }

    if (!p2p || force || now - sl.lastWsAt >= WS_KEEPALIVE_MS) {
      sl.lastWsAt = now;
      send({
        type: 'GAME_ACTION',
        action: { type: 'sensorUpdate', ...payload },
      });
    }
    updateLocalPreview(force);
  }

  function startSendLoop() {
    if (sl.rafId != null) return;
    const tick = () => {
      if (!sl.active) {
        sl.rafId = null;
        return;
      }
      sendSnapshot(false);
      updateLocalPreview(false);
      sl.rafId = requestAnimationFrame(tick);
    };
    sl.rafId = requestAnimationFrame(tick);
  }

  function stopSendLoop() {
    if (sl.rafId != null) {
      cancelAnimationFrame(sl.rafId);
      sl.rafId = null;
    }
  }

  function stopRtc() {
    sl.p2pState = 'off';
    sl.p2pIsLan = false;
    sl.remoteDescSet = false;
    sl.pendingIce = [];
    if (sl.rtcRetryTimer) {
      clearTimeout(sl.rtcRetryTimer);
      sl.rtcRetryTimer = null;
    }
    if (sl.dc) {
      try { sl.dc.close(); } catch {}
      sl.dc = null;
    }
    if (sl.pc) {
      try { sl.pc.close(); } catch {}
      sl.pc = null;
    }
  }

  function scheduleRtcRetry() {
    if (!sl.active || sl.rtcRetryTimer) return;
    sl.rtcRetryTimer = setTimeout(() => {
      sl.rtcRetryTimer = null;
      if (sl.active && !sl.pc) startRtc();
    }, 2000);
  }

  async function startRtc() {
    if (sl.pc || typeof RTCPeerConnection === 'undefined') return;
    sl.p2pState = 'connecting';
    sl.remoteDescSet = false;
    sl.pendingIce = [];
    try {
      const pc = new RTCPeerConnection(RTC_CFG);
      sl.pc = pc;
      const dc = pc.createDataChannel('sensor', { ordered: false, maxRetransmits: 0 });
      sl.dc = dc;

      dc.onopen = () => {
        sl.p2pState = 'open';
        refreshLinkQuality();
        setTimeout(() => { if (sl.active && !sl.p2pIsLan) refreshLinkQuality(); }, 250);
        updateLocalPreview(true);
        sendSnapshot(true);
      };
      dc.onclose = () => {
        stopRtc();
        updateLocalPreview(true);
        scheduleRtcRetry();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          stopRtc();
          updateLocalPreview(true);
          scheduleRtcRetry();
        }
      };

      pc.onicecandidate = e => {
        if (e.candidate) {
          send({ type: 'RTC_SIGNAL', signal: { candidate: e.candidate } });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'RTC_SIGNAL', signal: { sdp: pc.localDescription } });
    } catch {
      stopRtc();
      scheduleRtcRetry();
    }
  }

  async function handleRtcSignal(msg) {
    if (!sl.pc || !msg.signal) return;
    try {
      if (msg.signal.sdp) {
        await sl.pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
        sl.remoteDescSet = true;
        const queued = sl.pendingIce.splice(0);
        for (const cand of queued) {
          try { await sl.pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
        }
      } else if (msg.signal.candidate) {
        if (sl.remoteDescSet) {
          await sl.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
        } else {
          sl.pendingIce.push(msg.signal.candidate);
        }
      }
    } catch { /* ignore late/stale ICE candidates */ }
  }

  function onOrient(e) {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    sl.simActive = false;
    sl.permission = 'granted';
    sl.rawOrient = {
      alpha: e.alpha ?? 0,
      beta: e.beta ?? 0,
      gamma: e.gamma ?? 0,
      absolute: !!e.absolute,
    };
    sl.dirty = true;
  }

  function onMotion(e) {
    if (e.acceleration) {
      sl.accel = smoothVec3(sl.accel, {
        x: e.acceleration.x ?? 0,
        y: e.acceleration.y ?? 0,
        z: e.acceleration.z ?? 0,
      });
    }
    if (e.accelerationIncludingGravity) {
      sl.accelG = smoothVec3(sl.accelG, {
        x: e.accelerationIncludingGravity.x ?? 0,
        y: e.accelerationIncludingGravity.y ?? 0,
        z: e.accelerationIncludingGravity.z ?? 0,
      });
    }
    if (e.rotationRate) {
      sl.rotRate = smoothRotRate(sl.rotRate, {
        alpha: e.rotationRate.alpha ?? 0,
        beta: e.rotationRate.beta ?? 0,
        gamma: e.rotationRate.gamma ?? 0,
      });
    }
    sl.dirty = true;
  }

  function onTouch(e) {
    sl.touches = e.touches ? e.touches.length : 0;
    sl.dirty = true;
  }

  function attachListeners() {
    if (sl.listening) return;
    sl.listening = true;
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchend', onTouch, { passive: true });
    window.addEventListener('touchcancel', onTouch, { passive: true });

    if (navigator.getBattery) {
      navigator.getBattery().then(bat => {
        const readBat = () => {
          sl.batteryLevel = Math.round((bat.level || 0) * 100);
          sl.batteryCharging = !!bat.charging;
        };
        readBat();
        bat.addEventListener?.('levelchange', readBat);
        bat.addEventListener?.('chargingchange', readBat);
      }).catch(() => {});
    }
    if (!sl.timer) {
      sl.timer = setInterval(() => sendSnapshot(true), WS_KEEPALIVE_MS);
    }
  }

  function detachListeners() {
    sl.listening = false;
    window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('devicemotion', onMotion);
    window.removeEventListener('touchstart', onTouch);
    window.removeEventListener('touchend', onTouch);
    window.removeEventListener('touchcancel', onTouch);
    if (sl.timer) {
      clearInterval(sl.timer);
      sl.timer = null;
    }
  }

  window.slRequestSensors = async function slRequestSensors() {
    if (typeof SH !== 'undefined' && SH.ensureMotionPermission) {
      if (SH.motionState === 'denied') SH.motionState = 'prompt'; // allow explicit retry on tap
      const res = await SH.ensureMotionPermission();
      if (res === 'granted' || res === 'auto') {
        sl.permission = 'granted';
        attachListeners();
        sendSnapshot(true);
      } else if (res === 'unsupported') {
        sl.permission = 'unsupported';
        attachListeners();
      } else {
        sl.permission = 'denied';
      }
      updateLocalPreview(true);
      return;
    }
    try {
      let orientPerm = 'granted';
      let motionPerm = 'granted';
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        orientPerm = await DeviceOrientationEvent.requestPermission();
      }
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        motionPerm = await DeviceMotionEvent.requestPermission();
      }
      if (orientPerm === 'granted' || motionPerm === 'granted') {
        sl.permission = 'granted';
        attachListeners();
        sendSnapshot(true);
      } else {
        sl.permission = 'denied';
        updateLocalPreview(true);
      }
    } catch {
      sl.permission = 'unsupported';
      attachListeners();
      updateLocalPreview(true);
    }
  };

  window.slZero = function slZero() {
    if (!sl.rawOrient) return;
    sl.zero = {
      alpha: sl.rawOrient.alpha || 0,
      beta: sl.rawOrient.beta || 0,
      gamma: sl.rawOrient.gamma || 0,
    };
    sendSnapshot(true);
  };

  window.slSimInput = function slSimInput() {
    const b = Number(document.getElementById('slSimBeta')?.value || 0);
    const g = Number(document.getElementById('slSimGamma')?.value || 0);
    const a = Number(document.getElementById('slSimAlpha')?.value || 0);
    document.getElementById('slSimBetaVal').textContent = b + '°';
    document.getElementById('slSimGammaVal').textContent = g + '°';
    document.getElementById('slSimAlphaVal').textContent = a + '°';
    sl.simActive = true;
    sl.permission = 'manual';
    sl.rawOrient = { alpha: a, beta: b, gamma: g, absolute: false };
    sl.dirty = true;
    sendSnapshot(false);
  };

  window.slFinish = function slFinish() {
    send({ type: 'GAME_ACTION', action: { type: 'finish' } });
  };

  function renderSensorLabState(msg) {
    sl.active = msg.phase === 'live';
    if (sl.active) {
      startSendLoop();
      if (!sl.pc) startRtc();
    } else {
      stopSendLoop();
    }
    if (sl.active && !sl.listening) {
      const granted = typeof SH !== 'undefined' && SH.motionGranted ? SH.motionGranted()
        : !(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');
      if (granted) {
        sl.permission = typeof DeviceOrientationEvent === 'undefined' ? 'unsupported' : 'listening';
        attachListeners();
        sendSnapshot(true);
      } else if (typeof SH !== 'undefined' && SH.motionState === 'denied') {
        sl.permission = 'denied';
      } else {
        sl.permission = 'tap-enable';
      }
    }
    updateLocalPreview(true);
  }

  SH.registerGame('sensor-lab', {
    section: 'sensorLabSection',
    render: renderSensorLabState,
    onRtcSignal: handleRtcSignal,
    redraw() { updateLocalPreview(true); },
    reset() {
      sl.active = false;
      sl.simActive = false;
      sl.dirty = false;
      sl.rawOrient = null;
      sl.accel = null;
      sl.accelG = null;
      sl.rotRate = null;
      sl.sentTimes = [];
      sl.lastCapsKey = '';
      stopSendLoop();
      detachListeners();
      stopRtc();
    },
  });
})();
