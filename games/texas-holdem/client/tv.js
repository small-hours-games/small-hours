// Texas Hold'em on the TV. Never receives private hole cards during play.

    var lastThState = {};

    function thAiReact(prev, msg) {
      if (!SH.aiStage) return;
      if (msg.phase === 'showdown' && prev.phase !== 'showdown' && msg.showdown?.winners?.length) {
        msg.showdown.winners.forEach(w => {
          if (SH.aiPersona(w.playerId)) SH.aiStage.quip(w.playerId, 'holdem', 'win', msg.handNumber);
        });
        return;
      }
      if (msg.phase === 'showdown' || msg.phase === 'finished') return;
      (msg.players || []).forEach(id => {
        if (!SH.aiPersona(id)) return;
        if (msg.folded?.[id] && !prev.folded?.[id]) {
          SH.aiStage.quip(id, 'holdem', 'fold', msg.handNumber);
        } else if (msg.allIn?.[id] && !prev.allIn?.[id]) {
          SH.aiStage.quip(id, 'holdem', 'allIn', msg.handNumber);
        } else if ((msg.streetBets?.[id] || 0) > (prev.streetBets?.[id] || 0) && (msg.currentBet || 0) > (prev.currentBet || 0)) {
          SH.aiStage.quip(id, 'holdem', 'raise', msg.pot);
        }
      });
    }

    function renderHoldemTv(msg) {
      const names = state.playerNames || msg.playerNames || {};
      const boardLen = (msg.board || []).length;
      if (lastThState.boardLen != null && boardLen > lastThState.boardLen) audio.play('place');
      if (msg.phase === 'finished' && lastThState.phase !== 'finished') audio.play('win');
      const prev = lastThState;
      lastThState = {
        boardLen,
        phase: msg.phase,
        folded: { ...(msg.folded || {}) },
        allIn: { ...(msg.allIn || {}) },
        streetBets: { ...(msg.streetBets || {}) },
        currentBet: msg.currentBet || 0,
      };

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

      const seatHtml = id => {
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

        const av = SH.aiPersona(id)?.avatar || (state.playerAvatars || {})[id] || '';
        return '<div class="th-tv-seat' + (isTurn ? ' th-tv-seat-turn' : '') + (isFolded ? ' th-tv-seat-fold' : '') + '" data-player-id="' + escapeHtml(id) + '">' +
          '<div class="th-tv-seat-head"><div class="th-tv-seat-who"><span class="ai-seat-slot">' + av + '</span><b>' + escapeHtml(names[id] || id) + '</b></div><span class="tc-mono text-amber-300 font-bold">' + tcNum(msg.chips?.[id] ?? 0) + '</span></div>' +
          '<div class="th-tv-tags">' + badges.join('') + (streetBet > 0 ? '<span class="tc-mono th-tv-bet">Bet ' + tcNum(streetBet) + '</span>' : '') + '</div>' +
          (cards ? '<div class="th-tv-cards">' + cards + '</div>' : '') +
          handLabel +
        '</div>';
      };

      const plist = msg.players || [];
      const topSeats = [];
      const rightSeats = [];
      const bottomSeats = [];
      const leftSeats = [];
      plist.forEach((id, i) => {
        if (plist.length <= 2) {
          (i === 0 ? bottomSeats : topSeats).push(seatHtml(id));
        } else if (plist.length <= 4) {
          [bottomSeats, leftSeats, topSeats, rightSeats][i % 4].push(seatHtml(id));
        } else {
          const zone = i === 0 ? bottomSeats : i === 1 ? leftSeats : i <= Math.ceil(plist.length / 2) ? topSeats : i === plist.length - 1 ? rightSeats : topSeats;
          zone.push(seatHtml(id));
        }
      });

      const root = document.getElementById('gameContent');
      root.innerHTML = '<div class="tc-tv tc-felt th-tv">' +
        '<div class="tc-tv-status"><span class="tc-dot' + (msg.turn ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>' +
        '<div class="th-tv-arena">' +
          '<div class="th-tv-row-top">' + topSeats.join('') + '</div>' +
          '<div class="th-tv-col-left">' + leftSeats.join('') + '</div>' +
          '<div class="th-tv-oval">' +
            '<div class="th-tv-center">' +
              '<div class="th-tv-pot">Total Pot <b class="tc-mono">' + tcNum(msg.pot || 0) + '</b></div>' +
              '<div class="th-tv-board">' + boardHtml + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="th-tv-col-right">' + rightSeats.join('') + '</div>' +
          '<div class="th-tv-row-bottom">' + bottomSeats.join('') + '</div>' +
        '</div>' +
      '</div>';
      tcFitTv();
      if (SH.aiStage) {
        const winners = new Set((msg.showdown?.winners || []).map(w => w.playerId));
        SH.aiStage.mountSeats(root, msg.players || [], id => {
          if (winners.has(id)) return { mood: 'calm', arm: 1, boost: 0.8 };
          if (msg.folded?.[id]) return { mood: 'worried', arm: 0, boost: 0 };
          if (msg.allIn?.[id]) return { mood: 'calm', arm: 1, boost: 1 };
          return { mood: 'calm', arm: msg.turn === id ? 0.4 : 0, boost: 0 };
        });
        SH.aiStage.intro(msg.players || []);
        thAiReact(prev, msg);
      }
    }

    SH.registerGame('texas-holdem', {
      render: renderHoldemTv,
      reset() { lastThState = {}; SH.aiStage?.reset(); },
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
