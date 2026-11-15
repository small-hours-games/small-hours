// Shared helpers for the TV games that draw a Three.js stage (Tennis, Runner):
// the brand palette and art for canvas textures, a pixel budget that keeps weak
// Android TV chips at a steady frame rate, pooled sparks, and a full cleanup.
(function () {
  'use strict';

  var BRAND = { navy: '#0b1530', deep: '#13234a', sky: '#38bdf8', violet: '#a78bfa', rose: '#fb7185', yellow: '#facc15', white: '#f8fafc' };
  // The four cards of the logo, left to right.
  var FAN = [BRAND.sky, BRAND.violet, BRAND.rose, BRAND.yellow];
  var LOGO = '/images/smallhours-logo.svg'; // white wordmark, for dark surfaces
  var MARK = '/images/smallhours-mark.svg';

  // The Android TV app opens /host/CODE?tv=1; any Android WebView gets the light path too.
  var lowPower = /[?&]tv=1\b/.test(location.search) || /Android/i.test(navigator.userAgent);

  // Render at most ~1 megapixel on a TV (about 720p), ~2.6 elsewhere, whatever the CSS size.
  function pixelRatio(w, h) {
    var budget = lowPower ? 1.0e6 : 2.6e6;
    var fit = Math.sqrt(budget / Math.max(1, w * h));
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, fit));
  }

  function fit(renderer, camera, container) {
    var w = container.clientWidth || 1280;
    var h = container.clientHeight || 720;
    renderer.setPixelRatio(pixelRatio(w, h));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  var images = {};
  function image(src) {
    if (!images[src]) {
      images[src] = new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = src;
      });
    }
    return images[src];
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 40px Fredoka'),
      document.fonts.load('800 40px "Barlow Condensed"'),
    ]).catch(function () {});
  }

  // A texture painted by draw(ctx, art). It is painted at once, and again when the logo,
  // the mark and the brand fonts have loaded (art.logo / art.mark are null until then).
  function canvasTexture(THREE, w, h, draw) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    var art = { logo: null, mark: null };
    function paint() {
      ctx.clearRect(0, 0, w, h);
      draw(ctx, art);
      tex.needsUpdate = true;
    }
    paint();
    Promise.all([image(LOGO), image(MARK), fontsReady()]).then(function (r) {
      art.logo = r[0];
      art.mark = r[1];
      paint();
    });
    return tex;
  }

  // The crescent moon from the logo's yellow card. Needs a transparent canvas around it.
  function drawMoon(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx + r * 0.47, cy - r * 0.4, r * 0.84, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // One card of the logo fan: a colour, a white edge, and optionally a letter or the moon.
  function drawCard(ctx, w, h, color, opts) {
    var o = opts || {};
    var edge = Math.round(w * 0.07);
    roundRect(ctx, edge / 2, edge / 2, w - edge, h - edge, w * 0.2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = edge;
    ctx.strokeStyle = BRAND.white;
    ctx.stroke();
    ctx.fillStyle = BRAND.navy;
    if (o.letter) {
      ctx.font = '700 ' + Math.round(w * 0.74) + 'px Fredoka, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.letter, w / 2, h * 0.53);
    } else if (o.moon) {
      ctx.beginPath();
      ctx.arc(w * 0.46, h * 0.42, w * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w * 0.46 + w * 0.127, h * 0.42 - w * 0.108, w * 0.227, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The four brand colours as a strip, repeated `repeats` times across `w`.
  function drawFanStrip(ctx, x, y, w, h, repeats) {
    var seg = w / ((repeats || 1) * FAN.length);
    for (var i = 0; i < (repeats || 1) * FAN.length; i++) {
      ctx.fillStyle = FAN[i % FAN.length];
      ctx.fillRect(x + i * seg, y, seg + 1, h);
    }
  }

  // A fixed set of spark meshes, reused for every burst: nothing is allocated mid-game.
  function createSparkPool(THREE, scene, size, geometry) {
    var items = [];
    for (var i = 0; i < size; i++) {
      var mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, fog: false }));
      mesh.visible = false;
      scene.add(mesh);
      items.push({ mesh: mesh, vx: 0, vy: 0, vz: 0, life: 0, gravity: 10 });
    }
    var next = 0;
    var LIFE = 0.38;
    return {
      burst: function (pos, colorHex, count, spread, lift, gravity) {
        for (var n = 0; n < count; n++) {
          var s = items[next];
          next = (next + 1) % items.length;
          s.mesh.position.set(pos.x, pos.y, pos.z);
          s.mesh.material.color.setHex(colorHex);
          s.mesh.material.opacity = 1;
          s.mesh.visible = true;
          s.vx = (Math.random() - 0.5) * spread;
          s.vy = Math.random() * lift + 1.5;
          s.vz = (Math.random() - 0.5) * spread;
          s.gravity = gravity || 10;
          s.life = LIFE;
        }
      },
      update: function (dt) {
        for (var k = 0; k < items.length; k++) {
          var s = items[k];
          if (s.life <= 0) continue;
          s.life -= dt;
          if (s.life <= 0) { s.mesh.visible = false; continue; }
          s.vy -= s.gravity * dt;
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.y += s.vy * dt;
          s.mesh.position.z += s.vz * dt;
          s.mesh.material.opacity = s.life / LIFE;
        }
      },
    };
  }

  // Free everything a stage holds, and its WebGL context: a WebView allows only a few.
  // The last frame stays on screen as a still picture, behind the winner banner.
  function dispose(app) {
    if (!app || !app.renderer) return;
    var gl = app.renderer.domElement;
    if (gl && gl.parentNode && app.scene && app.camera) {
      try {
        app.renderer.render(app.scene, app.camera);
        var still = document.createElement('canvas');
        still.width = gl.width;
        still.height = gl.height;
        still.style.cssText = 'display:block;width:100%;height:100%';
        still.getContext('2d').drawImage(gl, 0, 0);
        gl.parentNode.replaceChild(still, gl);
      } catch (e) { /* no still: the stage goes dark */ }
    }
    if (app.scene) {
      app.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        var mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        mats.forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      });
    }
    app.renderer.dispose();
    if (app.renderer.forceContextLoss) app.renderer.forceContextLoss();
    var el = app.renderer.domElement;
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // A small deterministic random source, so painted textures look the same every time.
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  if (typeof SH !== 'undefined') {
    SH.stage3d = {
      BRAND: BRAND,
      FAN: FAN,
      LOGO: LOGO,
      MARK: MARK,
      lowPower: lowPower,
      pixelRatio: pixelRatio,
      fit: fit,
      canvasTexture: canvasTexture,
      drawMoon: drawMoon,
      drawCard: drawCard,
      drawFanStrip: drawFanStrip,
      roundRect: roundRect,
      createSparkPool: createSparkPool,
      dispose: dispose,
      seeded: seeded,
    };
  }
})();
