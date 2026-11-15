// Sensor Lab on the TV: live 3D phone orientation model & P2P/WS freshness per player.

(function () {
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let slAgeTimer = null;
  let slLastMsg = null;
  const peers = new Map();     // playerId -> { pc, dc }
  const p2pSnaps = new Map();  // playerId -> latest P2P snapshot + receivedAt

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

  function patchCard(id, snap) {
    const safeId = window.CSS?.escape ? CSS.escape(id) : id;
    const card = document.querySelector(`.sl-tv-card[data-player-id="${safeId}"]`);
    if (!card) return false;
    const orient = snap?.orient || { alpha: 0, beta: 0, gamma: 0 };
    const fresh = freshnessBadge(snap);
    const g = gForceTotal(snap);
    const horizonX = Math.max(-28, Math.min(28, (orient.gamma || 0) * 0.45));
    const horizonY = Math.max(-28, Math.min(28, (orient.beta || 0) * 0.45));

    const phone = card.querySelector('.sl-phone-3d');
    if (phone) {
      phone.classList.toggle('sl-p2p', snap?.transport === 'p2p');
      phone.style.transform = `rotateX(${orient.beta}deg) rotateY(${orient.gamma}deg) rotateZ(${-orient.alpha}deg)`;
    }
    const horizon = card.querySelector('.sl-horizon');
    if (horizon) horizon.style.transform = `translate(${horizonX}px, ${horizonY}px)`;

    const freshEl = card.querySelector('.sl-fresh');
    if (freshEl) {
      freshEl.className = 'sl-fresh ' + fresh.cls;
      freshEl.textContent = fresh.text;
    }
    const metricsEl = card.querySelector('.sl-tv-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `<span>α ${orient.alpha}°</span><span>β ${orient.beta}°</span><span>γ ${orient.gamma}°</span><span>${g !== null ? g + ' m/s²' : '— m/s²'}</span>`;
    }
    const capsEl = card.querySelector('.sl-caps');
    if (capsEl) capsEl.innerHTML = capsHtml(snap);
    return true;
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
      entry = { pc, dc: null };
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
            snap.receivedAt = Date.now();
            snap.transport = 'p2p';
            p2pSnaps.set(id, snap);
            patchCard(id, snap);
          } catch {}
        };
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { sdp: pc.localDescription } });
      } catch {}
    } else if (entry && msg.signal.candidate) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
      } catch {}
    }
  }

  function renderSensorLabTv(msg) {
    slLastMsg = msg;
    const content = document.getElementById('gameContent');
    if (!content) return;
    const names = state.playerNames || msg.playerNames || {};
    const players = msg.players || Object.keys(msg.sensors || {});

    // Patch in-place if the grid is already mounted for these players (keeps 60 Hz P2P smooth).
    const existingGrid = content.querySelector('.sl-tv-grid');
    if (existingGrid && players.every(id => patchCard(id, activeSnap(id)))) {
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

    if (!slAgeTimer) {
      slAgeTimer = setInterval(refreshAges, 200);
    }
  }

  SH.registerGame('sensor-lab', {
    render: renderSensorLabTv,
    onRtcSignal: handleRtcSignal,
    onLeave() {
      slLastMsg = null;
      p2pSnaps.clear();
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
