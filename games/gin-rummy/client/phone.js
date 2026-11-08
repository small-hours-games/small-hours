// Gin Rummy on the phone.

    state.grSelectedCard = null;

    // --- Gin Rummy ---
    function grOpponentId(msg) {
      return Object.keys(msg.cumulative || {}).find(id => id !== state.playerId) || null;
    }

    /** The thumb button: what the next move is. Pure, for tests. */
    function grCtaState(msg, selectedId) {
      if (msg.phase === 'scoring') return { label: 'Next hand', action: 'nextHand' };
      if (msg.phase === 'finished') return { label: 'Game over', disabled: true };
      if (!msg.isMyTurn) return { label: 'Waiting for ' + tcName(grOpponentId(msg), msg) + '…', disabled: true };
      if (msg.phase === 'first_turn') return { label: 'Take ' + tcCardShort(msg.discardTop), action: 'takeUpcard' };
      if (msg.turnPhase === 'draw') return { label: 'Draw from stock', action: 'drawStock' };
      if (!selectedId) return { label: 'Tap a card to discard', disabled: true };
      if (selectedId === msg.lastDrawnCardId) return { label: "Can't discard the card you just took", disabled: true };
      const card = (msg.myHand || []).find(c => c.id === selectedId);
      return card ? { label: 'Discard ' + tcCardShort(card), action: 'discard', verb: 'Discard', card: card } : { label: 'Tap a card to discard', disabled: true };
    }

    function grStatusText(msg) {
      const opp = tcName(grOpponentId(msg), msg);
      if (msg.phase === 'scoring') return 'Hand over';
      if (msg.phase === 'finished') return 'Game over';
      if (!msg.isMyTurn) {
        if (msg.phase === 'first_turn') return opp + ' is deciding on the upcard';
        return opp + (msg.turnPhase === 'draw' ? ' is drawing' : ' is discarding');
      }
      if (msg.phase === 'first_turn') return 'Take the upcard or decline it';
      if (msg.turnPhase === 'draw') return 'Tap Stock or Discard to draw';
      if (msg.canKnock) return msg.myDeadwoodValue === 0 ? 'Gin! Declare it or discard' : 'You can knock, or discard a card';
      return 'Pick a card to discard, or swipe it up';
    }

    function renderGinRummyState(msg) {
      state.grLastMsg = msg;
      tcFitScreen('ginRummySection');
      const me = state.playerId;
      const oppId = grOpponentId(msg);
      const playing = msg.phase !== 'scoring' && msg.phase !== 'finished';
      const myTurn = playing && !!msg.isMyTurn;
      const discardPhase = myTurn && msg.phase === 'drawing' && msg.turnPhase === 'discard';
      const drawPhase = myTurn && (msg.phase === 'drawing' || msg.phase === 'first_turn_draw') && msg.turnPhase === 'draw';
      const hand = msg.myHand || [];
      if (!hand.some(c => c.id === state.grSelectedCard)) state.grSelectedCard = null;
      if (!discardPhase) state.grSelectedCard = null;

      tcSetStatus('gr', grStatusText(msg), myTurn);
      tcBuzz('grWasTurn', myTurn);

      // Opponent pill and score chips
      const counts = msg.playerCardCounts || {};
      const oppCount = counts[oppId] != null ? counts[oppId] : (msg.opponentCardCount || 0);
      document.getElementById('grOppPill').className = 'tc-pill' + (playing && !msg.isMyTurn ? ' tc-pill-turn' : '');
      document.getElementById('grOppPill').innerHTML = escapeHtml(tcAvatar(oppId) + tcName(oppId, msg)) + ' <span class="tc-mono">' + tcNum(oppCount) + '🂠</span>';
      const cum = msg.cumulative || {};
      const boxes = msg.boxes || {};
      document.getElementById('grChips').innerHTML =
        (msg.handNumber ? '<span class="tc-pill tc-mono">Hand ' + tcNum(msg.handNumber) + '</span>' : '') +
        Object.keys(cum).map(id => '<span class="tc-pill">' + escapeHtml(id === me ? 'You' : tcName(id, msg)) +
          ' <b class="tc-mono">' + tcNum(cum[id]) + '</b>' + (boxes[id] ? ' <span class="tc-mono">▣' + tcNum(boxes[id]) + '</span>' : '') + '</span>').join('');

      // Table wells
      const stockCount = msg.stockCount || 0;
      const discardCount = msg.discardCount != null ? msg.discardCount : (msg.discardTop ? 1 : 0);
      const preview = (msg.discardPreview && msg.discardPreview.length) ? msg.discardPreview : (msg.discardTop ? [msg.discardTop] : []);
      const canStock = drawPhase && stockCount > 0;
      const canTakeDiscard = myTurn && !!msg.discardTop && (msg.phase === 'first_turn' || drawPhase);
      const canDropDiscard = discardPhase && !!state.grSelectedCard && state.grSelectedCard !== msg.lastDrawnCardId;
      document.getElementById('grStockStack').innerHTML = renderTableStack(null, stockCount, { size: 'md', facedown: true, emptyLabel: 'Empty', highlight: canStock });
      document.getElementById('grStockCount').textContent = stockCount + ' left';
      document.getElementById('grStockHint').textContent = canStock ? 'Tap to draw' : '';
      document.getElementById('grStockWell').classList.toggle('tc-well-active', canStock);
      document.getElementById('grDiscardStack').innerHTML = renderTableStack(preview, discardCount, { size: 'md', emptyLabel: 'Empty', highlight: canTakeDiscard || canDropDiscard });
      document.getElementById('grDiscardCount').textContent = discardCount + (discardCount === 1 ? ' card' : ' cards');
      document.getElementById('grDiscardHint').textContent = canDropDiscard ? 'Tap to discard' : canTakeDiscard ? (msg.phase === 'first_turn' ? 'Tap to take upcard' : 'Tap to take') : '';
      document.getElementById('grDiscardWell').classList.toggle('tc-well-active', canTakeDiscard || canDropDiscard);
      document.getElementById('grTable').hidden = !playing;

      // Hand rack with meld glows
      const melds = msg.myMelds || [];
      const meldOf = tcMeldMap(melds);
      const sortMode = state.grSortMode || 'melds';
      const ordered = orderHand(hand, sortMode, state.grOrder, melds);
      const handEl = document.getElementById('grHand');
      handEl.hidden = !playing;
      const arrivals = tcTrackArrivals('gr', hand, playing ? (msg.handNumber || 1) : null);
      const fromStock = state.grPrevStock != null && stockCount < state.grPrevStock;
      state.grPrevStock = stockCount;
      handEl.innerHTML = renderHandRack(ordered, {
        layout: tcLayout(), width: tcHandWidth('grHand'), cardW: tcHandCardW('grHand'),
        cardOpts: c => {
          const arrival = tcArrivalOpts(arrivals, c);
          return { selected: state.grSelectedCard === c.id, meld: meldOf[c.id], ...arrival, isNew: arrival.isNew || msg.lastDrawnCardId === c.id };
        },
      });
      attachHandGestures(handEl, {
        peek: true,
        onTap: id => grSelectCard(id),
        onPlay: id => grSwipeDiscard(id),
        onReorder: (id, targetId) => {
          state.grOrder = tcMoveId(ordered.map(c => c.id), id, targetId);
          state.grSortMode = 'custom';
          renderGinRummyState(state.grLastMsg);
        },
      });

      // HUD: sets / runs / deadwood
      const sets = melds.filter(m => m.type === 'set').length;
      const runs = melds.filter(m => m.type !== 'set').length;
      const dw = msg.myDeadwoodValue != null ? msg.myDeadwoodValue : null;
      const hud = document.getElementById('grHud');
      hud.hidden = !playing;
      hud.innerHTML = '<span><i style="background:var(--tc-set)"></i>Sets <b>' + sets + '</b></span><span class="tc-sep">|</span>' +
        '<span><i style="background:var(--tc-run)"></i>Runs <b>' + runs + '</b></span><span class="tc-sep">|</span>' +
        '<span>DW <b class="tc-dw' + (dw != null && dw <= 10 ? ' tc-dw-ok' : '') + '">' + (dw == null ? '–' : tcNum(dw)) + '</b></span>';

      // Thumb button, knock / decline, sort bar
      tcSetCta('grCta', grCtaState(msg, state.grSelectedCard));
      const knock = document.getElementById('grKnockBtn');
      knock.hidden = !(discardPhase && msg.canKnock);
      knock.textContent = dw === 0 ? 'GIN!' : 'Knock (' + dw + ')';
      knock.classList.toggle('tc-btn-gin', dw === 0);
      document.getElementById('grDeclineBtn').hidden = !(myTurn && msg.phase === 'first_turn');
      document.getElementById('grActionBar').hidden = !playing;
      document.getElementById('grLayoutBtn').textContent = tcLayout() === 'fan' ? 'Fan' : '2-Row';
      document.getElementById('grSortBtn').textContent = 'Sort: ' + (sortMode === 'custom' ? 'mine' : sortMode);
      tcSyncColoursBtn('grColoursBtn');

      // Result sheet
      const sheet = document.getElementById('grSheet');
      sheet.hidden = playing;
      if (!playing) renderGrScoring(msg);
      tcSqueeze('ginRummySection');
      tcLaunchArrivals(arrivals, hand, document.getElementById(fromStock ? 'grStockStack' : 'grDiscardStack'), handEl);
    }

    function grSelectCard(id) {
      const msg = state.grLastMsg;
      if (!msg) return;
      state.grSelectedCard = state.grSelectedCard === id ? null : id;
      renderGinRummyState(msg);
    }

    function grSwipeDiscard(id) {
      const msg = state.grLastMsg;
      if (!msg || !(msg.isMyTurn && msg.phase === 'drawing' && msg.turnPhase === 'discard')) { grSelectCard(id); return; }
      if (id === msg.lastDrawnCardId) {
        tcShake(document.getElementById('grHand'), id);
        showToast("You can't discard the card you just took", 'info');
        return;
      }
      state.grSelectedCard = id;
      grDiscard();
    }

    function grTapStack(source) {
      const msg = state.grLastMsg;
      if (!msg || !msg.isMyTurn) return;
      if (msg.phase === 'first_turn' && source === 'discard') { grAction('takeUpcard'); return; }
      if ((msg.phase === 'drawing' || msg.phase === 'first_turn_draw') && msg.turnPhase === 'draw') {
        if (source === 'stock' && (msg.stockCount || 0) > 0) grDraw('stock');
        else if (source === 'discard' && msg.discardTop) grDraw('discard');
        return;
      }
      if (source === 'discard' && msg.turnPhase === 'discard' && state.grSelectedCard) {
        if (state.grSelectedCard === msg.lastDrawnCardId) { showToast("You can't discard the card you just took", 'info'); return; }
        grDiscard();
      }
    }

    function grCtaAction() {
      const action = document.getElementById('grCta').dataset.action;
      if (action === 'takeUpcard' || action === 'nextHand') grAction(action);
      else if (action === 'drawStock') grDraw('stock');
      else if (action === 'discard') grDiscard();
    }

    function grSetSortMode(mode) {
      state.grSortMode = mode;
      state.grOrder = null;
      if (state.grLastMsg) renderGinRummyState(state.grLastMsg);
    }

    function grCycleSort() {
      const order = ['melds', 'rank', 'suit'];
      const i = order.indexOf(state.grSortMode || 'melds');
      grSetSortMode(order[(i + 1) % order.length]);
    }

    function grToggleLayout() {
      tcSetLayout(tcLayout() === 'fan' ? 'rack' : 'fan');
      if (state.grLastMsg) renderGinRummyState(state.grLastMsg);
    }

    function grDraw(source) {
      state.grSelectedCard = null;
      send({ type: 'GAME_ACTION', action: { type: 'draw', source } });
    }

    function grDiscard() {
      if (!state.grSelectedCard) return;
      const cardId = state.grSelectedCard;
      state.grSelectedCard = null;
      send({ type: 'GAME_ACTION', action: { type: 'discard', cardId } });
    }

    function grAction(actionType) {
      state.grSelectedCard = null;
      send({ type: 'GAME_ACTION', action: { type: actionType } });
    }

    /** Melds + deadwood of one player as glowing card groups. */
    function grRevealHtml(title, melds, deadwood, size, layoffs) {
      let html = '<div class="tc-reveal"><div class="tc-reveal-head"><span>' + escapeHtml(title) + '</span>' +
        '<span>Deadwood ' + (deadwood || []).reduce((s, c) => s + Math.min(10, tcNum(c.rank)), 0) + '</span></div><div class="tc-meld-groups">';
      (melds || []).forEach(m => {
        html += '<div class="tc-meld-group">' + (m.cards || []).map(c => renderTableCard(c, { size: size, meld: m.type === 'set' ? 'set' : 'run', dataId: '' })).join('') + '</div>';
      });
      if ((layoffs || []).length) {
        html += '<div class="tc-meld-group">' + layoffs.map(c => renderTableCard(c, { size: size, badge: 'laid off', dataId: '' })).join('') + '</div>';
      }
      if ((deadwood || []).length) {
        html += '<div class="tc-meld-group tc-deadwood-group">' + deadwood.map(c => renderTableCard(c, { size: size, dataId: '' })).join('') + '</div>';
      }
      return html + '</div></div>';
    }

    function renderGrScoring(msg) {
      const hr = msg.handResult || {};
      const me = state.playerId;
      const typeLabels = { knock: 'Knock', undercut: 'Undercut!', gin: 'Gin!', bigGin: 'Big Gin!', cancelled: 'Stock ran out' };
      let html = '<div class="tc-sheet-kicker">' + escapeHtml(msg.phase === 'finished' ? 'Game over' : (typeLabels[hr.type] || 'Hand over')) + '</div>';
      if (hr.type === 'cancelled') {
        html += '<div class="tc-sheet-title">No points this hand</div>';
      } else if (hr.winner) {
        const good = hr.winner === me;
        html += '<div class="tc-sheet-title ' + (good ? 'tc-good' : 'tc-bad') + '">' +
          escapeHtml((good ? 'You win' : tcName(hr.winner, msg) + ' wins') + ' +' + (hr.points || 0)) + '</div>';
      }
      if (msg.knocker) {
        const oppId = Object.keys(msg.cumulative || {}).find(id => id !== msg.knocker);
        const knockName = msg.knocker === me ? 'You' : tcName(msg.knocker, msg);
        const oppName = oppId === me ? 'You' : tcName(oppId, msg);
        html += grRevealHtml(knockName + ' (knocked)', msg.knockerMelds, msg.knockerDeadwood, 'sm');
        html += grRevealHtml(oppName, msg.opponentMelds, msg.opponentDeadwood, 'sm', msg.opponentLayoffs);
      }
      const totals = msg.finalScores || msg.cumulative || {};
      html += '<div class="tc-scoreline">' + Object.keys(totals).map(id =>
        '<span>' + escapeHtml(id === me ? 'You' : tcName(id, msg)) + ' <b>' + tcNum(totals[id]) + '</b></span>').join('') + '</div>';
      document.getElementById('grSheet').innerHTML = html;
    }

    SH.registerGame('gin-rummy', {
      section: 'ginRummySection',
      render: renderGinRummyState,
      redraw() { if (state.grLastMsg) renderGinRummyState(state.grLastMsg); },
      reset() { state.grSelectedCard = null; },
    });
