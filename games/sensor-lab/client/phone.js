// Sensor Lab on the phone: captures gyro, accel, touch, screen, battery & network
// and streams 60 Hz over WebRTC P2P DataChannel (with 15 Hz WebSocket fallback).

(function () {
  const WS_INTERVAL_MS = 66;       // ~15 Hz over WebSocket / P2P WAN (safely under 30 msg/s limit)
  const CELLULAR_INTERVAL_MS = 100; // ~10 Hz on 4G/5G/cellular or high-RTT links
  const P2P_LAN_INTERVAL_MS = 16;  // ~60 Hz direct LAN P2P UDP over RTCDataChannel
  const WS_KEEPALIVE_MS = 500;     // 2 Hz WS state sync while P2P is active
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
    timer: null,
    simActive: false,
    pc: null,
    dc: null,
    p2pState: 'off', // off | connecting | open | closed
    p2pIsLan: false,
    linkCheckAt: 0,
  };

  function round1(n) { return Math.round(n * 10) / 10; }

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

  function updateLocalPreview() {
    const orient = currentOrient();
    const phoneEl = document.getElementById('slPhoneLocal');
    const horizonEl = document.getElementById('slLocalHorizon');
    const readoutEl = document.getElementById('slLocalReadout');
    const hzPill = document.getElementById('slHzPill');
    const permPill = document.getElementById('slPermPill');
    const capsEl = document.getElementById('slLocalCaps');

    if (hzPill) {
      const mode = isP2pOpen() ? 'P2P' : 'WS';
      hzPill.textContent = `${mode} · ${currentHz()} Hz`;
    }
    if (permPill) permPill.textContent = isP2pOpen() ? `${sl.permission} · P2P` : sl.permission;

    if (phoneEl && orient) {
      phoneEl.style.transform = `rotateX(${orient.beta}deg) rotateY(${orient.gamma}deg) rotateZ(${-orient.alpha}deg)`;
    }
    if (horizonEl && orient) {
      horizonEl.style.transform = `translate(${Math.max(-24, Math.min(24, orient.gamma * 0.4))}px, ${Math.max(-24, Math.min(24, orient.beta * 0.4))}px)`;
    }
    if (readoutEl) {
      if (orient) {
        readoutEl.textContent = `α ${orient.alpha}° · β ${orient.beta}° · γ ${orient.gamma}°`;
      } else {
        readoutEl.textContent = sl.permission === 'denied'
          ? 'Sensor permission denied'
          : 'Tap "Enable Sensors" or use sliders below';
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
      capsEl.innerHTML = items.map(([label, ok]) =>
        '<span class="sl-cap ' + (ok ? 'sl-cap-ok' : 'sl-cap-no') + '">' + (ok ? '✓ ' : '· ') + escapeHtml(label) + '</span>'
      ).join('');
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
      let activePair = null;
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && (report.nominated || report.state === 'succeeded')) {
          activePair = report;
        }
      });
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
    if (!force && now - sl.lastSendAt < minInterval) return;

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
    updateLocalPreview();
  }

  function stopRtc() {
    sl.p2pState = 'off';
    if (sl.dc) {
      try { sl.dc.close(); } catch {}
      sl.dc = null;
    }
    if (sl.pc) {
      try { sl.pc.close(); } catch {}
      sl.pc = null;
    }
  }

  async function startRtc() {
    if (sl.pc || typeof RTCPeerConnection === 'undefined') return;
    sl.p2pState = 'connecting';
    try {
      const pc = new RTCPeerConnection(RTC_CFG);
      sl.pc = pc;
      const dc = pc.createDataChannel('sensor', { ordered: false, maxRetransmits: 0 });
      sl.dc = dc;

      dc.onopen = () => {
        sl.p2pState = 'open';
        refreshLinkQuality();
        updateLocalPreview();
        sendSnapshot(true);
      };
      dc.onclose = () => {
        sl.p2pState = 'closed';
        updateLocalPreview();
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
    }
  }

  async function handleRtcSignal(msg) {
    if (!sl.pc || !msg.signal) return;
    try {
      if (msg.signal.sdp) {
        await sl.pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
      } else if (msg.signal.candidate) {
        await sl.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
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
    sendSnapshot(false);
  }

  function onMotion(e) {
    if (e.acceleration) {
      sl.accel = { x: e.acceleration.x ?? 0, y: e.acceleration.y ?? 0, z: e.acceleration.z ?? 0 };
    }
    if (e.accelerationIncludingGravity) {
      sl.accelG = { x: e.accelerationIncludingGravity.x ?? 0, y: e.accelerationIncludingGravity.y ?? 0, z: e.accelerationIncludingGravity.z ?? 0 };
    }
    if (e.rotationRate) {
      sl.rotRate = { alpha: e.rotationRate.alpha ?? 0, beta: e.rotationRate.beta ?? 0, gamma: e.rotationRate.gamma ?? 0 };
    }
    sendSnapshot(false);
  }

  function onTouch(e) {
    sl.touches = e.touches ? e.touches.length : 0;
    sendSnapshot(false);
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
        updateLocalPreview();
      }
    } catch {
      sl.permission = 'unsupported';
      attachListeners();
      updateLocalPreview();
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
    sendSnapshot(false);
  };

  window.slFinish = function slFinish() {
    send({ type: 'GAME_ACTION', action: { type: 'finish' } });
  };

  function renderSensorLabState(msg) {
    sl.active = msg.phase === 'live';
    if (sl.active && !sl.pc) startRtc();
    if (sl.active && !sl.listening) {
      const needsTap = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
      if (!needsTap) {
        sl.permission = typeof DeviceOrientationEvent === 'undefined' ? 'unsupported' : 'listening';
        attachListeners();
        sendSnapshot(true);
      } else {
        sl.permission = 'tap-enable';
      }
    }
    updateLocalPreview();
  }

  SH.registerGame('sensor-lab', {
    section: 'sensorLabSection',
    render: renderSensorLabState,
    onRtcSignal: handleRtcSignal,
    redraw() { updateLocalPreview(); },
    reset() {
      sl.active = false;
      sl.simActive = false;
      sl.rawOrient = null;
      sl.accel = null;
      sl.accelG = null;
      sl.rotRate = null;
      sl.sentTimes = [];
      detachListeners();
      stopRtc();
    },
  });
})();
