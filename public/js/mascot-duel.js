// Periodic 3D Lion vs. Frog Card-Stack Duel for the TV Game-Show Lobby.
// Strictly bounded to the right of .invite-panel so #qrContainer and #roomCode are never covered.
(function (root) {
  const CARD_FACES = [
    '/cards/faces/SPADE-1.svg',
    '/cards/faces/HEART-13-KING.svg',
    '/cards/faces/DIAMOND-12-QUEEN.svg',
    '/cards/faces/CLUB-11-JACK.svg',
    '/cards/faces/HEART-1.svg',
    '/cards/faces/SPADE-13-KING.svg',
    '/cards/faces/DIAMOND-1.svg',
    '/cards/faces/CLUB-10.svg',
    '/cards/faces/HEART-10.svg',
    '/cards/faces/SPADE-12-QUEEN.svg',
    '/cards/faces/DIAMOND-13-KING.svg',
    '/cards/faces/CLUB-1.svg',
  ];

  const LION_CALLOUTS = ['ROAR! 🦁', 'ACE HIGH!', 'KING MOVE!', 'BURN! 🔥', 'ROYAL SLAM!'];
  const FROG_CALLOUTS = ['RIBBIT! 🐸', 'CROAK SHOT!', 'WILD CARD!', 'SNAP! ⚡', 'BULLSEYE!'];
  const CLASH_CALLOUTS = ['CLASH! ⚔️', 'DOUBLE ACE! 💥', 'CARD STORM!'];

  const INITIAL_DELAY_MS = 6500;
  const DUEL_INTERVAL_MS = 38000;
  const DUEL_DURATION_MS = 6800;
  const STACK_SIZE = 10;

  function buildStackHtml(side) {
    let cards = '';
    for (let i = 0; i < STACK_SIZE; i++) {
      const face = CARD_FACES[(i + (side === 'frog' ? 4 : 0)) % CARD_FACES.length];
      const isTop = i === STACK_SIZE - 1;
      cards +=
        '<div class="duel-stack-card" data-stack-idx="' + i + '" style="--stack-i:' + i + ';">' +
          '<img src="' + (isTop ? face : '/cards/backs/back.svg') + '" alt="" draggable="false">' +
        '</div>';
    }
    return (
      '<div class="duel-card-stack duel-card-stack-' + side + '" data-role="stack-' + side + '">' +
        cards +
        '<span class="duel-stack-count" data-role="count-' + side + '">' + STACK_SIZE + '</span>' +
      '</div>'
    );
  }

  function buildMascotStageHtml() {
    let manePetals = '';
    for (let i = 0; i < 12; i++) {
      manePetals += '<span class="lion-mane-petal" style="--petal-i:' + i + ';"></span>';
    }

    return (
      '<div class="mascot-duel-arena" data-role="arena">' +
        '<div class="mascot-duel-banner" data-role="banner">' +
          '<span class="duel-banner-spark">🃏</span>' +
          '<span>3D CARD STACK DUEL!</span>' +
          '<span class="duel-banner-spark">⚡</span>' +
        '</div>' +

        /* 3D LION (Left Duellist) */
        '<div class="duel-fighter duel-fighter-lion" data-role="lion">' +
          '<div class="fighter-shadow"></div>' +
          '<div class="fighter-3d-rig">' +
            '<div class="fighter-torso fighter-torso-lion">' +
              '<div class="fighter-lapel"></div>' +
              '<div class="fighter-badge">★</div>' +
            '</div>' +
            '<div class="fighter-head fighter-head-lion">' +
              '<div class="lion-mane-ring">' + manePetals + '</div>' +
              '<div class="lion-ear lion-ear-left"></div>' +
              '<div class="lion-ear lion-ear-right"></div>' +
              '<div class="fighter-crown">👑</div>' +
              '<div class="lion-face-sphere">' +
                '<div class="fighter-brow fighter-brow-left"></div>' +
                '<div class="fighter-brow fighter-brow-right"></div>' +
                '<div class="fighter-eye fighter-eye-left"><span class="pupil"></span></div>' +
                '<div class="fighter-eye fighter-eye-right"><span class="pupil"></span></div>' +
                '<div class="lion-snout">' +
                  '<div class="lion-nose"></div>' +
                  '<div class="lion-mouth"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="fighter-arm fighter-arm-deck">' +
              buildStackHtml('lion') +
            '</div>' +
            '<div class="fighter-arm fighter-arm-throw" data-role="throw-arm-lion">' +
              '<div class="fighter-paw fighter-paw-lion"></div>' +
            '</div>' +
          '</div>' +
          '<div class="fighter-callout" data-role="callout-lion"></div>' +
        '</div>' +

        /* Flying 3D Cards Layer */
        '<div class="duel-flying-layer" data-role="flying-layer"></div>' +

        /* 3D FROG (Right Duellist) */
        '<div class="duel-fighter duel-fighter-frog" data-role="frog">' +
          '<div class="fighter-shadow"></div>' +
          '<div class="fighter-3d-rig">' +
            '<div class="fighter-torso fighter-torso-frog">' +
              '<div class="frog-belly"></div>' +
              '<div class="frog-bowtie">🎀</div>' +
            '</div>' +
            '<div class="fighter-head fighter-head-frog">' +
              '<div class="fighter-crown">👑</div>' +
              '<div class="frog-eye-dome frog-eye-left"><span class="pupil"></span></div>' +
              '<div class="frog-eye-dome frog-eye-right"><span class="pupil"></span></div>' +
              '<div class="frog-face-sphere">' +
                '<div class="frog-cheek frog-cheek-left"></div>' +
                '<div class="frog-cheek frog-cheek-right"></div>' +
                '<div class="frog-smile"></div>' +
                '<div class="frog-vocal-sac"></div>' +
              '</div>' +
            '</div>' +
            '<div class="fighter-arm fighter-arm-deck">' +
              buildStackHtml('frog') +
            '</div>' +
            '<div class="fighter-arm fighter-arm-throw" data-role="throw-arm-frog">' +
              '<div class="fighter-paw fighter-paw-frog"></div>' +
            '</div>' +
          '</div>' +
          '<div class="fighter-callout" data-role="callout-frog"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function createMascotDuel(options) {
    const opts = options || {};
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const win = opts.window || (typeof window !== 'undefined' ? window : null);

    let stageEl = null;
    let isRunning = false;
    let activeLobby = true;
    let loopTimer = null;
    let stepTimers = [];
    let duelCount = 0;
    let lastChaseDirection = null;

    function clearStepTimers() {
      while (stepTimers.length) {
        clearTimeout(stepTimers.pop());
      }
    }

    function scheduleStep(fn, delay) {
      const id = setTimeout(fn, delay);
      stepTimers.push(id);
      return id;
    }

    // Compute safe horizontal bounds strictly to the right of .invite-panel and #qrContainer
    function computeSafeLeftPx() {
      if (!doc) return 380;
      const invitePanel = doc.querySelector ? doc.querySelector('.invite-panel') : null;
      const qrContainer = doc.getElementById ? doc.getElementById('qrContainer') : null;
      let rightEdge = 0;
      if (invitePanel && typeof invitePanel.getBoundingClientRect === 'function') {
        const rect = invitePanel.getBoundingClientRect();
        if (rect && rect.right > rightEdge) rightEdge = rect.right;
      }
      if (qrContainer && typeof qrContainer.getBoundingClientRect === 'function') {
        const rect = qrContainer.getBoundingClientRect();
        if (rect && rect.right > rightEdge) rightEdge = rect.right;
      }
      // Always reserve at least 360px on the left so the QR code column is never touched
      return Math.max(360, Math.ceil(rightEdge + 24));
    }

    function updateStageBounds() {
      if (!stageEl) return { safeLeft: 380 };
      const safeLeft = computeSafeLeftPx();
      stageEl.style.left = safeLeft + 'px';
      stageEl.style.right = '24px';
      stageEl.dataset.safeLeft = String(safeLeft);
      return { safeLeft };
    }

    function ensureStage() {
      if (!doc) return null;
      stageEl = doc.getElementById('mascotDuelStage');
      if (!stageEl && doc.body && typeof doc.createElement === 'function') {
        stageEl = doc.createElement('div');
        stageEl.id = 'mascotDuelStage';
        stageEl.className = 'mascot-duel-stage';
        stageEl.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(stageEl);
      }
      if (stageEl && !stageEl.innerHTML) {
        stageEl.innerHTML = buildMascotStageHtml();
      }
      updateStageBounds();
      return stageEl;
    }

    function isLobbyVisible() {
      if (!activeLobby) return false;
      if (doc && doc.body && doc.body.classList && typeof doc.body.classList.contains === 'function') {
        if (doc.body.classList.contains('in-game')) return false;
      }
      return true;
    }

    function resetStacks() {
      if (!stageEl || !stageEl.querySelectorAll) return;
      const cards = stageEl.querySelectorAll('.duel-stack-card');
      cards.forEach(card => {
        card.classList.remove('is-thrown');
      });
      const lionCount = stageEl.querySelector('[data-role="count-lion"]');
      const frogCount = stageEl.querySelector('[data-role="count-frog"]');
      if (lionCount) lionCount.textContent = String(STACK_SIZE);
      if (frogCount) frogCount.textContent = String(STACK_SIZE);
    }

    function popTopCardFromStack(side, remaining) {
      if (!stageEl || !stageEl.querySelector) return;
      const card = stageEl.querySelector(
        '.duel-card-stack-' + side + ' .duel-stack-card[data-stack-idx="' + remaining + '"]'
      );
      if (card) card.classList.add('is-thrown');
      const badge = stageEl.querySelector('[data-role="count-' + side + '"]');
      if (badge) badge.textContent = String(Math.max(1, remaining));
    }

    function showCallout(side, text) {
      if (!stageEl || !stageEl.querySelector) return;
      const el = stageEl.querySelector('[data-role="callout-' + side + '"]');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('is-popping');
      void el.offsetWidth;
      el.classList.add('is-popping');
    }

    function spawnFlyingCard(fromSide, stepIdx, clashMidAir) {
      if (!stageEl || !stageEl.querySelector || !doc || typeof doc.createElement !== 'function') return;
      const layer = stageEl.querySelector('[data-role="flying-layer"]');
      if (!layer) return;

      const cardEl = doc.createElement('div');
      const faceUrl = CARD_FACES[(stepIdx * 2 + (fromSide === 'lion' ? 0 : 1)) % CARD_FACES.length];
      const arcHeight = -42 - (stepIdx % 3) * 18;
      const spinDeg = (fromSide === 'lion' ? 1 : -1) * (540 + (stepIdx % 2) * 180);

      cardEl.className =
        'duel-flying-card from-' + fromSide + (clashMidAir ? ' is-midair-clash' : '');
      cardEl.style.setProperty('--arc-y', arcHeight + 'px');
      cardEl.style.setProperty('--spin-z', spinDeg + 'deg');
      cardEl.innerHTML =
        '<div class="duel-flying-card-inner">' +
          '<img class="duel-card-face" src="' + faceUrl + '" alt="" draggable="false">' +
          '<img class="duel-card-back" src="/cards/backs/back.svg" alt="" draggable="false">' +
        '</div>';

      layer.appendChild(cardEl);

      // Trigger opponent hit reaction or mid-air spark burst
      scheduleStep(() => {
        const targetRole = fromSide === 'lion' ? 'frog' : 'lion';
        const targetEl = stageEl.querySelector('[data-role="' + targetRole + '"]');
        if (targetEl && !clashMidAir) {
          targetEl.classList.remove('is-hit');
          void targetEl.offsetWidth;
          targetEl.classList.add('is-hit');
        }
        if (clashMidAir && fromSide === 'lion') {
          const spark = doc.createElement('div');
          spark.className = 'duel-clash-burst';
          spark.textContent = CLASH_CALLOUTS[stepIdx % CLASH_CALLOUTS.length];
          layer.appendChild(spark);
          scheduleStep(() => spark.remove(), 650);
        }
      }, 340);

      scheduleStep(() => {
        cardEl.remove();
      }, 720);
    }

    function triggerDuel() {
      if (!isLobbyVisible() || isRunning) return false;
      ensureStage();
      if (!stageEl) return false;

      updateStageBounds();
      isRunning = true;
      clearStepTimers();
      resetStacks();

      // First duel chases out to the left; next duel chases out to the right
      const chaseDirection = duelCount % 2 === 0 ? 'left' : 'right';
      duelCount++;
      lastChaseDirection = chaseDirection;
      stageEl.dataset.chaseDirection = chaseDirection;

      stageEl.classList.add('is-active', 'phase-enter');
      stageEl.classList.remove('phase-duel', 'phase-exit', 'phase-exit-left', 'phase-exit-right');

      let lionCards = STACK_SIZE;
      let frogCards = STACK_SIZE;

      // Phase 1 -> Phase 2: Start throwing cards after entrance
      scheduleStep(() => {
        if (!isLobbyVisible()) { stopDuel(); return; }
        stageEl.classList.remove('phase-enter');
        stageEl.classList.add('phase-duel');
        showCallout('lion', 'DEAL EM! 🦁');
        showCallout('frog', 'BRING IT! 🐸');
      }, 950);

      // 9 rapid card-throwing volleys between 1.1s and 5.3s
      const volleySchedule = [
        { at: 1150, attacker: 'lion', clash: false },
        { at: 1600, attacker: 'frog', clash: false },
        { at: 2050, attacker: 'both', clash: true },
        { at: 2550, attacker: 'lion', clash: false },
        { at: 2980, attacker: 'frog', clash: false },
        { at: 3420, attacker: 'both', clash: true },
        { at: 3900, attacker: 'lion', clash: false },
        { at: 4320, attacker: 'frog', clash: false },
        { at: 4780, attacker: 'both', clash: true },
      ];

      volleySchedule.forEach((v, idx) => {
        scheduleStep(() => {
          if (!isLobbyVisible()) { stopDuel(); return; }

          if (v.attacker === 'lion' || v.attacker === 'both') {
            lionCards = Math.max(1, lionCards - 1);
            popTopCardFromStack('lion', lionCards);
            const lionEl = stageEl.querySelector('[data-role="lion"]');
            if (lionEl) {
              lionEl.classList.remove('is-throwing');
              void lionEl.offsetWidth;
              lionEl.classList.add('is-throwing');
            }
            spawnFlyingCard('lion', idx, v.clash);
            if (idx % 2 === 0) {
              showCallout('lion', LION_CALLOUTS[idx % LION_CALLOUTS.length]);
            }
          }

          if (v.attacker === 'frog' || v.attacker === 'both') {
            frogCards = Math.max(1, frogCards - 1);
            popTopCardFromStack('frog', frogCards);
            const frogEl = stageEl.querySelector('[data-role="frog"]');
            if (frogEl) {
              frogEl.classList.remove('is-throwing');
              void frogEl.offsetWidth;
              frogEl.classList.add('is-throwing');
            }
            spawnFlyingCard('frog', idx, v.clash);
            if (idx % 2 === 1) {
              showCallout('frog', FROG_CALLOUTS[idx % FROG_CALLOUTS.length]);
            }
          }
        }, v.at);
      });

      // Phase 3: Chase each other outside (first duel to the left, next duel to the right)
      scheduleStep(() => {
        if (!stageEl) return;
        stageEl.classList.remove('phase-duel');
        if (chaseDirection === 'left') {
          showCallout('lion', 'CATCH ME! 🦁💨');
          showCallout('frog', 'COME BACK! 🐸⚡');
          stageEl.classList.add('phase-exit', 'phase-exit-left');
        } else {
          showCallout('frog', 'TOO SLOW! 🐸💨');
          showCallout('lion', 'HEY WAIT! 🦁⚡');
          stageEl.classList.add('phase-exit', 'phase-exit-right');
        }
      }, 5400);

      scheduleStep(() => {
        stopDuel();
      }, DUEL_DURATION_MS);

      return true;
    }

    function stopDuel() {
      clearStepTimers();
      isRunning = false;
      if (stageEl) {
        stageEl.classList.remove('is-active', 'phase-enter', 'phase-duel', 'phase-exit', 'phase-exit-left', 'phase-exit-right');
        const flying = stageEl.querySelector ? stageEl.querySelector('[data-role="flying-layer"]') : null;
        if (flying) flying.innerHTML = '';
      }
    }

    function scheduleLoop() {
      clearTimeout(loopTimer);
      if (!activeLobby) return;
      loopTimer = setTimeout(function tick() {
        if (isLobbyVisible()) {
          triggerDuel();
        }
        if (activeLobby) {
          loopTimer = setTimeout(tick, DUEL_INTERVAL_MS);
        }
      }, INITIAL_DELAY_MS);
    }

    function setLobbyActive(inLobby) {
      activeLobby = Boolean(inLobby);
      if (!activeLobby) {
        clearTimeout(loopTimer);
        stopDuel();
      } else {
        ensureStage();
        scheduleLoop();
      }
    }

    function start() {
      ensureStage();
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('resize', updateStageBounds);
      }
      setLobbyActive(true);
    }

    return {
      start,
      triggerDuel,
      stopDuel,
      setLobbyActive,
      updateStageBounds,
      computeSafeLeftPx,
      isRunning: () => isRunning,
      getLastChaseDirection: () => lastChaseDirection,
    };
  }

  root.createMascotDuel = createMascotDuel;
  if (typeof window !== 'undefined') window.createMascotDuel = createMascotDuel;
})(globalThis);
