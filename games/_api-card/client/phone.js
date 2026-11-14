// Shared Phone UI for API-created card games (_api-card)
    state.acSelectedCards = state.acSelectedCards || [];
    state.acLog = state.acLog || [];
    state.acSeenSeq = null;
    state.acPendingWild = false;

    function acCycleSort() {
      const modes = ['rank', 'suit', 'custom'];
      state.acSortMode = modes[(modes.indexOf(state.acSortMode || 'rank') + 1) % modes.length];
      if (state.acLastMsg) renderApiCardState(state.acLastMsg);
    }

    function acToggleLayout() {
      tcToggleLayout();
      if (state.acLastMsg) renderApiCardState(state.acLastMsg);
    }

    function acCanPlay(card, msg) {
      if (!card) return false;
      if ((msg.wildRanks || []).includes(card.rank)) return true;
      if (!msg.pileTop || msg.pileReset) return true;
      const suit = msg.activeSuit || msg.pileTop.suit;
      if (msg.playMatch === 'any') return true;
      if (msg.playMatch === 'suitOrRank') return card.suit === suit || card.rank === msg.pileTop.rank;
      if (msg.playMatch === 'higherOrEqual') return card.rank >= msg.pileTop.rank;
      if (msg.playMatch === 'lowerOrEqual') return card.rank <= msg.pileTop.rank;
      if (msg.playMatch === 'sameRank') return card.rank === msg.pileTop.rank;
      return true;
    }

    function acRuleHint(msg) {
      if (msg.phase === 'finished') {
        const w = msg.winner === state.playerId ? 'You won!' : tcName(msg.winner, msg) + ' won!';
        return '<div class="tc-knock-banner tc-knock-banner-gin">🏆 ' + escapeHtml(w) + '</div>';
      }
      if (!msg.pileTop || msg.pileReset) return 'Play any card';
      const suitSym = { h: '♥', d: '♦', c: '♣', s: '♠' }[msg.activeSuit || msg.pileTop.suit] || '';
      const rankLbl = tcRankLabel(msg.pileTop.rank);
      if (msg.playMatch === 'suitOrRank') return 'Match ' + suitSym + ' or ' + rankLbl;
      if (msg.playMatch === 'higherOrEqual') return 'Play ' + rankLbl + ' or higher';
      if (msg.playMatch === 'lowerOrEqual') return 'Play ' + rankLbl + ' or lower';
      if (msg.playMatch === 'sameRank') return 'Play ' + rankLbl;
      return 'Play any card';
    }

    function renderApiCardState(msg) {
      state.acLastMsg = msg;
      tcFitScreen('apiCardSection');
      const myHand = msg.myHand || [];
      const validIds = new Set(myHand.map(c => c.id));
      state.acSelectedCards = state.acSelectedCards.filter(id => validIds.has(id));
      const myTurn = msg.phase === 'play' && !!msg.isMyTurn;
      document.getElementById('apiCardSection')?.classList.toggle('tc-my-turn-glow', myTurn);

      const status = msg.phase === 'finished'
        ? (msg.winner === state.playerId ? 'You won!' : tcName(msg.winner, msg) + ' won')
        : (myTurn ? 'Your turn' : tcName(msg.currentPlayer, msg) + "'s turn");
      document.getElementById('acStatusText').textContent = status;
      document.getElementById('acStatusDot').className = 'tc-dot' + (myTurn ? ' tc-dot-live' : '');
      document.getElementById('acMeta').textContent = myHand.length + ' card' + (myHand.length === 1 ? '' : 's');

      // Opponents
      const opps = (msg.players || []).filter(p => p.playerId !== state.playerId);
      document.getElementById('acOpps').innerHTML = opps.map(p => {
        const turn = msg.phase === 'play' && p.playerId === msg.currentPlayer;
        return '<div class="tc-opp' + (turn ? ' tc-opp-turn' : '') + '">' +
          '<div class="tc-opp-head"><span class="tc-opp-name">' + escapeHtml(tcAvatar(p.playerId) + tcName(p.playerId, msg)) + '</span>' +
          '<span class="tc-opp-tag">' + (p.isOut ? '✓ out' : turn ? '▶ playing' : p.handCount + ' cards') + '</span></div>' +
        '</div>';
      }).join('');

      document.getElementById('acDrawStack').innerHTML = renderTableStack(null, msg.drawPileCount || 0, { size: 'md', facedown: true, emptyLabel: 'Empty' });
      document.getElementById('acDrawCount').textContent = (msg.drawPileCount || 0) + ' left';
      const preview = (msg.pilePreview && msg.pilePreview.length) ? msg.pilePreview : (msg.pileTop ? [msg.pileTop] : []);
      document.getElementById('acPileStack').innerHTML = renderMessyPile(preview, msg.pileCount || preview.length, { size: 'md', emptyLabel: 'Empty' });
      document.getElementById('acPileCount').textContent = (msg.pileCount || 0) + ' cards';

      const ev = msg.lastEvent;
      const fresh = ev && ev.seq !== state.acSeenSeq;
      state.acLog = tcLogPush(state.acLog, ev, 6);
      state.acSeenSeq = ev ? ev.seq : null;
      if (fresh && ev.by !== state.playerId && (ev.kind === 'burn' || ev.kind === 'draw')) {
        if (navigator.vibrate) navigator.vibrate(30);
      }
      document.getElementById('acLog').innerHTML = msg.phase === 'play'
        ? renderMoveLog(state.acLog, { name: id => (id === state.playerId ? 'You' : tcName(id, msg)), avatar: id => tcAvatar(id), max: 3 })
        : '';

      const ruleEl = document.getElementById('acRule');
      if (msg.phase === 'finished') ruleEl.innerHTML = acRuleHint(msg);
      else ruleEl.textContent = acRuleHint(msg);

      const ordered = orderHand(myHand, state.acSortMode || 'rank', state.acOrder);
      const handEl = document.getElementById('acHand');
      const arrivals = tcTrackArrivals('ac', myHand, msg.phase === 'play' ? 'play' : null);
      tcFlipHand(handEl, () => {
        handEl.innerHTML = renderHandRack(ordered, {
          layout: tcLayout(),
          width: tcHandWidth('acHand'),
          cardW: tcHandCardW('acHand'),
          cardOpts: c => ({
            selected: state.acSelectedCards.includes(c.id),
            dim: myTurn && !acCanPlay(c, msg),
            ...tcArrivalOpts(arrivals, c),
          }),
          emptyText: msg.phase === 'finished' ? 'Game over' : 'No cards left',
        });
      });
      attachHandGestures(handEl, {
        peek: true,
        onTap: id => {
          if (!myTurn) return;
          if (msg.allowMultiSameRank) {
            const card = myHand.find(c => c.id === id);
            const first = myHand.find(c => c.id === state.acSelectedCards[0]);
            if (state.acSelectedCards.includes(id)) state.acSelectedCards = state.acSelectedCards.filter(x => x !== id);
            else if (first && card && first.rank === card.rank) state.acSelectedCards = [...state.acSelectedCards, id];
            else state.acSelectedCards = [id];
          } else {
            state.acSelectedCards = state.acSelectedCards.includes(id) ? [] : [id];
          }
          state.acPendingWild = false;
          renderApiCardState(msg);
        },
        onPlay: id => {
          if (!myTurn) return;
          state.acSelectedCards = [id];
          acCtaAction();
        },
      });

      const sel = myHand.filter(c => state.acSelectedCards.includes(c.id));
      const picker = document.getElementById('acSuitPicker');
      picker.hidden = !(state.acPendingWild && myTurn && sel.length > 0);

      if (msg.phase === 'finished') tcSetCta('acCta', { label: 'Game over', disabled: true });
      else if (!myTurn) tcSetCta('acCta', { label: 'Waiting for ' + tcName(msg.currentPlayer, msg) + '…', disabled: true });
      else if (sel.length) tcSetCta('acCta', { label: 'Play ' + tcCardShort(sel[0]) + (sel.length > 1 ? ' ×' + sel.length : ''), action: 'play' });
      else tcSetCta('acCta', { label: 'Draw card', action: 'draw' });

      document.getElementById('acLayoutBtn').textContent = tcLayout() === 'fan' ? 'Fan' : '2-Row';
      document.getElementById('acSortBtn').textContent = 'Sort: ' + (state.acSortMode || 'rank');
      tcSyncColoursBtn('acColoursBtn');
      document.getElementById('acPassBtn').disabled = !myTurn;
      tcSqueeze('apiCardSection');
    }

    function acCtaAction() {
      const msg = state.acLastMsg;
      if (!msg || !msg.isMyTurn) return;
      const sel = (msg.myHand || []).filter(c => state.acSelectedCards.includes(c.id));
      if (!sel.length) { acDrawCard(); return; }
      if ((msg.wildRanks || []).includes(sel[0].rank) && msg.playMatch === 'suitOrRank') {
        state.acPendingWild = true;
        renderApiCardState(msg);
        return;
      }
      send({ type: 'GAME_ACTION', action: { type: 'playCards', cardIds: state.acSelectedCards } });
      state.acSelectedCards = [];
    }

    function acPickWildSuit(suit) {
      if (!state.acSelectedCards.length) return;
      send({ type: 'GAME_ACTION', action: { type: 'playCards', cardIds: state.acSelectedCards, chosenSuit: suit } });
      state.acSelectedCards = [];
      state.acPendingWild = false;
    }

    function acDrawCard() {
      if (!state.acLastMsg || !state.acLastMsg.isMyTurn) return;
      send({ type: 'GAME_ACTION', action: { type: 'drawCard' } });
    }

    function acPassTurn() {
      if (!state.acLastMsg || !state.acLastMsg.isMyTurn) return;
      send({ type: 'GAME_ACTION', action: { type: 'passTurn' } });
    }

    SH.registerGame('_api-card', {
      section: 'apiCardSection',
      render: renderApiCardState,
      redraw() { if (state.acLastMsg) renderApiCardState(state.acLastMsg); },
      reset() { state.acSelectedCards = []; state.acPendingWild = false; },
    });
    if (typeof SH_DYNAMIC_ALIASES !== 'undefined' && Array.isArray(SH_DYNAMIC_ALIASES)) {
      SH_DYNAMIC_ALIASES.forEach(a => SH.aliasGame(a.id, a.base));
    }
