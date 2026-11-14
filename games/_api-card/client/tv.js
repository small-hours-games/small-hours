// Shared TV UI for API-created card games (_api-card)
    var acLog = [];
    var acSeenSeq = null;

    function renderApiCardTv(msg) {
      const content = document.getElementById('gameContent');
      const names = state.playerNames || msg.playerNames || {};
      const ev = msg.lastEvent || null;
      const fresh = !!ev && ev.seq !== acSeenSeq;
      acSeenSeq = ev ? ev.seq : null;
      acLog = tcLogPush(acLog, ev, 6);

      const players = msg.players || [];
      const many = players.length > 4;
      const pileSize = many ? 'lg' : 'xl';
      const status = msg.phase === 'finished'
        ? (msg.winner ? (names[msg.winner] || 'Player') + ' won!' : 'Game over')
        : (msg.currentPlayer ? (names[msg.currentPlayer] || 'Player') + "'s turn" : 'Card Game');

      const seat = p => {
        const turn = msg.phase === 'play' && p.playerId === msg.currentPlayer;
        const tag = p.isOut ? '✓ out' : turn ? '▶ playing' : null;
        const cards = '<div><div class="tc-mini-label">Hand</div>' + tvFanHtml(p.handCount || 0, 'sm', 8) + '</div>';
        return tvSeatHtml(p.playerId, names, { turn, out: p.isOut, tag, tagClass: p.isOut ? 'tc-tag-out' : '', cards });
      };

      const half = Math.floor(players.length / 2);
      const left = players.slice(0, half);
      const top = players.length % 2 ? [players[half]] : [];
      const right = players.slice(half + top.length);

      let html = '<div class="tc-tv tc-felt' + (many ? ' tc-tv-many' : '') + '">';
      html += '<div class="tc-tv-status"><span class="tc-dot' + (msg.phase === 'play' ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>';
      html += '<div class="tc-tv-row"><div class="tc-tv-col">' + left.map(seat).join('') + '</div><div class="tc-tv-mid">';
      if (top.length) html += '<div class="tc-tv-top">' + top.map(seat).join('') + '</div>';

      if (msg.phase === 'finished') {
        html += '<div class="tc-tv-result tc-result-pop"><div class="tc-sheet-kicker">Winner</div>' +
          '<div class="tc-knock-banner tc-knock-banner-gin">🏆 ' + escapeHtml(names[msg.winner] || 'Winner') + ' wins!</div>' +
          '</div>';
      } else {
        const preview = (msg.pilePreview && msg.pilePreview.length) ? msg.pilePreview : (msg.pileTop ? [msg.pileTop] : []);
        const suitSym = msg.activeSuit ? ({ h: '♥', d: '♦', c: '♣', s: '♠' }[msg.activeSuit] || '') : '';
        const side = '<div class="tc-rule">' + (suitSym ? 'Active suit: ' + suitSym : 'Play pile') + '</div>' +
          renderMoveLog(acLog, { name: id => names[id] || 'Player', max: 4 });
        html += '<div class="tc-tv-center">' +
          '<div class="tc-well' + (fresh && ev && ev.kind === 'draw' ? ' tc-well-drawn' : '') + '" id="tvDrawWell"><span class="tc-well-label">Draw deck</span>' +
            renderTableStack(null, msg.drawPileCount || 0, { size: pileSize, facedown: true, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + tcNum(msg.drawPileCount) + ' left</span></div>' +
          '<div class="tc-well' + (fresh && ev && ev.kind === 'burn' ? ' sh-burned' : '') + '" id="tvPileWell"><span class="tc-well-label">Play pile</span>' +
            renderMessyPile(preview, msg.pileCount || preview.length, { size: pileSize, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + tcNum(msg.pileCount) + ' cards</span></div>' +
        '</div><div class="tc-tv-side">' + side + '</div>';
      }

      html += '</div><div class="tc-tv-col">' + right.map(seat).join('') + '</div></div></div>';
      content.innerHTML = html;
      tcFitTv();
    }

    SH.registerGame('_api-card', {
      render: renderApiCardTv,
      alwaysScoreboard: true,
    });
    if (typeof SH_DYNAMIC_ALIASES !== 'undefined' && Array.isArray(SH_DYNAMIC_ALIASES)) {
      SH_DYNAMIC_ALIASES.forEach(a => SH.aliasGame(a.id, a.base));
    }
