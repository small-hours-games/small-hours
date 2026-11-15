// Sensor Lab on the TV: live 3D phone orientation model & P2P/WS freshness per player.

(function () {
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let slAgeTimer = null;
  let slRafId = null;
  let slLastFrameAt = 0;
  let slLastMsg = null;
  const peers = new Map();       // playerId -> { pc, dc, remoteDescSet, pendingIce }
  const p2pSnaps = new Map();    // playerId -> latest P2P snapshot + receivedAt
  const playerState = new Map(); // playerId -> { lastSeq, smoothOrient, unwrappedAlpha, lastMetricsAt, lastCapsKey }

  function normAngle(deg) {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }

  function getPlayerState(id) {
    let st = playerState.get(id);
    if (!st) {
      st = {
        lastSeq: null,
        smoothOrient: null,
        unwrappedAlpha: 0,
        lastMetricsAt: 0,
        lastCapsKey: '',
      };
      playerState.set(id, st);
    }
    return st;
  }

  function isNewerSeq(prevSeq, nextSeq) {
    if (typeof nextSeq !== 'number' || !Number.isFinite(nextSeq)) return true;
    if (typeof prevSeq !== 'number' || !Number.isFinite(prevSeq)) return true;
    if (nextSeq > prevSeq) return true;
    return prevSeq - nextSeq > 100; // phone page reloaded / reset
  }

  function activeSnap(id) {
    const p2p = p2pSnaps.get(id);
    const wsSnap = slLastMsg?.sensors?.[id] || null;
    if (p2p && Date.now() - p2p.receivedAt <= 1500) return p2p;
    return wsSnap;
  }

  function freshnessBadge(snap) {
    const ts = snap?.receivedAt || snap?.serverTs;
    if (!snap || !ts) return { cls: 'sl-fresh-stale', text: 'NO DATA' };
    const age = Math.max(0, Date.now() - ts);
    const hz = snap.hz || 0;
    const tag = snap.transport === 'p2p' ? 'P2P' : 'WS';
    if (age <= 350) return { cls: 'sl-fresh-live', text: `${tag} · ${hz} Hz · ${age}ms` };
    if (age <= 1500) return { cls: 'sl-fresh-slow', text: `${tag} · ${hz} Hz · ${age}ms` };
    return { cls: 'sl-fresh-stale', text: `STALE · ${Math.round(age / 1000)}s ago` };
  }

  function gForceTotal(snap) {
    const v = snap?.accelG || snap?.accel;
    if (!v) return null;
    return Math.round(Math.hypot(v.x || 0, v.y || 0, v.z || 0) * 10) / 10;
  }

  function capsHtml(snap) {
    const dev = snap?.device || {};
    const badges = [
      ['P2P', snap?.transport === 'p2p'],
      ['Gyro', !!dev.hasGyro],
      ['Accel', !!dev.hasAccel],
      ['Touch' + (dev.maxTouch ? ' ×' + dev.maxTouch : ''), (dev.maxTouch || 0) > 0],
      ['Bat' + (dev.batteryLevel != null ? ' ' + dev.batteryLevel + '%' + (dev.batteryCharging ? '⚡' : '') : ''), dev.batteryLevel != null],
      ['Net' + (dev.netType ? ' ' + dev.netType : ''), !!dev.netType],
      [dev.screenOrient ? dev.screenOrient.replace('-primary', '') : 'Screen', !!dev.screenOrient],
    ];
    return badges.map(([label, ok]) =>
      `<span class="sl-cap ${ok ? 'sl-cap-ok' : 'sl-cap-no'}">${ok ? '✓' : '·'} ${escapeHtml(label)}</span>`
    ).join('');
  }

  function patchCard(id, snap, dt, now) {
    const safeId = window.CSS?.escape ? CSS.escape(id) : id;
    const card = document.querySelector(`.sl-tv-card[data-player-id="${safeId}"]`);
    if (!card) return false;
    const target = snap?.orient || { alpha: 0, beta: 0, gamma: 0 };
    const st = getPlayerState(id);

    if (!st.smoothOrient) {
      st.smoothOrient = { alpha: target.alpha || 0, beta: target.beta || 0, gamma: target.gamma || 0 };
      st.unwrappedAlpha = target.alpha || 0;
    } else {
      const rate = snap?.transport === 'p2p' ? 24 : 14;
      const k = 1 - Math.exp(-dt * rate);
      const dAlpha = normAngle((target.alpha || 0) - st.smoothOrient.alpha) * k;
      const dBeta = normAngle((target.beta || 0) - st.smoothOrient.beta) * k;
      const dGamma = normAngle((target.gamma || 0) - st.smoothOrient.gamma) * k;
      st.smoothOrient.alpha = ((st.smoothOrient.alpha + dAlpha) % 360 + 360) % 360;
      st.smoothOrient.beta += dBeta;
      st.smoothOrient.gamma += dGamma;
      st.unwrappedAlpha += dAlpha;
    }

    const horizonX = Math.max(-28, Math.min(28, (st.smoothOrient.gamma || 0) * 0.45));
    const horizonY = Math.max(-28, Math.min(28, (st.smoothOrient.beta || 0) * 0.45));

    const phone = card.querySelector('.sl-phone-3d');
    if (phone) {
      phone.classList.toggle('sl-p2p', snap?.transport === 'p2p');
      phone.style.transform = `rotateX(${st.smoothOrient.beta.toFixed(2)}deg) rotateY(${st.smoothOrient.gamma.toFixed(2)}deg) rotateZ(${(-st.unwrappedAlpha).toFixed(2)}deg)`;
    }
    const horizon = card.querySelector('.sl-horizon');
    if (horizon) horizon.style.transform = `translate(${horizonX.toFixed(1)}px, ${horizonY.toFixed(1)}px)`;

    if (now - st.lastMetricsAt >= 66) {
      st.lastMetricsAt = now;
      const fresh = freshnessBadge(snap);
      const freshEl = card.querySelector('.sl-fresh');
      if (freshEl) {
        freshEl.className = 'sl-fresh ' + fresh.cls;
        freshEl.textContent = fresh.text;
      }
      const g = gForceTotal(snap);
      const metricsEl = card.querySelector('.sl-tv-metrics');
      if (metricsEl) {
        const spans = metricsEl.querySelectorAll('span');
        if (spans.length === 4) {
          spans[0].textContent = `α ${target.alpha}°`;
          spans[1].textContent = `β ${target.beta}°`;
          spans[2].textContent = `γ ${target.gamma}°`;
          spans[3].textContent = g !== null ? g + ' m/s²' : '— m/s²';
        }
      }
      const nextCaps = capsHtml(snap);
      if (nextCaps !== st.lastCapsKey) {
        st.lastCapsKey = nextCaps;
        const capsEl = card.querySelector('.sl-caps');
        if (capsEl) capsEl.innerHTML = nextCaps;
      }
    }
    return true;
  }

  function startRenderLoop() {
    if (slRafId != null) return;
    slLastFrameAt = performance.now();
    const tick = now => {
      if (!slLastMsg) {
        slRafId = null;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - slLastFrameAt) / 1000));
      slLastFrameAt = now;
      const players = slLastMsg.players || Object.keys(slLastMsg.sensors || {});
      for (const id of players) {
        patchCard(id, activeSnap(id), dt, now);
      }
      slRafId = requestAnimationFrame(tick);
    };
    slRafId = requestAnimationFrame(tick);
  }

  function stopRenderLoop() {
    if (slRafId != null) {
      cancelAnimationFrame(slRafId);
      slRafId = null;
    }
  }

  function renderPlayerCard(id, snap, names) {
    const name = names[id] || id;
    const av = (state.playerAvatars || {})[id] || '📱';
    const orient = snap?.orient || { alpha: 0, beta: 0, gamma: 0 };
    const fresh = freshnessBadge(snap);
    const g = gForceTotal(snap);
    const screenText = snap?.device?.viewportW ? `${snap.device.viewportW}×${snap.device.viewportH} @${snap.device.dpr || 1}x` : '—';
    const horizonX = Math.max(-28, Math.min(28, (orient.gamma || 0) * 0.45));
    const horizonY = Math.max(-28, Math.min(28, (orient.beta || 0) * 0.45));
    const transform = `rotateX(${orient.beta}deg) rotateY(${orient.gamma}deg) rotateZ(${-orient.alpha}deg)`;

    return `
      <div class="sl-tv-card" data-player-id="${escapeHtml(id)}">
        <div class="sl-tv-card-head">
          <div class="sl-tv-who"><span>${escapeHtml(av)}</span><b>${escapeHtml(name)}</b></div>
          <span class="sl-fresh ${fresh.cls}" data-sl-fresh="${escapeHtml(id)}">${escapeHtml(fresh.text)}</span>
        </div>
        <div class="sl-stage">
          <div class="sl-phone-3d${snap?.transport === 'p2p' ? ' sl-p2p' : ''}" style="transform:${transform}">
            <div class="sl-face sl-front">
              <div class="sl-notch"></div>
              <div class="sl-screen-label">${escapeHtml(av)} ${escapeHtml(name)}</div>
              <div class="sl-horizon" style="transform:translate(${horizonX}px, ${horizonY}px)"></div>
            </div>
            <div class="sl-face sl-back"><div class="sl-cam"></div></div>
            <div class="sl-face sl-left"></div>
            <div class="sl-face sl-right"></div>
            <div class="sl-face sl-top"></div>
            <div class="sl-face sl-bottom"></div>
          </div>
        </div>
        <div class="sl-tv-metrics tc-mono">
          <span>α ${orient.alpha}°</span>
          <span>β ${orient.beta}°</span>
          <span>γ ${orient.gamma}°</span>
          <span>${g !== null ? g + ' m/s²' : '— m/s²'}</span>
        </div>
        <div class="sl-tv-sub tc-mono">${escapeHtml(screenText)} · perm: ${escapeHtml(snap?.permission || 'none')}</div>
        <div class="sl-caps">${capsHtml(snap)}</div>
      </div>
    `;
  }

  function refreshAges() {
    if (!slLastMsg) return;
    for (const id of slLastMsg.players || []) {
      const safeId = window.CSS?.escape ? CSS.escape(id) : id;
      const el = document.querySelector(`[data-sl-fresh="${safeId}"]`);
      if (!el) continue;
      const fresh = freshnessBadge(activeSnap(id));
      el.className = 'sl-fresh ' + fresh.cls;
      el.textContent = fresh.text;
    }
  }

  async function handleRtcSignal(msg) {
    const id = msg.fromPlayerId;
    if (!id || !msg.signal || typeof RTCPeerConnection === 'undefined') return;

    let entry = peers.get(id);
    if (msg.signal.sdp?.type === 'offer') {
      if (entry) {
        try { entry.pc.close(); } catch {}
      }
      const pc = new RTCPeerConnection(RTC_CFG);
      entry = { pc, dc: null, remoteDescSet: false, pendingIce: [] };
      peers.set(id, entry);

      pc.onicecandidate = e => {
        if (e.candidate) {
          send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { candidate: e.candidate } });
        }
      };
      pc.ondatachannel = e => {
        const dc = e.channel;
        entry.dc = dc;
        dc.onmessage = ev => {
          try {
            const snap = JSON.parse(ev.data);
            const st = getPlayerState(id);
            if (!isNewerSeq(st.lastSeq, snap.seq)) return;
            st.lastSeq = snap.seq;
            snap.receivedAt = Date.now();
            snap.transport = 'p2p';
            p2pSnaps.set(id, snap);
          } catch {}
        };
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
        entry.remoteDescSet = true;
        const queued = entry.pendingIce.splice(0);
        for (const cand of queued) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { sdp: pc.localDescription } });
      } catch {}
    } else if (entry && msg.signal.candidate) {
      if (entry.remoteDescSet) {
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
        } catch {}
      } else {
        entry.pendingIce.push(msg.signal.candidate);
      }
    }
  }

  function renderSensorLabTv(msg) {
    slLastMsg = msg;
    const content = document.getElementById('gameContent');
    if (!content) return;
    const names = state.playerNames || msg.playerNames || {};
    const players = msg.players || Object.keys(msg.sensors || {});

    // Keep existing grid mounted for 60 Hz rAF smoothing; only rebuild if player cards are missing.
    const existingGrid = content.querySelector('.sl-tv-grid');
    const allMounted = existingGrid && players.every(id => {
      const safeId = window.CSS?.escape ? CSS.escape(id) : id;
      return !!existingGrid.querySelector(`.sl-tv-card[data-player-id="${safeId}"]`);
    });
    if (allMounted) {
      startRenderLoop();
      return;
    }

    content.innerHTML = `
      <div class="sl-tv">
        <div class="sl-tv-header">
          <span class="sl-tv-title">📱 Sensor Lab — Live Phone Orientation & Telemetry</span>
          <span class="sl-tv-hint">Tilt or rotate your phone · P2P WebRTC when on same LAN</span>
        </div>
        <div class="sl-tv-grid">
          ${players.map(id => renderPlayerCard(id, activeSnap(id), names)).join('')}
        </div>
      </div>
    `;

    startRenderLoop();
    if (!slAgeTimer) {
      slAgeTimer = setInterval(refreshAges, 200);
    }
  }

  SH.registerGame('sensor-lab', {
    render: renderSensorLabTv,
    onRtcSignal: handleRtcSignal,
    onLeave() {
      slLastMsg = null;
      stopRenderLoop();
      p2pSnaps.clear();
      playerState.clear();
      for (const { pc } of peers.values()) {
        try { pc.close(); } catch {}
      }
      peers.clear();
      if (slAgeTimer) {
        clearInterval(slAgeTimer);
        slAgeTimer = null;
      }
    },
  });
})();
