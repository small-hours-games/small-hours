// Small Hours Tennis — the player on court.
// The body is the avatar the player picked in the lobby (SH.avatarRig, public/js/avatar-3d.js):
// a penguin plays as a penguin. This file adds what tennis needs: the racket arm,
// a ring in the player's side colour and a blob shadow.
(function () {
  'use strict';

  const SCALE = 1.13;

  function createTennisCharacter(THREE, { avatar, isNear }) {
    const root = new THREE.Group();
    // Larger than life: from the broadcast camera a true-to-scale player is a few pixels of animal.
    root.scale.setScalar(1.4);
    const side = isNear ? 0x38bdf8 : 0xfb7185;

    const rig = SH.avatarRig(THREE, avatar);
    rig.group.scale.setScalar(SCALE);
    root.add(rig.group);
    // The racket arm replaces the avatar's own right arm.
    if (rig.armR) rig.armR.visible = false;

    // Soft blob shadow, so the player sits on the court without a shadow pass
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.035;
    root.add(blob);

    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: side, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.05;
    root.add(groundRing);

    // Racket arm pivot, at the avatar's shoulder
    const armMat = new THREE.MeshLambertMaterial({ color: rig.meta.rim });
    const armPivot = new THREE.Group();
    armPivot.position.set(0.38, rig.shoulderY * SCALE + 0.07, 0);
    const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), armMat);
    armMesh.position.set(0, -0.18, 0.14);
    armMesh.rotation.x = Math.PI / 3;
    armPivot.add(armMesh);

    // Tennis racket, its frame in the side colour
    const racketGroup = new THREE.Group();
    racketGroup.position.set(0, -0.34, 0.38);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.34, 8),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.14;
    racketGroup.add(handle);

    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.026, 8, 24), new THREE.MeshLambertMaterial({ color: side }));
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

    return {
      root,
      headGroup: rig.head,
      armPivot,
      racketGroup,
      meta: rig.meta,
      swingTimer: 0,
      swingDuration: 0.34,
      swingSide: 'forehand',
      hitReaction: 0,
    };
  }

  window.SH_TENNIS_CHAR = { createTennisCharacter };
})();
