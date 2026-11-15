// Sensor Lab on the TV: live 3D phone orientation model & sensor freshness per player.

(function () {
  let slAgeTimer = null;
  let slLastMsg = null;

  function freshnessBadge(snap) {
    if (!snap || !snap.serverTs) return { cls: 'sl-fresh-stale', text: 'NO DATA' };
    const age = Math.max(0, Date.now() - snap.serverTs);
    const hz = snap.hz || 0;
    if (age <= 350) return { cls: 'sl-fresh-live', text: `LIVE · ${hz} Hz · ${age}ms` };
    if (age <= 1500) return { cls: 'sl-fresh-slow', text: `SLOW · ${hz} Hz · ${age}ms` };
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
          <div class="sl-phone-3d" style="transform:${transform}">
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
    if (!slLastMsg || !slLastMsg.sensors) return;
    for (const id of slLastMsg.players || []) {
      const el = document.querySelector(`[data-sl-fresh="${window.CSS?.escape ? CSS.escape(id) : id}"]`);
      if (!el) continue;
      const fresh = freshnessBadge(slLastMsg.sensors[id]);
      el.className = 'sl-fresh ' + fresh.cls;
      el.textContent = fresh.text;
    }
  }

  function renderSensorLabTv(msg) {
    slLastMsg = msg;
    const content = document.getElementById('gameContent');
    if (!content) return;
    const names = state.playerNames || msg.playerNames || {};
    const players = msg.players || Object.keys(msg.sensors || {});

    content.innerHTML = `
      <div class="sl-tv">
        <div class="sl-tv-header">
          <span class="sl-tv-title">📱 Sensor Lab — Live Phone Orientation & Telemetry</span>
          <span class="sl-tv-hint">Tilt or rotate your phone to test live responsiveness</span>
        </div>
        <div class="sl-tv-grid">
          ${players.map(id => renderPlayerCard(id, msg.sensors?.[id], names)).join('')}
        </div>
      </div>
    `;

    if (!slAgeTimer) {
      slAgeTimer = setInterval(refreshAges, 200);
    }
  }

  SH.registerGame('sensor-lab', {
    render: renderSensorLabTv,
    onLeave() {
      slLastMsg = null;
      if (slAgeTimer) {
        clearInterval(slAgeTimer);
        slAgeTimer = null;
      }
    },
  });
})();
