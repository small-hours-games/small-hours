// Small Hours Tennis — TV 3D Court, Physics, AI & WebRTC Host
(function () {
  'use strict';

  const COURT_W = 8.23; // Singles width
  const COURT_L = 23.77;
  const HALF_W = COURT_W / 2;
  const HALF_L = COURT_L / 2;
  const NET_H = 0.94;
  const GRAVITY = -19.5;

  let sim = null;
  let lastMsg = null;
  let rafId = null;
  let threeApp = null;
  const rtcPeers = new Map();
  let resizeHandler = null;

  function avatarFor(id, msg) {
    if (String(id).startsWith('bot_')) {
      return (typeof SH !== 'undefined' && SH.aiPersona && (SH.aiPersona(id) || {}).avatar) || '\u{1F916}';
    }
    return (state.playerAvatars || msg?.playerAvatars || {})[id] || '\u{1F3BE}';
  }

  function nameFor(id, msg) {
    if (String(id).startsWith('bot_')) {
      return (typeof SH !== 'undefined' && SH.aiPersona && (SH.aiPersona(id) || {}).name) || 'Club AI';
    }
    return (state.playerNames || msg?.playerNames || {})[id] || 'Player';
  }

  function sendToPhone(playerId, payload) {
    const entry = rtcPeers.get(playerId);
    if (entry && entry.dc && entry.dc.readyState === 'open') {
      try { entry.dc.send(JSON.stringify(payload)); return true; } catch { /* ignore */ }
    }
    return false;
  }

  function reportPointToServer(winnerId, call) {
    if (!sim || !lastMsg) return;
    sim.pointSerial += 1;
    const humanId = (lastMsg.players || []).find(id => !String(id).startsWith('bot_'));
    if (humanId) {
      send({
        type: 'RTC_SIGNAL',
        toPlayerId: humanId,
        signal: { tnPoint: { winnerId, call, serial: sim.pointSerial } },
      });
    }
  }

  function setupRtcForPlayer(id) {
    if (rtcPeers.has(id) || String(id).startsWith('bot_')) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const entry = { pc, dc: null, pendingIce: [], remoteSet: false };
    rtcPeers.set(id, entry);

    const dc = pc.createDataChannel('tennis-input', { ordered: false, maxRetransmits: 0 });
    entry.dc = dc;
    dc.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'swing') handlePlayerSwing(id, d);
        else if (d.type === 'toss') handlePlayerToss(id);
        else if (d.type === 'aim' && sim) {
          const p = sim.actors[id];
          if (p) p.aimBias = Math.max(-1, Math.min(1, Number(d.aim) || 0));
        }
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
      .then(() => {
        send({ type: 'RTC_SIGNAL', toPlayerId: id, signal: { sdp: pc.localDescription } });
      })
      .catch(() => {});
  }

  function handlePlayerToss(playerId) {
    if (!sim || sim.phase !== 'serve_wait') return;
    if (sim.serverId !== playerId) return;
    startServeToss();
  }

  function handlePlayerSwing(playerId, data) {
    if (!sim || sim.finished) return;
    const actor = sim.actors[playerId];
    if (!actor) return;

    const speed = Math.max(0.75, Math.min(1.65, Number(data.speed) || 1.15));
    const shotType = ['topspin', 'slice', 'lob', 'smash', 'flat'].includes(data.shotType) ? data.shotType : 'topspin';
    const aimX = Math.max(-1, Math.min(1, Number(data.dirX ?? actor.aimBias ?? 0)));

    actor.char.swingTimer = actor.char.swingDuration;
    actor.char.swingSide = data.side || (actor.pos.x > 0 ? 'backhand' : 'forehand');
    actor.swingWindow = 0.30;
    actor.pendingShot = { speed, shotType, aimX };

    if (sim.phase === 'serve_wait' && sim.serverId === playerId) {
      startServeToss();
      return;
    }

    if (sim.phase === 'serve_toss' && sim.serverId === playerId) {
      attemptServeHit(actor, actor.pendingShot);
      return;
    }

    if (sim.phase === 'rally') {
      tryHitBall(actor, actor.pendingShot);
    }
  }

  function startServeToss() {
    if (!sim || sim.phase !== 'serve_wait') return;
    const srv = sim.actors[sim.serverId];
    if (!srv) return;
    sim.phase = 'serve_toss';
    sim.ball.pos.set(srv.pos.x + (srv.isNear ? 0.32 : -0.32), 1.4, srv.pos.z + (srv.isNear ? -0.4 : 0.4));
    sim.ball.vel.set(0, 6.2, 0);
    sim.ball.active = true;
    window.SH_TENNIS_AUDIO?.toss();
    showCallout('SWING TO SERVE!', '');
  }

  function attemptServeHit(actor, shot) {
    if (!sim || sim.phase !== 'serve_toss') return;
    const h = sim.ball.pos.y;
    if (h < 1.1 || h > 3.6) return;
    const isSweet = h >= 2.0 && h <= 2.95;
    const dirZ = actor.isNear ? -1 : 1;
    const power = (isSweet ? 27 : 21) * shot.speed;
    const crossX = (actor.pos.x > 0 ? -2.2 : 2.2) + shot.aimX * 1.4;

    sim.ball.vel.set(crossX, isSweet ? 2.4 : 4.2, dirZ * power);
    sim.ball.lastHitter = actor.id;
    sim.ball.bounces = 0;
    sim.phase = 'rally';
    window.SH_TENNIS_AUDIO?.[isSweet ? 'smash' : 'hit'](shot.speed);
    spawnImpactSparks(sim.ball.pos, isSweet ? 0xfacc15 : 0x38bdf8);
    sendToPhone(actor.id, { type: 'haptic', kind: isSweet ? 'perfect' : 'hit' });
    showCallout(isSweet ? 'POWER SERVE!' : 'SERVE', `${Math.round(power * 6.2)} KM/H`);
  }

  function tryHitBall(actor, shot) {
    if (!sim || sim.phase !== 'rally') return false;
    if (sim.ball.lastHitter === actor.id) return false;
    const dx = sim.ball.pos.x - actor.pos.x;
    const dz = sim.ball.pos.z - actor.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.75 || sim.ball.pos.y > 3.4) return false;

    const isSweet = dist < 1.55 && sim.ball.pos.y >= 0.55 && sim.ball.pos.y <= 1.85;
    const dirZ = actor.isNear ? -1 : 1;
    let speedZ = (isSweet ? 22 : 17.5) * shot.speed;
    let vy = 5.4;
    if (shot.shotType === 'lob') { speedZ *= 0.72; vy = 10.6; }
    else if (shot.shotType === 'smash' && sim.ball.pos.y > 1.35) { speedZ *= 1.3; vy = 1.6; }
    else if (shot.shotType === 'slice') { speedZ *= 0.88; vy = 4.6; }

    const targetX = Math.max(-HALF_W + 0.5, Math.min(HALF_W - 0.5, shot.aimX * (HALF_W - 0.6)));
    const flightTime = Math.abs((dirZ * (HALF_L - 1.8) - sim.ball.pos.z) / speedZ);
    const vx = (targetX - sim.ball.pos.x) / Math.max(0.35, flightTime);

    sim.ball.vel.set(vx, vy, dirZ * speedZ);
    sim.ball.lastHitter = actor.id;
    sim.ball.bounces = 0;
    actor.swingWindow = 0;

    window.SH_TENNIS_AUDIO?.[shot.shotType === 'smash' ? 'smash' : 'hit'](shot.speed);
    spawnImpactSparks(sim.ball.pos, isSweet ? 0xfacc15 : 0x38bdf8);
    sendToPhone(actor.id, { type: 'haptic', kind: isSweet ? 'perfect' : 'hit' });

    const kmh = Math.round(Math.hypot(vx, speedZ) * 6.4);
    showCallout(isSweet ? `PERFECT ${shot.shotType.toUpperCase()}` : shot.shotType.toUpperCase(), `${kmh} KM/H`);
    return true;
  }

  function awardPoint(winnerId, call) {
    if (!sim || sim.phase === 'point_pause' || sim.finished) return;
    sim.phase = 'point_pause';
    sim.pauseTimer = 1.65;
    window.SH_TENNIS_AUDIO?.[call === 'OUT!' ? 'out' : 'point']();
    showCallout(call, `${nameFor(winnerId, lastMsg)} +POINT`);
    for (const id of Object.keys(sim.actors)) {
      sendToPhone(id, { type: 'haptic', kind: id === winnerId ? 'perfect' : 'fault' });
    }
    reportPointToServer(winnerId, call);
  }

  function showCallout(grade, detail) {
    const el = document.getElementById('tnCallout');
    if (!el) return;
    el.innerHTML = `<div class="tn-call-grade">${escapeHtml(grade)}</div>` +
      (detail ? `<div class="tn-call-detail">${escapeHtml(detail)}</div>` : '');
    el.classList.remove('hidden');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), 1400);
  }

  function spawnImpactSparks(pos, colorHex) {
    if (!threeApp) return;
    const THREE = threeApp.THREE;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 })
      );
      m.position.copy(pos);
      m.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        Math.random() * 5 + 1.5,
        (Math.random() - 0.5) * 7
      );
      m.userData.life = 0.35;
      threeApp.scene.add(m);
      threeApp.sparks.push(m);
    }
  }

  function resetForNextPoint(msg) {
    if (!sim) return;
    const p1 = msg.players[0];
    const p2 = msg.players[1];
    sim.serverId = msg.serverId || p1;
    const serveSide = (sim.pointSerial % 2 === 0) ? 1.5 : -1.5;

    if (sim.actors[p1]) {
      sim.actors[p1].pos.set(sim.serverId === p1 ? serveSide : 0, 0, HALF_L + 0.6);
      sim.actors[p1].targetX = sim.actors[p1].pos.x;
    }
    if (sim.actors[p2]) {
      sim.actors[p2].pos.set(sim.serverId === p2 ? -serveSide : 0, 0, -HALF_L - 0.6);
      sim.actors[p2].targetX = sim.actors[p2].pos.x;
    }

    sim.ball.active = false;
    sim.ball.bounces = 0;
    sim.ball.lastHitter = null;
    const srv = sim.actors[sim.serverId];
    if (srv) {
      sim.ball.pos.set(srv.pos.x + (srv.isNear ? 0.35 : -0.35), 1.15, srv.pos.z + (srv.isNear ? -0.35 : 0.35));
    }
    sim.phase = 'serve_wait';
    sim.aiServeDelay = 1.05;
  }

  function createCourtTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#163d9c');
    grad.addColorStop(0.5, '#1d4ed8');
    grad.addColorStop(1, '#163d9c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 1024);
    // Subtle acrylic court grain
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 1600; i++) {
      ctx.fillRect((i * 73) % 512, (i * 139) % 1024, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function drawLogoOnCanvas(ctx, tex, x, y, w, h) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, x, y, w, h);
      tex.needsUpdate = true;
    };
    img.src = '/images/smallhours-logo-light.svg';
  }

  function createApronTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(512, 512, 120, 512, 512, 680);
    grad.addColorStop(0, '#0c4a3e');
    grad.addColorStop(1, '#072428');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.drawImage(img, 512 - 140, 120, 280, 64);
      ctx.translate(512, 872);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, -140, -32, 280, 64);
      ctx.restore();
      tex.needsUpdate = true;
    };
    img.src = '/images/smallhours-logo-light.svg';
    return tex;
  }

  function createNetTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 128; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 64); ctx.stroke();
    }
    for (let y = 0; y <= 64; y += 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 3);
    return tex;
  }

  function createBannerTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1530';
    ctx.fillRect(0, 0, 1024, 128);
    const cols = ['#38bdf8', '#a78bfa', '#fb7185', '#facc15'];
    cols.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(i * 256, 0, 256, 8);
    });

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    drawLogoOnCanvas(ctx, tex, 140, 22, 350, 80);
    drawLogoOnCanvas(ctx, tex, 540, 22, 350, 80);
    return tex;
  }

  function spawnBounceRing(x, z, inBounds) {
    if (!threeApp) return;
    const THREE = threeApp.THREE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 20),
      new THREE.MeshBasicMaterial({
        color: inBounds ? 0xfacc15 : 0xfb7185,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    ring.userData.life = 0.42;
    threeApp.scene.add(ring);
    threeApp.bounceRings.push(ring);
  }

  function initThreeScene(THREE, container, msg) {
    const w = container.clientWidth || 1280;
    const h = container.clientHeight || 720;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1530);
    scene.fog = new THREE.Fog(0x0b1530, 38, 95);

    const camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 140);
    camera.position.set(HALF_W + 14.5, 10.2, 0);
    camera.lookAt(0, 0.7, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Night-stadium lighting
    scene.add(new THREE.HemisphereLight(0xbae6fd, 0x0b1530, 0.78));
    const sun = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sun.position.set(10, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-14, 12, -16);
    scene.add(rimLight);

    // Outer stadium apron with Smallhours baseline branding
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 46),
      new THREE.MeshStandardMaterial({ map: createApronTexture(THREE), roughness: 0.88 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.receiveShadow = true;
    scene.add(apron);

    // Inner blue hardcourt with acrylic sheen
    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_W, COURT_L),
      new THREE.MeshStandardMaterial({ map: createCourtTexture(THREE), roughness: 0.65 })
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.01;
    court.receiveShadow = true;
    scene.add(court);

    // Stadium perimeter Smallhours boards (far sideline + both baselines; near sideline open for broadcast camera)
    const bannerTex = createBannerTexture(THREE);
    const boardMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissive: 0x1e293b, emissiveIntensity: 0.35, roughness: 0.5 });
    const farSideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.5, 24), boardMat);
    farSideBoard.position.set(-(HALF_W + 4.4), 0.75, 0);
    scene.add(farSideBoard);
    for (const sz of [-1, 1]) {
      const endBoard = new THREE.Mesh(new THREE.BoxGeometry(14, 1.4, 0.25), boardMat);
      endBoard.position.set(0, 0.7, sz * (HALF_L + 4.6));
      scene.add(endBoard);
    }

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
    for (const [tx, tz] of [[-13, -18], [13, -18], [-13, 18], [13, 18]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 12, 8), poleMat);
      pole.position.set(tx, 6, tz);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.35), lampMat);
      lamp.position.set(tx, 12, tz);
      lamp.lookAt(0, 0, 0);
      scene.add(lamp);
    }

    // Court white lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    function addLine(lx, lz, lw, ll) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, ll), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(lx, 0.02, lz);
      scene.add(m);
    }
    addLine(0, HALF_L, COURT_W, 0.12);
    addLine(0, -HALF_L, COURT_W, 0.12);
    addLine(-HALF_W, 0, 0.12, COURT_L);
    addLine(HALF_W, 0, 0.12, COURT_L);
    addLine(0, 6.4, COURT_W, 0.1);
    addLine(0, -6.4, COURT_W, 0.1);
    addLine(0, 0, 0.1, 12.8);

    // Woven Net, Tape, Center Strap & Metallic Posts
    const netMesh = new THREE.Mesh(
      new THREE.BoxGeometry(COURT_W + 1.2, NET_H, 0.04),
      new THREE.MeshStandardMaterial({ map: createNetTexture(THREE), transparent: true, opacity: 0.88 })
    );
    netMesh.position.set(0, NET_H / 2, 0);
    scene.add(netMesh);
    const netTape = new THREE.Mesh(new THREE.BoxGeometry(COURT_W + 1.2, 0.08, 0.09), lineMat);
    netTape.position.set(0, NET_H, 0);
    scene.add(netTape);
    const centerStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, NET_H, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    centerStrap.position.set(0, NET_H / 2, 0);
    scene.add(centerStrap);
    for (const px of [-(HALF_W + 0.6), HALF_W + 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, NET_H + 0.14, 10), poleMat);
      post.position.set(px, (NET_H + 0.14) / 2, 0);
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      cap.position.set(px, NET_H + 0.14, 0);
      scene.add(cap);
    }

    // Ball + motion trail + shadow
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xdfff00, emissive: 0x65a30d, emissiveIntensity: 0.3, roughness: 0.35 })
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    const trailMeshes = [];
    for (let i = 0; i < 5; i++) {
      const tm = new THREE.Mesh(
        new THREE.SphereGeometry(0.14 - i * 0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xdfff00, transparent: true, opacity: 0.36 - i * 0.065 })
      );
      tm.visible = false;
      scene.add(tm);
      trailMeshes.push(tm);
    }

    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.025;
    scene.add(shadowMesh);

    // Build Small Hours 3D Characters from lobby avatars
    const actors = {};
    const players = msg.players || [];
    players.forEach((id, idx) => {
      const isNear = idx === 0;
      const char = window.SH_TENNIS_CHAR.createTennisCharacter(THREE, {
        avatar: avatarFor(id, msg),
        isNear,
      });
      char.root.rotation.y = isNear ? Math.PI : 0;
      scene.add(char.root);
      actors[id] = {
        id,
        isNear,
        isBot: String(id).startsWith('bot_'),
        char,
        pos: new THREE.Vector3(0, 0, isNear ? HALF_L + 0.6 : -HALF_L - 0.6),
        targetX: 0,
        aimBias: 0,
        swingWindow: 0,
        pendingShot: null,
      };
    });

    threeApp = { THREE, scene, camera, renderer, ballMesh, trailMeshes, trailHistory: [], shadowMesh, sparks: [], bounceRings: [] };
    sim = {
      phase: 'serve_wait',
      serverId: msg.serverId || players[0],
      pointSerial: msg.pointSerial || 0,
      pauseTimer: 0,
      aiServeDelay: 1.0,
      finished: msg.phase === 'finished',
      actors,
      ball: { pos: new THREE.Vector3(0, 1.2, HALF_L), vel: new THREE.Vector3(), active: false, bounces: 0, lastHitter: null },
    };
    resetForNextPoint(msg);

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

  function stepSimulation(dt) {
    if (!sim || !threeApp) return;
    const pIds = Object.keys(sim.actors);
    const p1 = sim.actors[pIds[0]];
    const p2 = sim.actors[pIds[1]];

    // Update sparks
    for (let i = threeApp.sparks.length - 1; i >= 0; i--) {
      const s = threeApp.sparks[i];
      s.userData.life -= dt;
      s.position.addScaledVector(s.userData.vel, dt);
      s.userData.vel.y -= 9.8 * dt;
      s.material.opacity = Math.max(0, s.userData.life / 0.35);
      if (s.userData.life <= 0) {
        threeApp.scene.remove(s);
        threeApp.sparks.splice(i, 1);
      }
    }

    // Update bounce rings
    for (let i = threeApp.bounceRings.length - 1; i >= 0; i--) {
      const r = threeApp.bounceRings[i];
      r.userData.life -= dt;
      const p = 1 - Math.max(0, r.userData.life / 0.42);
      r.scale.setScalar(1 + p * 2.4);
      r.material.opacity = Math.max(0, (1 - p) * 0.85);
      if (r.userData.life <= 0) {
        threeApp.scene.remove(r);
        threeApp.bounceRings.splice(i, 1);
      }
    }

    if (sim.phase === 'point_pause') {
      sim.pauseTimer -= dt;
      if (sim.pauseTimer <= 0 && !sim.finished && lastMsg) {
        resetForNextPoint(lastMsg);
      }
    }

    // AI & Player movement toward ball
    for (const actor of Object.values(sim.actors)) {
      if (actor.char.swingTimer > 0) {
        actor.char.swingTimer = Math.max(0, actor.char.swingTimer - dt);
        const t = 1 - actor.char.swingTimer / actor.char.swingDuration;
        const swingArc = Math.sin(t * Math.PI) * 2.1;
        actor.char.armPivot.rotation.y = actor.char.swingSide === 'backhand' ? -swingArc : swingArc;
        actor.char.armPivot.rotation.x = -0.5 - Math.sin(t * Math.PI) * 0.7;
      } else {
        actor.char.armPivot.rotation.y *= 0.85;
        actor.char.armPivot.rotation.x *= 0.85;
      }

      if (sim.phase === 'rally') {
        const ballHeadingHere = actor.isNear ? sim.ball.vel.z > 0 : sim.ball.vel.z < 0;
        if (ballHeadingHere) {
          actor.targetX = Math.max(-HALF_W + 0.3, Math.min(HALF_W - 0.3, sim.ball.pos.x));
        } else {
          actor.targetX = 0;
        }
      }
      const moveSpeed = actor.isBot ? 6.4 : 7.8;
      const diffX = actor.targetX - actor.pos.x;
      actor.pos.x += Math.sign(diffX) * Math.min(Math.abs(diffX), moveSpeed * dt);
      actor.char.root.position.copy(actor.pos);

      // AI serve & return
      if (actor.isBot && !sim.finished) {
        if (sim.phase === 'serve_wait' && sim.serverId === actor.id) {
          sim.aiServeDelay -= dt;
          if (sim.aiServeDelay <= 0) startServeToss();
        } else if (sim.phase === 'serve_toss' && sim.serverId === actor.id && sim.ball.vel.y < 0 && sim.ball.pos.y <= 2.6) {
          handlePlayerSwing(actor.id, { speed: 1.1, shotType: 'topspin', dirX: (Math.random() - 0.5) * 0.8 });
        } else if (sim.phase === 'rally' && sim.ball.lastHitter !== actor.id) {
          const dz = Math.abs(sim.ball.pos.z - actor.pos.z);
          if (dz < 1.9 && sim.ball.bounces <= 1) {
            handlePlayerSwing(actor.id, {
              speed: 1.0 + Math.random() * 0.2,
              shotType: Math.random() > 0.82 ? 'lob' : 'topspin',
              dirX: (Math.random() - 0.5) * 1.4,
            });
          }
        }
      }
    }

    // Ball physics
    if (sim.phase === 'serve_toss') {
      sim.ball.vel.y += GRAVITY * dt;
      sim.ball.pos.addScaledVector(sim.ball.vel, dt);
      if (sim.ball.pos.y <= 0.18) {
        sim.phase = 'serve_wait';
        resetForNextPoint(lastMsg || { players: pIds, serverId: sim.serverId, pointSerial: sim.pointSerial });
      }
    } else if (sim.phase === 'rally') {
      const prevZ = sim.ball.pos.z;
      sim.ball.vel.y += GRAVITY * dt;
      sim.ball.pos.addScaledVector(sim.ball.vel, dt);

      // Net collision
      if ((prevZ < 0 && sim.ball.pos.z >= 0) || (prevZ > 0 && sim.ball.pos.z <= 0)) {
        if (sim.ball.pos.y < NET_H + 0.12) {
          window.SH_TENNIS_AUDIO?.net();
          const winnerId = sim.ball.lastHitter === p1?.id ? p2?.id : p1?.id;
          if (winnerId) awardPoint(winnerId, 'NET!');
        }
      }

      // Ground bounce
      if (sim.ball.pos.y <= 0.18 && sim.ball.vel.y < 0) {
        sim.ball.pos.y = 0.18;
        sim.ball.vel.y = -sim.ball.vel.y * 0.74;
        sim.ball.bounces += 1;
        window.SH_TENNIS_AUDIO?.bounce();

        const inBounds = Math.abs(sim.ball.pos.x) <= HALF_W + 0.18 && Math.abs(sim.ball.pos.z) <= HALF_L + 0.18;
        spawnBounceRing(sim.ball.pos.x, sim.ball.pos.z, inBounds);
        if (sim.ball.bounces === 1 && !inBounds) {
          const winnerId = sim.ball.lastHitter === p1?.id ? p2?.id : p1?.id;
          if (winnerId) awardPoint(winnerId, 'OUT!');
        } else if (sim.ball.bounces >= 2) {
          const winnerId = sim.ball.lastHitter || p1?.id;
          if (winnerId) awardPoint(winnerId, 'WINNER!');
        }
      }

      // Check early swing window if player swung slightly before ball arrived
      for (const actor of Object.values(sim.actors)) {
        if (actor.swingWindow > 0) {
          actor.swingWindow -= dt;
          if (actor.pendingShot && tryHitBall(actor, actor.pendingShot)) {
            actor.pendingShot = null;
          }
        }
      }
    }

    threeApp.ballMesh.position.copy(sim.ball.pos);
    if (sim.phase === 'rally' || sim.phase === 'serve_toss') {
      threeApp.trailHistory.unshift(sim.ball.pos.clone());
      if (threeApp.trailHistory.length > threeApp.trailMeshes.length * 2) threeApp.trailHistory.pop();
      threeApp.trailMeshes.forEach((tm, idx) => {
        const pt = threeApp.trailHistory[(idx + 1) * 2 - 1];
        if (pt) { tm.position.copy(pt); tm.visible = true; }
        else tm.visible = false;
      });
    } else {
      threeApp.trailHistory.length = 0;
      threeApp.trailMeshes.forEach(tm => { tm.visible = false; });
    }
    threeApp.shadowMesh.position.set(sim.ball.pos.x, 0.025, sim.ball.pos.z);
    threeApp.shadowMesh.scale.setScalar(Math.max(0.4, 1 - sim.ball.pos.y * 0.15));

    const radarBall = document.getElementById('tnRadarBall');
    if (radarBall) {
      const rx = Math.max(4, Math.min(96, 50 - (sim.ball.pos.z / HALF_L) * 44));
      const ry = Math.max(4, Math.min(96, 50 + (sim.ball.pos.x / HALF_W) * 44));
      radarBall.style.left = `${rx.toFixed(1)}%`;
      radarBall.style.top = `${ry.toFixed(1)}%`;
    }

    // Smoothly track rally along the court length on the broadcast camera
    threeApp.camera.position.z += (sim.ball.pos.z * 0.22 - threeApp.camera.position.z) * 0.08;
    threeApp.camera.lookAt(0, 0.7, sim.ball.pos.z * 0.16);

    threeApp.renderer.render(threeApp.scene, threeApp.camera);
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

  function updateScoreboardDom(msg) {
    const p1 = msg.players[0];
    const p2 = msg.players[1];
    const el1 = document.getElementById('tnScoreP1');
    const el2 = document.getElementById('tnScoreP2');
    const g1 = document.getElementById('tnGamesP1');
    const g2 = document.getElementById('tnGamesP2');
    if (el1) el1.textContent = msg.pointLabels?.[p1] || '0';
    if (el2) el2.textContent = msg.pointLabels?.[p2] || '0';
    if (g1) g1.textContent = `Games: ${msg.games?.[p1] || 0}`;
    if (g2) g2.textContent = `Games: ${msg.games?.[p2] || 0}`;
    document.querySelector('.tn-p1')?.classList.toggle('serving', msg.serverId === p1);
    document.querySelector('.tn-p2')?.classList.toggle('serving', msg.serverId === p2);

    const banner = document.getElementById('tnWinnerBanner');
    if (banner) {
      if (msg.phase === 'finished' && msg.winner) {
        banner.textContent = `🏆 ${nameFor(msg.winner, msg)} wins the match!`;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }
  }

  function renderTennisTv(msg) {
    lastMsg = msg;
    const content = document.getElementById('gameContent');
    if (!content) return;

    if (!content.querySelector('.tn-tv')) {
      const p1 = msg.players[0];
      const p2 = msg.players[1];
      const svg1 = SH.avatarSvg ? SH.avatarSvg(avatarFor(p1, msg), { size: 42 }) : '';
      const svg2 = SH.avatarSvg ? SH.avatarSvg(avatarFor(p2, msg), { size: 42 }) : '';
      content.innerHTML = `
        <div class="tn-tv">
          <div class="tn-hud-top">
            <div class="tn-player-pill tn-p1">
              <span class="tn-avatar">${svg1}</span>
              <div>
                <div class="tn-pname">${escapeHtml(nameFor(p1, msg))}</div>
                <div class="tn-pgames" id="tnGamesP1">Games: 0</div>
              </div>
              <div class="tn-pts" id="tnScoreP1">0</div>
            </div>
            <div class="tn-vs-badge"><img src="/images/smallhours-logo-light.svg" alt="Smallhours" class="tn-brand-logo" /><span>BEST OF ${msg.bestOf || 3}</span></div>
            <div class="tn-player-pill tn-p2">
              <div class="tn-pts" id="tnScoreP2">0</div>
              <div>
                <div class="tn-pname">${escapeHtml(nameFor(p2, msg))}</div>
                <div class="tn-pgames" id="tnGamesP2">Games: 0</div>
              </div>
              <span class="tn-avatar">${svg2}</span>
            </div>
          </div>
          <div class="tn-stage-wrap">
            <div id="tnStage" class="tn-stage"></div>
            <div class="tn-court-radar" aria-hidden="true">
              <div class="tn-radar-court">
                <div class="tn-radar-service"></div>
                <div id="tnRadarBall" class="tn-radar-ball"></div>
              </div>
            </div>
            <div id="tnCallout" class="tn-callout hidden"></div>
            <div id="tnWinnerBanner" class="tn-winner-banner hidden"></div>
          </div>
        </div>
      `;

      const stage = document.getElementById('tnStage');
      const loadThree = (typeof SH !== 'undefined' && SH.loadThree)
        ? SH.loadThree
        : () => (window.THREE ? Promise.resolve(window.THREE) : import('/vendor/three/three.module.min.js').then(m => (window.THREE = m)));
      loadThree().then(THREE => {
        if (!document.getElementById('tnStage')) return;
        initThreeScene(THREE, stage, msg);
        startLoop();
        (msg.players || []).forEach(setupRtcForPlayer);
      }).catch(err => {
        if (stage) stage.innerHTML = `<div style="padding:24px;color:#fda4af;font-weight:700">Failed to load 3D court: ${escapeHtml(err?.message || String(err))}</div>`;
      });
    }

    if (sim) {
      sim.finished = msg.phase === 'finished';
      if (msg.phase === 'finished') window.SH_TENNIS_AUDIO?.gameWin();
    }
    updateScoreboardDom(msg);
  }

  function cleanupTennis() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
    for (const { pc, dc } of rtcPeers.values()) {
      try { dc?.close(); pc?.close(); } catch { /* ignore */ }
    }
    rtcPeers.clear();
    if (threeApp?.renderer) {
      threeApp.renderer.dispose();
    }
    threeApp = null;
    sim = null;
    lastMsg = null;
  }

  SH.registerGame('tennis', {
    render: renderTennisTv,
    onLeave: cleanupTennis,
    onMute(muted) { window.SH_TENNIS_AUDIO?.setMuted(muted); },
    onRtcSignal(msg) {
      const fromId = msg.fromPlayerId;
      const sig = msg.signal;
      if (!fromId || !sig) return;
      if (sig.tnSwing) { handlePlayerSwing(fromId, sig.tnSwing); return; }
      if (sig.tnToss) { handlePlayerToss(fromId); return; }
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
        detail: `${msg.games?.[id] || 0}G (${msg.pointLabels?.[id] || '0'})`,
      }));
      return { entries, roundLabel: `Best of ${msg.bestOf || 3}` };
    },
  });
})();
