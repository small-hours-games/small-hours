// The lobby avatars as small 3D characters for the TV games (Tennis, Runner).
// SH.avatarRig(THREE, avatar) builds the animal or robot the player picked: a penguin
// is a penguin on the court. Every rig stands on y = 0, faces +z, is about 1.75 high,
// and returns the same parts so a game can animate any of them the same way.
// Built from a few low-poly primitives with Lambert materials: cheap enough for a TV chip.
(function () {
  'use strict';

  var DARK = '#0b1530';
  var WHITE = '#f8fafc';
  var ORANGE = '#f59e0b';

  function avatarRig(THREE, avatar) {
    var m = SH.avatarMeta(avatar);
    var id = m.id;

    var mats = {};
    function mat(color, kind) {
      var key = color + (kind || '');
      if (!mats[key]) {
        mats[key] = kind === 'glow'
          ? new THREE.MeshBasicMaterial({ color: color })
          : new THREE.MeshLambertMaterial({ color: color, side: kind === 'flat' ? THREE.DoubleSide : THREE.FrontSide });
      }
      return mats[key];
    }
    var G = {
      sph: function (r) { return new THREE.SphereGeometry(r, 12, 10); },
      cone: function (r, h, seg) { return new THREE.ConeGeometry(r, h, seg || 8); },
      cap: function (r, l) { return new THREE.CapsuleGeometry(r, l, 3, 8); },
      box: function (w, h, d) { return new THREE.BoxGeometry(w, h, d); },
      cyl: function (r, h) { return new THREE.CylinderGeometry(r, r, h, 6); },
      tor: function (R, t) { return new THREE.TorusGeometry(R, t, 6, 16); },
      disc: function (r) { return new THREE.CircleGeometry(r, 14); },
    };
    function add(parent, geo, color, x, y, z, kind) {
      var mesh = new THREE.Mesh(geo, mat(color, kind));
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }
    function scaled(mesh, x, y, z) { mesh.scale.set(x, y, z); return mesh; }
    function turned(mesh, x, y, z) { mesh.rotation.set(x || 0, y || 0, z || 0); return mesh; }
    function sides(fn) { fn(-1); fn(1); }

    // Colours and build options; each species changes what it needs.
    var C = { body: m.bg, head: m.bg, belly: m.accent, limb: m.rim, feet: ORANGE };
    var O = {
      body: 'capsule', bodyY: 0.78, head: 'ball', headR: 0.32, headY: 1.42,
      legs: 'normal', arms: 'normal', belly: true, eyes: true, shoulderY: 0.98,
    };
    var before = {
      panda: function () { C.body = m.accent; C.head = m.accent; C.limb = '#2b3650'; },
      penguin: function () { C.body = '#34466f'; C.head = '#34466f'; O.legs = 'feet'; O.arms = 'flipper'; O.belly = false; },
      frog: function () { O.eyes = false; },
      butterfly: function () { C.limb = '#5b21b6'; },
      octopus: function () { O.headR = 0.4; O.headY = 1.18; O.body = 'none'; O.legs = 'none'; O.arms = 'none'; O.belly = false; O.shoulderY = 0.8; },
      crab: function () { O.body = 'shell'; O.head = 'none'; O.headY = 0.62; O.eyes = false; O.arms = 'claw'; O.belly = false; O.shoulderY = 0.72; },
      flamingo: function () { O.body = 'bird'; O.bodyY = 0.98; O.headR = 0.2; O.headY = 1.62; O.legs = 'long'; O.arms = 'wing'; O.belly = false; O.shoulderY = 1.02; },
      dolphin: function () { O.arms = 'flipper'; },
      elf: function () { C.head = '#f6c9a0'; O.belly = false; },
      hedgehog: function () { C.head = m.accent; O.body = 'round'; },
      parrot: function () { O.legs = 'feet'; O.arms = 'wing'; },
      whale: function () { O.body = 'round'; O.headR = 0.36; O.headY = 1.2; O.arms = 'flipper'; },
      'bot-nova': function () { C.body = '#475569'; C.head = '#475569'; O.body = 'box'; O.head = 'box'; O.eyes = false; O.belly = false; },
      'bot-glitch': function () { O.head = 'box'; O.eyes = false; O.belly = false; },
      'bot-brain': function () { C.head = '#f9a8d4'; O.eyes = false; O.belly = false; },
      'bot-rocket': function () { O.head = 'none'; O.eyes = false; O.belly = false; },
      'bot-sat': function () { O.body = 'box'; O.headR = 0.28; O.eyes = false; O.belly = false; O.arms = 'panel'; },
    };
    if (before[id]) before[id]();

    var root = new THREE.Group();

    // Body
    var body = null;
    if (O.body === 'capsule') body = add(root, G.cap(0.28, 0.44), C.body, 0, O.bodyY, 0);
    else if (O.body === 'round') body = scaled(add(root, G.sph(0.42), C.body, 0, 0.74, 0), 1, 1.05, 0.98);
    else if (O.body === 'box') body = add(root, G.box(0.56, 0.72, 0.42), C.body, 0, O.bodyY, 0);
    else if (O.body === 'shell') body = scaled(add(root, G.sph(0.4), C.body, 0, 0.62, 0), 1.45, 0.8, 1);
    else if (O.body === 'bird') body = scaled(add(root, G.sph(0.27), C.body, 0, O.bodyY, 0), 1, 0.9, 1.25);
    if (O.belly) scaled(add(root, G.sph(0.2), C.belly, 0, 0.74, O.body === 'round' ? 0.34 : 0.21), 1, 1.25, 0.5);

    // Head and eyes
    var head = new THREE.Group();
    head.position.y = O.headY;
    root.add(head);
    if (O.head === 'ball') add(head, G.sph(O.headR), C.head, 0, 0, 0);
    else if (O.head === 'box') add(head, G.box(0.52, 0.42, 0.44), C.head, 0, 0, 0);
    var f = O.headR / 0.32;
    function eye(x, y, z, r) {
      add(head, G.sph(r || 0.075), WHITE, x, y, z);
      add(head, G.sph((r || 0.075) * 0.56), DARK, x, y, z + (r || 0.075) * 0.82);
    }
    if (O.eyes) {
      // Sit the eyes on the surface of the head, whatever its size.
      var ex = 0.12 * f;
      var ey = 0.05 * f;
      var ez = Math.sqrt(O.headR * O.headR - ex * ex - ey * ey) - 0.035;
      sides(function (s) { eye(s * ex, ey, ez); });
    }

    // Legs
    var legL;
    var legR;
    if (O.legs === 'normal') {
      legL = add(root, G.cap(0.09, 0.28), C.limb, -0.13, 0.26, 0);
      legR = add(root, G.cap(0.09, 0.28), C.limb, 0.13, 0.26, 0);
    } else if (O.legs === 'feet') {
      // Webbed feet on short stubs; the foot is the part a game swings.
      sides(function (s) { add(root, G.cyl(0.045, 0.3), C.feet, s * 0.13, 0.22, 0); });
      legL = add(root, G.box(0.2, 0.09, 0.32), C.feet, -0.13, 0.045, 0.06);
      legR = add(root, G.box(0.2, 0.09, 0.32), C.feet, 0.13, 0.045, 0.06);
    } else if (O.legs === 'long') {
      legL = add(root, G.cap(0.04, 0.62), C.limb, -0.09, 0.38, 0);
      legR = add(root, G.cap(0.04, 0.62), C.limb, 0.09, 0.38, 0);
    }

    // Arms
    var armL;
    var armR;
    function arm(s) {
      if (O.arms === 'normal') return add(root, G.cap(0.065, 0.24), C.limb, s * 0.34, 0.84, 0);
      if (O.arms === 'flipper') return turned(scaled(add(root, G.sph(0.2), C.body, s * 0.36, 0.8, 0), 0.32, 1.25, 0.7), 0, 0, s * 0.35);
      if (O.arms === 'wing') return turned(scaled(add(root, G.sph(0.2), C.limb, s * 0.3, O.shoulderY - 0.04, -0.04), 0.3, 1.1, 1.2), 0, 0, s * 0.3);
      if (O.arms === 'claw') {
        var claw = new THREE.Group();
        claw.position.set(s * 0.62, 0.72, 0.1);
        turned(add(claw, G.cap(0.06, 0.2), C.limb, -s * 0.12, -0.04, 0), 0, 0, s * 1.2);
        scaled(add(claw, G.sph(0.17), C.body, s * 0.08, 0.08, 0.04), 1, 1.25, 0.8);
        turned(add(claw, G.cone(0.07, 0.2, 6), C.body, s * 0.02, 0.3, 0.04), 0, 0, s * 0.5);
        root.add(claw);
        return claw;
      }
      if (O.arms === 'panel') {
        var panel = new THREE.Group();
        panel.position.set(s * 0.34, 0.9, 0);
        add(panel, G.cyl(0.025, 0.2), m.rim, s * 0.08, 0, 0).rotation.z = Math.PI / 2;
        add(panel, G.box(0.46, 0.3, 0.03), '#2563eb', s * 0.4, 0, 0);
        add(panel, G.box(0.02, 0.3, 0.04), m.accent, s * 0.4, 0, 0);
        root.add(panel);
        return panel;
      }
      return null;
    }
    armL = arm(-1);
    armR = arm(1);

    // Shared features
    function ears(kind, color, inner) {
      sides(function (s) {
        if (kind === 'pointed') {
          add(head, G.cone(0.1, 0.24, 6), color, s * 0.2, 0.3, 0).rotation.z = -s * 0.35;
          if (inner) add(head, G.cone(0.05, 0.14, 6), inner, s * 0.2, 0.29, 0.04).rotation.z = -s * 0.35;
        } else if (kind === 'round') {
          add(head, G.sph(0.11), color, s * 0.24, 0.25, 0);
        } else if (kind === 'small') {
          add(head, G.sph(0.075), color, s * 0.25, 0.22, 0);
        } else if (kind === 'big') {
          add(head, G.sph(0.17), color, s * 0.3, 0.2, 0);
          if (inner) add(head, G.sph(0.1), inner, s * 0.3, 0.2, 0.1);
        } else if (kind === 'side') {
          add(head, G.cone(0.07, 0.28, 6), color, s * 0.38, 0.06, 0).rotation.z = -s * 1.25;
        }
      });
    }
    function muzzle(color, r, nose) {
      scaled(add(head, G.sph(r || 0.13), color, 0, -0.08, 0.25), 1, 0.8, 0.9);
      if (nose !== false) add(head, G.sph(0.045), nose || DARK, 0, -0.04, 0.25 + (r || 0.13) * 0.9);
    }
    // A cone pointing forward from the face; tilt > 0 droops it.
    function beak(color, r, h, y, tilt) {
      var b = add(head, G.cone(r, h, 8), color, 0, y, O.headR * 0.85 + h / 2 - 0.02);
      b.rotation.x = Math.PI / 2 + (tilt || 0);
      return b;
    }
    function antennae(color, tip, glow) {
      sides(function (s) {
        add(head, G.cyl(0.015, 0.26), color, s * 0.13, 0.36, 0).rotation.z = -s * 0.3;
        add(head, G.sph(0.045), tip, s * 0.17, 0.5, 0, glow ? 'glow' : '');
      });
    }
    function visor(color, y, w) {
      add(head, G.box(w || 0.4, 0.12, 0.05), color, 0, y || 0.03, O.head === 'box' ? 0.22 : O.headR - 0.03, 'glow');
    }
    // A thin tail from the lower back, with a tuft at the end.
    function thinTail(color, tuft) {
      turned(add(root, G.cyl(0.03, 0.5), color, 0, 0.62, -0.42), -1.0, 0, 0);
      add(root, G.sph(0.08), tuft, 0, 0.78, -0.64);
    }
    // Cones pointing back and up, for spikes and plumes.
    function backCone(parent, color, x, y, z, r, h, lean) {
      add(parent, G.cone(r, h, 6), color, x, y, z).rotation.x = lean === undefined ? -1.0 : lean;
    }
    function fluke(color, y, z) {
      add(root, G.box(0.56, 0.05, 0.2), color, 0, y, z);
    }

    var species = {
      fox: function () {
        ears('pointed', m.bg, DARK);
        muzzle(m.accent, 0.13);
        turned(scaled(add(root, G.sph(0.16), m.bg, 0, 0.62, -0.42), 1, 1, 1.9), -0.7, 0, 0);
        add(root, G.sph(0.1), WHITE, 0, 0.82, -0.63);
      },
      frog: function () {
        sides(function (s) { eye(s * 0.15, 0.27, 0.06, 0.11); });
        add(head, G.box(0.32, 0.025, 0.03), DARK, 0, -0.1, 0.305);
      },
      panda: function () {
        ears('round', '#2b3650');
        sides(function (s) { scaled(add(head, G.sph(0.11), '#2b3650', s * 0.125, 0.045, 0.215), 1, 1.25, 0.6); });
        muzzle(WHITE, 0.1);
      },
      lion: function () {
        add(head, G.tor(0.3, 0.11), '#92400e', 0, 0, -0.04);
        ears('round', m.bg);
        muzzle(m.accent, 0.13);
        thinTail(m.bg, '#92400e');
      },
      tiger: function () {
        ears('round', m.bg);
        muzzle(m.accent, 0.13);
        [0.66, 0.9].forEach(function (y) { add(root, G.tor(0.283, 0.028), DARK, 0, y, 0).rotation.x = Math.PI / 2; });
        add(head, G.box(0.05, 0.03, 0.26), DARK, 0, 0.31, -0.02);
        sides(function (s) { add(head, G.box(0.05, 0.03, 0.2), DARK, s * 0.13, 0.28, -0.02); });
        thinTail(m.bg, DARK);
      },
      butterfly: function () {
        antennae(DARK, m.accent);
        sides(function (s) {
          add(root, G.disc(0.4), m.rim, s * 0.44, 1.02, -0.2, 'flat').rotation.y = s * 0.45;
          add(root, G.disc(0.27), m.cheek, s * 0.36, 0.56, -0.2, 'flat').rotation.y = s * 0.45;
          add(root, G.disc(0.13), m.accent, s * 0.46, 1.04, -0.185, 'flat').rotation.y = s * 0.45;
        });
      },
      koala: function () {
        ears('big', m.bg, m.accent);
        scaled(add(head, G.sph(0.09), '#1e293b', 0, -0.03, 0.3), 0.8, 1.2, 0.7);
      },
      penguin: function () {
        scaled(add(root, G.sph(0.26), WHITE, 0, 0.74, 0.16), 1, 1.3, 0.62);
        scaled(add(head, G.sph(0.22), WHITE, 0, -0.02, 0.18), 1, 1, 0.62);
        beak(ORANGE, 0.095, 0.22, -0.09, 0.15);
        backCone(root, C.body, 0, 0.4, -0.3, 0.1, 0.2, -1.9);
      },
      unicorn: function () {
        turned(add(head, G.cone(0.05, 0.32, 8), '#fde047', 0, 0.42, 0.12), 0.25, 0, 0);
        ears('pointed', m.bg, m.accent);
        scaled(add(head, G.sph(0.13), m.accent, 0, -0.09, 0.27), 1, 0.8, 1.2);
        ['#38bdf8', '#a78bfa', '#facc15', '#fb7185'].forEach(function (col, i) {
          add(head, G.sph(0.095), col, 0, 0.28 - i * 0.15, -0.2 - i * 0.03);
        });
        turned(scaled(add(root, G.sph(0.13), m.cheek, 0, 0.58, -0.4), 1, 1.9, 1), 0.7, 0, 0);
      },
      octopus: function () {
        var arms = [];
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          var t = add(root, G.cap(0.09, 0.44), m.bg, Math.sin(a) * 0.36, 0.34, Math.cos(a) * 0.36);
          t.rotation.set(Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75);
          arms.push(t);
        }
        legL = arms[5]; legR = arms[0]; armL = arms[4]; armR = arms[1];
        [[-0.12, 0.34, 0.08], [0.14, 0.33, -0.05], [0, 0.38, -0.12]].forEach(function (p) {
          add(head, G.sph(0.05), m.accent, p[0], p[1], p[2]);
        });
        add(head, G.box(0.12, 0.025, 0.03), DARK, 0, -0.12, 0.385);
      },
      dino: function () {
        add(head, G.box(0.3, 0.17, 0.24), m.bg, 0, -0.08, 0.28);
        sides(function (s) { add(head, G.sph(0.025), DARK, s * 0.07, -0.02, 0.4); });
        [[0.32, -0.05], [0.24, -0.2], [0.08, -0.29]].forEach(function (p) { backCone(head, m.rim, 0, p[0], p[1], 0.07, 0.17, -0.5); });
        [1.0, 0.8, 0.6].forEach(function (y) { backCone(root, m.rim, 0, y, -0.29, 0.07, 0.17, -1.2); });
        add(root, G.cone(0.17, 0.62, 8), m.bg, 0, 0.42, -0.5).rotation.x = -1.75;
      },
      bear: function () {
        ears('round', m.bg);
        muzzle(m.accent, 0.13);
        add(root, G.sph(0.08), m.bg, 0, 0.58, -0.3);
      },
      crab: function () {
        sides(function (s) {
          add(head, G.cyl(0.025, 0.24), m.rim, s * 0.15, 0.36, 0.12);
          eye(s * 0.15, 0.52, 0.13, 0.085);
          [-0.14, 0.12].forEach(function (z) {
            add(root, G.cap(0.045, 0.2), m.rim, s * 0.52, 0.26, z).rotation.z = s * 0.7;
          });
        });
        add(head, G.box(0.16, 0.025, 0.03), DARK, 0, 0.02, 0.4);
      },
      flamingo: function () {
        turned(add(root, G.cyl(0.06, 0.52), m.bg, 0, 1.33, 0.1), 0.25, 0, 0);
        beak(m.accent, 0.075, 0.2, -0.04, 0.55);
        add(head, G.sph(0.045), DARK, 0, -0.14, 0.33);
        [-0.1, 0, 0.1].forEach(function (x) { backCone(root, m.rim, x, 1.04, -0.36, 0.07, 0.3, -1.1); });
      },
      dolphin: function () {
        beak(m.bg, 0.1, 0.28, -0.08);
        scaled(add(root, G.cone(0.13, 0.32, 4), m.bg, 0, 1.0, -0.3), 0.4, 1, 1).rotation.x = -0.5;
        add(root, G.cone(0.13, 0.46, 8), m.bg, 0, 0.5, -0.42).rotation.x = -1.9;
        fluke(m.rim, 0.42, -0.66);
      },
      elf: function () {
        ears('side', C.head);
        add(head, G.cone(0.3, 0.46, 10), m.bg, 0, 0.42, -0.02);
        add(head, G.tor(0.3, 0.045), m.rim, 0, 0.2, -0.02).rotation.x = Math.PI / 2;
        add(head, G.sph(0.07), m.accent, 0, 0.67, -0.02);
        add(root, G.tor(0.285, 0.035), '#fde047', 0, 0.66, 0).rotation.x = Math.PI / 2;
      },
      hedgehog: function () {
        ears('small', m.bg);
        beak(m.accent, 0.11, 0.2, -0.07);
        add(head, G.sph(0.045), DARK, 0, -0.07, 0.47);
        [1.02, 0.78, 0.54].forEach(function (y, row) {
          [-0.2, 0, 0.2].forEach(function (x) { backCone(root, row % 2 ? m.bg : m.rim, x, y, -0.34 + Math.abs(x) * 0.5, 0.09, 0.26, -1.1); });
        });
        [[-0.15, 0.2], [0.15, 0.2], [0, 0.3], [-0.12, 0.02], [0.12, 0.02]].forEach(function (p) { backCone(head, m.bg, p[0], p[1], -0.22, 0.08, 0.22, -1.0); });
      },
      otter: function () {
        ears('small', m.bg);
        muzzle(m.accent, 0.15);
        turned(add(root, G.cap(0.09, 0.5), m.bg, 0, 0.34, -0.46), 1.15, 0, 0);
      },
      parrot: function () {
        beak(ORANGE, 0.09, 0.18, -0.06, 0.6);
        sides(function (s) { add(head, G.sph(0.06), m.cheek, s * 0.21, -0.06, 0.2); });
        [-0.07, 0, 0.07].forEach(function (x, i) { backCone(head, '#ef4444', x, 0.34, -0.04 - (i === 1 ? 0.04 : 0), 0.05, 0.22, -0.6); });
        turned(add(root, G.box(0.18, 0.04, 0.52), '#ef4444', 0, 0.46, -0.44), 0.55, 0, 0);
        turned(add(root, G.box(0.1, 0.045, 0.56), '#3b82f6', 0, 0.47, -0.46), 0.55, 0, 0);
      },
      whale: function () {
        add(head, G.cyl(0.02, 0.16), WHITE, 0, 0.42, 0);
        [[-0.08, 0.52], [0.08, 0.52], [0, 0.58]].forEach(function (p) { add(head, G.sph(0.05), '#bae6fd', p[0], p[1], 0); });
        add(root, G.cone(0.16, 0.5, 8), m.bg, 0, 0.66, -0.56).rotation.x = -1.7;
        fluke(m.rim, 0.66, -0.84);
      },
      'bot-nova': function () {
        visor(m.accent);
        antennae(m.rim, m.accent, true);
        add(root, G.sph(0.055), m.accent, 0, 0.9, 0.22, 'glow');
        add(root, G.box(0.3, 0.05, 0.03), m.rim, 0, 0.7, 0.215);
      },
      'bot-glitch': function () {
        sides(function (s) {
          add(head, G.box(0.11, 0.11, 0.05), m.cheek, s * 0.12, 0.05, 0.22, 'glow');
          add(head, G.box(0.09, 0.16, 0.09), m.rim, s * 0.3, -0.12, 0);
        });
        [-0.1, 0, 0.1].forEach(function (x) { add(head, G.box(0.06, 0.05, 0.05), m.accent, x, -0.12, 0.22, 'glow'); });
        antennae(m.rim, m.accent, true);
      },
      'bot-brain': function () {
        [[-0.16, 0.2, 0.08], [0.16, 0.2, 0.08], [0, 0.26, -0.08], [-0.2, 0.08, -0.14], [0.2, 0.08, -0.14], [0, 0.24, 0.16]].forEach(function (p) {
          add(head, G.sph(0.15), C.head, p[0], p[1], p[2]);
        });
        add(head, G.box(0.03, 0.03, 0.5), m.bg, 0, 0.33, 0);
        visor(m.bg, -0.06, 0.44);
        sides(function (s) { add(head, G.sph(0.04), '#fef08a', s * 0.1, -0.06, 0.3, 'glow'); });
      },
      'bot-rocket': function () {
        add(head, G.cone(0.3, 0.52, 12), m.bg, 0, 0.02, 0);
        add(head, G.sph(0.06), m.accent, 0, 0.29, 0);
        add(root, G.sph(0.12), '#7dd3fc', 0, 0.9, 0.22, 'glow');
        add(root, G.tor(0.13, 0.03), m.accent, 0, 0.9, 0.22);
        sides(function (s) { scaled(add(root, G.cone(0.16, 0.36, 4), m.rim, s * 0.34, 0.5, -0.06), 1, 1, 0.3); });
        scaled(add(root, G.cone(0.16, 0.36, 4), m.rim, 0, 0.5, -0.34), 0.3, 1, 1);
        add(root, G.cone(0.13, 0.34, 8), '#facc15', 0, 0.2, -0.3, 'glow').rotation.x = 2.2;
      },
      'bot-sat': function () {
        visor(m.accent);
        add(head, G.cone(0.22, 0.14, 12), m.accent, 0, 0.36, 0).rotation.x = Math.PI;
        add(head, G.cyl(0.015, 0.16), m.rim, 0, 0.42, 0);
        add(head, G.sph(0.04), '#fef08a', 0, 0.52, 0, 'glow');
        add(root, G.sph(0.05), m.accent, 0, 0.9, 0.22, 'glow');
      },
    };
    if (species[id]) species[id]();
    else ears('round', m.rim);

    return {
      group: root, head: head, body: body,
      legL: legL, legR: legR, armL: armL, armR: armR,
      shoulderY: O.shoulderY, meta: m,
    };
  }

  if (typeof SH !== 'undefined') SH.avatarRig = avatarRig;
})();
