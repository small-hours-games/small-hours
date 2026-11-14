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
      if (!hole.length) {
        labelEl.textContent = 'Sitting out this hand';
        cardsEl.innerHTML = '';
        return;
      }
      labelEl.textContent = state.thHideCards ? 'Hole cards hidden (tap to peek)' : 'Your hole cards (tap to hide)';
      cardsEl.innerHTML = hole.map(c =>
        renderTableCard(state.thHideCards ? null : c, {
          size: 'lg',
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
      const allInTo = msg.myMaxBetTo;
      const halfPotTo = Math.min(allInTo, Math.max(minTo, Math.round(((msg.pot || 0) * 0.5 + msg.currentBet) / 10) * 10));
      const potTo = Math.min(allInTo, Math.max(minTo, Math.round(((msg.pot || 0) + msg.currentBet) / 10) * 10));

      let raiseHtml = '';
      if (canRaise) {
        const opts = [
          { label: 'Min ' + tcNum(minTo), to: minTo, cls: '' },
        ];
        if (halfPotTo > minTo && halfPotTo < allInTo) opts.push({ label: '½ Pot · ' + tcNum(halfPotTo), to: halfPotTo, cls: '' });
        if (potTo > halfPotTo && potTo < allInTo) opts.push({ label: 'Pot · ' + tcNum(potTo), to: potTo, cls: 'tc-active' });
        opts.push({ label: 'All-In ' + tcNum(allInTo), to: allInTo, cls: 'tc-btn-gold' });
        raiseHtml = '<div class="th-raise-row">' +
          opts.map(o => '<button type="button" class="tc-btn ' + o.cls + '" onclick="thSend(\'raise\', { to: ' + o.to + ' })">' + o.label + '</button>').join('') +
        '</div>';
      }

      const mainBtn = msg.myCanCheck
        ? '<button type="button" class="tc-btn tc-btn-lg tc-btn-gin" onclick="thSend(\'check\')">Check</button>'
        : '<button type="button" class="tc-btn tc-btn-lg tc-btn-gin" onclick="thSend(\'call\')">Call ' + tcNum(Math.min(msg.myToCall, msg.chips?.[state.playerId] || 0)) + '</button>';

      el.innerHTML =
        '<div class="tc-btn-grid">' +
          '<button type="button" class="tc-btn tc-btn-lg tc-btn-warn" onclick="thSend(\'fold\')">Fold</button>' +
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
