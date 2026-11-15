// Sensor Lab on the phone: captures gyro, accel, touch, screen, battery & network
// and streams throttled 15 Hz snapshots to the server.

(function () {
  const SEND_INTERVAL_MS = 66; // ~15 Hz (safely under ws-adapter 30 msg/s rate limit)

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
    timer: null,
    simActive: false,
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

  function updateLocalPreview() {
    const orient = currentOrient();
    const phoneEl = document.getElementById('slPhoneLocal');
    const horizonEl = document.getElementById('slLocalHorizon');
    const readoutEl = document.getElementById('slLocalReadout');
    const hzPill = document.getElementById('slHzPill');
    const permPill = document.getElementById('slPermPill');
    const capsEl = document.getElementById('slLocalCaps');

    if (hzPill) hzPill.textContent = currentHz() + ' Hz';
    if (permPill) permPill.textContent = sl.permission;

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

  function sendSnapshot(force) {
    if (!sl.active) return;
    const now = performance.now();
    if (!force && now - sl.lastSendAt < SEND_INTERVAL_MS) return;
    sl.lastSendAt = now;
    sl.seq += 1;
    sl.sentTimes.push(now);

    send({
      type: 'GAME_ACTION',
      action: {
        type: 'sensorUpdate',
        orient: currentOrient(),
        accel: sl.accel,
        accelG: sl.accelG,
        rotRate: sl.rotRate,
        device: currentDevice(),
        hz: currentHz(),
        seq: sl.seq,
        clientTs: Date.now(),
        permission: sl.permission,
      },
    });
    updateLocalPreview();
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
      sl.accel = {
        x: e.acceleration.x ?? 0,
        y: e.acceleration.y ?? 0,
        z: e.acceleration.z ?? 0,
      };
    }
    if (e.accelerationIncludingGravity) {
      sl.accelG = {
        x: e.accelerationIncludingGravity.x ?? 0,
        y: e.accelerationIncludingGravity.y ?? 0,
        z: e.accelerationIncludingGravity.z ?? 0,
      };
    }
    if (e.rotationRate) {
      sl.rotRate = {
        alpha: e.rotationRate.alpha ?? 0,
        beta: e.rotationRate.beta ?? 0,
        gamma: e.rotationRate.gamma ?? 0,
      };
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
      sl.timer = setInterval(() => sendSnapshot(true), 500);
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
    if (sl.active && !sl.listening) {
      // Auto-attach on browsers that don't require an explicit iOS tap gesture.
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
    },
  });
})();
