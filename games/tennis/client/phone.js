// Small Hours Tennis — Phone Racket Sensor & Touch Controller
(function () {
  'use strict';

  const tn = {
    active: false,
    listening: false,
    shotType: 'topspin',
    aim: 0,
    lastSwingAt: 0,
    lastAimSentAt: 0,
    pc: null,
    dc: null,
    bound: false,
    padStart: null,
  };

  function vibrate(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }

  function sendInput(payload) {
    if (tn.dc && tn.dc.readyState === 'open') {
      try { tn.dc.send(JSON.stringify(payload)); return; } catch { /* ignore */ }
    }
    if (payload.type === 'swing') {
      send({ type: 'RTC_SIGNAL', signal: { tnSwing: payload } });
    } else if (payload.type === 'toss') {
      send({ type: 'RTC_SIGNAL', signal: { tnToss: true } });
    }
  }

  function emitSwing(opts) {
    const now = performance.now();
    if (now - tn.lastSwingAt < 280) return;
    tn.lastSwingAt = now;
    vibrate(25);
    const pad = document.getElementById('tnRacketPad');
    if (pad) {
      pad.classList.remove('swinging');
      void pad.offsetWidth;
      pad.classList.add('swinging');
    }
    sendInput({
      type: 'swing',
      shotType: opts.shotType || tn.shotType,
      speed: opts.speed || 1.15,
      side: opts.side || null,
      dirX: opts.dirX != null ? opts.dirX : tn.aim,
    });
  }

  function onDeviceOrientation(e) {
    if (!tn.active) return;
    const gamma = Number(e.gamma);
    if (!Number.isFinite(gamma)) return;
    tn.aim = Math.max(-1, Math.min(1, gamma / 40));
    const now = performance.now();
    if (now - tn.lastAimSentAt > 50) {
      tn.lastAimSentAt = now;
      if (tn.dc && tn.dc.readyState === 'open') {
        try { tn.dc.send(JSON.stringify({ type: 'aim', aim: tn.aim })); } catch { /* ignore */ }
      }
    }
  }

  function onDeviceMotion(e) {
    if (!tn.active) return;
    const acc = e.acceleration || e.accelerationIncludingGravity;
    if (!acc) return;
    const ax = Number(acc.x) || 0;
    const ay = Number(acc.y) || 0;
    const az = Number(acc.z) || 0;
    const mag = e.acceleration ? Math.hypot(ax, ay, az) : Math.abs(Math.hypot(ax, ay, az) - 9.81);

    const rot = e.rotationRate || {};
    const rotMag = Math.hypot(Number(rot.alpha) || 0, Number(rot.beta) || 0, Number(rot.gamma) || 0);

    // Detect crisp racket swing gesture
    if (mag > 14.5 || rotMag > 260) {
      const speed = Math.max(0.85, Math.min(1.6, 0.8 + mag / 26));
      const side = ax > 4 ? 'backhand' : ax < -4 ? 'forehand' : null;
      let shotType = tn.shotType;
      if (mag > 25 && ay < -6) shotType = 'smash';
      else if (ay > 11 && Math.abs(az) < 8) {
        sendInput({ type: 'toss' });
        vibrate(18);
        return;
      }
      emitSwing({ speed, side, shotType });
      const ro = document.getElementById('tnSensorReadout');
      if (ro) ro.textContent = `Swing! ${shotType.toUpperCase()} (${speed.toFixed(2)}x)`;
    }
  }

  function attachSensors() {
    if (tn.listening) return;
    tn.listening = true;
    window.addEventListener('deviceorientation', onDeviceOrientation);
    window.addEventListener('devicemotion', onDeviceMotion);
    const btn = document.getElementById('tnSensorBtn');
    if (btn) btn.textContent = '📱 Racket Sensors Active ✓';
    const ro = document.getElementById('tnSensorReadout');
    if (ro) ro.textContent = 'Motion sensors active — swing phone!';
  }

  function startRtc() {
    if (tn.pc) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    tn.pc = pc;
    pc.ondatachannel = ev => {
      tn.dc = ev.channel;
      tn.dc.onmessage = msgEv => {
        try {
          const d = JSON.parse(msgEv.data);
          if (d.type === 'haptic') {
            if (d.kind === 'perfect') vibrate([40, 25, 65]);
            else if (d.kind === 'hit') vibrate(30);
            else if (d.kind === 'fault') vibrate([20, 40, 20]);
          }
        } catch { /* ignore */ }
      };
    };
    pc.onicecandidate = e => {
      if (e.candidate) send({ type: 'RTC_SIGNAL', signal: { candidate: e.candidate } });
    };
  }

  function bindUi() {
    if (tn.bound) return;
    tn.bound = true;

    document.getElementById('tnSensorBtn')?.addEventListener('click', async () => {
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          const res = await DeviceMotionEvent.requestPermission();
          if (res !== 'granted') { showToast('Motion permission denied — use swipe pad!', 'info'); return; }
        }
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          await DeviceOrientationEvent.requestPermission();
        }
        attachSensors();
      } catch {
        showToast('Motion permission denied — use swipe pad!', 'info');
      }
    });

    document.getElementById('tnTossBtn')?.addEventListener('click', () => {
      vibrate(15);
      sendInput({ type: 'toss' });
    });

    document.querySelectorAll('[data-tn-shot]').forEach(btn => {
      btn.addEventListener('click', () => {
        tn.shotType = btn.dataset.tnShot || 'topspin';
        document.querySelectorAll('[data-tn-shot]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    const pad = document.getElementById('tnRacketPad');
    if (pad) {
      pad.addEventListener('pointerdown', e => {
        tn.padStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      });
      pad.addEventListener('pointerup', e => {
        if (!tn.padStart) return;
        const dx = e.clientX - tn.padStart.x;
        const dy = e.clientY - tn.padStart.y;
        const dt = Math.max(20, performance.now() - tn.padStart.t);
        tn.padStart = null;
        const dist = Math.hypot(dx, dy);
        if (dist < 18) {
          emitSwing({ speed: 1.1 });
          return;
        }
        const speed = Math.max(0.85, Math.min(1.55, 0.8 + dist / dt * 0.45));
        const side = dx > 20 ? 'backhand' : dx < -20 ? 'forehand' : null;
        const dirX = Math.max(-1, Math.min(1, dx / 140));
        let shotType = tn.shotType;
        if (dy < -75 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          sendInput({ type: 'toss' });
          return;
        }
        if (dy > 45 && speed > 1.25) shotType = 'smash';
        emitSwing({ speed, side, dirX, shotType });
      });
    }
  }

  function renderTennisPhone(msg) {
    bindUi();
    tn.active = msg.phase === 'playing';
    if (tn.active && !tn.pc) startRtc();

    const needsTap = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') ||
      (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function');
    if (!needsTap && !tn.listening) attachSensors();

    const p1 = msg.players?.[0];
    const p2 = msg.players?.[1];
    const myId = state.playerId;
    const myAvatar = (state.players || []).find(p => p.playerId === myId)?.avatar || '\u{1F3BE}';

    const avEl = document.getElementById('tnMyAvatar');
    if (avEl && SH.avatarSvg) avEl.innerHTML = SH.avatarSvg(myAvatar, { size: 40 });
    const nameEl = document.getElementById('tnMyName');
    if (nameEl) nameEl.textContent = state.username || 'Player';

    const scoreEl = document.getElementById('tnScorePill');
    if (scoreEl && p1 && p2) {
      scoreEl.textContent = `${msg.pointLabels?.[p1] || '0'} – ${msg.pointLabels?.[p2] || '0'}`;
    }
    const gamesEl = document.getElementById('tnGamesPill');
    if (gamesEl && p1 && p2) {
      gamesEl.textContent = `Games: ${msg.games?.[p1] || 0} – ${msg.games?.[p2] || 0}`;
    }
    const statusEl = document.getElementById('tnStatusText');
    if (statusEl) {
      if (msg.phase === 'finished') {
        statusEl.textContent = msg.winner === myId ? '🏆 You won the match!' : 'Match finished!';
      } else {
        statusEl.textContent = msg.serverId === myId ? 'Your serve — Toss & Swing!' : 'Return the rally!';
      }
    }
  }

  SH.registerGame('tennis', {
    section: 'tennisSection',
    render: renderTennisPhone,
    onRtcSignal(msg) {
      const sig = msg.signal;
      if (!sig) return;
      if (sig.tnPoint) {
        send({ type: 'GAME_ACTION', action: { type: 'reportPoint', ...sig.tnPoint } });
        return;
      }
      if (!tn.pc) startRtc();
      if (sig.sdp) {
        tn.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp))
          .then(() => tn.pc.createAnswer())
          .then(ans => tn.pc.setLocalDescription(ans))
          .then(() => send({ type: 'RTC_SIGNAL', signal: { sdp: tn.pc.localDescription } }))
          .catch(() => {});
      } else if (sig.candidate) {
        tn.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
      }
    },
    reset() {
      tn.active = false;
      if (tn.listening) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
        window.removeEventListener('devicemotion', onDeviceMotion);
        tn.listening = false;
      }
      try { tn.dc?.close(); tn.pc?.close(); } catch { /* ignore */ }
      tn.dc = null;
      tn.pc = null;
    },
  });
})();
