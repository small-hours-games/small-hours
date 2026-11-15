// After Hours Runner — TV 3D Synthwave Cosmos & Multiplayer Race
(function () {
  'use strict';

  const LANE_W = 2.2;
  const LANES = [-2, -1, 0, 1, 2];
  const WORD = ['H', 'O', 'U', 'R', 'S'];
  const WORD_COLORS = ['#38bdf8', '#f43f5e', '#facc15', '#22d3ee', '#4ade80'];

  let sim = null;
  let lastMsg = null;
  let rafId = null;
  let threeApp = null;
  let resizeHandler = null;
  const rtcPeers = new Map();

  function avatarFor(id, msg) {
    if (String(id).startsWith('bot_')) {
      return (typeof SH !== 'undefined' && SH.aiPersona && (SH.aiPersona(id) || {}).avatar) || '\u{1F916}';
    }
    return (state.playerAvatars || msg?.playerAvatars || {})[id] || '\u{26A1}';
  }

  function nameFor(id, msg) {
    if (String(id).startsWith('bot_')) {
      return (typeof SH !== 'undefined' && SH.aiPersona && (SH.aiPersona(id) || {}).name) || 'Cyber Bot';
    }
    return (state.playerNames || msg?.playerNames || {})[id] || 'Runner';
  }

  function sendToPhone(playerId, payload) {
    const entry = rtcPeers.get(playerId);
    if (entry && entry.dc && entry.dc.readyState === 'open') {
      try { entry.dc.send(JSON.stringify(payload)); return true; } catch { /* ignore */ }
    }
    return false;
  }

  function setupRtcForPlayer(id) {
    if (rtcPeers.has(id) || String(id).startsWith('bot_')) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const entry = { pc, dc: null, pendingIce: [], remoteSet: false };
    rtcPeers.set(id, entry);

    const dc = pc.createDataChannel('runner-input', { ordered: false, maxRetransmits: 0 });
    entry.dc = dc;
    dc.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data);
        if (d.cmd) handleRunnerCmd(id, d.cmd);
      } catch { /* ignore */ }
    };

    pc.onicecandidate = e => {
      if (e.candidate) send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { candidate: e.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') rtcPeers.delete(id);
    };

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { sdp: pc.localDescription } }))
      .catch(() => {});
  }

  function handleRunnerCmd(playerId, cmd) {
    if (!sim || sim.finished) return;
    const r = sim.runners[playerId];
    if (!r || !r.alive) return;
    if (cmd === 'left') {
      if (r.lane > -2) { r.lane -= 1; window.SH_RUNNER_AUDIO?.lane(); }
    } else if (cmd === 'right') {
      if (r.lane < 2) { r.lane += 1; window.SH_RUNNER_AUDIO?.lane(); }
    } else if (cmd === 'jump') {
      if (!r.jumping) {
        r.jumping = true;
        r.vy = 11.2;
        window.SH_RUNNER_AUDIO?.jump();
      }
    }
  }

  function buildRunnerRig(THREE, avatar) {
    const meta = (typeof SH !== 'undefined' && SH.avatarMeta)
      ? SH.avatarMeta(avatar)
      : { bg: '#ec4899', accent: '#fbcfe8', rim: '#f472b6' };
    const group = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({
      color: meta.bg,
      emissive: meta.bg,
      emissiveIntensity: 0.28,
      roughness: 0.35,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: meta.rim,
      emissive: meta.rim,
      emissiveIntensity: 0.4,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.44, 6, 12), suitMat);
    body.position.y = 0.78;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), suitMat);
    head.position.y = 1.42;
    group.add(head);

    if (typeof SH !== 'undefined' && SH.avatarTexture) {
      const tex = SH.avatarTexture(THREE, avatar);
      const faceMat = new THREE.MeshBasicMaterial({ map: tex });
      const discB = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20), faceMat);
      discB.position.set(0, 1.42, 0.29);
      const discF = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20), faceMat);
      discF.position.set(0, 1.42, -0.29);
      discF.rotation.y = Math.PI;
      group.add(discB, discF);
    }

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.28, 4, 8);
    const legL = new THREE.Mesh(legGeo, rimMat);
    legL.position.set(-0.13, 0.26, 0);
    const legR = new THREE.Mesh(legGeo, rimMat);
    legR.position.set(0.13, 0.26, 0);
    group.add(legL, legR);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: meta.rim, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    group.add(aura);

    return { group, legL, legR, meta };
  }

  function createLetterTexture(THREE, letter, color) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f0524';
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function initThreeScene(THREE, container, msg) {
    const w = container.clientWidth || 1280;
    const h = container.clientHeight || 720;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090318);
    scene.fog = new THREE.FogExp2(0x090318, 0.014);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 160);
    camera.position.set(0, 5.4, 8.2);
    camera.lookAt(0, 1.0, -24);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xe0e7ff, 0.9));
    const dir = new THREE.DirectionalLight(0xf472b6, 1.3);
    dir.position.set(6, 16, 10);
    scene.add(dir);

    // Synthwave Horizon Sun
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(14, 32),
      new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: 0.78 })
    );
    sun.position.set(0, 10, -95);
    scene.add(sun);

    // Highway Floor + Neon Grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_W * 5.6, 160),
      new THREE.MeshStandardMaterial({ color: 0x12062b, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -60);
    scene.add(floor);

    const grid = new THREE.GridHelper(120, 48, 0x22d3ee, 0x6d28d9);
    grid.position.set(0, 0.02, -50);
    scene.add(grid);

    // Lane divider lines
    for (let i = -2.5; i <= 2.5; i += 1) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 150),
        new THREE.MeshBasicMaterial({ color: Math.abs(i) === 2.5 ? 0xec4899 : 0x38bdf8, transparent: true, opacity: 0.55 })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(i * LANE_W, 0.03, -60);
      scene.add(strip);
    }

    // Starfield
    const starPos = [];
    for (let i = 0; i < 320; i++) {
      starPos.push((Math.random() - 0.5) * 140, Math.random() * 45 + 4, -Math.random() * 130);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe0e7ff, size: 0.35 })));

    // Build Runners
    const players = msg.players || [];
    const startLanes = players.length === 1 ? [0] : players.length === 2 ? [-1, 1] : players.length === 3 ? [-2, 0, 2] : [-2, -1, 1, 2];
    const runners = {};
    players.forEach((id, idx) => {
      const rig = buildRunnerRig(THREE, avatarFor(id, msg));
      const lane = startLanes[idx % startLanes.length];
      rig.group.position.set(lane * LANE_W, 0, 0);
      scene.add(rig.group);
      runners[id] = {
        id,
        isBot: String(id).startsWith('bot_'),
        rig,
        lane,
        x: lane * LANE_W,
        y: 0,
        vy: 0,
        jumping: false,
        lives: 3,
        gems: 0,
        letters: 0,
        score: 0,
        alive: true,
        invuln: 0,
        runPhase: idx * 1.3,
      };
    });

    const letterTextures = WORD.map((ch, idx) => createLetterTexture(THREE, ch, WORD_COLORS[idx]));
    threeApp = { THREE, scene, camera, renderer, grid, letterTextures };
    sim = {
      speed: 21,
      distance: 0,
      spawnZ: -28,
      nextLetterIdx: 0,
      items: [],
      runners,
      elimOrder: [],
      finished: msg.phase === 'finished',
      hudTimer: 0,
    };

    resizeHandler = () => {
      if (!threeApp) return;
      const nw = container.clientWidth || 1280;
      const nh = container.clientHeight || 720;
      threeApp.camera.aspect = nw / nh;
      threeApp.camera.updateProjectionMatrix();
      threeApp.renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', resizeHandler);
  }

  function spawnRow(z) {
    if (!threeApp || !sim) return;
    const THREE = threeApp.THREE;

    // Pick 1–3 lanes for barriers, leaving at least 2 lanes clear
    const shuffled = [...LANES].sort(() => Math.random() - 0.5);
    const barrierCount = Math.min(3, 1 + Math.floor(sim.distance / 450));
    const blocked = new Set(shuffled.slice(0, barrierCount));

    for (const lane of blocked) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(LANE_W * 0.78, 1.35, 0.75),
        new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 0.65 })
      );
      mesh.position.set(lane * LANE_W, 0.68, z);
      threeApp.scene.add(mesh);
      sim.items.push({ type: 'barrier', lane, z, mesh, active: true });
    }

    // Spawn a gem or H-O-U-R-S letter in an open lane
    const open = LANES.filter(l => !blocked.has(l));
    if (open.length) {
      const lane = open[Math.floor(Math.random() * open.length)];
      if (Math.random() < 0.24) {
        const idx = sim.nextLetterIdx % WORD.length;
        sim.nextLetterIdx += 1;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.15, 1.15),
          new THREE.MeshBasicMaterial({ map: threeApp.letterTextures[idx], transparent: true, side: THREE.DoubleSide })
        );
        mesh.position.set(lane * LANE_W, 1.2, z);
        threeApp.scene.add(mesh);
        sim.items.push({ type: 'letter', letterIdx: idx, lane, z, mesh, active: true });
      } else {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.45, 0),
          new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 0.6 })
        );
        mesh.position.set(lane * LANE_W, 1.0, z);
        threeApp.scene.add(mesh);
        sim.items.push({ type: 'gem', lane, z, mesh, active: true });
      }
    }
  }

  function finishRace() {
    if (!sim || sim.finished || !lastMsg) return;
    sim.finished = true;
    const scores = {};
    const stats = {};
    for (const r of Object.values(sim.runners)) {
      scores[r.id] = Math.round(r.score);
      stats[r.id] = { lives: r.lives, gems: r.gems, letters: r.letters, alive: r.alive };
    }
    const ranked = Object.values(sim.runners).sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.score - a.score;
    });
    const winnerId = ranked[0]?.id || null;
    const humanId = (lastMsg.players || []).find(id => !String(id).startsWith('bot_'));
    if (humanId) {
      send({
        type: 'RTC_SIGNAL',
        toPlayerId: humanId,
        signal: { rnEnd: { winnerId, scores, stats } },
      });
    }
  }

  function stepSimulation(dt) {
    if (!sim || !threeApp) return;

    if (!sim.finished) {
      sim.speed = Math.min(38, 21 + sim.distance * 0.008);
      const dz = sim.speed * dt;
      sim.distance += dz;

      // Scroll grid
      threeApp.grid.position.z = ((threeApp.grid.position.z + dz) % 2.5) - 50;

      // Spawn rows ahead
      while (sim.spawnZ > -95) {
        spawnRow(sim.spawnZ);
        sim.spawnZ -= 16;
      }
      sim.spawnZ += dz;

      // Move items toward players
      for (let i = sim.items.length - 1; i >= 0; i--) {
        const it = sim.items[i];
        it.z += dz;
        it.mesh.position.z = it.z;
        if (it.type === 'gem' || it.type === 'letter') it.mesh.rotation.y += dt * 2.6;
        if (it.z > 10 || !it.active) {
          threeApp.scene.remove(it.mesh);
          sim.items.splice(i, 1);
        }
      }

      // Update runners
      const allRunners = Object.values(sim.runners);
      for (const r of allRunners) {
        if (!r.alive) {
          r.rig.group.visible = false;
          continue;
        }
        r.score += dz * 2.2;
        if (r.invuln > 0) r.invuln = Math.max(0, r.invuln - dt);
        r.rig.group.visible = r.invuln <= 0 || Math.floor(r.invuln * 14) % 2 === 0;

        // AI steering
        if (r.isBot) {
          const hazard = sim.items.find(it => it.active && it.type === 'barrier' && it.lane === r.lane && it.z > -14 && it.z < -1.5);
          if (hazard) {
            const safe = LANES.filter(l => Math.abs(l - r.lane) === 1 && !sim.items.some(it => it.active && it.type === 'barrier' && it.lane === l && it.z > -15 && it.z < 1));
            if (safe.length) r.lane = safe[Math.floor(Math.random() * safe.length)];
            else if (!r.jumping) { r.jumping = true; r.vy = 11.2; }
          }
        }

        // Smooth lane X + jump Y
        const targetX = r.lane * LANE_W;
        r.x += (targetX - r.x) * Math.min(1, dt * 24);
        if (r.jumping) {
          r.y += r.vy * dt;
          r.vy -= 29 * dt;
          if (r.y <= 0) { r.y = 0; r.vy = 0; r.jumping = false; }
        }
        r.runPhase += dt * (sim.speed * 0.65);
        r.rig.legL.rotation.x = Math.sin(r.runPhase) * 0.7;
        r.rig.legR.rotation.x = -Math.sin(r.runPhase) * 0.7;
        r.rig.group.position.set(r.x, r.y, 0);

        // Collisions near z = 0
        for (const it of sim.items) {
          if (!it.active || Math.abs(it.z) > 1.05) continue;
          if (Math.abs(it.lane * LANE_W - r.x) > 0.95) continue;

          if (it.type === 'barrier') {
            if (r.y < 1.1 && r.invuln <= 0) {
              it.active = false;
              r.lives -= 1;
              r.invuln = 1.4;
              window.SH_RUNNER_AUDIO?.hit();
              sendToPhone(r.id, { type: 'haptic', kind: 'hit' });
              if (r.lives <= 0) {
                r.alive = false;
                sim.elimOrder.push(r.id);
              }
            }
          } else if (it.type === 'gem') {
            it.active = false;
            r.gems += 1;
            r.score += 100;
            window.SH_RUNNER_AUDIO?.gem();
            sendToPhone(r.id, { type: 'haptic', kind: 'gem' });
          } else if (it.type === 'letter') {
            it.active = false;
            r.score += 250;
            if (r.letters < WORD.length) r.letters += 1;
            if (r.letters >= WORD.length) {
              r.score += 1000;
              r.lives = Math.min(3, r.lives + 1);
              r.letters = 0;
              window.SH_RUNNER_AUDIO?.wordComplete();
            } else {
              window.SH_RUNNER_AUDIO?.letter();
            }
            sendToPhone(r.id, { type: 'haptic', kind: 'letter' });
          }
        }
      }

      const aliveCount = allRunners.filter(r => r.alive).length;
      if (aliveCount === 0 || (allRunners.length > 1 && aliveCount <= 1)) {
        finishRace();
      }
    }

    sim.hudTimer += dt;
    if (sim.hudTimer >= 0.12) {
      sim.hudTimer = 0;
      updateHudDom();
      for (const r of Object.values(sim.runners)) {
        if (!r.isBot) {
          sendToPhone(r.id, {
            type: 'hud',
            lives: r.lives,
            gems: r.gems,
            letters: r.letters,
            score: Math.round(r.score),
            alive: r.alive,
          });
        }
      }
    }

    threeApp.renderer.render(threeApp.scene, threeApp.camera);
  }

  function updateHudDom() {
    if (!sim) return;
    const sp = document.getElementById('rnSpeedPill');
    if (sp) sp.textContent = `${Math.round(sim.speed * 4)} KM/H • ${Math.round(sim.distance)}m`;

    for (const r of Object.values(sim.runners)) {
      const card = document.querySelector(`.rn-runner-card[data-runner-id="${r.id}"]`);
      if (card) {
        card.classList.toggle('out', !r.alive);
        const metaEl = card.querySelector('.rn-rc-meta');
        if (metaEl) metaEl.textContent = `${'❤️'.repeat(Math.max(0, r.lives)) || '💀'} • 💎${r.gems} • ${WORD.slice(0, r.letters).join('') || '-'}`;
        const scoreEl = card.querySelector('.rn-rc-score');
        if (scoreEl) scoreEl.textContent = String(Math.round(r.score));
      }
      const dot = document.querySelector(`.rn-radar-dot[data-runner-id="${r.id}"]`);
      if (dot) {
        dot.style.display = r.alive ? 'block' : 'none';
        dot.style.left = `${(50 + (r.x / (LANE_W * 2.5)) * 42).toFixed(1)}%`;
        dot.style.bottom = `${(10 + r.y * 12).toFixed(1)}px`;
      }
    }
  }

  function startLoop() {
    if (rafId !== null) return;
    let lastT = performance.now();
    const tick = now => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      stepSimulation(dt);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function renderRunnerTv(msg) {
    lastMsg = msg;
    const content = document.getElementById('gameContent');
    if (!content) return;

    if (!content.querySelector('.rn-tv')) {
      const cardsHtml = (msg.players || []).map(id => {
        const svg = SH.avatarSvg ? SH.avatarSvg(avatarFor(id, msg), { size: 36 }) : '';
        return `
          <div class="rn-runner-card" data-runner-id="${escapeHtml(id)}">
            <span class="rn-avatar">${svg}</span>
            <div>
              <div class="rn-rc-name">${escapeHtml(nameFor(id, msg))}</div>
              <div class="rn-rc-meta">❤️❤️❤️ • 💎0</div>
            </div>
            <div class="rn-rc-score">0</div>
          </div>
        `;
      }).join('');

      const dotsHtml = (msg.players || []).map(id => {
        const meta = SH.avatarMeta ? SH.avatarMeta(avatarFor(id, msg)) : { rim: '#22d3ee' };
        return `<span class="rn-radar-dot" data-runner-id="${escapeHtml(id)}" style="background:${meta.rim};color:${meta.rim};left:50%"></span>`;
      }).join('');

      content.innerHTML = `
        <div class="rn-tv">
          <div class="rn-hud-top">
            <div class="rn-runners-row">${cardsHtml}</div>
            <div id="rnSpeedPill" class="rn-speed-pill">84 KM/H • 0m</div>
          </div>
          <div class="rn-stage-wrap">
            <div class="rn-parallax-stars" aria-hidden="true"></div>
            <div id="rnStage" class="rn-stage"></div>
            <div class="rn-track-radar" aria-hidden="true">
              <div class="rn-radar-lanes">${dotsHtml}</div>
            </div>
            <div id="rnWinnerBanner" class="rn-winner-banner hidden"></div>
          </div>
        </div>
      `;

      const stage = document.getElementById('rnStage');
      const loadThree = (typeof SH !== 'undefined' && SH.loadThree)
        ? SH.loadThree
        : () => (window.THREE ? Promise.resolve(window.THREE) : import('/vendor/three/three.module.min.js').then(m => (window.THREE = m)));
      loadThree().then(THREE => {
        if (!document.getElementById('rnStage')) return;
        initThreeScene(THREE, stage, msg);
        startLoop();
        (msg.players || []).forEach(setupRtcForPlayer);
      }).catch(err => {
        if (stage) stage.innerHTML = `<div style="padding:24px;color:#fda4af;font-weight:700">Failed to load 3D track: ${escapeHtml(err?.message || String(err))}</div>`;
      });
    }

    const banner = document.getElementById('rnWinnerBanner');
    if (banner) {
      if (msg.phase === 'finished' && msg.winner) {
        banner.textContent = `🏆 ${nameFor(msg.winner, msg)} wins After Hours Runner!`;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }
  }

  function cleanupRunner() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
    for (const { pc, dc } of rtcPeers.values()) {
      try { dc?.close(); pc?.close(); } catch { /* ignore */ }
    }
    rtcPeers.clear();
    if (threeApp?.renderer) threeApp.renderer.dispose();
    threeApp = null;
    sim = null;
    lastMsg = null;
  }

  SH.registerGame('runner', {
    render: renderRunnerTv,
    onLeave: cleanupRunner,
    onMute(muted) { window.SH_RUNNER_AUDIO?.setMuted(muted); },
    onRtcSignal(msg) {
      const fromId = msg.fromPlayerId;
      const sig = msg.signal;
      if (!fromId || !sig) return;
      if (sig.rnCmd) { handleRunnerCmd(fromId, sig.rnCmd); return; }
      const entry = rtcPeers.get(fromId);
      if (!entry) return;
      if (sig.sdp) {
        entry.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp))
          .then(() => {
            entry.remoteSet = true;
            for (const c of entry.pendingIce) entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            entry.pendingIce = [];
          })
          .catch(() => {});
      } else if (sig.candidate) {
        if (entry.remoteSet) entry.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
        else entry.pendingIce.push(sig.candidate);
      }
    },
    alwaysScoreboard: true,
    scoreboard(msg, { names }) {
      const entries = (msg.players || []).map(id => ({
        id,
        name: names[id] || nameFor(id, msg),
        score: msg.scores?.[id] || 0,
      }));
      return { entries, roundLabel: 'Synthwave Race' };
    },
  });
})();
