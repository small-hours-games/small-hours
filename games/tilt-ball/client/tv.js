// Tilt-Ball Arena on the TV: 60 FPS Canvas 2D bumper marbles + WebRTC P2P inputs.

(function () {
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf'];
  const W = 900;
  const H = 640;
  const CX = W / 2;
  const CY = H / 2;
  const START_R = 290;
  const MIN_R = 105;
  const MARBLE_R = 30;

  const peers = new Map();
  const p2pTilts = new Map();
  let sim = null;
  let rafId = null;
  let lastMsg = null;
  let roundReported = 0;
  let nextRoundTimer = null;
  let countdownTimer = null;
  let countdownValue = 0;

  function getAvatar(id) {
    if (String(id).startsWith('bot_')) {
      return (SH.aiPersona(id) || {}).avatar || '🤖';
    }
    return (state.playerAvatars || {})[id]
      || (state.players || []).find(p => p.playerId === id)?.avatar
      || (lastMsg?.playerAvatars || {})[id]
      || '👤';
  }

  function initRoundSim(msg) {
    const players = msg.players || [];
    const n = players.length || 1;
    const spawnR = Math.min(180, START_R * 0.62);
    const marbles = players.map((id, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        id,
        x: CX + Math.cos(ang) * spawnR,
        y: CY + Math.sin(ang) * spawnR,
        vx: 0,
        vy: 0,
        color: COLORS[i % COLORS.length],
        alive: true,
        fallScale: 1,
        boosted: false,
        trail: [],
        botNextThinkAt: 0,
        botInput: { x: 0, y: 0, boost: 0 },
        botBoostUntil: 0,
        botBoostCooldownUntil: 0,
        botWander: (Math.random() - 0.5) * 0.5,
      };
    });
    sim = {
      round: msg.round,
      arenaR: START_R,
      startedAt: performance.now(),
      marbles,
      elimOrder: [],
      sparks: [],
      banner: '',
    };
  }

  function spawnSparks(x, y, color, count) {
    if (!sim) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      sim.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }

  function steerBot(m) {
    const now = performance.now();
    if (now < m.botNextThinkAt) {
      return {
        x: m.botInput.x,
        y: m.botInput.y,
        boost: now < m.botBoostUntil ? 1 : 0,
      };
    }
    m.botNextThinkAt = now + 190 + Math.random() * 120;
    m.botWander += (Math.random() - 0.5) * 0.35;
    m.botWander = Math.max(-0.45, Math.min(0.45, m.botWander));

    const dxCenter = CX - m.x;
    const dyCenter = CY - m.y;
    const distCenter = Math.hypot(dxCenter, dyCenter) || 1;
    let tx;
    let ty;
    let wantBoost = false;

    if (distCenter > sim.arenaR * 0.76) {
      // Recover toward center with human-like imperfection.
      const baseAng = Math.atan2(dyCenter, dxCenter) + m.botWander * 0.6;
      const power = 0.72;
      tx = Math.cos(baseAng) * power;
      ty = Math.sin(baseAng) * power;
      wantBoost = distCenter > sim.arenaR * 0.9 && Math.random() < 0.4;
    } else {
      let nearest = null;
      let bestD = Infinity;
      for (const o of sim.marbles) {
        if (o === m || !o.alive) continue;
        const d = Math.hypot(o.x - m.x, o.y - m.y);
        if (d < bestD) { bestD = d; nearest = o; }
      }
      if (!nearest) {
        tx = (dxCenter / distCenter) * 0.45;
        ty = (dyCenter / distCenter) * 0.45;
      } else {
        const baseAng = Math.atan2(nearest.y - m.y, nearest.x - m.x) + m.botWander;
        const power = 0.65;
        tx = Math.cos(baseAng) * power + (dxCenter / distCenter) * 0.14;
        ty = Math.sin(baseAng) * power + (dyCenter / distCenter) * 0.14;
        wantBoost = bestD < 95 && Math.random() < 0.28;
      }
    }

    if (wantBoost && now >= m.botBoostCooldownUntil) {
      m.botBoostUntil = now + 350;
      m.botBoostCooldownUntil = now + 3200;
    }
    m.botInput = { x: tx, y: ty };
    return {
      x: tx,
      y: ty,
      boost: now < m.botBoostUntil ? 1 : 0,
    };
  }

  function stepPhysics(dt) {
    if (!sim || !lastMsg || lastMsg.phase !== 'playing') return;
    const elapsed = (performance.now() - sim.startedAt) / 1000;
    sim.arenaR = Math.max(MIN_R, START_R - elapsed * 7.2);

    for (const m of sim.marbles) {
      if (!m.alive) {
        m.fallScale = Math.max(0, m.fallScale - dt * 2.5);
        continue;
      }
      let input;
      if (m.id.startsWith('bot_')) {
        input = steerBot(m);
      } else {
        const p2p = p2pTilts.get(m.id);
        input = (p2p && Date.now() - p2p.at < 1200) ? p2p : (lastMsg.tilts?.[m.id] || { x: 0, y: 0, boost: 0 });
      }
      const accel = input.boost ? 1450 : 900;
      m.boosted = !!input.boost;
      m.vx += (input.x || 0) * accel * dt;
      m.vy += (input.y || 0) * accel * dt;
      m.vx *= Math.pow(0.28, dt);
      m.vy *= Math.pow(0.28, dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 10) m.trail.shift();

      if (Math.hypot(m.x - CX, m.y - CY) > sim.arenaR + MARBLE_R * 0.35) {
        m.alive = false;
        sim.elimOrder.push(m.id);
        spawnSparks(m.x, m.y, m.color, 18);
        audio.play('draw');
      }
    }

    // Elastic marble-to-marble collisions.
    for (let i = 0; i < sim.marbles.length; i++) {
      const a = sim.marbles[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < sim.marbles.length; j++) {
        const b = sim.marbles[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = MARBLE_R * 2;
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot > 0) {
            const impulse = dot * 1.18;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, '#fff', 6);
            audio.play('place');
          }
        }
      }
    }

    sim.sparks = sim.sparks.filter(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.life -= dt * 2.2;
      return s.life > 0;
    });

    const alive = sim.marbles.filter(m => m.alive);
    if (alive.length <= 1 && roundReported !== sim.round) {
      roundReported = sim.round;
      const winnerId = alive[0]?.id || sim.elimOrder[sim.elimOrder.length - 1] || null;
      const names = state.playerNames || lastMsg.playerNames || {};
      sim.banner = winnerId ? `🏆 ${names[winnerId] || winnerId} wins Round ${sim.round}!` : 'Draw!';
      audio.play('win');

      const humanId = (lastMsg.players || []).find(id => !id.startsWith('bot_'));
      if (humanId) {
        send({ type: 'RTC_SIGNAL', toPlayerId: humanId, signal: { tbRoundEnd: { round: sim.round, winnerId, elimOrder: sim.elimOrder } } });
      }
    }
  }

  function drawArena() {
    const canvas = document.getElementById('tbCanvas');
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    const names = state.playerNames || lastMsg?.playerNames || {};

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    // Outer danger void
    const voidGrad = ctx.createRadialGradient(CX, CY, sim.arenaR * 0.7, CX, CY, START_R + 60);
    voidGrad.addColorStop(0, 'rgba(14, 165, 233, 0.14)');
    voidGrad.addColorStop(1, 'rgba(239, 68, 68, 0.08)');
    ctx.fillStyle = voidGrad;
    ctx.fillRect(0, 0, W, H);

    // Arena platform
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, sim.arenaR, 0, Math.PI * 2);
    const platGrad = ctx.createRadialGradient(CX, CY, 10, CX, CY, sim.arenaR);
    platGrad.addColorStop(0, '#1e293b');
    platGrad.addColorStop(0.82, '#0f172a');
    platGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = platGrad;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = sim.arenaR < 155 ? '#ef4444' : '#38bdf8';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.restore();

    // Inner ring guides
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 2;
    for (const r of [sim.arenaR * 0.35, sim.arenaR * 0.7]) {
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trails & Marbles
    for (const m of sim.marbles) {
      if (m.fallScale <= 0.05) continue;
      for (let i = 0; i < m.trail.length; i++) {
        const pt = m.trail[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, MARBLE_R * (i / m.trail.length) * 0.65 * m.fallScale, 0, Math.PI * 2);
        ctx.fillStyle = m.color + '28';
        ctx.fill();
      }
      const r = MARBLE_R * m.fallScale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      const orbGrad = ctx.createRadialGradient(m.x - r * 0.25, m.y - r * 0.25, r * 0.15, m.x, m.y, r);
      orbGrad.addColorStop(0, '#334155');
      orbGrad.addColorStop(0.7, '#0f172a');
      orbGrad.addColorStop(1, m.color);
      ctx.fillStyle = orbGrad;
      ctx.shadowColor = m.boosted ? '#facc15' : m.color;
      ctx.shadowBlur = m.boosted ? 28 : 16;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = m.boosted ? '#fef08a' : m.color;
      ctx.stroke();
      ctx.restore();

      // Render player/bot avatar cleanly centered inside the marble.
      const av = getAvatar(m.id);
      const avSize = Math.max(12, Math.round(r * 1.12));
      ctx.save();
      ctx.font = `${avSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 4;
      ctx.fillText(av, m.x, m.y + 1);
      ctx.restore();

      if (m.alive) {
        const label = (names[m.id] || m.id).slice(0, 12);
        const readyTag = lastMsg?.phase === 'ready' ? (lastMsg.ready?.[m.id] ? ' ✅' : ' ⏳') : '';
        ctx.save();
        ctx.font = '700 13px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
        ctx.strokeText(label + readyTag, m.x, m.y - r - 6);
        ctx.fillStyle = lastMsg?.phase === 'ready' && lastMsg.ready?.[m.id] ? '#86efac' : '#f8fafc';
        ctx.fillText(label + readyTag, m.x, m.y - r - 6);
        ctx.restore();
      }
    }

    // Sparks
    for (const s of sim.sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (lastMsg?.phase === 'ready') {
      const readyCount = (lastMsg.players || []).filter(id => lastMsg.ready?.[id]).length;
      const total = (lastMsg.players || []).length;
      const msgText = lastMsg.allReady
        ? 'Everyone Ready! Press 🚀 Start Countdown on a phone!'
        : `Round ${lastMsg.round}: Waiting for Ready (${readyCount}/${total})`;
      ctx.save();
      ctx.fillStyle = 'rgba(11, 21, 48, 0.88)';
      ctx.fillRect(CX - 300, CY - 34, 600, 68);
      ctx.strokeStyle = lastMsg.allReady ? '#facc15' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(CX - 300, CY - 34, 600, 68);
      ctx.font = '800 21px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = lastMsg.allReady ? '#fef08a' : '#e0f2fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msgText, CX, CY);
      ctx.restore();
    } else if (lastMsg?.phase === 'countdown' && countdownValue > 0) {
      ctx.save();
      ctx.font = '900 120px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 32;
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(String(countdownValue), CX, CY);
      ctx.fillStyle = '#fef08a';
      ctx.fillText(String(countdownValue), CX, CY);
      ctx.restore();
    } else if (sim.banner) {
      ctx.fillStyle = 'rgba(11, 21, 48, 0.86)';
      ctx.fillRect(CX - 250, CY - 34, 500, 68);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(CX - 250, CY - 34, 500, 68);
      ctx.font = '800 24px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sim.banner, CX, CY);
    }
  }

  function loop(prevTs) {
    rafId = requestAnimationFrame(now => {
      const dt = Math.min(0.05, (now - prevTs) / 1000);
      stepPhysics(dt);
      drawArena();
      if (rafId !== null) loop(now);
    });
  }

  async function handleRtcSignal(msg) {
    const id = msg.fromPlayerId;
    if (!id || !msg.signal || typeof RTCPeerConnection === 'undefined') return;
    let entry = peers.get(id);
    if (msg.signal.sdp?.type === 'offer') {
      if (entry) { try { entry.pc.close(); } catch {} }
      const pc = new RTCPeerConnection(RTC_CFG);
      entry = { pc };
      peers.set(id, entry);
      pc.onicecandidate = e => { if (e.candidate) send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { candidate: e.candidate } }); };
      pc.ondatachannel = e => {
        e.channel.onmessage = ev => {
          try {
            const d = JSON.parse(ev.data);
            p2pTilts.set(id, { x: d.x || 0, y: d.y || 0, boost: d.boost || 0, at: Date.now() });
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
      try { await entry.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate)); } catch {}
    }
  }

  function renderTiltBallTv(msg) {
    const prevPhase = lastMsg?.phase;
    const prevRound = lastMsg?.round;
    lastMsg = msg;

    const content = document.getElementById('gameContent');
    if (!content) return;
    if (!content.querySelector('#tbCanvas')) {
      content.innerHTML = `
        <div class="tb-tv">
          <div class="tb-tv-bar">
            <span class="tb-tv-badge" id="tbTvRound">Round ${msg.round}/${msg.maxRounds}</span>
            <span class="tb-tv-hint">Tilt your phone to knock rivals off the shrinking ring!</span>
          </div>
          <canvas id="tbCanvas" width="${W}" height="${H}"></canvas>
        </div>
      `;
    }
    const badge = document.getElementById('tbTvRound');
    if (badge) badge.textContent = msg.phase === 'finished' ? 'Final Results' : `Round ${msg.round}/${msg.maxRounds}`;

    if (!sim || (msg.phase === 'ready' && (prevPhase !== 'ready' || prevRound !== msg.round))) {
      roundReported = 0;
      clearTimeout(nextRoundTimer);
      clearInterval(countdownTimer);
      countdownValue = 0;
      initRoundSim(msg);
    }

    if (msg.phase === 'countdown' && prevPhase !== 'countdown') {
      clearInterval(countdownTimer);
      countdownValue = 3;
      audio.play('place');
      countdownTimer = setInterval(() => {
        countdownValue -= 1;
        if (countdownValue > 0) {
          audio.play('place');
        } else {
          clearInterval(countdownTimer);
          countdownTimer = null;
          audio.play('win');
          const humanId = (lastMsg?.players || []).find(id => !id.startsWith('bot_'));
          if (humanId) send({ type: 'RTC_SIGNAL', toPlayerId: humanId, signal: { tbBeginRound: true } });
        }
      }, 750);
    }

    if (msg.phase === 'playing' && prevPhase !== 'playing' && sim) {
      sim.startedAt = performance.now();
    }

    if (msg.phase === 'round_over' && prevPhase !== 'round_over') {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = setTimeout(() => {
        const humanId = (lastMsg?.players || []).find(id => !id.startsWith('bot_'));
        if (humanId) send({ type: 'RTC_SIGNAL', toPlayerId: humanId, signal: { tbNextRound: true } });
      }, 3200);
    }

    if (msg.phase === 'finished' && sim) {
      const names = state.playerNames || msg.playerNames || {};
      const top = [...(msg.players || [])].sort((a, b) => (msg.scores?.[b] || 0) - (msg.scores?.[a] || 0))[0];
      sim.banner = top ? `🏆 ${names[top] || top} wins Tilt-Ball Arena!` : 'Game Over!';
    }

    if (rafId === null) loop(performance.now());
  }

  SH.registerGame('tilt-ball', {
    render: renderTiltBallTv,
    onRtcSignal: handleRtcSignal,
    scoreboard(msg, { names }) {
      const scores = msg.scores || {};
      return {
        roundLabel: `Round ${msg.round || 1}/${msg.maxRounds || 3}`,
        entries: Object.keys(scores).sort((a, b) => scores[b] - scores[a]).map((id, i) => ({
          id,
          name: names[id] || id,
          valueText: (scores[id] || 0) + ' pts',
          rank: i + 1,
        })),
      };
    },
    onLeave() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      clearTimeout(nextRoundTimer);
      clearInterval(countdownTimer);
      countdownTimer = null;
      countdownValue = 0;
      sim = null;
      lastMsg = null;
      roundReported = 0;
      p2pTilts.clear();
      for (const { pc } of peers.values()) { try { pc.close(); } catch {} }
      peers.clear();
    },
  });
})();
