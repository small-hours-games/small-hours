// Gin Rummy on the TV.

    var lastGrState = {}; // so re-renders do not repeat a sound

    function renderGinRummy(msg) {
      const content = document.getElementById('gameContent');
      const names = state.playerNames || msg.playerNames || {};
      const cum = msg.cumulative || {};
      const boxes = msg.boxes || {};
      const pids = Object.keys(cum);
      const playing = msg.phase !== 'scoring' && msg.phase !== 'finished';

      // Sounds (TV speakers)
      if (lastGrState.handNumber != null && msg.handNumber > lastGrState.handNumber) audio.play('deck_redraw');
      if ((msg.phase === 'scoring' || msg.phase === 'finished') && lastGrState.phase !== msg.phase) audio.play('win');
      if (msg.phase === 'drawing' && lastGrState.phase === 'drawing') {
        if (msg.stockCount < lastGrState.stockCount) audio.play('draw');
        if (msg.discardCount > lastGrState.discardCount) audio.play('place');
      }
      lastGrState = { handNumber: msg.handNumber, phase: msg.phase, stockCount: msg.stockCount, discardCount: msg.discardCount };

      const current = msg.currentPlayer;
      const action = msg.phase === 'first_turn' ? 'deciding on the upcard' : (msg.turnPhase === 'draw' ? 'drawing' : 'discarding');
      let status = 'Gin Rummy';
      if (playing && current) status = (names[current] || 'Player') + ' is ' + action;
      else if (msg.phase === 'scoring') status = 'Hand over';
      else if (msg.phase === 'finished') status = 'Game over';

      const seat = pid => {
        const count = tcNum((msg.playerCardCounts || {})[pid] != null ? msg.playerCardCounts[pid] : 10);
        const pts = tcNum(cum[pid]);
        const bx = tcNum(boxes[pid]);
        const turn = playing && pid === current;
        return tvSeatHtml(pid, names, {
          turn,
          tag: turn ? '▶ ' + action : null,
          stats: '<span><span class="tc-seat-score">' + pts + '</span> pts</span><span>' + bx + (bx === 1 ? ' box · ' : ' boxes · ') + count + ' cards</span>',
          cards: playing ? tvFanHtml(count, 'sm', 11) : '',
        });
      };

      let html = '<div class="tc-tv tc-felt">';
      html += '<div class="tc-tv-status"><span class="tc-dot' + (playing ? ' tc-dot-live' : '') + '"></span>' +
        (msg.handNumber ? '<span class="tc-mono">Hand ' + tcNum(msg.handNumber) + '</span> · ' : '') + escapeHtml(status) + '</div>';
      if (playing) {
        html += '<div class="tc-tv-row"><div class="tc-tv-col">' + (pids[1] ? seat(pids[1]) : '') + '</div><div class="tc-tv-mid">';
        const discardCount = tcNum(msg.discardCount != null ? msg.discardCount : (msg.discardTop ? 1 : 0));
        const preview = (msg.discardPreview && msg.discardPreview.length) ? msg.discardPreview : (msg.discardTop ? [msg.discardTop] : []);
        html += '<div class="tc-tv-center">' +
          '<div class="tc-well"><span class="tc-well-label">Stock</span>' +
            renderTableStack(null, msg.stockCount || 0, { size: 'xl', facedown: true, emptyLabel: 'Empty', highlight: msg.turnPhase === 'draw' }) +
            '<span class="tc-count">' + tcNum(msg.stockCount) + ' left</span></div>' +
          '<div class="tc-well"><span class="tc-well-label">Discard</span>' +
            renderTableStack(preview, discardCount, { size: 'xl', emptyLabel: 'Empty', highlight: msg.phase === 'first_turn' }) +
            '<span class="tc-count">' + discardCount + (discardCount === 1 ? ' card' : ' cards') + '</span></div>' +
        '</div>';
        const last = (msg.events || []).slice(-1)[0];
        if (last && (last.type === 'draw' || last.type === 'discard')) {
          const who = names[last.playerId] || 'Player';
          const text = last.type === 'draw'
            ? who + ' drew from the ' + (last.source === 'discard' ? 'discard pile' : 'stock')
            : who + ' discarded' + (msg.discardTop && msg.discardTop.id === last.cardId ? ' ' + tcCardShort(msg.discardTop) : '');
          html += '<div class="tc-tv-banner">' + escapeHtml(text) + '</div>';
        }
        html += '</div><div class="tc-tv-col">' + (pids[0] ? seat(pids[0]) : '') + '</div></div>';
      } else {
        const hr = msg.handResult || {};
        const labels = { knock: 'Knock', undercut: 'Undercut!', gin: 'Gin!', bigGin: 'Big Gin!', cancelled: 'Stock ran out' };
        html += '<div class="tc-tv-result">';
        html += '<div class="tc-sheet-kicker">' + escapeHtml(msg.phase === 'finished' ? 'Game over' : (labels[hr.type] || 'Hand over')) + '</div>';
        if (msg.phase === 'finished' && msg.winner) {
          html += '<div class="tc-sheet-title tc-good">' + escapeHtml((names[msg.winner] || 'Player') + ' wins the game!') + '</div>';
        } else if (hr.type === 'cancelled') {
          html += '<div class="tc-sheet-title">No points this hand</div>';
        } else if (hr.winner) {
          html += '<div class="tc-sheet-title tc-good">' + escapeHtml((names[hr.winner] || 'Player') + ' wins +' + (hr.points || 0)) + '</div>';
        }
        if (msg.knocker) {
          const oppId = pids.find(id => id !== msg.knocker);
          html += tvRevealHtml((names[msg.knocker] || 'Player') + ' (knocked)', msg.knockerMelds, msg.knockerDeadwood);
          html += tvRevealHtml(names[oppId] || 'Player', msg.opponentMelds, msg.opponentDeadwood, msg.opponentLayoffs);
        }
        html += '</div>';
        html += '<div class="tc-tv-seats">' + pids.map(seat).join('') + '</div>';
      }

      html += '</div>';
      content.innerHTML = html;
      tcFitTv();
    }

    SH.registerGame('gin-rummy', {
      render: renderGinRummy,
      scoreboard(msg) {
        return msg.handNumber != null ? { roundLabel: 'Hand ' + msg.handNumber } : {};
      },
    });
