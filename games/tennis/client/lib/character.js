// Small Hours Tennis — 3D Character Rig Builder
// Builds a Small Hours 3D player rig styled from the player's lobby SVG avatar.
(function () {
  'use strict';

  function createTennisCharacter(THREE, { avatar, isNear }) {
    const meta = (typeof SH !== 'undefined' && SH.avatarMeta)
      ? SH.avatarMeta(avatar)
      : { id: 'guest', bg: '#4f46e5', accent: '#e0e7ff', rim: '#818cf8', ear: 'round' };

    const root = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: meta.bg, roughness: 0.45, metalness: 0.08 });
    const accentMat = new THREE.MeshStandardMaterial({ color: meta.accent, roughness: 0.5 });
    const rimMat = new THREE.MeshStandardMaterial({ color: meta.rim, roughness: 0.4 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

    // Torso (jersey in player's avatar primary color + accent collar)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.48, 6, 12), bodyMat);
    torso.position.y = 0.92;
    torso.castShadow = true;
    root.add(torso);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 16), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.24;
    root.add(collar);

    // Smallhours chest stripe & grounded shadow ring
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.328, 0.328, 0.09, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: isNear ? 0x38bdf8 : 0xfb7185, roughness: 0.35, side: THREE.DoubleSide })
    );
    stripe.position.y = 0.96;
    root.add(stripe);

    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 24),
      new THREE.MeshBasicMaterial({
        color: isNear ? 0x38bdf8 : 0xfb7185,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.02;
    root.add(groundRing);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.18, 0.11, 0.3);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-0.14, 0.06, 0.04);
    shoeL.castShadow = true;
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0.14, 0.06, 0.04);
    shoeR.castShadow = true;
    root.add(shoeL, shoeR);

    // Head group with Small Hours SVG avatar face badge
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.62;
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), bodyMat);
    headSphere.castShadow = true;
    headGroup.add(headSphere);

    // SVG Face Disc on front & back so the character is recognizable from any camera angle
    if (typeof SH !== 'undefined' && SH.avatarTexture) {
      const faceTex = SH.avatarTexture(THREE, avatar);
      const faceMat = new THREE.MeshBasicMaterial({ map: faceTex });
      const faceDiscF = new THREE.Mesh(new THREE.CircleGeometry(0.31, 24), faceMat);
      faceDiscF.position.z = 0.31;
      const faceDiscB = new THREE.Mesh(new THREE.CircleGeometry(0.31, 24), faceMat);
      faceDiscB.position.z = -0.31;
      faceDiscB.rotation.y = Math.PI;
      headGroup.add(faceDiscF, faceDiscB);
    }

    // Species silhouette accents (ears / horn / spikes / antennae)
    if (meta.ear === 'pointed' || meta.ear === 'elf') {
      const earGeo = new THREE.ConeGeometry(0.09, 0.24, 6);
      const earL = new THREE.Mesh(earGeo, rimMat);
      earL.position.set(-0.26, 0.28, 0);
      earL.rotation.z = 0.4;
      const earR = new THREE.Mesh(earGeo, rimMat);
      earR.position.set(0.26, 0.28, 0);
      earR.rotation.z = -0.4;
      headGroup.add(earL, earR);
    } else if (meta.ear === 'horn') {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.3, 8),
        new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xca8a04, emissiveIntensity: 0.3 })
      );
      horn.position.set(0, 0.42, 0.08);
      horn.rotation.x = 0.2;
      headGroup.add(horn);
    } else if (meta.ear === 'round' || meta.ear === 'fluffy' || meta.ear === 'dome') {
      const earGeo = new THREE.SphereGeometry(0.12, 10, 10);
      const earL = new THREE.Mesh(earGeo, rimMat);
      earL.position.set(-0.28, 0.26, 0);
      const earR = new THREE.Mesh(earGeo, rimMat);
      earR.position.set(0.28, 0.26, 0);
      headGroup.add(earL, earR);
    } else if (meta.ear === 'mane') {
      const mane = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.09, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
      );
      headGroup.add(mane);
    }
    root.add(headGroup);

    // Racket Arm Pivot
    const armPivot = new THREE.Group();
    armPivot.position.set(0.38, 1.18, 0);
    const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), accentMat);
    armMesh.position.set(0, -0.18, 0.14);
    armMesh.rotation.x = Math.PI / 3;
    armPivot.add(armMesh);

    // Tennis Racket
    const racketGroup = new THREE.Group();
    racketGroup.position.set(0, -0.34, 0.38);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.14;
    racketGroup.add(handle);

    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.026, 8, 24),
      new THREE.MeshStandardMaterial({ color: isNear ? 0x38bdf8 : 0xf43f5e, roughness: 0.3, metalness: 0.3 })
    );
    frame.scale.set(0.86, 1.18, 1);
    frame.position.z = 0.58;
    racketGroup.add(frame);

    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    strings.scale.set(0.84, 1.15, 1);
    strings.position.z = 0.58;
    racketGroup.add(strings);

    armPivot.add(racketGroup);
    root.add(armPivot);

    // Off-hand
    const offHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), accentMat);
    offHand.position.set(-0.38, 1.0, 0.18);
    root.add(offHand);

    return {
      root,
      headGroup,
      armPivot,
      racketGroup,
      offHand,
      shoeL,
      shoeR,
      meta,
      swingTimer: 0,
      swingDuration: 0.34,
      swingSide: 'forehand',
      hitReaction: 0,
    };
  }

  window.SH_TENNIS_CHAR = { createTennisCharacter };
})();
