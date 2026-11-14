// Texas Hold'em on the phone.

    state.thHideCards = false;

    function thSend(type, payload) {
      send({ type: 'GAME_ACTION', action: { type, ...(payload || {}) } });
    }

    function thTogglePeek() {
      state.thHideCards = !state.thHideCards;
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
        if (board[i]) html += renderTableCard(board[i], { size: 'sm', dataId: '' });
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
      if (!hole.length) {
        labelEl.textContent = 'Sitting out this hand';
        cardsEl.innerHTML = '';
        return;
      }
      labelEl.textContent = state.thHideCards ? 'Hole cards hidden (tap to peek)' : 'Your hole cards (tap to hide)';
      cardsEl.innerHTML = hole.map(c =>
        renderTableCard(state.thHideCards ? null : c, {
          size: 'md',
          facedown: state.thHideCards,
          dim: folded,
          dataId: '',
        })
      ).join('');
    }

    function thRenderControls(msg) {
      const el = document.getElementById('thControls');
      if (msg.phase === 'showdown') {
        el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" onclick="thSend(\'nextHand\')">Next Hand</button>';
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
      const midTo = Math.min(msg.myMaxBetTo, minTo + 40);
      const allInTo = msg.myMaxBetTo;

      let raiseHtml = '';
      if (canRaise) {
        raiseHtml = '<div class="th-raise-row">' +
          '<button type="button" class="tc-btn" onclick="thSend(\'raise\', { to: ' + minTo + ' })">Raise ' + tcNum(minTo) + '</button>' +
          (midTo > minTo && midTo < allInTo ? '<button type="button" class="tc-btn" onclick="thSend(\'raise\', { to: ' + midTo + ' })">Raise ' + tcNum(midTo) + '</button>' : '') +
          '<button type="button" class="tc-btn tc-btn-warn" onclick="thSend(\'raise\', { to: ' + allInTo + ' })">All-In ' + tcNum(allInTo) + '</button>' +
        '</div>';
      }

      const mainBtn = msg.myCanCheck
        ? '<button type="button" class="tc-btn tc-btn-gin" onclick="thSend(\'check\')">Check</button>'
        : '<button type="button" class="tc-btn tc-btn-gin" onclick="thSend(\'call\')">Call ' + tcNum(Math.min(msg.myToCall, msg.chips?.[state.playerId] || 0)) + '</button>';

      el.innerHTML =
        '<div class="tc-actionbar">' +
          '<button type="button" class="tc-btn th-btn-fold" onclick="thSend(\'fold\')">Fold</button>' +
          mainBtn +
        '</div>' +
        raiseHtml;
    }

    function renderHoldemState(msg) {
      state.thLastMsg = msg;
      tcFitScreen('holdemSection');
      const active = !!msg.isMyTurn || msg.phase === 'showdown';
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
      reset() { state.thHideCards = false; state.thLastMsg = null; },
    });
