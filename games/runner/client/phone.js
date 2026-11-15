// After Hours Runner — Phone Touch Swipe + Optional Tilt/Flick Controller
(function () {
  'use strict';

  const rn = {
    active: false,
    motionOn: false,
    listening: false,
    tiltNeutral: 0,
    lastTiltStepAt: 0,
    lastFlickAt: 0,
    pc: null,
    dc: null,
    bound: false,
    swipeStart: null,
  };

  function vibrate(p) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(p); } catch { /* ignore */ }
    }
  }

  function sendCmd(cmd) {
    if (!rn.active) return;
    vibrate(14);
    if (rn.dc && rn.dc.readyState === 'open') {
      try { rn.dc.send(JSON.stringify({ cmd })); return; } catch { /* ignore */ }
    }
    send({ type: 'RTC_SIGNAL', signal: { rnCmd: cmd } });
  }

  function onDeviceOrientation(e) {
    if (!rn.active || !rn.motionOn) return;
    const gamma = Number(e.gamma);
    if (!Number.isFinite(gamma)) return;
    const now = performance.now();
    if (now - rn.lastTiltStepAt < 260) return;
    const delta = gamma - rn.tiltNeutral;
    if (delta < -16) {
      rn.lastTiltStepAt = now;
      sendCmd('left');
    } else if (delta > 16) {
      rn.lastTiltStepAt = now;
      sendCmd('right');
    }
  }

  function onDeviceMotion(e) {
    if (!rn.active || !rn.motionOn) return;
    const acc = e.acceleration;
    if (!acc) return;
    const now = performance.now();
    if (now - rn.lastFlickAt < 400) return;
    if (Number(acc.y) > 10 || Number(acc.z) > 12) {
      rn.lastFlickAt = now;
      sendCmd('jump');
    }
  }

  function attachSensors() {
    if (rn.listening) return;
    rn.listening = true;
    window.addEventListener('deviceorientation', onDeviceOrientation);
    window.addEventListener('devicemotion', onDeviceMotion);
  }

  function updateMotionBtn() {
    const btn = document.getElementById('rnMotionToggle');
    if (btn) {
      btn.textContent = rn.motionOn ? '📱 Tilt: ON' : '📱 Tilt: Off';
      btn.classList.toggle('bg-cyan-700', rn.motionOn);
      btn.classList.toggle('text-white', rn.motionOn);
    }
  }

  function updateHudFromTv(d) {
    const livesEl = document.getElementById('rnMyLives');
    if (livesEl) {
      livesEl.textContent = d.alive
        ? `${'❤️'.repeat(Math.max(0, d.lives))} • 💎 ${d.gems}`
        : `💀 Eliminated • 💎 ${d.gems}`;
    }
    const scoreEl = document.getElementById('rnMyScore');
    if (scoreEl) scoreEl.textContent = String(d.score || 0);
    const chips = document.querySelectorAll('#rnLettersBar .rn-letter-chip');
    chips.forEach((chip, i) => chip.classList.toggle('got', i < (d.letters || 0)));
  }

  function startRtc() {
    if (rn.pc) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    rn.pc = pc;
    pc.ondatachannel = ev => {
      rn.dc = ev.channel;
      rn.dc.onmessage = msgEv => {
        try {
          const d = JSON.parse(msgEv.data);
          if (d.type === 'hud') updateHudFromTv(d);
          else if (d.type === 'haptic') {
            if (d.kind === 'hit') vibrate([35, 30, 50]);
            else if (d.kind === 'letter') vibrate([20, 20, 35]);
            else if (d.kind === 'gem') vibrate(18);
          }
        } catch { /* ignore */ }
      };
    };
    pc.onicecandidate = e => {
      if (e.candidate) send({ type: 'RTC_SIGNAL', signal: { candidate: e.candidate } });
    };
  }

  function bindUi() {
    if (rn.bound) return;
    rn.bound = true;

    document.getElementById('rnLeftBtn')?.addEventListener('click', () => sendCmd('left'));
    document.getElementById('rnRightBtn')?.addEventListener('click', () => sendCmd('right'));
    document.getElementById('rnJumpBtn')?.addEventListener('click', () => sendCmd('jump'));

    document.getElementById('rnMotionToggle')?.addEventListener('click', () => {
      if (rn.motionOn) {
        rn.motionOn = false;
        updateMotionBtn();
        return;
      }
      if (typeof SH !== 'undefined' && SH.ensureMotionPermission) {
        SH.ensureMotionPermission().then(res => {
          if (res === 'granted' || res === 'auto') {
            rn.motionOn = true;
            attachSensors();
            updateMotionBtn();
          } else {
            showToast('Motion permission denied — use swipe/buttons!', 'info');
          }
        });
      } else {
        rn.motionOn = true;
        attachSensors();
        updateMotionBtn();
      }
    });

    const pad = document.getElementById('rnSwipePad');
    if (pad) {
      pad.addEventListener('pointerdown', e => {
        rn.swipeStart = { x: e.clientX, y: e.clientY };
      });
      pad.addEventListener('pointerup', e => {
        if (!rn.swipeStart) return;
        const dx = e.clientX - rn.swipeStart.x;
        const dy = e.clientY - rn.swipeStart.y;
        rn.swipeStart = null;
        if (Math.hypot(dx, dy) < 20) {
          sendCmd('jump');
          return;
        }
        if (Math.abs(dx) > Math.abs(dy)) sendCmd(dx < 0 ? 'left' : 'right');
        else if (dy < -20) sendCmd('jump');
      });
    }
  }

  function renderRunnerPhone(msg) {
    bindUi();
    rn.active = msg.phase === 'playing';
    if (rn.active && !rn.pc) startRtc();

    const myId = state.playerId;
    const myAvatar = (state.players || []).find(p => p.playerId === myId)?.avatar || '\u{26A1}';
    const avEl = document.getElementById('rnMyAvatar');
    if (avEl && SH.avatarSvg) avEl.innerHTML = SH.avatarSvg(myAvatar, { size: 38 });
    const nameEl = document.getElementById('rnMyName');
    if (nameEl) nameEl.textContent = state.username || 'Runner';
    updateMotionBtn();
  }

  SH.registerGame('runner', {
    section: 'runnerSection',
    render: renderRunnerPhone,
    onRtcSignal(msg) {
      const sig = msg.signal;
      if (!sig) return;
      if (sig.rnEnd) {
        send({ type: 'GAME_ACTION', action: { type: 'reportRaceEnd', ...sig.rnEnd } });
        return;
      }
      if (!rn.pc) startRtc();
      if (sig.sdp) {
        rn.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp))
          .then(() => rn.pc.createAnswer())
          .then(ans => rn.pc.setLocalDescription(ans))
          .then(() => send({ type: 'RTC_SIGNAL', signal: { sdp: rn.pc.localDescription } }))
          .catch(() => {});
      } else if (sig.candidate) {
        rn.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
      }
    },
    reset() {
      rn.active = false;
      rn.motionOn = false;
      if (rn.listening) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
        window.removeEventListener('devicemotion', onDeviceMotion);
        rn.listening = false;
      }
      try { rn.dc?.close(); rn.pc?.close(); } catch { /* ignore */ }
      rn.dc = null;
      rn.pc = null;
    },
  });
})();
