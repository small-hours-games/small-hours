// Gin Rummy on the TV.

    var lastGrState = {}; // so re-renders do not repeat a sound
    var grLog = [];
    var grSeenSeq = null;

    function grAvatar(id) {
      if (String(id).startsWith('bot_')) {
        return (typeof SH !== 'undefined' && SH.aiPersona && (SH.aiPersona(id) || {}).avatar) || '🤖';
      }
      return (state.playerAvatars || {})[id] || '';
    }

    /** Play the move on the TV: drawn cards fly from Stock/Discard to the seat; discards fly to Discard. */
    function tvAnimateGrEvent(ev) {
      const story = typeof document !== 'undefined' && document.getElementById('storyOverlay');
      if (story && story.style && story.style.display !== 'none' && typeof getComputedStyle === 'function' && getComputedStyle(story).display !== 'none') return;
      const content = document.getElementById('gameContent');
      if (!content || typeof content.querySelector !== 'function') return;
      const esc = window.CSS && CSS.escape ? CSS.escape(ev.by) : ev.by;
      const seatEl = content.querySelector('.tc-seat[data-player-id="' + esc + '"]');
      if (!seatEl) return;
      const seatRect = seatEl.getBoundingClientRect();
      if (ev.kind === 'gr-discard') {
        const card = (ev.cards || [])[0];
        const discardStack = content.querySelector('#grTvDiscardWell .tc-stack') || content.querySelector('#grTvDiscardWell');
        if (!card || !discardStack || typeof tcFlyIn !== 'function') return;
        const topEl = discardStack.querySelector('.tc-top');
        if (topEl) topEl.classList.add('tc-in-flight');
        tcFlyIn(card, seatRect, discardStack, ev, {
          onDone: () => {
            if (topEl) {
              topEl.classList.remove('tc-in-flight');
              topEl.classList.add('tc-land');
            }
          },
        });
      } else if (ev.kind === 'gr-draw-stock') {
        const stockEl = content.querySelector('#grTvStockWell .tc-stack') || content.querySelector('#grTvStockWell');
        if (stockEl && typeof tcFlyFromPile === 'function') tcFlyFromPile(null, stockEl, seatRect, { facedown: true });
      } else if (ev.kind === 'gr-draw-discard' || ev.kind === 'gr-take-upcard') {
        const card = (ev.cards || [])[0];
        const discardEl = content.querySelector('#grTvDiscardWell .tc-stack') || content.querySelector('#grTvDiscardWell');
        if (discardEl && typeof tcFlyFromPile === 'function') tcFlyFromPile(card, discardEl, seatRect);
      }
    }

    function renderGinRummy(msg) {
      const content = document.getElementById('gameContent');
      const names = state.playerNames || msg.playerNames || {};
      const cum = msg.cumulative || {};
      const boxes = msg.boxes || {};
      const pids = Object.keys(cum);
      const playing = msg.phase !== 'scoring' && msg.phase !== 'finished';
      const ev = msg.lastEvent || null;
      const freshEvent = !!ev && ev.seq !== grSeenSeq;
      grSeenSeq = ev ? ev.seq : null;
      grLog = tcLogPush(grLog, ev, 6);

      // Sounds (TV speakers)
      if (lastGrState.handNumber != null && msg.handNumber > lastGrState.handNumber) audio.play('deck_redraw');
      if ((msg.phase === 'scoring' || msg.phase === 'finished') && lastGrState.phase !== msg.phase) audio.play('win');
      if (msg.phase === 'drawing' && lastGrState.phase === 'drawing') {
        if (msg.stockCount < lastGrState.stockCount) audio.play('draw');
        if (msg.discardCount > lastGrState.discardCount) audio.play('place');
      }
      lastGrState = { handNumber: msg.handNumber, phase: msg.phase, stockCount: msg.stockCount, discardCount: msg.discardCount };

      const current = msg.currentPlayer;
      const drewStock = playing && msg.turnPhase === 'discard' && ev && ev.by === current && ev.kind === 'gr-draw-stock';
      const drewDiscard = playing && msg.turnPhase === 'discard' && ev && ev.by === current && (ev.kind === 'gr-draw-discard' || ev.kind === 'gr-take-upcard');
      const tookCard = drewDiscard && ev.cards && ev.cards[0] ? ' ' + tcCardShort(ev.cards[0]) : '';
      const action = msg.phase === 'first_turn' ? 'deciding on the upcard'
        : drewStock ? 'drew from stock'
        : drewDiscard ? 'took' + tookCard + ' from discard'
        : (msg.turnPhase === 'draw' ? 'drawing' : 'discarding');
      let status = 'Gin Rummy';
      if (playing && current) status = (names[current] || 'Player') + (drewStock || drewDiscard ? ' ' : ' is ') + action;
      else if (msg.phase === 'scoring') status = 'Hand over';
      else if (msg.phase === 'finished') status = 'Game over';

      const hr = msg.handResult || {};
      const seat = pid => {
        const count = tcNum((msg.playerCardCounts || {})[pid] != null ? msg.playerCardCounts[pid] : 10);
        const pts = tcNum(cum[pid]);
        const bx = tcNum(boxes[pid]);
        const turn = playing && pid === current;
        const knocked = !playing && pid === msg.knocker;
        const knockTag = knocked ? (hr.type === 'gin' ? '🔥 Gin!' : hr.type === 'bigGin' ? '🌟 Big Gin!' : '🔔 Knocked') : null;
        return tvSeatHtml(pid, names, {
          turn,
          tag: turn ? '▶ ' + action : knockTag,
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
        const actorName = names[current] || 'Player';
        html += '<div class="tc-tv-center">' +
          '<div class="tc-well' + (drewStock ? ' tc-well-drawn' : '') + '" id="grTvStockWell"><span class="tc-well-label">Stock</span>' +
            renderTableStack(null, msg.stockCount || 0, { size: 'xl', facedown: true, emptyLabel: 'Empty', highlight: msg.turnPhase === 'draw' }) +
            '<span class="tc-count">' + tcNum(msg.stockCount) + ' left</span>' +
            (drewStock ? '<span class="tc-well-hint">← ' + escapeHtml(actorName) + ' drew</span>' : '') + '</div>' +
          '<div class="tc-well' + (drewDiscard ? ' tc-well-drawn' : '') + '" id="grTvDiscardWell"><span class="tc-well-label">Discard</span>' +
            renderTableStack(preview, discardCount, { size: 'xl', emptyLabel: 'Empty', highlight: msg.phase === 'first_turn' }) +
            '<span class="tc-count">' + discardCount + (discardCount === 1 ? ' card' : ' cards') + '</span>' +
            (drewDiscard ? '<span class="tc-well-hint">← ' + escapeHtml(actorName + ' took' + tookCard) + '</span>' : '') + '</div>' +
        '</div>';
        const logHtml = renderMoveLog(grLog, { name: id => names[id] || 'Player', avatar: grAvatar, max: 4 });
        if (logHtml) html += '<div class="tc-tv-side">' + logHtml + '</div>';
        html += '</div><div class="tc-tv-col">' + (pids[0] ? seat(pids[0]) : '') + '</div></div>';
      } else {
        const labels = { knock: 'Knock', undercut: 'Undercut!', gin: 'Gin!', bigGin: 'Big Gin!', cancelled: 'Stock ran out' };
        html += '<div class="tc-tv-result' + (msg.knocker ? ' tc-result-pop' : '') + '">';
        if (msg.knocker) {
          const knockerName = names[msg.knocker] || 'Player';
          const bannerCls = hr.type === 'undercut' ? ' tc-knock-banner-undercut' : (hr.type === 'gin' || hr.type === 'bigGin') ? ' tc-knock-banner-gin' : '';
          const bannerText = hr.type === 'gin' ? '🔥 ' + knockerName + ' got Gin!'
            : hr.type === 'bigGin' ? '🌟 ' + knockerName + ' got Big Gin!'
            : hr.type === 'undercut' ? '💥 ' + knockerName + ' knocked — Undercut!'
            : '🔔 ' + knockerName + ' knocked!';
          html += '<div class="tc-knock-banner' + bannerCls + '">' + escapeHtml(bannerText) + '</div>';
        }
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
      if (freshEvent && playing) tvAnimateGrEvent(ev);
    }

    SH.registerGame('gin-rummy', {
      render: renderGinRummy,
      scoreboard(msg) {
        return msg.handNumber != null ? { roundLabel: 'Hand ' + msg.handNumber } : {};
      },
    });
