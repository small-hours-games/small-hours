// Texas Hold'em on the TV. Never receives private hole cards during play.

    var lastThState = {};

    function renderHoldemTv(msg) {
      const names = state.playerNames || msg.playerNames || {};
      const boardLen = (msg.board || []).length;
      if (lastThState.boardLen != null && boardLen > lastThState.boardLen) audio.play('place');
      if (msg.phase === 'finished' && lastThState.phase !== 'finished') audio.play('win');
      lastThState = { boardLen, phase: msg.phase };

      let status = 'Hand ' + msg.handNumber + '/' + msg.maxHands + ' · ' + msg.phase.toUpperCase();
      if (msg.phase === 'finished') status = (names[msg.winner] || 'Someone') + ' wins the table!';
      else if (msg.phase === 'showdown' && msg.showdown?.winners?.length) {
        const w = msg.showdown.winners[0];
        status = (names[w.playerId] || w.playerId) + ' wins ' + tcNum(w.amount) + ' (' + w.handName + ')';
      } else if (msg.turn) {
        status += ' · ' + (names[msg.turn] || 'Player') + "'s turn";
      }

      let boardHtml = '';
      for (let i = 0; i < 5; i++) {
        if (msg.board && msg.board[i]) boardHtml += renderTableCard(msg.board[i], { size: 'lg', dataId: '' });
        else boardHtml += '<div class="th-tv-slot"></div>';
      }

      const revealed = msg.showdown?.revealedHands || {};
      const handNames = msg.showdown?.handNames || {};

      const seatsHtml = (msg.players || []).map(id => {
        const isTurn = msg.turn === id && msg.phase !== 'showdown' && msg.phase !== 'finished';
        const isFolded = !!msg.folded?.[id];
        const isAllIn = !!msg.allIn?.[id];
        const badges = [];
        if (msg.dealerId === id) badges.push('<span class="th-tag th-tag-d">D</span>');
        if (msg.sbId === id) badges.push('<span class="th-tag">SB</span>');
        if (msg.bbId === id) badges.push('<span class="th-tag">BB</span>');
        if (isFolded) badges.push('<span class="th-tag th-tag-fold">FOLD</span>');
        if (isAllIn && !isFolded) badges.push('<span class="th-tag th-tag-allin">ALL-IN</span>');

        const cards = revealed[id]
          ? revealed[id].map(c => renderTableCard(c, { size: 'sm', dataId: '' })).join('')
          : (!isFolded && (msg.activePlayers || []).includes(id)
              ? renderTableCard(null, { size: 'sm', facedown: true, dataId: '' }) + renderTableCard(null, { size: 'sm', facedown: true, dataId: '' })
              : '');

        const streetBet = msg.streetBets?.[id] || 0;
        const handLabel = handNames[id] ? '<div class="th-tv-handname">' + escapeHtml(handNames[id]) + '</div>' : '';

        return '<div class="th-tv-seat' + (isTurn ? ' th-tv-seat-turn' : '') + (isFolded ? ' th-tv-seat-fold' : '') + '">' +
          '<div class="th-tv-seat-head"><b>' + escapeHtml(names[id] || id) + '</b><span class="tc-mono">' + tcNum(msg.chips?.[id] ?? 0) + '</span></div>' +
          '<div class="th-tv-tags">' + badges.join('') + (streetBet > 0 ? '<span class="tc-mono th-tv-bet">Bet ' + tcNum(streetBet) + '</span>' : '') + '</div>' +
          (cards ? '<div class="th-tv-cards">' + cards + '</div>' : '') +
          handLabel +
        '</div>';
      }).join('');

      document.getElementById('gameContent').innerHTML = '<div class="tc-tv tc-felt th-tv">' +
        '<div class="tc-tv-status"><span class="tc-dot' + (msg.turn ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>' +
        '<div class="th-tv-center">' +
          '<div class="th-tv-pot">Pot <b class="tc-mono">' + tcNum(msg.pot || 0) + '</b></div>' +
          '<div class="th-tv-board">' + boardHtml + '</div>' +
        '</div>' +
        '<div class="th-tv-seats">' + seatsHtml + '</div>' +
      '</div>';
      tcFitTv();
    }

    SH.registerGame('texas-holdem', {
      render: renderHoldemTv,
      alwaysScoreboard: true,
      scoreboard(msg, { names }) {
        const chips = msg.chips || {};
        return {
          roundLabel: 'Hand ' + (msg.handNumber || 1) + '/' + (msg.maxHands || 10),
          entries: Object.keys(chips).sort((a, b) => chips[b] - chips[a]).map((id, i) => ({
            id,
            name: names[id] || id,
            valueText: tcNum(chips[id]) + ' chips',
            rank: i + 1,
            isOut: chips[id] <= 0,
          })),
        };
      },
    });
