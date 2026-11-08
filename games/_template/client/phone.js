// The phone screen. Cards, the hand and its gestures come from public/js/table-cards*.js.

    state.exSelected = null;

    function renderExampleState(msg) {
      state.exLastMsg = msg;
      tcFitScreen('exampleSection');
      const myTurn = msg.phase === 'play' && !!msg.isMyTurn;
      const hand = msg.myHand || [];
      if (!hand.some(c => c.id === state.exSelected)) state.exSelected = null;
      tcSetStatus('ex', myTurn ? 'Your turn' : tcName(msg.turn, msg) + "'s turn", myTurn);
      document.getElementById('exTop').innerHTML = renderTableCard(msg.top, { size: 'md', dataId: '' });

      const handEl = document.getElementById('exHand');
      handEl.innerHTML = renderHandRack(orderHand(hand, 'suit'), {
        layout: tcLayout(), width: tcHandWidth('exHand'), cardW: tcHandCardW('exHand'),
        cardOpts: c => ({ selected: state.exSelected === c.id }),
      });
      attachHandGestures(handEl, {
        peek: true,
        onTap: id => { state.exSelected = state.exSelected === id ? null : id; renderExampleState(msg); },
        onPlay: id => exSend('play', { cardId: id }),
      });

      const picked = hand.find(c => c.id === state.exSelected);
      tcSetCta('exCta', !myTurn ? { label: 'Waiting…', disabled: true }
        : picked ? { label: 'Play ' + tcCardShort(picked), verb: 'Play', card: picked }
        : { label: 'Draw a card' });
    }

    function exSend(type, payload) {
      state.exSelected = null;
      send({ type: 'GAME_ACTION', action: { type, ...payload } });
    }

    function exCtaAction() {
      if (state.exSelected) exSend('play', { cardId: state.exSelected });
      else exSend('draw');
    }

    SH.registerGame('_template', {
      section: 'exampleSection',
      render: renderExampleState,
      redraw() { if (state.exLastMsg) renderExampleState(state.exLastMsg); },
      reset() { state.exSelected = null; },
    });
