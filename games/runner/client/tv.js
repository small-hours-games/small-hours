// After Hours Runner — TV 3D Synthwave Cosmos & Multiplayer Race
(function () {
  'use strict';

  const LANE_W = 2.2;
  const LANES = [-2, -1, 0, 1, 2];
  const WORD = ['H', 'O', 'U', 'R', 'S'];
  const WORD_COLORS = ['#38bdf8', '#a78bfa', '#fb7185', '#facc15', '#38bdf8'];

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

  // The runner is the avatar the player picked (SH.avatarRig), seen from behind:
  // tails, wings, ears and spikes are what tell the runners apart.
  function buildRunnerRig(THREE, avatar) {
    const rig = SH.avatarRig(THREE, avatar);
    const group = new THREE.Group();
    rig.group.rotation.y = Math.PI; // rigs face +z, the race goes toward -z
    rig.group.scale.setScalar(1.15);
    // A night road: let every colour glow a little, or a penguin's back is lost in the dark.
    rig.group.traverse(o => {
      if (o.material?.emissive) {
        o.material.emissive.copy(o.material.color);
        o.material.emissiveIntensity = 0.5;
      }
    });
    group.add(rig.group);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.56, 24),
      new THREE.MeshBasicMaterial({ color: rig.meta.rim, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    group.add(aura);

    return { group, legL: rig.legL, legR: rig.legR, armL: rig.armL, armR: rig.armR, aura, meta: rig.meta };
  }

  // An H-O-U-R-S pickup is one card of the logo fan, with its letter.
  function createLetterTexture(THREE, letter, color) {
    const S = SH.stage3d;
    return S.canvasTexture(THREE, 128, 200, ctx => S.drawCard(ctx, 128, 200, color, { letter }));
  }

  // Trackside sign: a logo card; the yellow one carries the moon.
  function createCardTexture(THREE, color) {
    const S = SH.stage3d;
    return S.canvasTexture(THREE, 96, 152, ctx => S.drawCard(ctx, 96, 152, color, { moon: color === S.BRAND.yellow }));
  }

  // The Smallhours crescent as a synthwave moon: yellow to rose, cut by scanlines.
  function createMoonTexture(THREE) {
    return SH.stage3d.canvasTexture(THREE, 512, 512, ctx => {
      const grad = ctx.createLinearGradient(0, 30, 0, 482);
      grad.addColorStop(0, '#fde047');
      grad.addColorStop(0.5, '#facc15');
      grad.addColorStop(1, '#fb7185');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(256, 256, 228, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(256 + 107, 256 - 91, 192, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) ctx.fillRect(0, 300 + i * 30, 512, 5 + i * 2.6);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  // A city after hours on the horizon: dark blocks, a few windows lit in the card colours.
  function createSkylineTexture(THREE) {
    const S = SH.stage3d;
    const tex = S.canvasTexture(THREE, 1024, 160, ctx => {
      const rand = S.seeded(11);
      let x = 0;
      while (x < 1024) {
        const w = 26 + Math.floor(rand() * 44);
        const h = 34 + Math.floor(rand() * (rand() < 0.15 ? 110 : 62));
        ctx.fillStyle = rand() < 0.5 ? '#141f4d' : '#1a2759';
        ctx.fillRect(x, 160 - h, w + 1, h);
        for (let wy = 160 - h + 8; wy < 150; wy += 11) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) {
            if (rand() > 0.3) continue;
            ctx.fillStyle = S.FAN[Math.floor(rand() * 4)];
            ctx.globalAlpha = 0.5 + rand() * 0.5;
            ctx.fillRect(wx, wy, 4, 5);
            ctx.globalAlpha = 1;
          }
        }
        x += w;
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  function createGlowTexture(THREE) {
    return SH.stage3d.canvasTexture(THREE, 8, 128, ctx => {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(167, 139, 250, 0)');
      grad.addColorStop(0.6, 'rgba(167, 139, 250, 0.3)');
      grad.addColorStop(1, 'rgba(251, 113, 133, 0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 128);
    });
  }

  // Gate banner: Night Navy, the card colours along both edges, the logo twice.
  function createArchTexture(THREE) {
    const S = SH.stage3d;
    return S.canvasTexture(THREE, 1024, 96, (ctx, art) => {
      ctx.fillStyle = S.BRAND.navy;
      ctx.fillRect(0, 0, 1024, 96);
      S.drawFanStrip(ctx, 0, 0, 1024, 9, 2);
      S.drawFanStrip(ctx, 0, 87, 1024, 9, 2);
      if (!art.logo) return;
      ctx.drawImage(art.logo, 130, 18, 262, 60);
      ctx.drawImage(art.logo, 632, 18, 262, 60);
    });
  }

  // Barrier front: rose hazard stripes on navy.
  function createHazardTexture(THREE) {
    const S = SH.stage3d;
    return S.canvasTexture(THREE, 128, 64, ctx => {
      ctx.fillStyle = S.BRAND.navy;
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = S.BRAND.rose;
      for (let x = -64; x < 128; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 64);
        ctx.lineTo(x + 16, 64);
        ctx.lineTo(x + 80, 0);
        ctx.lineTo(x + 64, 0);
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  function spawnRunnerSparks(x, y, z, colorHex) {
    threeApp?.sparks.burst({ x, y, z }, colorHex, 9, 8, 5, 12);
  }

  // Barriers, gems and letter cards are reused: a long race allocates nothing new.
  function takeMesh(kind) {
    const pool = threeApp.pools[kind];
    const mesh = pool.free.pop() || pool.make();
    mesh.visible = true;
    return mesh;
  }

  function giveMesh(kind, mesh) {
    mesh.visible = false;
    threeApp.pools[kind].free.push(mesh);
  }

  function initThreeScene(THREE, container, msg) {
    const S = SH.stage3d;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1530);
    scene.fog = new THREE.FogExp2(0x0b1530, 0.013);

    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 170);
    camera.position.set(0, 5.4, 8.2);
    camera.lookAt(0, 1.0, -24);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    S.fit(renderer, camera, container);

    scene.add(new THREE.AmbientLight(0xe0e7ff, 1.5));
    const dir = new THREE.DirectionalLight(0xfb7185, 1.4);
    dir.position.set(6, 16, 10);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fill.position.set(-8, 10, 6);
    scene.add(fill);

    // Horizon, back to front: glow, the crescent moon, the city. None of them fogs or writes depth.
    function backdrop(tex, w, h, y, z, order) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
      );
      m.position.set(0, y, z);
      m.renderOrder = order;
      scene.add(m);
    }
    backdrop(createGlowTexture(THREE), 340, 44, 22, -122, 1);
    backdrop(createMoonTexture(THREE), 34, 34, 25, -118, 2);
    backdrop(createSkylineTexture(THREE), 320, 26, 13, -114, 3);

    // Highway floor + neon grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_W * 5.6, 160),
      new THREE.MeshLambertMaterial({ color: 0x111c44 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -60);
    scene.add(floor);

    const grid = new THREE.GridHelper(120, 48, 0x38bdf8, 0xa78bfa);
    grid.position.set(0, 0.02, -50);
    scene.add(grid);

    // Lane divider lines: sky between lanes, rose on the road edge
    const laneMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.68 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfb7185 });
    const laneGeo = new THREE.PlaneGeometry(0.08, 150);
    const edgeGeo = new THREE.PlaneGeometry(0.16, 150);
    for (let i = -2.5; i <= 2.5; i += 1) {
      const edge = Math.abs(i) === 2.5;
      const strip = new THREE.Mesh(edge ? edgeGeo : laneGeo, edge ? edgeMat : laneMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(i * LANE_W, 0.03, -60);
      scene.add(strip);
    }

    // Trackside: the logo's four cards as signs, and a Smallhours gate every fifth row.
    const rows = [];
    const cardMats = S.FAN.map(col => new THREE.MeshBasicMaterial({ map: createCardTexture(THREE, col), alphaTest: 0.5, side: THREE.DoubleSide }));
    const cardGeo = new THREE.PlaneGeometry(1.5, 2.38);
    const postGeo = new THREE.BoxGeometry(0.14, 2.2, 0.14);
    const postMat = new THREE.MeshBasicMaterial({ color: 0x34467a });
    const gatePostGeo = new THREE.BoxGeometry(0.3, 8, 0.3);
    const gatePostMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const archGeo = new THREE.PlaneGeometry(LANE_W * 6.4, 1.32);
    const archMat = new THREE.MeshBasicMaterial({ map: createArchTexture(THREE) });
    const sideX = LANE_W * 3.25;
    for (let i = 0; i < 10; i++) {
      const parts = [];
      const put = (geo, mat, x, y, turn) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, 0);
        if (turn) m.rotation.y = turn;
        scene.add(m);
        parts.push(m);
      };
      if (i % 5 === 0) {
        put(gatePostGeo, gatePostMat, -LANE_W * 3.05, 4, 0);
        put(gatePostGeo, gatePostMat, LANE_W * 3.05, 4, 0);
        put(archGeo, archMat, 0, 7.5, 0);
      } else {
        put(postGeo, postMat, -sideX, 1.1, 0);
        put(postGeo, postMat, sideX, 1.1, 0);
        put(cardGeo, cardMats[i % 4], -sideX, 3.3, 0.35);
        put(cardGeo, cardMats[(i + 2) % 4], sideX, 3.3, -0.35);
      }
      rows.push({ parts, z: -i * 12 });
    }

    // Starfield
    const starPos = [];
    for (let i = 0; i < 260; i++) {
      starPos.push((Math.random() - 0.5) * 200, Math.random() * 60 + 18, -100 - Math.random() * 10);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe0e7ff, size: 0.5, fog: false })));

    // Pools for everything that scrolls down the road
    const hazardMat = new THREE.MeshBasicMaterial({ map: createHazardTexture(THREE) });
    const barGeo = new THREE.BoxGeometry(LANE_W * 0.78, 1.1, 0.5);
    const capGeo = new THREE.BoxGeometry(LANE_W * 0.86, 0.2, 0.6);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const gemGeo = new THREE.OctahedronGeometry(0.45, 0);
    const gemMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.6 });
    const letterGeo = new THREE.PlaneGeometry(0.96, 1.5);
    const letterMats = WORD.map((ch, idx) => new THREE.MeshBasicMaterial({
      map: createLetterTexture(THREE, ch, WORD_COLORS[idx]), alphaTest: 0.5, side: THREE.DoubleSide,
    }));
    const pool = make => ({ free: [], make: () => { const m = make(); scene.add(m); return m; } });
    const pools = {
      barrier: pool(() => {
        const group = new THREE.Group();
        const bar = new THREE.Mesh(barGeo, hazardMat);
        bar.position.y = 0.55;
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 1.2;
        group.add(bar, cap);
        return group;
      }),
      gem: pool(() => new THREE.Mesh(gemGeo, gemMat)),
      letter: pool(() => new THREE.Mesh(letterGeo, letterMats[0])),
    };

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

    const sparks = S.createSparkPool(THREE, scene, 36, new THREE.OctahedronGeometry(0.11, 0));
    threeApp = { THREE, scene, camera, renderer, grid, rows, sparks, pools, letterMats };
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
      if (threeApp) S.fit(threeApp.renderer, threeApp.camera, container);
    };
    window.addEventListener('resize', resizeHandler);
  }

  function spawnRow(z) {
    if (!threeApp || !sim) return;

    // Pick 1–3 lanes for barriers, leaving at least 2 lanes clear
    const shuffled = [...LANES].sort(() => Math.random() - 0.5);
    const barrierCount = Math.min(3, 1 + Math.floor(sim.distance / 450));
    const blocked = new Set(shuffled.slice(0, barrierCount));

    for (const lane of blocked) {
      const mesh = takeMesh('barrier');
      mesh.position.set(lane * LANE_W, 0, z);
      sim.items.push({ type: 'barrier', lane, z, mesh, active: true });
    }

    // Spawn a gem or H-O-U-R-S letter in an open lane
    const open = LANES.filter(l => !blocked.has(l));
    if (open.length) {
      const lane = open[Math.floor(Math.random() * open.length)];
      if (Math.random() < 0.24) {
        const idx = sim.nextLetterIdx % WORD.length;
        sim.nextLetterIdx += 1;
        const mesh = takeMesh('letter');
        mesh.material = threeApp.letterMats[idx];
        mesh.position.set(lane * LANE_W, 1.25, z);
        sim.items.push({ type: 'letter', letterIdx: idx, lane, z, mesh, active: true });
      } else {
        const mesh = takeMesh('gem');
        mesh.position.set(lane * LANE_W, 1.0, z);
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

      // Scroll the grid, the trackside cards and the gates
      threeApp.grid.position.z = ((threeApp.grid.position.z + dz) % 2.5) - 50;
      for (const row of threeApp.rows) {
        row.z += dz;
        if (row.z > 12) row.z -= 120;
        for (const part of row.parts) part.position.z = row.z;
      }

      threeApp.sparks.update(dt);

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
          giveMesh(it.type, it.mesh);
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

        // Smooth lane X + jump Y + tilt lean + arm/leg stride
        const targetX = r.lane * LANE_W;
        const dx = targetX - r.x;
        r.x += dx * Math.min(1, dt * 24);
        if (r.jumping) {
          r.y += r.vy * dt;
          r.vy -= 29 * dt;
          if (r.y <= 0) { r.y = 0; r.vy = 0; r.jumping = false; }
        }
        r.runPhase += dt * (sim.speed * 0.65);
        r.rig.legL.rotation.x = Math.sin(r.runPhase) * 0.72;
        r.rig.legR.rotation.x = -Math.sin(r.runPhase) * 0.72;
        if (r.rig.armL) r.rig.armL.rotation.x = -Math.sin(r.runPhase) * 0.65;
        if (r.rig.armR) r.rig.armR.rotation.x = Math.sin(r.runPhase) * 0.65;
        r.rig.group.rotation.z = Math.max(-0.28, Math.min(0.28, -dx * 0.14));
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
              spawnRunnerSparks(r.x, r.y + 0.9, 0, 0xfb7185);
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
            spawnRunnerSparks(r.x, r.y + 1.0, 0, 0x38bdf8);
            window.SH_RUNNER_AUDIO?.gem();
            sendToPhone(r.id, { type: 'haptic', kind: 'gem' });
          } else if (it.type === 'letter') {
            it.active = false;
            r.score += 250;
            spawnRunnerSparks(r.x, r.y + 1.1, 0, 0xfacc15);
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
    const sp = document.getElementById('rnSpeedText');
    if (sp) sp.textContent = `${Math.round(sim.speed * 4)} KM/H · ${Math.round(sim.distance)} M`;

    for (const r of Object.values(sim.runners)) {
      if (!r.hud) {
        const card = document.querySelector(`.rn-runner-card[data-runner-id="${r.id}"]`);
        r.hud = {
          card,
          lives: card ? [...card.querySelectorAll('.rn-rc-lives b')] : [],
          gems: card?.querySelector('.rn-rc-gems'),
          word: card ? [...card.querySelectorAll('.rn-rc-word i')] : [],
          score: card?.querySelector('.rn-rc-score'),
          dot: document.querySelector(`.rn-radar-dot[data-runner-id="${r.id}"]`),
          sig: '',
        };
      }
      const hud = r.hud;
      // Lives, gems and letters change rarely: touch the DOM only when they do.
      const sig = `${r.alive}|${r.lives}|${r.gems}|${r.letters}`;
      if (sig !== hud.sig) {
        hud.sig = sig;
        hud.card?.classList.toggle('out', !r.alive);
        hud.lives.forEach((el, i) => el.classList.toggle('lost', i >= r.lives));
        if (hud.gems) hud.gems.textContent = `◆ ${r.gems}`;
        hud.word.forEach((el, i) => el.classList.toggle('got', i < r.letters));
      }
      if (hud.score) hud.score.textContent = String(Math.round(r.score));
      if (hud.dot) {
        hud.dot.style.display = r.alive ? 'block' : 'none';
        hud.dot.style.left = `${(50 + (r.x / (LANE_W * 2.5)) * 42).toFixed(1)}%`;
        hud.dot.style.bottom = `${(10 + r.y * 12).toFixed(1)}px`;
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
        const avatar = avatarFor(id, msg);
        const svg = SH.avatarSvg ? SH.avatarSvg(avatar, { size: 40 }) : '';
        const rim = SH.avatarMeta ? SH.avatarMeta(avatar).rim : '#38bdf8';
        return `
          <div class="rn-runner-card" data-runner-id="${escapeHtml(id)}" style="--rn-c:${rim}">
            <span class="rn-avatar">${svg}</span>
            <div class="rn-rc-main">
              <div class="rn-rc-name">${escapeHtml(nameFor(id, msg))}</div>
              <div class="rn-rc-meta">
                <span class="rn-rc-lives"><b>♥</b><b>♥</b><b>♥</b></span>
                <span class="rn-rc-gems">◆ 0</span>
                <span class="rn-rc-word">${WORD.map(ch => `<i>${ch}</i>`).join('')}</span>
              </div>
            </div>
            <div class="rn-rc-score">0</div>
          </div>
        `;
      }).join('');

      const dotsHtml = (msg.players || []).map(id => {
        const meta = SH.avatarMeta ? SH.avatarMeta(avatarFor(id, msg)) : { rim: '#38bdf8' };
        return `<span class="rn-radar-dot" data-runner-id="${escapeHtml(id)}" style="background:${meta.rim};left:50%"></span>`;
      }).join('');

      content.innerHTML = `
        <div class="rn-tv">
          <div class="rn-hud-top">
            <div class="rn-runners-row">${cardsHtml}</div>
            <div id="rnSpeedPill" class="rn-speed-pill"><img src="/images/smallhours-logo.svg" alt="Smallhours" class="rn-brand-logo" /><span id="rnSpeedText">84 KM/H · 0 M</span></div>
          </div>
          <div class="rn-stage-wrap">
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
        banner.textContent = `${nameFor(msg.winner, msg)} wins the night race!`;
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
    SH.stage3d.dispose(threeApp);
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
      const scores = msg.scores || {};
      const out = id => msg.stats?.[id]?.alive === false;
      const ids = (msg.players || Object.keys(scores)).slice().sort((a, b) => (out(a) - out(b)) || ((scores[b] || 0) - (scores[a] || 0)));
      const entries = ids.map((id, i) => ({
        id,
        name: names[id] || nameFor(id, msg),
        valueText: `${scores[id] || 0} p`,
        rank: i + 1,
        isOut: out(id),
      }));
      return { entries, roundLabel: 'Night Race' };
    },
  });
})();
