// Sjuan on the phone, built on the card kit in public/js/table-cards*.js.

    state.sjSelected = null;

    function sjCanPlay(card, msg) {
      const top = msg.stacks[card.suit];
      return top === card.rank + 1 || top === card.rank - 1;
    }

    function sjStatusText(msg, myTurn) {
      if (msg.phase === 'finished') return msg.winner === state.playerId ? 'You won!' : tcName(msg.winner, msg) + ' won';
      return myTurn ? 'Your turn: play next to a stack' : tcName(msg.turn, msg) + "'s turn";
    }

    function sjCtaState(msg, myTurn, picked) {
      if (msg.phase === 'finished') return { label: 'Game over', disabled: true };
      if (!myTurn) return { label: 'Waiting for ' + tcName(msg.turn, msg) + '…', disabled: true };
      if (picked) return sjCanPlay(picked, msg)
        ? { label: 'Play ' + tcCardShort(picked), verb: 'Play', card: picked, action: 'play' }
        : { label: "That card can't go there", disabled: true };
      return { label: msg.deckCount > 0 ? 'Draw a card' : 'Pass', action: 'draw' };
    }

    function renderSjuanState(msg) {
      state.sjLastMsg = msg;
      tcFitScreen('sjuanSection');
      const hand = msg.myHand || [];
      const myTurn = msg.phase === 'play' && !!msg.isMyTurn;
      if (!hand.some(c => c.id === state.sjSelected)) state.sjSelected = null;
      tcSetStatus('sj', sjStatusText(msg, myTurn), myTurn);
      tcBuzz('sjWasTurn', myTurn);
      document.getElementById('sjDeckPill').textContent = 'Deck ' + tcNum(msg.deckCount);
      document.getElementById('sjBoard').innerHTML = sjBoardHtml(msg, 'md');
      document.getElementById('sjDeck').innerHTML = renderTableStack(null, msg.deckCount || 0, { size: 'sm', facedown: true });
      document.getElementById('sjOthers').innerHTML = Object.keys(msg.handCounts || {})
        .filter(id => id !== state.playerId)
        .map(id => '<span class="tc-pill">' + escapeHtml(tcName(id, msg)) + ' <b class="tc-mono">' + tcNum(msg.handCounts[id]) + '</b></span>')
        .join('');

      const arrivals = tcTrackArrivals('sj', hand, msg.phase === 'play' ? 'play' : null);
      const handEl = document.getElementById('sjHand');
      handEl.innerHTML = renderHandRack(orderHand(hand, 'suit'), {
        layout: tcLayout(), width: tcHandWidth('sjHand'), cardW: tcHandCardW('sjHand'),
        cardOpts: c => ({ selected: state.sjSelected === c.id, dim: myTurn && !sjCanPlay(c, msg), ...tcArrivalOpts(arrivals, c) }),
      });
      attachHandGestures(handEl, { peek: true, onTap: sjTap, onPlay: sjSwipe });
      tcSetCta('sjCta', sjCtaState(msg, myTurn, hand.find(c => c.id === state.sjSelected)));
      tcLaunchArrivals(arrivals, hand, document.getElementById('sjDeck'), handEl);
    }

    function sjBoardHtml(msg, size) {
      return ['h', 'd', 'c', 's'].map(suit => renderTableCard({ id: 'stack-' + suit, suit, rank: msg.stacks[suit] }, { size, dataId: '' })).join('');
    }

    function sjTap(id) {
      state.sjSelected = state.sjSelected === id ? null : id;
      renderSjuanState(state.sjLastMsg);
    }

    function sjPlay(id) {
      state.sjSelected = null;
      send({ type: 'GAME_ACTION', action: { type: 'playCard', cardId: id } });
    }

    function sjSwipe(id, flick) {
      const msg = state.sjLastMsg;
      const card = (msg.myHand || []).find(c => c.id === id);
      if (!msg.isMyTurn || !card || !sjCanPlay(card, msg)) { tcShake(document.getElementById('sjHand'), id); return; }
      tcThrowOff(card, flick.rect, flick);
      flick.el.style.visibility = 'hidden';
      sjPlay(id);
    }

    function sjCtaAction() {
      const action = document.getElementById('sjCta').dataset.action;
      if (action === 'play') sjPlay(state.sjSelected);
      else if (action === 'draw') send({ type: 'GAME_ACTION', action: { type: 'draw' } });
    }

    function sjRedraw() {
      if (state.sjLastMsg) renderSjuanState(state.sjLastMsg);
    }

    SH.registerGame('sjuan', {
      section: 'sjuanSection',
      render: renderSjuanState,
      redraw: sjRedraw,
      reset() { state.sjSelected = null; },
    });
