// Blackjack on the TV.

    var lastBjState = {};

    function bjTvOutcome(hand) {
      if (hand.outcome === 'blackjack') return '<span class="bj-badge bj-badge-win">BLACKJACK</span>';
      if (hand.outcome === 'win') return '<span class="bj-badge bj-badge-win">WIN</span>';
      if (hand.outcome === 'push') return '<span class="bj-badge bj-badge-push">PUSH</span>';
      if (hand.outcome === 'bust') return '<span class="bj-badge bj-badge-lose">BUST</span>';
      if (hand.outcome === 'lose') return '<span class="bj-badge bj-badge-lose">LOSE</span>';
      if (hand.status === 'blackjack') return '<span class="bj-badge bj-badge-win">21!</span>';
      if (hand.status === 'busted') return '<span class="bj-badge bj-badge-lose">BUST</span>';
      return '';
    }

    function renderBlackjackTv(msg) {
      const names = state.playerNames || msg.playerNames || {};
      if (lastBjState.phase === 'betting' && msg.phase !== 'betting') audio.play('place');
      if (msg.phase === 'finished' && lastBjState.phase !== 'finished') audio.play('win');
      lastBjState = { phase: msg.phase };

      let status = 'Round ' + msg.round + ' of ' + msg.maxRounds;
      if (msg.phase === 'betting') status += ' · Place your bets on your phone';
      else if (msg.phase === 'playing') status += ' · ' + (names[msg.turn] || 'Player') + "'s turn";
      else if (msg.phase === 'settled') {
        const rc = msg.nextReadyCount != null ? msg.nextReadyCount : 0;
        const rt = msg.nextReadyTotal != null ? msg.nextReadyTotal : 0;
        status += ' · Round settled' + (rt ? ' · Ready ' + rc + '/' + rt : '');
      }
      else if (msg.phase === 'finished') status = (names[msg.winner] || 'Someone') + ' wins the table!';

      const d = msg.dealer || { cards: [] };
      let dealerCards = d.cards.map(c => renderTableCard(c, { size: 'lg', dataId: '' })).join('');
      if (d.hiddenHole) dealerCards += renderTableCard(null, { size: 'lg', facedown: true, dataId: '' });
      if (!dealerCards) dealerCards = '<span class="bj-empty">Waiting for bets…</span>';
      const dealerLabel = d.cards.length
        ? 'Dealer (' + (d.hiddenHole ? d.total + ' + ?' : d.isBusted ? d.total + ' BUST' : d.total) + ')'
        : 'Dealer';

      const seatHtml = id => {
        const seat = msg.seats[id];
        const isTurn = msg.phase === 'playing' && msg.turn === id;
        const isReady = msg.phase === 'settled' && !!(msg.nextReady && msg.nextReady[id]);
        const handsHtml = seat.hands && seat.hands.length
          ? seat.hands.map((h, idx) => {
              const activeH = isTurn && idx === msg.activeHandIndex;
              return '<div class="bj-tv-hand' + (activeH ? ' bj-hand-active' : '') + '">' +
                '<div class="bj-cards">' + h.cards.map(c => renderTableCard(c, { size: 'sm', dataId: '' })).join('') + '</div>' +
                '<div class="bj-tv-hand-info">' + h.total + ' · Bet ' + tcNum(h.bet) + ' ' + bjTvOutcome(h) + '</div>' +
              '</div>';
            }).join('')
          : '<div class="bj-tv-bet-wait">' + (seat.betPlaced ? 'Bet: ' + tcNum(seat.pendingBet) : 'Betting…') + '</div>';

        const av = (state.playerAvatars || {})[id] || '';
        return '<div class="bj-tv-seat' + (isTurn ? ' bj-tv-seat-turn' : '') + '">' +
          '<div class="bj-tv-seat-head"><div class="bj-tv-seat-who">' + (av ? '<span class="bj-tv-avatar">' + av + '</span>' : '') + '<b>' + escapeHtml(names[id] || id) + '</b></div>' +
          '<div class="flex items-center gap-1.5">' + (isReady ? '<span class="bj-badge bj-badge-win">READY</span>' : '') + '<span class="tc-mono text-amber-300 font-bold">' + tcNum(seat.chips) + '</span></div></div>' +
          handsHtml +
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

      document.getElementById('gameContent').innerHTML = '<div class="tc-tv tc-felt bj-tv">' +
        '<div class="tc-tv-status"><span class="tc-dot' + (msg.phase === 'playing' || msg.phase === 'betting' ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>' +
        '<div class="bj-tv-arena">' +
          '<div class="bj-tv-row-top">' + topSeats.join('') + '</div>' +
          '<div class="bj-tv-col-left">' + leftSeats.join('') + '</div>' +
          '<div class="bj-tv-oval">' +
            '<div class="bj-tv-dealer">' +
              '<div class="bj-tv-dealer-pill">' + escapeHtml(dealerLabel) + '</div>' +
              '<div class="bj-cards">' + dealerCards + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="bj-tv-col-right">' + rightSeats.join('') + '</div>' +
          '<div class="bj-tv-row-bottom">' + bottomSeats.join('') + '</div>' +
        '</div>' +
      '</div>';
      tcFitTv();
    }

    SH.registerGame('blackjack', {
      render: renderBlackjackTv,
      alwaysScoreboard: true,
      scoreboard(msg, { names }) {
        const seats = msg.seats || {};
        return {
          roundLabel: 'Round ' + (msg.round || 1) + '/' + (msg.maxRounds || 5),
          entries: Object.keys(seats).sort((a, b) => seats[b].chips - seats[a].chips).map((id, i) => ({
            id,
            name: names[id] || id,
            valueText: tcNum(seats[id].chips) + ' chips',
            rank: i + 1,
          })),
        };
      },
    });
