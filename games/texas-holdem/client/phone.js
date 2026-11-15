// Texas Hold'em on the phone.

    state.thHideCards = false;
    state.thPeekingHold = false;
    state.thConfirmAction = null;
    state.thConfirmTimer = null;
    state.thRaiseTo = null;
    state.thTurnKey = null;

    function thSend(type, payload) {
      thClearConfirm();
      send({ type: 'GAME_ACTION', action: { type, ...(payload || {}) } });
    }

    function thClearConfirm() {
      clearTimeout(state.thConfirmTimer);
      state.thConfirmTimer = null;
      state.thConfirmAction = null;
    }

    function thArmOrSend(kind, sendType, payload) {
      if (state.thConfirmAction === kind) {
        thSend(sendType, payload);
        return;
      }
      thClearConfirm();
      state.thConfirmAction = kind;
      state.thConfirmTimer = setTimeout(() => {
        state.thConfirmAction = null;
        if (state.thLastMsg) thRenderControls(state.thLastMsg);
      }, 2500);
      if (state.thLastMsg) thRenderControls(state.thLastMsg);
    }

    function thTogglePin() {
      state.thHideCards = !state.thHideCards;
      state.thPeekingHold = false;
      if (state.thLastMsg) thRenderHole(state.thLastMsg);
    }

    function thPeekStart(e) {
      if (!state.thHideCards) return;
      e.preventDefault();
      state.thPeekingHold = true;
      if (state.thLastMsg) thRenderHole(state.thLastMsg);
    }

    function thPeekEnd() {
      if (!state.thPeekingHold) return;
      state.thPeekingHold = false;
      if (state.thLastMsg) thRenderHole(state.thLastMsg);
    }

    function thStatusText(msg) {
      if (msg.phase === 'finished') {
        return msg.winner === state.playerId ? 'You won the table!' : tcName(msg.winner, msg) + ' won!';
      }
      if (msg.phase === 'showdown') {
        const w = msg.showdown?.winners?.[0];
        return w ? tcName(w.playerId, msg) + ' won ' + tcNum(w.amount) : 'Showdown';
      }
      if (msg.folded?.[state.playerId]) return 'Folded · watching hand';
      if (msg.isMyTurn) return 'Your turn!';
      return tcName(msg.turn, msg) + "'s turn";
    }

    function thRenderBoard(msg) {
      const board = msg.board || [];
      let html = '';
      for (let i = 0; i < 5; i++) {
        if (board[i]) html += renderTableCard(board[i], { size: 'md', dataId: '' });
        else html += '<div class="th-slot"></div>';
      }
      document.getElementById('thBoard').innerHTML = html;
    }

    function thRenderShowdown(msg) {
      const el = document.getElementById('thShowdown');
      if (msg.phase !== 'showdown' || !msg.showdown?.winners?.length) {
        el.innerHTML = '';
        return;
      }
      el.innerHTML = msg.showdown.winners.map(w =>
        '<div class="th-win-banner"><b>' + escapeHtml(tcName(w.playerId, msg)) + '</b> wins <span class="tc-mono">' + tcNum(w.amount) + '</span> · ' + escapeHtml(w.handName) + '</div>'
      ).join('');
    }

    function thRenderHole(msg) {
      const hole = msg.myHand || [];
      const folded = !!msg.folded?.[state.playerId];
      const labelEl = document.getElementById('thHoleLabel');
      const cardsEl = document.getElementById('thHoleCards');
      const peekBtn = document.getElementById('thPeekBtn');
      if (!hole.length) {
        labelEl.textContent = 'Sitting out this hand';
        cardsEl.innerHTML = '';
        if (peekBtn) peekBtn.hidden = true;
        return;
      }
      if (peekBtn) {
        peekBtn.hidden = false;
        peekBtn.textContent = state.thHideCards ? 'Show Cards' : 'Hide Cards';
      }
      const hidden = state.thHideCards && !state.thPeekingHold;
      labelEl.textContent = state.thPeekingHold
        ? 'Peeking — release to hide'
        : hidden
          ? 'Hidden (hold cards to peek)'
          : 'Your hole cards';
      cardsEl.innerHTML = hole.map(c =>
        renderTableCard(hidden ? null : c, {
          size: 'lg',
          facedown: hidden,
          dim: folded,
          dataId: '',
        })
      ).join('');
    }

    function thClampRaise(to, msg) {
      const minTo = msg.myMinRaiseTo || 0;
      const allInTo = msg.myMaxBetTo || minTo;
      return Math.max(minTo, Math.min(allInTo, Math.round(to / 10) * 10));
    }

    function thSetRaise(to) {
      if (!state.thLastMsg) return;
      thClearConfirm();
      state.thRaiseTo = thClampRaise(to, state.thLastMsg);
      thRenderControls(state.thLastMsg);
    }

    function thStepRaise(delta) {
      if (!state.thLastMsg) return;
      thClearConfirm();
      const cur = state.thRaiseTo != null ? state.thRaiseTo : (state.thLastMsg.myMinRaiseTo || 0);
      state.thRaiseTo = thClampRaise(cur + delta, state.thLastMsg);
      thRenderControls(state.thLastMsg);
    }

    function thSliderInput(val) {
      thClearConfirm();
      state.thRaiseTo = Number(val);
      const btn = document.getElementById('thRaiseConfirmBtn');
      const read = document.getElementById('thRaiseReadout');
      const maxTo = state.thLastMsg?.myMaxBetTo || 0;
      if (read) read.textContent = String(tcNum(state.thRaiseTo));
      if (btn) {
        btn.textContent = state.thRaiseTo >= maxTo ? 'All-In ' + tcNum(maxTo) : 'Raise to ' + tcNum(state.thRaiseTo);
        btn.classList.toggle('tc-btn-gold', state.thRaiseTo >= maxTo);
      }
    }

    function thSubmitRaise() {
      const msg = state.thLastMsg;
      if (!msg) return;
      const to = thClampRaise(state.thRaiseTo != null ? state.thRaiseTo : msg.myMinRaiseTo, msg);
      if (to >= msg.myMaxBetTo) {
        thArmOrSend('allin', 'raise', { to: msg.myMaxBetTo });
      } else {
        thSend('raise', { to });
      }
    }

    function thRenderControls(msg) {
      const el = document.getElementById('thControls');
      if (msg.phase === 'showdown') {
        const amReady = !!(msg.nextReady && msg.nextReady[state.playerId]);
        const rc = msg.nextReadyCount != null ? msg.nextReadyCount : 0;
        const rt = msg.nextReadyTotal != null ? msg.nextReadyTotal : 1;
        const label = amReady
          ? 'Ready ✓ (' + rc + '/' + rt + ') — Tap to Cancel'
          : 'Ready Next Hand (' + rc + '/' + rt + ')';
        const adminAdvance = state.isAdmin
          ? '<button type="button" class="tc-btn tc-btn-lg w-full min-h-[44px]" onclick="thSend(\'nextHand\')">Admin: Advance Now</button>'
          : '';
        el.innerHTML =
          '<button type="button" class="tc-cta tc-cta-big' + (amReady ? ' tc-cta-gin' : '') + '" onclick="thSend(\'readyNextHand\')">' + label + '</button>' +
          adminAdvance;
        return;
      }
      if (msg.phase === 'finished') {
        el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" disabled>Game over</button>';
        return;
      }
      if (!msg.isMyTurn) {
        el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" disabled>Waiting for ' + escapeHtml(tcName(msg.turn, msg)) + '…</button>';
        return;
      }

      const canRaise = msg.myMaxBetTo > msg.currentBet;
      const minTo = msg.myMinRaiseTo;
      const allInTo = msg.myMaxBetTo;
      const halfPotTo = thClampRaise((msg.pot || 0) * 0.5 + msg.currentBet, msg);
      const potTo = thClampRaise((msg.pot || 0) + msg.currentBet, msg);
      if (state.thRaiseTo == null || state.thRaiseTo < minTo || state.thRaiseTo > allInTo) {
        state.thRaiseTo = minTo;
      }

      let raiseHtml = '';
      if (canRaise) {
        const presets = [
          { label: 'Min', to: minTo },
        ];
        if (halfPotTo > minTo && halfPotTo < allInTo) presets.push({ label: '½ Pot', to: halfPotTo });
        if (potTo > halfPotTo && potTo < allInTo) presets.push({ label: 'Pot', to: potTo });
        presets.push({ label: 'Max', to: allInTo });

        const isAllIn = state.thRaiseTo >= allInTo;
        const allInArmed = state.thConfirmAction === 'allin';
        const submitLabel = allInArmed
          ? 'Tap again: All-In ' + tcNum(allInTo) + '!'
          : isAllIn
            ? 'All-In ' + tcNum(allInTo)
            : 'Raise to ' + tcNum(state.thRaiseTo);

        raiseHtml =
          '<div class="th-raise-box">' +
            '<div class="th-preset-row">' +
              presets.map(o =>
                '<button type="button" class="tc-btn th-preset-btn' + (state.thRaiseTo === o.to ? ' tc-active' : '') + '" onclick="thSetRaise(' + o.to + ')">' + o.label + '</button>'
              ).join('') +
            '</div>' +
            '<div class="th-slider-row">' +
              '<button type="button" class="tc-btn th-stepper-btn" onclick="thStepRaise(-20)" aria-label="Decrease raise by 20">−BB</button>' +
              '<input type="range" id="thRaiseSlider" class="th-slider" min="' + tcNum(minTo) + '" max="' + tcNum(allInTo) + '" step="10" value="' + tcNum(state.thRaiseTo) + '" oninput="thSliderInput(this.value)">' +
              '<button type="button" class="tc-btn th-stepper-btn" onclick="thStepRaise(20)" aria-label="Increase raise by 20">+BB</button>' +
              '<span class="tc-mono th-raise-val" id="thRaiseReadout">' + tcNum(state.thRaiseTo) + '</span>' +
            '</div>' +
            '<button type="button" id="thRaiseConfirmBtn" class="tc-btn tc-btn-lg w-full min-h-[44px] ' +
              (allInArmed ? 'th-btn-confirm' : isAllIn ? 'tc-btn-gold' : 'tc-active') +
              '" onclick="thSubmitRaise()">' + submitLabel + '</button>' +
          '</div>';
      }

      const foldArmed = state.thConfirmAction === 'fold';
      const foldBtn = '<button type="button" class="tc-btn tc-btn-lg ' +
        (foldArmed ? 'th-btn-confirm' : 'tc-btn-warn') +
        '" onclick="thArmOrSend(\'fold\', \'fold\')">' + (foldArmed ? 'Tap to Confirm Fold' : 'Fold') + '</button>';

      const mainBtn = msg.myCanCheck
        ? '<button type="button" class="tc-btn tc-btn-lg tc-btn-gin" onclick="thSend(\'check\')">Check</button>'
        : '<button type="button" class="tc-btn tc-btn-lg tc-btn-gin" onclick="thSend(\'call\')">Call ' + tcNum(Math.min(msg.myToCall, msg.chips?.[state.playerId] || 0)) + '</button>';

      el.innerHTML =
        '<div class="tc-btn-grid">' + foldBtn + mainBtn + '</div>' +
        raiseHtml;
    }

    function renderHoldemState(msg) {
      const turnKey = msg.handNumber + ':' + msg.phase + ':' + msg.turn + ':' + (msg.currentBet || 0);
      if (state.thTurnKey !== turnKey) {
        state.thTurnKey = turnKey;
        thClearConfirm();
        state.thRaiseTo = null;
      }
      state.thLastMsg = msg;
      tcFitScreen('holdemSection');
      const active = !!msg.isMyTurn || (msg.phase === 'showdown' && !(msg.nextReady && msg.nextReady[state.playerId]));
      document.getElementById('holdemSection')?.classList.toggle('tc-my-turn-glow', active);
      tcSetStatus('th', thStatusText(msg), active);
      tcBuzz('thWasTurn', !!msg.isMyTurn);
      document.getElementById('thHandPill').textContent = 'H' + msg.handNumber + '/' + msg.maxHands;
      document.getElementById('thChipsPill').textContent = tcNum(msg.chips?.[state.playerId] ?? 0) + ' chips';
      document.getElementById('thPotPill').textContent = 'Pot ' + tcNum(msg.pot || 0);
      document.getElementById('thStreetPill').textContent = msg.phase.charAt(0).toUpperCase() + msg.phase.slice(1);
      thRenderBoard(msg);
      thRenderShowdown(msg);
      thRenderHole(msg);
      thRenderControls(msg);
    }

    SH.registerGame('texas-holdem', {
      section: 'holdemSection',
      render: renderHoldemState,
      redraw() { if (state.thLastMsg) renderHoldemState(state.thLastMsg); },
      reset() {
        thClearConfirm();
        state.thHideCards = false;
        state.thPeekingHold = false;
        state.thRaiseTo = null;
        state.thTurnKey = null;
        state.thLastMsg = null;
        document.getElementById('holdemSection')?.classList.remove('tc-my-turn-glow');
      },
    });
