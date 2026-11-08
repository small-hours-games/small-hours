// Palace on the TV.

    var lastShState = {}; // so re-renders do not repeat a sound
    var shLog = [];
    var shSeenSeq = null;

    function shitheadRuleHintText(pileTopRank, pileCount) {
      if (!pileCount) return 'Empty pile: play anything';
      const top = pileTopRank == null ? null : Number(pileTopRank);
      if (top == null || isNaN(top)) return 'A 2 reset the pile: play anything';
      const rankLbl = tcRankLabel(top);
      if (top === 7) return '7 on top: play 7 or lower, or a 2 or 10';
      return 'Play ' + rankLbl + ' or higher, or a 2 or 10';
    }

    function renderShithead(msg) {
      const content = document.getElementById('gameContent');
      const names = state.playerNames || msg.playerNames || {};
      const ev = msg.lastEvent || null;
      const freshEvent = !!ev && ev.seq !== shSeenSeq && msg.phase !== 'swap';
      shSeenSeq = ev ? ev.seq : null;
      shLog = tcLogPush(shLog, ev, 6);
      const flying = freshEvent && ev.cards && ev.cards.length && (ev.kind === 'play' || ev.kind === 'burn' || ev.kind === 'blind-miss');

      // Sounds (TV speakers). A thrown card makes its sound when it lands.
      if (msg.phase === 'play' || msg.phase === 'finished') {
        if (lastShState.pileCount != null && msg.pileCount === 0 && lastShState.pileCount > 0 && !flying) audio.play('deck_redraw');
        else if (lastShState.drawPileCount != null && msg.drawPileCount < lastShState.drawPileCount && !flying) audio.play('draw');
        else if (lastShState.pileCount != null && msg.pileCount > lastShState.pileCount && !flying) audio.play('place');
        if (msg.phase === 'finished' && lastShState.phase !== 'finished') audio.play('win');
      }
      lastShState = { pileCount: msg.pileCount || 0, drawPileCount: msg.drawPileCount, phase: msg.phase };

      const players = msg.players || [];
      const finish = msg.finishOrder || [];
      const many = players.length > 4; // compact seats so 5-6 players fit a 1080p TV
      const pileSize = many ? 'lg' : 'xl';
      let status = 'Palace';
      if (msg.phase === 'swap') status = 'Swap phase: everyone picks their face-up cards';
      else if (msg.phase === 'finished') status = 'Game over';
      else if (msg.currentPlayer) status = (names[msg.currentPlayer] || 'Player') + "'s turn";

      const seat = p => {
        const place = finish.indexOf(p.playerId);
        const out = p.isOut || place >= 0;
        const turn = msg.phase === 'play' && p.playerId === msg.currentPlayer;
        let tag = null;
        let tagClass = '';
        if (msg.phase === 'swap') { tag = (msg.swapConfirmed || {})[p.playerId] ? '✓ ready' : '⏳ swapping'; tagClass = (msg.swapConfirmed || {})[p.playerId] ? 'tc-tag-out' : ''; }
        else if (msg.phase === 'finished' && p.playerId === msg.loser) { tag = 'Palace keeper 💩'; tagClass = 'tc-tag-loser'; }
        else if (out) { tag = '✓ out #' + (place + 1); tagClass = 'tc-tag-out'; }
        else if (turn) tag = '▶ playing';
        let cards = '';
        if (!out || msg.phase === 'swap') {
          cards += '<div><div class="tc-mini-label">Hand</div>' + tvFanHtml(p.handCount || 0, 'sm', 8) + '</div>';
          cards += '<div><div class="tc-mini-label">Face up · down</div><div class="tc-mini-row">' +
            (p.faceUp || []).map(c => renderTableCard(c, { size: many ? 'sm' : 'md', dataId: '' })).join('') +
            Array.from({ length: p.faceDownCount || 0 }, () => renderTableCard(null, { size: 'sm', facedown: true, dataId: '' })).join('') +
          '</div></div>';
        }
        return tvSeatHtml(p.playerId, names, { turn, out, tag, tagClass, cards });
      };

      // Seats around the table: half left, half right, and an odd player out above the
      // pile, so three players sit left, top and right instead of two-against-one.
      const half = Math.floor(players.length / 2);
      const left = players.slice(0, half);
      const top = players.length % 2 ? [players[half]] : [];
      const right = players.slice(half + top.length);

      let html = '<div class="tc-tv tc-felt' + (many ? ' tc-tv-many' : '') + '">';
      html += '<div class="tc-tv-status"><span class="tc-dot' + (msg.phase === 'play' ? ' tc-dot-live' : '') + '"></span>' + escapeHtml(status) + '</div>';
      html += '<div class="tc-tv-row"><div class="tc-tv-col">' + left.map(seat).join('') + '</div><div class="tc-tv-mid">';
      if (top.length) html += '<div class="tc-tv-top">' + top.map(seat).join('') + '</div>';

      if (msg.phase === 'finished') {
        html += '<div class="tc-tv-result"><div class="tc-sheet-kicker">Final standings</div><div class="tc-standings">' +
          finish.map((id, i) => '<div class="tc-standing"><span class="tc-place">#' + (i + 1) + '</span>' + playerAvatarHtml(id) + escapeHtml(names[id] || 'Player') + '</div>').join('') +
          (msg.loser ? '<div class="tc-standing"><span class="tc-place">💩</span>' + playerAvatarHtml(msg.loser) + escapeHtml((names[msg.loser] || 'Player') + ' keeps the palace') + '</div>' : '') +
        '</div></div>';
      } else if (msg.phase === 'play') {
        const pilePreview = (msg.pilePreview && msg.pilePreview.length) ? msg.pilePreview : (msg.pileTop ? [msg.pileTop] : []);
        const pileCount = tcNum(msg.pileCount);
        let side = '<div class="tc-rule">' + escapeHtml(shitheadRuleHintText(msg.pileTopRank, msg.pileCount || 0)) + '</div>';
        side += renderMoveLog(shLog, { name: id => names[id] || 'Player', avatar: id => (String(id).startsWith('bot_') ? '🤖' : ((state.playerAvatars || {})[id] || '')), max: 4 });
        html += '<div class="tc-tv-center">' +
          '<div class="tc-well"><span class="tc-well-label">Draw deck</span>' +
            renderTableStack(null, msg.drawPileCount || 0, { size: pileSize, facedown: true, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + tcNum(msg.drawPileCount) + ' left</span></div>' +
          '<div class="tc-well" id="tvPileWell"><span class="tc-well-label">Play pile</span>' +
            renderMessyPile(pilePreview, pileCount || pilePreview.length, { size: pileSize, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + pileCount + (pileCount === 1 ? ' card' : ' cards') + '</span></div>' +
        '</div>' +
        '<div class="tc-tv-side">' + side + '</div>';
      } else {
        html += '<div class="tc-tv-banner">Put your strongest cards (2, 10, A) face-up, then tap Done on your phone</div>';
      }

      html += '</div><div class="tc-tv-col">' + right.map(seat).join('') + '</div></div>';
      html += '</div>';
      content.innerHTML = html;
      tcFitTv();
      if (freshEvent) tvAnimateShEvent(ev, msg);
      else if (ev && ev.seq === state.tvFlightSeq) {
        const flyingTop = content.querySelector('#tvPileWell .tc-pile-top');
        if (flyingTop) flyingTop.classList.add('tc-in-flight');
      }
    }

    /** Play the move on the TV: the card flies in from the player's seat, or the pile slides to them. */
    function tvAnimateShEvent(ev, msg) {
      // Nothing flies while the story card covers the table: the card would land on top of it.
      const story = document.getElementById('storyOverlay');
      if (story && story.style.display !== 'none' && getComputedStyle(story).display !== 'none') return;
      const content = document.getElementById('gameContent');
      const seatEl = content.querySelector('.tc-seat[data-player-id="' + (window.CSS && CSS.escape ? CSS.escape(ev.by) : ev.by) + '"]');
      const pile = content.querySelector('#tvPileWell .tc-pile');
      if (!seatEl || !pile) return;
      const fromRect = seatEl.getBoundingClientRect();
      const card = (ev.cards || [])[ev.cards.length - 1];
      if (ev.kind === 'pickup') {
        tcSweepTo(pile, fromRect, ev.count);
        audio.play('draw');
        return;
      }
      if (!card) return;
      const topEl = pile.querySelector('.tc-pile-top');
      if (ev.kind === 'play' && topEl) {
        topEl.classList.add('tc-in-flight');
        state.tvFlightSeq = ev.seq;
      }
      tcFlyIn(card, fromRect, pile, ev, {
        burn: ev.kind === 'burn',
        onDone: () => {
          // The table may have been redrawn during the flight, and only the latest card is hidden.
          if (state.tvFlightSeq === ev.seq) {
            state.tvFlightSeq = null;
            const landed = document.querySelector('#tvPileWell .tc-pile-top');
            if (landed) landed.classList.remove('tc-in-flight');
          }
          if (ev.kind === 'blind-miss') tcSweepTo(pile, fromRect, ev.count);
          audio.play(ev.kind === 'play' ? 'place' : ev.kind === 'burn' ? 'deck_redraw' : 'draw');
        },
      });
    }

    SH.registerGame('shithead', {
      render: renderShithead,
      alwaysScoreboard: true,
      scoreboard(msg, { names, ids }) {
        // `scores` here is players.length - placement; derive true placement from finishOrder.
        const finishOrder = msg.finishOrder || [];
        // Best-first: those who went out first rank above those still in.
        const rankedIds = [
          ...finishOrder,
          ...ids.filter(id => !finishOrder.includes(id)),
        ];
        const cardsLeft = id => {
          const p = (msg.players || []).find(x => x.playerId === id);
          if (!p) return 'Playing';
          const n = (p.handCount || 0) + (p.faceUp || []).length + (p.faceDownCount || 0);
          return n + (n === 1 ? ' card' : ' cards');
        };
        return { entries: rankedIds.map((id, i) => ({
          id,
          name: names[id] || id,
          valueText: finishOrder.includes(id) ? 'Place ' + (i + 1) : cardsLeft(id),
          rank: i + 1,
          isOut: finishOrder.includes(id),
        })) };
      },
    });
