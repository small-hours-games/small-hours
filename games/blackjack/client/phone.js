// Blackjack on the phone.

    state.bjBetAmount = 50;
    state.bjLastBet = null;

    function bjSend(type, payload) {
      send({ type: 'GAME_ACTION', action: { type, ...(payload || {}) } });
    }

    function bjStatusText(msg) {
      if (msg.phase === 'finished') {
        return msg.winner === state.playerId ? 'You won the table!' : tcName(msg.winner, msg) + ' won!';
      }
      if (msg.phase === 'betting') {
        return msg.mySeat?.betPlaced ? 'Waiting for other bets…' : 'Place your bet';
      }
      if (msg.phase === 'settled') return 'Round ' + msg.round + ' settled';
      if (msg.isMyTurn) return 'Your turn!';
      return tcName(msg.turn, msg) + "'s turn";
    }

    function bjOutcomeLabel(hand) {
      if (hand.outcome === 'blackjack') return '<span class="bj-badge bj-badge-win">Blackjack! +' + tcNum(hand.payout - hand.bet) + '</span>';
      if (hand.outcome === 'win') return '<span class="bj-badge bj-badge-win">Win +' + tcNum(hand.bet) + '</span>';
      if (hand.outcome === 'push') return '<span class="bj-badge bj-badge-push">Push</span>';
      if (hand.outcome === 'bust') return '<span class="bj-badge bj-badge-lose">Bust</span>';
      if (hand.outcome === 'lose') return '<span class="bj-badge bj-badge-lose">Lose</span>';
      if (hand.status === 'blackjack') return '<span class="bj-badge bj-badge-win">Blackjack!</span>';
      if (hand.status === 'busted') return '<span class="bj-badge bj-badge-lose">Bust</span>';
      if (hand.status === 'stood') return '<span class="bj-badge bj-badge-push">Stood</span>';
      return '';
    }

    function bjRenderDealer(msg) {
      const cardsEl = document.getElementById('bjDealerCards');
      const totalEl = document.getElementById('bjDealerTotal');
      const d = msg.dealer || { cards: [] };
      if (!d.cards || !d.cards.length) {
        cardsEl.innerHTML = '<span class="bj-empty">Waiting for bets</span>';
        totalEl.textContent = '';
        return;
      }
      let html = d.cards.map(c => renderTableCard(c, { size: 'md', dataId: '' })).join('');
      if (d.hiddenHole) {
        html += renderTableCard(null, { size: 'md', facedown: true, dataId: '' });
      }
      cardsEl.innerHTML = html;
      totalEl.textContent = d.hiddenHole ? d.total + ' + ?' : d.isBusted ? d.total + ' BUST' : String(d.total);
    }

    function bjRenderHands(msg) {
      const wrap = document.getElementById('bjMyHands');
      const seat = msg.mySeat;
      if (!seat || !seat.hands || !seat.hands.length) {
        const betInfo = seat && seat.betPlaced ? 'Bet placed: ' + tcNum(seat.pendingBet) : 'Pick a bet below';
        wrap.innerHTML = '<div class="bj-empty-hand">' + escapeHtml(betInfo) + '</div>';
        return;
      }
      wrap.innerHTML = seat.hands.map((hand, idx) => {
        const isActive = msg.isMyTurn && idx === msg.activeHandIndex;
        const cardsHtml = hand.cards.map(c => renderTableCard(c, { size: 'lg', dataId: '' })).join('');
        const meta = 'Total <b class="tc-mono">' + hand.total + (hand.soft ? ' (soft)' : '') + '</b> · Bet <b class="tc-mono">' + tcNum(hand.bet) + '</b>';
        return '<div class="bj-hand-box' + (isActive ? ' bj-hand-active' : '') + '">' +
          '<div class="bj-cards">' + cardsHtml + '</div>' +
          '<div class="bj-hand-meta">' + meta + ' ' + bjOutcomeLabel(hand) + '</div>' +
        '</div>';
      }).join('');
    }

    function bjRenderControls(msg) {
      const el = document.getElementById('bjControls');
      const seat = msg.mySeat || { chips: 0 };

      if (msg.phase === 'betting') {
        if (seat.betPlaced) {
          el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" disabled>Waiting for table…</button>';
          return;
        }
        const maxBet = seat.chips;
        const minBet = Math.min(10, maxBet);
        if (state.bjBetAmount > maxBet) state.bjBetAmount = maxBet;
        if (state.bjBetAmount < minBet) state.bjBetAmount = minBet;
        const presets = [10, 25, 50, 100, 250].filter(v => v <= maxBet);
        const presetBtns = presets.map(v =>
          '<button type="button" class="bj-chip bj-chip-' + v + (state.bjBetAmount === v ? ' bj-chip-sel' : '') + '" onclick="bjPickBet(' + v + ')">' + v + '</button>'
        ).join('') + '<button type="button" class="bj-chip bj-chip-all' + (state.bjBetAmount === maxBet ? ' bj-chip-sel' : '') + '" onclick="bjPickBet(' + maxBet + ')">All-In</button>';

        const canRepeat = state.bjLastBet && state.bjLastBet >= minBet && state.bjLastBet <= maxBet && state.bjLastBet !== state.bjBetAmount;
        const adjustRow =
          '<div class="bj-adjust-row">' +
            '<button type="button" class="tc-btn bj-adjust-btn" onclick="bjAdjustBet(-10)"' + (state.bjBetAmount <= minBet ? ' disabled' : '') + '>−10</button>' +
            '<button type="button" class="tc-btn bj-adjust-btn" onclick="bjAdjustBet(10)"' + (state.bjBetAmount >= maxBet ? ' disabled' : '') + '>+10</button>' +
            '<button type="button" class="tc-btn bj-adjust-btn" onclick="bjAdjustBet(25)"' + (state.bjBetAmount >= maxBet ? ' disabled' : '') + '>+25</button>' +
            (canRepeat ? '<button type="button" class="tc-btn tc-active bj-adjust-btn" onclick="bjPickBet(' + tcNum(state.bjLastBet) + ')">Repeat ' + tcNum(state.bjLastBet) + '</button>' : '') +
          '</div>';

        el.innerHTML =
          '<div class="bj-bet-row">' + presetBtns + '</div>' +
          adjustRow +
          '<button type="button" class="tc-cta tc-cta-big" onclick="bjPlaceBet()">Deal Hand · Bet ' + tcNum(state.bjBetAmount) + '</button>';
        return;
      }

      if (msg.phase === 'playing') {
        if (!msg.isMyTurn) {
          el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" disabled>Waiting for ' + escapeHtml(tcName(msg.turn, msg)) + '…</button>';
          return;
        }
        el.innerHTML =
          '<div class="tc-btn-grid">' +
            '<button type="button" class="tc-btn tc-btn-lg tc-btn-gin" onclick="bjSend(\'hit\')">Hit</button>' +
            '<button type="button" class="tc-btn tc-btn-lg tc-btn-gold" onclick="bjSend(\'stand\')">Stand</button>' +
            (msg.myCanDouble ? '<button type="button" class="tc-btn tc-btn-lg tc-active" onclick="bjSend(\'double\')">Double 2×</button>' : '') +
            (msg.myCanSplit ? '<button type="button" class="tc-btn tc-btn-lg" onclick="bjSend(\'split\')">Split</button>' : '') +
          '</div>';
        return;
      }

      if (msg.phase === 'settled') {
        const amReady = !!(msg.nextReady && msg.nextReady[state.playerId]);
        const readyCount = msg.nextReadyCount != null ? msg.nextReadyCount : 0;
        const readyTotal = msg.nextReadyTotal != null ? msg.nextReadyTotal : 1;
        const readyLabel = amReady
          ? 'Ready ✓ (' + readyCount + '/' + readyTotal + ') — Tap to Cancel'
          : 'Ready for Next Round (' + readyCount + '/' + readyTotal + ')';
        const adminAdvance = state.isAdmin
          ? '<button type="button" class="tc-btn tc-btn-lg w-full min-h-[44px]" onclick="bjSend(\'nextRound\')">Admin: Advance Now</button>'
          : '';
        el.innerHTML =
          '<button type="button" class="tc-cta tc-cta-big' + (amReady ? ' tc-cta-gin' : '') + '" onclick="bjSend(\'readyNextRound\')">' + readyLabel + '</button>' +
          adminAdvance;
        return;
      }

      el.innerHTML = '<button type="button" class="tc-cta tc-cta-big" disabled>Game over</button>';
    }

    function bjPickBet(amount) {
      state.bjBetAmount = amount;
      if (state.bjLastMsg) bjRenderControls(state.bjLastMsg);
    }

    function bjAdjustBet(delta) {
      const maxBet = state.bjLastMsg?.mySeat?.chips ?? state.bjBetAmount;
      const minBet = Math.min(10, maxBet);
      state.bjBetAmount = Math.max(minBet, Math.min(maxBet, state.bjBetAmount + delta));
      if (state.bjLastMsg) bjRenderControls(state.bjLastMsg);
    }

    function bjPlaceBet() {
      state.bjLastBet = state.bjBetAmount;
      bjSend('placeBet', { amount: state.bjBetAmount });
    }

    function renderBlackjackState(msg) {
      state.bjLastMsg = msg;
      tcFitScreen('blackjackSection');
      const active = (msg.phase === 'betting' && !msg.mySeat?.betPlaced) || !!msg.isMyTurn || (msg.phase === 'settled' && !(msg.nextReady && msg.nextReady[state.playerId]));
      document.getElementById('blackjackSection')?.classList.toggle('tc-my-turn-glow', active);
      tcSetStatus('bj', bjStatusText(msg), active);
      tcBuzz('bjWasTurn', !!msg.isMyTurn);
      document.getElementById('bjRoundPill').textContent = 'R' + msg.round + '/' + msg.maxRounds;
      document.getElementById('bjChipsPill').textContent = tcNum(msg.mySeat?.chips ?? 0) + ' chips';
      bjRenderDealer(msg);
      bjRenderHands(msg);
      bjRenderControls(msg);
    }

    SH.registerGame('blackjack', {
      section: 'blackjackSection',
      render: renderBlackjackState,
      redraw() { if (state.bjLastMsg) renderBlackjackState(state.bjLastMsg); },
      reset() {
        state.bjBetAmount = 50;
        state.bjLastBet = null;
        state.bjLastMsg = null;
        document.getElementById('blackjackSection')?.classList.remove('tc-my-turn-glow');
      },
    });
