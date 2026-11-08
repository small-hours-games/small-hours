// The TV screen. It only ever gets the shared view: no hands.

    function renderExample(msg) {
      const names = state.playerNames || msg.playerNames || {};
      const seats = Object.keys(msg.handCounts || {}).map(id => tvSeatHtml(id, names, {
        turn: id === msg.turn && msg.phase === 'play',
        cards: tvFanHtml(msg.handCounts[id], 'sm', 8),
      })).join('');
      document.getElementById('gameContent').innerHTML = '<div class="tc-tv tc-felt">' +
        '<div class="tc-tv-seats">' + seats + '</div>' +
        '<div class="tc-tv-center"><div class="tc-well"><span class="tc-well-label">Top card</span>' +
          renderTableCard(msg.top, { size: 'xl', dataId: '' }) +
        '</div></div></div>';
      tcFitTv();
    }

    SH.registerGame('_template', { render: renderExample });
