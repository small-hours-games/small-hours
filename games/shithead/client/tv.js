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

    // --- The AI characters (SH_AI, src/engine/bots/personas.js) ---
    // When a game starts they boot up on their seats, each in its own way and a little lost,
    // and later they say something when a move goes their way (or doesn't).
    var shAiIntroDone = false;
    var shAiBubbles = {};
    var shAiFinished = [];

    function shAiSeatRect(id) {
      const content = document.getElementById('gameContent');
      const seat = content && content.querySelector('.tc-seat[data-player-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      return seat ? seat.getBoundingClientRect() : null;
    }

    /** A speech bubble above an AI seat; a newer line replaces the last one. */
    function shAiSay(id, text, ms) {
      const r = shAiSeatRect(id);
      if (!r || !text) return;
      if (shAiBubbles[id]) shAiBubbles[id].remove();
      const b = document.createElement('div');
      b.className = 'ai-bubble';
      b.textContent = text;
      b.style.left = (r.left + r.width / 2).toFixed(0) + 'px';
      b.style.top = (r.top + 6).toFixed(0) + 'px';
      document.body.appendChild(b);
      shAiBubbles[id] = b;
      setTimeout(() => {
        b.classList.add('ai-bubble-out');
        setTimeout(() => b.remove(), 400);
        if (shAiBubbles[id] === b) delete shAiBubbles[id];
      }, ms || 2600);
    }

    /** One AI character arrives on its seat: its own entrance, then a confused look around. */
    function shAiEntrance(id, i) {
      const p = SH.aiPersona(id);
      const r = shAiSeatRect(id);
      if (!p || !r) return;
      const el = document.createElement('div');
      el.className = 'ai-intro ai-intro-' + (p.entrance || 'boot');
      el.style.left = (r.left + r.width / 2).toFixed(0) + 'px';
      el.style.top = (r.top + r.height / 2).toFixed(0) + 'px';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="ai-intro-face">' + escapeHtml(p.avatar) + '<span class="ai-intro-lost">' +
        (p.entrance === 'dizzy' ? '💫' : '❓') + '</span></div><div class="ai-intro-name">' + escapeHtml(p.name) + '</div>';
      // The drawn robot (ai-robots.js) instead of the emoji, when the page has the rigs.
      if (typeof createAiRobot === 'function') {
        const face = el.querySelector('.ai-intro-face');
        const lost = face.querySelector('.ai-intro-lost');
        face.textContent = '';
        face.classList.add('ai-intro-rig');
        // The character's own body (the same one that dances in the lobby show), not a copy.
        const rig = typeof aiRobot === 'function' ? aiRobot(p.name, p.entrance || 'boot') : createAiRobot(p.entrance || 'boot');
        rig.pose({ mood: 'calm' });
        face.appendChild(rig.el);
        face.appendChild(lost);
      }
      document.body.appendChild(el);
      setTimeout(() => shAiSay(id, p.hello[i % p.hello.length], 3200), 900);
      setTimeout(() => el.remove(), 4300);
    }

    function shAiIntro(msg) {
      const bots = (msg.players || []).map(pl => pl.playerId).filter(id => SH.aiPersona(id));
      bots.forEach((id, i) => setTimeout(() => shAiEntrance(id, i), 300 + i * 850));
    }

    /** A line for what just happened to an AI seat (burn, pick-up, blind miss, going out). */
    function shAiReact(ev, msg) {
      const finish = msg.finishOrder || [];
      const newlyOut = finish.filter(id => !shAiFinished.includes(id) && SH.aiPersona(id));
      shAiFinished = finish.slice();
      newlyOut.forEach(id => { const p = SH.aiPersona(id); shAiSay(id, p.quips.out[finish.length % p.quips.out.length]); });
      if (!ev || !SH.aiPersona(ev.by) || newlyOut.includes(ev.by)) return;
      const kind = ev.kind === 'burn' ? 'burn' : ev.kind === 'pickup' ? 'pickup' : ev.kind === 'blind-miss' ? 'blind' : null;
      if (!kind) return;
      const lines = SH.aiPersona(ev.by).quips[kind] || [];
      if (lines.length) setTimeout(() => shAiSay(ev.by, lines[(ev.seq || 0) % lines.length]), kind === 'burn' ? 500 : 250);
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
      const prevDrawCount = lastShState.drawPileCount;
      const drewCount = (freshEvent && msg.phase === 'play' && prevDrawCount != null && msg.drawPileCount < prevDrawCount)
        ? (prevDrawCount - msg.drawPileCount) : 0;
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
        let banner = '';
        if (msg.loser) {
          banner = '<div class="tc-knock-banner tc-knock-banner-undercut">💩 ' + escapeHtml(names[msg.loser] || 'Player') + ' keeps the palace!</div>';
        } else if (finish[0]) {
          banner = '<div class="tc-knock-banner tc-knock-banner-gin">🏆 ' + escapeHtml(names[finish[0]] || 'Player') + ' wins!</div>';
        }
        html += '<div class="tc-tv-result tc-result-pop"><div class="tc-sheet-kicker">Final standings</div>' + banner + '<div class="tc-standings">' +
          finish.map((id, i) => '<div class="tc-standing"><span class="tc-place">#' + (i + 1) + '</span>' + playerAvatarHtml(id) + escapeHtml(names[id] || 'Player') + '</div>').join('') +
          (msg.loser ? '<div class="tc-standing"><span class="tc-place">💩</span>' + playerAvatarHtml(msg.loser) + escapeHtml((names[msg.loser] || 'Player') + ' keeps the palace') + '</div>' : '') +
        '</div></div>';
      } else if (msg.phase === 'play') {
        const pilePreview = (msg.pilePreview && msg.pilePreview.length) ? msg.pilePreview : (msg.pileTop ? [msg.pileTop] : []);
        const pileCount = tcNum(msg.pileCount);
        const actorName = ev ? (names[ev.by] || 'Player') : '';
        const drawHint = drewCount > 0 ? '<span class="tc-well-hint">← ' + escapeHtml(actorName) + ' drew ' + drewCount + '</span>' : '';
        let pileClass = '';
        let pileHint = '';
        if (freshEvent && ev) {
          if (ev.kind === 'pickup') {
            pileClass = ' tc-well-drawn';
            pileHint = '<span class="tc-well-hint">← ' + escapeHtml(actorName) + ' picked up ' + tcNum(ev.count) + '</span>';
          } else if (ev.kind === 'blind-miss') {
            pileClass = ' tc-well-drawn';
            pileHint = '<span class="tc-well-hint">🫣 ' + escapeHtml(actorName) + ' missed (' + tcNum(ev.count) + ')</span>';
          } else if (ev.kind === 'burn') {
            pileClass = ' sh-burned';
            pileHint = '<span class="tc-well-hint">🔥 ' + escapeHtml(actorName) + ' burned!</span>';
          }
        }
        let side = '<div class="tc-rule">' + escapeHtml(shitheadRuleHintText(msg.pileTopRank, msg.pileCount || 0)) + '</div>';
        side += renderMoveLog(shLog, { name: id => names[id] || 'Player', avatar: id => (String(id).startsWith('bot_') ? ((SH.aiPersona(id) || {}).avatar || '🤖') : ((state.playerAvatars || {})[id] || '')), max: 4 });
        html += '<div class="tc-tv-center">' +
          '<div class="tc-well' + (drewCount > 0 ? ' tc-well-drawn' : '') + '" id="tvDrawWell"><span class="tc-well-label">Draw deck</span>' +
            renderTableStack(null, msg.drawPileCount || 0, { size: pileSize, facedown: true, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + tcNum(msg.drawPileCount) + ' left</span>' + drawHint + '</div>' +
          '<div class="tc-well' + pileClass + '" id="tvPileWell"><span class="tc-well-label">Play pile</span>' +
            renderMessyPile(pilePreview, pileCount || pilePreview.length, { size: pileSize, emptyLabel: 'Empty' }) +
            '<span class="tc-count">' + pileCount + (pileCount === 1 ? ' card' : ' cards') + '</span>' + pileHint + '</div>' +
        '</div>' +
        '<div class="tc-tv-side">' + side + '</div>';
      } else {
        html += '<div class="tc-tv-banner">Put your strongest cards (2, 10, A) face-up, then tap Done on your phone</div>';
      }

      html += '</div><div class="tc-tv-col">' + right.map(seat).join('') + '</div></div>';
      html += '</div>';
      content.innerHTML = html;
      tcFitTv();
      if (msg.phase === 'swap' && !shAiIntroDone) {
        shAiIntroDone = true;
        shAiFinished = [];
        requestAnimationFrame(() => shAiIntro(msg));
      }
      if (msg.phase === 'finished') shAiIntroDone = false;
      if (freshEvent || (msg.finishOrder || []).length !== shAiFinished.length) shAiReact(freshEvent ? ev : null, msg);
      if (freshEvent) tvAnimateShEvent(ev, msg, drewCount);
      else if (ev && ev.seq === state.tvFlightSeq) {
        const flyingTop = content.querySelector('#tvPileWell .tc-pile-top');
        if (flyingTop) flyingTop.classList.add('tc-in-flight');
      }
    }

    /** Play the move on the TV: the card flies in from the player's seat, or the pile slides to them. */
    function tvAnimateShEvent(ev, msg, drewCount) {
      // Nothing flies while the story card covers the table: the card would land on top of it.
      const story = document.getElementById('storyOverlay');
      if (story && story.style && story.style.display !== 'none' && getComputedStyle(story).display !== 'none') return;
      const content = document.getElementById('gameContent');
      const seatEl = content && typeof content.querySelector === 'function'
        ? content.querySelector('.tc-seat[data-player-id="' + (window.CSS && CSS.escape ? CSS.escape(ev.by) : ev.by) + '"]')
        : null;
      const pile = content && typeof content.querySelector === 'function' ? content.querySelector('#tvPileWell .tc-pile') : null;
      if (!seatEl || !pile) return;
      const fromRect = seatEl.getBoundingClientRect();
      if (drewCount > 0) {
        const drawWell = content.querySelector('#tvDrawWell .tc-pile');
        if (drawWell) tcFlyFromPile(null, drawWell, fromRect, { facedown: true });
      }
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

    let shLastBoard = null;
    SH.registerGame('shithead', {
      render: renderShithead,
      onLeave() {
        document.querySelectorAll('.ai-bubble, .ai-intro').forEach(el => el.remove());
        shAiBubbles = {};
        shAiIntroDone = false;
      },
      alwaysScoreboard: true,
      scoreboard(msg, { names, ids }) {
        // The end-of-game message carries only the result, not the table: keep the last
        // table we saw so the final board still shows places instead of "Playing".
        if (msg.players || msg.finishOrder) shLastBoard = { players: msg.players, finishOrder: msg.finishOrder };
        else if (shLastBoard) msg = Object.assign({}, shLastBoard, msg);
        // `scores` here is players.length - placement; derive true placement from finishOrder.
        const finishOrder = msg.finishOrder || [];
        const over = msg.phase === 'finished';
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
          valueText: finishOrder.includes(id) ? 'Place ' + (i + 1) : over ? '💩 Palace' : cardsLeft(id),
          rank: i + 1,
          isOut: finishOrder.includes(id) && !over,   // at the end the places say it all
        })) };
      },
    });
