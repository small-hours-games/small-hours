// Sjuan on the TV, built on the card kit. It only gets the shared view: no hands.

    var lastSjState = {}; // so re-renders do not repeat a sound

    function sjBoardTvHtml(msg) {
      return ['h', 'd', 'c', 's'].map(suit => renderTableCard({ id: 'stack-' + suit, suit, rank: msg.stacks[suit] }, { size: 'xl', dataId: '' })).join('');
    }

    function renderSjuan(msg) {
      const names = state.playerNames || msg.playerNames || {};
      const lastPlayId = msg.lastPlay?.card?.id ?? null;
      const prevPhase = lastSjState.phase;
      const prevDeck = lastSjState.deckCount;
      if (prevDeck != null && msg.deckCount < prevDeck) audio.play('draw');
      if (lastPlayId && lastPlayId !== lastSjState.lastPlayId) audio.play('place');
      if (msg.phase === 'finished' && prevPhase !== 'finished') audio.play('win');
      lastSjState = { deckCount: msg.deckCount, lastPlayId, phase: msg.phase };

      const pids = Object.keys(msg.handCounts || {});
      const status = msg.phase === 'finished' ? (names[msg.winner] || 'Someone') + ' wins!' : (names[msg.turn] || 'Player') + "'s turn";
      const seats = pids.map(id => tvSeatHtml(id, names, {
        turn: msg.phase === 'play' && id === msg.turn,
        cards: tvFanHtml(msg.handCounts[id], 'sm', 8),
      })).join('');
      const content = document.getElementById('gameContent');
      content.innerHTML = '<div class="tc-tv tc-felt">' +
        '<div class="tc-tv-status"><span class="tc-dot' + (msg.phase === 'play' ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>' +
        '<div class="tc-tv-seats">' + seats + '</div>' +
        '<div class="tc-tv-center">' +
          '<div class="tc-well"><span class="tc-well-label">The sevens</span><div class="sj-board">' + sjBoardTvHtml(msg) + '</div></div>' +
          '<div class="tc-well"><span class="tc-well-label">Deck</span>' +
            renderTableStack(null, msg.deckCount || 0, { size: 'xl', facedown: true, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + tcNum(msg.deckCount) + ' left</span></div>' +
        '</div></div>';
      tcFitTv();
      if (SH.aiStage) {
        SH.aiStage.mountSeats(content, pids, id => {
          if (msg.phase === 'finished' && msg.winner === id) return { mood: 'calm', arm: 1, boost: 0.8 };
          if (msg.phase === 'finished' && msg.winner && msg.winner !== id) return { mood: 'worried', arm: 0, boost: 0 };
          return { mood: 'calm', arm: msg.turn === id ? 0.35 : 0, boost: 0 };
        });
        SH.aiStage.intro(pids);
        if (msg.phase === 'finished' && prevPhase !== 'finished' && SH.aiPersona(msg.winner)) {
          SH.aiStage.quip(msg.winner, 'sjuan', 'out', msg.round);
        } else if (msg.lastResult?.stuck && msg.lastResult?.winner && SH.aiPersona(msg.lastResult.winner)) {
          SH.aiStage.quip(msg.lastResult.winner, 'sjuan', 'stuck', msg.round);
        } else if (msg.lastPlay?.playerId && lastPlayId && SH.aiPersona(msg.lastPlay.playerId)) {
          SH.aiStage.quip(msg.lastPlay.playerId, 'sjuan', 'play', msg.round);
        }
      }
    }

    SH.registerGame('sjuan', {
      render: renderSjuan,
      reset() { lastSjState = {}; SH.aiStage?.reset(); },
      alwaysScoreboard: true,
      scoreboard(msg, { names }) {
        const counts = msg.handCounts || {};
        return {
          entries: Object.keys(counts).sort((a, b) => counts[a] - counts[b]).map((id, i) => ({
            id, name: names[id] || id, valueText: counts[id] + (counts[id] === 1 ? ' card' : ' cards'), rank: i + 1, isOut: counts[id] === 0,
          })),
        };
      },
    });
