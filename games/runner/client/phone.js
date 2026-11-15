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
    pendingIce: [],
    remoteSet: false,
    bound: false,
    swipeStart: null,
    swipeFired: false,
  };

  function setLinkBadge(isP2p) {
    const pill = document.getElementById('rnLinkPill');
    if (!pill) return;
    pill.textContent = isP2p ? 'P2P' : 'WS';
    pill.className = isP2p
      ? 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-700 text-white font-mono font-bold'
      : 'text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono';
  }

  function vibrate(p) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(p); } catch { /* ignore */ }
    }
  }

  function sendCmd(cmd) {
    if (!rn.active) return;
    if (rn.dc && rn.dc.readyState === 'open') {
      try { rn.dc.send(JSON.stringify({ cmd })); } catch {
        send({ type: 'RTC_SIGNAL', signal: { rnCmd: cmd } });
      }
    } else {
      send({ type: 'RTC_SIGNAL', signal: { rnCmd: cmd } });
    }

    requestAnimationFrame(() => {
      vibrate(12);
      const pad = document.getElementById('rnSwipePad');
      if (pad) {
        pad.classList.remove('pulsing');
        requestAnimationFrame(() => pad.classList.add('pulsing'));
      }
      const orb = document.getElementById('rnCssOrb');
      const shadow = document.getElementById('rnCssOrbShadow');
      if (cmd === 'left' || cmd === 'right') {
        rn.visualLane = Math.max(-2, Math.min(2, (rn.visualLane || 0) + (cmd === 'left' ? -1 : 1)));
        const pct = `${50 + rn.visualLane * 18}%`;
        if (orb) orb.style.left = pct;
        if (shadow) shadow.style.left = pct;
      } else if (cmd === 'jump' && orb && shadow) {
        orb.classList.add('jumping');
        shadow.classList.add('jumping');
        clearTimeout(rn.jumpTimer);
        rn.jumpTimer = setTimeout(() => {
          orb.classList.remove('jumping');
          shadow.classList.remove('jumping');
        }, 300);
      }
    });
  }

  function onDeviceOrientation(e) {
    if (!rn.active || !rn.motionOn) return;
    const gamma = Number(e.gamma);
    if (!Number.isFinite(gamma)) return;
    const now = performance.now();
    if (now - rn.lastTiltStepAt < 170) return;
    const delta = gamma - rn.tiltNeutral;
    if (delta < -12) {
      rn.lastTiltStepAt = now;
      sendCmd('left');
    } else if (delta > 12) {
      rn.lastTiltStepAt = now;
      sendCmd('right');
    }
  }

  function onDeviceMotion(e) {
    if (!rn.active || !rn.motionOn) return;
    const acc = e.acceleration;
    if (!acc) return;
    const now = performance.now();
    if (now - rn.lastFlickAt < 300) return;
    if (Number(acc.y) > 7.5 || Number(acc.z) > 9.5) {
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
    rn.pendingIce = [];
    rn.remoteSet = false;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    rn.pc = pc;
    pc.ondatachannel = ev => {
      rn.dc = ev.channel;
      rn.dc.onopen = () => setLinkBadge(true);
      rn.dc.onclose = () => setLinkBadge(false);
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

    document.getElementById('rnLeftBtn')?.addEventListener('pointerdown', e => { e.preventDefault(); sendCmd('left'); });
    document.getElementById('rnRightBtn')?.addEventListener('pointerdown', e => { e.preventDefault(); sendCmd('right'); });
    document.getElementById('rnJumpBtn')?.addEventListener('pointerdown', e => { e.preventDefault(); sendCmd('jump'); });

    document.getElementById('rnMotionToggle')?.addEventListener('click', async () => {
      if (rn.motionOn) {
        rn.motionOn = false;
        updateMotionBtn();
        return;
      }
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') { showToast('Motion permission denied — use swipe/buttons!', 'info'); return; }
        }
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          await DeviceMotionEvent.requestPermission();
        }
        rn.motionOn = true;
        attachSensors();
        updateMotionBtn();
      } catch {
        showToast('Motion permission denied — use swipe/buttons!', 'info');
      }
    });

    const pad = document.getElementById('rnSwipePad');
    if (pad) {
      pad.addEventListener('pointerdown', e => {
        e.preventDefault();
        rn.swipeStart = { x: e.clientX, y: e.clientY };
        rn.swipeFired = false;
      });
      pad.addEventListener('pointermove', e => {
        if (!rn.swipeStart) return;
        const dx = e.clientX - rn.swipeStart.x;
        const dy = e.clientY - rn.swipeStart.y;
        if (Math.abs(dx) >= 22 && Math.abs(dx) > Math.abs(dy)) {
          sendCmd(dx < 0 ? 'left' : 'right');
          rn.swipeStart = { x: e.clientX, y: e.clientY };
          rn.swipeFired = true;
        } else if (dy <= -22 && Math.abs(dy) >= Math.abs(dx)) {
          sendCmd('jump');
          rn.swipeStart = { x: e.clientX, y: e.clientY };
          rn.swipeFired = true;
        }
      });
      pad.addEventListener('pointerup', () => {
        if (!rn.swipeStart) return;
        const fired = rn.swipeFired;
        rn.swipeStart = null;
        rn.swipeFired = false;
        if (!fired) sendCmd('jump');
      });
      pad.addEventListener('pointercancel', () => {
        rn.swipeStart = null;
        rn.swipeFired = false;
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
    if (nameEl) nameEl.textContent = state.name || 'Runner';
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
          .then(() => {
            rn.remoteSet = true;
            for (const c of rn.pendingIce) rn.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            rn.pendingIce = [];
            return rn.pc.createAnswer();
          })
          .then(ans => rn.pc.setLocalDescription(ans))
          .then(() => send({ type: 'RTC_SIGNAL', signal: { sdp: rn.pc.localDescription } }))
          .catch(() => {});
      } else if (sig.candidate) {
        if (rn.remoteSet) rn.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
        else rn.pendingIce.push(sig.candidate);
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
