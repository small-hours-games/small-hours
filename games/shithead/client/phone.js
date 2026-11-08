// Palace on the phone.

    Object.assign(state, {
      shSelectedCards: [],
      shSwapSelected: { hand: null, faceUp: null },
      shitheadDecks: 1,
      shWasTurn: false,
      shMoveTimer: null,
      shBurnTimer: null,
    });

    // A move is on its way: the card has left the hand but the server has not answered.
    // No second move until it has. A slow answer usually means a phone whose connection died
    // without noticing (screen lock, Wi-Fi to 4G): after a moment we check the line, and a
    // reconnect resends the move (player.html). Only if nothing comes does the card go back.
    const SH_MOVE_TIMEOUT_MS = 8000;
    const SH_MOVE_SLOW_MS = 800;

    function shMovePending() { return state.shMoveTimer != null; }

    function shMoveAnswered() {
      clearTimeout(state.shMoveTimer);
      clearTimeout(state.shMoveSlowTimer);
      state.shMoveTimer = null;
    }

    function shMoveSent() {
      shMoveAnswered();
      state.shMoveSlowTimer = setTimeout(() => { if (typeof checkConnection === 'function') checkConnection(); }, SH_MOVE_SLOW_MS);
      state.shMoveTimer = setTimeout(() => {
        state.shMoveTimer = null;
        showToast("That move didn't go through. Try again.", 'error');
        shRedraw();
      }, SH_MOVE_TIMEOUT_MS);
    }

    // A 10 or four of a kind empties the pile at once, so show why the card is gone.
    function shShowBurn(ev) {
      const well = document.getElementById('shPileWell');
      well.classList.remove('sh-burned');
      void well.offsetWidth; // restart the flare if the last one is still running
      well.classList.add('sh-burned');
      clearTimeout(state.shBurnTimer);
      state.shBurnTimer = setTimeout(() => well.classList.remove('sh-burned'), 900);
      if (ev.by === state.playerId) showToast('🔥 You burned the pile!', 'success');
    }

    // --- Palace (shithead engine) ---
    function canPlayCard(rank, pileTopRank, pileCount) {
      // Coerce to numbers defensively; mirrors canPlayOnPile in the engine
      const r = Number(rank);
      const top = pileTopRank == null ? null : Number(pileTopRank);
      if (!pileCount) return true;
      if (r === 2 || r === 10) return true; // 2 resets, 10 burns
      if (top === null || isNaN(top)) return true;
      if (top === 7) return r <= 7;
      return r >= top;
    }

    function shRuleBannerText(pileTopRank, pileCount) {
      if (!pileCount) return 'Empty pile: play anything';
      const top = pileTopRank == null ? null : Number(pileTopRank);
      if (top == null || isNaN(top)) return 'A 2 reset the pile: play anything';
      const lbl = tcRankLabel(top);
      if (top === 7) return '7 on top: play 7 or lower, or a 2 or 10';
      return 'Play ' + lbl + ' or higher, or a 2 or 10';
    }

    /** Final order in one line: who went out first, and who keeps the palace. Pure, for tests. */
    function shStandingsText(msg) {
      const order = msg.finishOrder || [];
      const name = id => (id === state.playerId ? 'You' : tcName(id, msg));
      const medals = ['🥇', '🥈', '🥉'];
      const out = order.map((id, i) => (medals[i] || '#' + (i + 1)) + ' ' + name(id));
      const loser = (msg.players || []).map(p => p.playerId).find(id => !order.includes(id));
      if (loser) out.push('💩 ' + name(loser));
      return out.length ? out.join('  ·  ') : 'Game over';
    }

    /** Which of my zones is in play: hand, then face-up, then face-down. */
    function shZone(msg) {
      if ((msg.myHand || []).length) return 'hand';
      if ((msg.myFaceUp || []).length) return 'faceUp';
      if ((msg.myFaceDownIds || []).length) return 'faceDown';
      return 'none';
    }

    function shActiveZoneCards(msg) {
      const zone = shZone(msg);
      if (zone === 'hand') return msg.myHand;
      if (zone === 'faceUp') return msg.myFaceUp;
      return [];
    }

    /** The thumb button: what the next move is. Pure, for tests. */
    function shCtaState(msg, selectedIds) {
      if (msg.phase === 'finished') return { label: 'Game over', disabled: true };
      if (msg.phase === 'swap') {
        const ready = msg.swapConfirmed && msg.swapConfirmed[state.playerId];
        return ready ? { label: 'Ready ✓ waiting for others', disabled: true } : { label: 'Done swapping', action: 'confirmSwap' };
      }
      if (!msg.isMyTurn) return { label: 'Waiting for ' + tcName(msg.currentPlayer, msg) + '…', disabled: true };
      const zone = shZone(msg);
      if (zone === 'faceDown') {
        return selectedIds.length ? { label: 'Flip the blind card', action: 'playFaceDown' } : { label: 'Pick a face-down card', disabled: true };
      }
      const cards = shActiveZoneCards(msg);
      const sel = cards.filter(c => selectedIds.includes(c.id));
      if (sel.length) {
        return { label: 'Play ' + (sel.length > 1 ? sel.length + '× ' + tcRankLabel(sel[0].rank) : tcCardShort(sel[0])), action: 'playCards',
          verb: 'Play', card: sel[0], count: sel.length };
      }
      const pileCount = msg.pileCount || 0;
      if (pileCount > 0 && !cards.some(c => canPlayCard(c.rank, msg.pileTopRank, pileCount))) {
        return { label: 'Pick up the pile (' + pileCount + ')', action: 'pickUpPile' };
      }
      return { label: 'Tap cards to play', disabled: true };
    }

    function renderShitheadState(msg) {
      state.shLastMsg = msg;
      tcFitScreen('shitheadSection');
      const zone = shZone(msg);
      const pileCount = msg.pileCount || 0;
      const myTurn = msg.phase === 'play' && !!msg.isMyTurn;

      // Keep only selections that are still in my active zone
      const validIds = new Set(zone === 'faceDown' ? (msg.myFaceDownIds || []) : shActiveZoneCards(msg).map(c => c.id));
      state.shSelectedCards = msg.phase === 'play' ? state.shSelectedCards.filter(id => validIds.has(id)) : [];

      // Status line
      let status = 'Palace';
      if (msg.phase === 'swap') status = 'Swap: put your strongest cards face-up';
      else if (msg.phase === 'finished') {
        const place = (msg.finishOrder || []).indexOf(state.playerId);
        status = place === 0 ? '🏆 You won! First out' : place > 0 ? 'You finished #' + (place + 1) : '💩 You keep the palace';
      } else if (myTurn) {
        status = zone === 'faceUp' ? 'Your turn: play from your face-up cards'
          : zone === 'faceDown' ? 'Your turn: flip a blind card!' : 'Your turn';
      } else if ((msg.finishOrder || []).includes(state.playerId)) {
        status = "You're out! Watching the others";
      } else {
        status = tcName(msg.currentPlayer, msg) + "'s turn";
      }
      tcSetStatus('sh', status, myTurn || (msg.phase === 'swap' && !(msg.swapConfirmed || {})[state.playerId]));
      tcBuzz('shWasTurn', myTurn);
      document.getElementById('shMeta').textContent = 'Deck ' + (msg.drawPileCount || 0);

      renderShOtherPlayers(msg);

      // Table: draw deck and play pile
      document.getElementById('shDrawStack').innerHTML = renderTableStack(null, msg.drawPileCount || 0, { size: 'md', facedown: true, emptyLabel: 'Empty' });
      document.getElementById('shDrawCount').textContent = (msg.drawPileCount || 0) + ' left';
      const pilePreview = (msg.pilePreview && msg.pilePreview.length) ? msg.pilePreview : (msg.pileTop ? [msg.pileTop] : []);
      const pileStack = document.getElementById('shPileStack');
      pileStack.innerHTML = renderMessyPile(pilePreview, pileCount || pilePreview.length, { size: 'md', emptyLabel: 'Empty', highlight: myTurn && state.shSelectedCards.length > 0 });
      // Move log + a landing bounce for each new card on the pile
      const ev = msg.lastEvent;
      const freshEvent = ev && ev.seq !== state.shSeenSeq;
      state.shLog = tcLogPush(state.shLog, ev, 6);
      state.shSeenSeq = ev ? ev.seq : null;
      if (freshEvent && ev.kind === 'play' && ev.by !== state.playerId) {
        const top = pileStack.querySelector('.tc-pile-top');
        if (top) top.classList.add('tc-land');
      }
      if (freshEvent && ev.kind === 'burn') shShowBurn(ev);
      if (freshEvent && ev.by !== state.playerId && (ev.kind === 'burn' || ev.kind === 'pickup' || ev.kind === 'blind-miss')) {
        if (navigator.vibrate) navigator.vibrate(30);
      }
      document.getElementById('shLog').innerHTML = msg.phase === 'play'
        ? renderMoveLog(state.shLog, { name: id => (id === state.playerId ? 'You' : tcName(id, msg)), avatar: id => tcAvatar(id), max: 3 })
        : '';
      document.getElementById('shPileCount').textContent = pileCount + (pileCount === 1 ? ' card' : ' cards');
      document.getElementById('shPileWell').classList.toggle('tc-well-active', myTurn && state.shSelectedCards.length > 0);
      document.getElementById('shRule').textContent = msg.phase === 'swap'
        ? 'Tap a hand card, then a face-up card, to swap them. 2, 10 and A are strong face-up.'
        : msg.phase === 'finished' ? shStandingsText(msg)
        : shRuleBannerText(msg.pileTopRank, pileCount);

      // My table cards (face-up / face-down) above the hand
      const faceUp = msg.myFaceUp || [];
      const fdIds = msg.myFaceDownIds || [];
      let table = '';
      if (msg.phase === 'swap' || zone === 'hand') {
        table += '<div class="tc-table-group"><span class="tc-group-label">Face up</span><div class="tc-row">' +
          (faceUp.length ? faceUp.map(c => renderTableCard(c, {
            size: 'md',
            selected: msg.phase === 'swap' && state.shSwapSelected.faceUp === c.id,
            dim: msg.phase !== 'swap',
          })).join('') : '<span class="tc-group-label">none</span>') + '</div></div>';
      }
      if (zone !== 'faceDown' && fdIds.length) {
        table += '<div class="tc-table-group"><span class="tc-group-label">Face down</span><div class="tc-row">' +
          fdIds.map(() => renderTableCard(null, { size: 'sm', facedown: true, dataId: '' })).join('') + '</div></div>';
      }
      const tableEl = document.getElementById('shTableCards');
      tableEl.innerHTML = table;
      attachHandGestures(tableEl, {
        onTap: id => { if (state.shLastMsg && state.shLastMsg.phase === 'swap') shSwapSelect('faceUp', id); },
      });

      // The rack: whatever zone I play from
      let rackCards = [];
      if (msg.phase === 'swap' || zone === 'hand') rackCards = msg.myHand || [];
      else if (zone === 'faceUp') rackCards = faceUp;
      const sortMode = state.shSortMode || 'rank';
      // "rank" in Palace: low to high, with the 2s and 10s (they play on anything) kept last.
      let ordered = orderHand(rackCards, sortMode === 'rank' ? 'palace' : sortMode, state.shOrder);
      // A big hand (after a pickup) stacks same ranks: Palace plays them together anyway.
      const stackable = msg.phase === 'play' && zone === 'hand' && shHasStacks(rackCards);
      const stacked = stackable && !state.shSplitStacks;
      state.shStacked = stacked;
      const myHand = msg.myHand || [];
      const arrivals = tcTrackArrivals('sh', myHand, msg.phase === 'play' ? 'play' : null);
      let rackOpts;
      if (msg.phase === 'swap') {
        rackOpts = c => ({ selected: state.shSwapSelected.hand === c.id });
      } else {
        rackOpts = (c, group) => ({
          selected: (group || [c]).some(g => state.shSelectedCards.includes(g.id)),
          dim: myTurn && !canPlayCard(c.rank, msg.pileTopRank, pileCount),
          ...tcArrivalOpts(arrivals, c, group),
        });
      }
      if (msg.phase === 'play' && zone === 'faceDown') {
        ordered = fdIds.map(id => ({ id }));
        rackOpts = c => ({ facedown: true, selected: state.shSelectedCards.includes(c.id) });
      }
      const handEl = document.getElementById('shHand');
      tcFlipHand(handEl, () => {
        handEl.innerHTML = renderHandRack(ordered, {
          layout: tcLayout(), width: tcHandWidth('shHand'), cardW: tcHandCardW('shHand'), cardOpts: rackOpts,
          stack: stacked,
          emptyText: msg.phase === 'finished' ? 'Game over' : 'No cards left',
        });
      });
      attachHandGestures(handEl, {
        peek: true,
        onTap: id => shTapCard(id),
        onPlay: (id, flick) => shSwipePlay(id, flick),
        onReorder: (id, targetId) => {
          state.shOrder = tcMoveId(ordered.map(c => c.id), id, targetId);
          state.shSortMode = 'custom';
          renderShitheadState(state.shLastMsg);
        },
      });

      // Thumb button and action bar
      tcSetCta('shCta', shCtaState(msg, state.shSelectedCards));
      document.getElementById('shLayoutBtn').textContent = tcLayout() === 'fan' ? 'Fan' : '2-Row';
      document.getElementById('shSortBtn').textContent = 'Sort: ' + (sortMode === 'custom' ? 'mine' : sortMode);
      const stackBtn = document.getElementById('shStackBtn');
      stackBtn.hidden = !stackable;
      stackBtn.textContent = state.shSplitStacks ? 'Stack' : 'Split stacks';
      tcSyncColoursBtn('shColoursBtn');
      const pickUp = document.getElementById('shPickUpBtn');
      pickUp.hidden = msg.phase !== 'play';
      pickUp.disabled = !myTurn || pileCount === 0;
      pickUp.textContent = 'Pick up' + (pileCount ? ' (' + pileCount + ')' : '');
      updateShSelectionAssistUI();
      tcSqueeze('shitheadSection');
      shFitLog();
      const fromPile = ev && (ev.kind === 'pickup' || ev.kind === 'blind-miss');
      // A card drawn to replace the one I threw waits until that one has landed on the pile.
      tcLaunchArrivals(arrivals, myHand, fromPile ? pileStack : document.getElementById('shDrawStack'), handEl, { delay: tcThrowsLandIn() });
    }

    /** The hand is pinned to the bottom: drop the oldest log lines until none sit under it. */
    function shFitLog() {
      const logEl = document.getElementById('shLog');
      const zone = document.querySelector('#shitheadSection .tc-hand-zone');
      if (!logEl || !zone) return;
      const items = Array.from(logEl.querySelectorAll('.tc-log-item'));
      // The latest move always stays; older lines only when there is room.
      while (items.length > 1 && logEl.getBoundingClientRect().bottom > zone.getBoundingClientRect().top + 8) {
        items.pop().remove();
      }
    }

    function shTapCard(id) {
      const msg = state.shLastMsg;
      if (!msg) return;
      if (msg.phase === 'swap') { shSwapSelect('hand', id); return; }
      if (msg.phase !== 'play') return;
      const handEl = document.getElementById('shHand');
      if (shZone(msg) === 'faceDown') {
        state.shSelectedCards = state.shSelectedCards.includes(id) ? [] : [id];
        renderShitheadState(msg);
        return;
      }
      const card = shActiveZoneCards(msg).find(c => c.id === id);
      if (!card) return;
      if (msg.isMyTurn && !canPlayCard(card.rank, msg.pileTopRank, msg.pileCount || 0)) {
        tcShake(handEl, id);
        showToast(shRuleBannerText(msg.pileTopRank, msg.pileCount || 0), 'info');
        return;
      }
      if (state.shStacked) {
        // One tap takes the whole stack; a second tap puts it back.
        const group = shActiveZoneCards(msg).filter(c => c.rank === card.rank).map(c => c.id);
        const all = group.every(g => state.shSelectedCards.includes(g));
        state.shSelectedCards = all ? [] : group;
        renderShitheadState(msg);
        return;
      }
      if (state.shSelectedCards.includes(id)) {
        // A second tap only deselects: a quick double tap must never play a card by accident.
        state.shSelectedCards = state.shSelectedCards.filter(x => x !== id);
      } else {
        const first = shActiveZoneCards(msg).find(c => c.id === state.shSelectedCards[0]);
        state.shSelectedCards = first && first.rank === card.rank ? [...state.shSelectedCards, id] : [id];
      }
      renderShitheadState(msg);
    }

    function shSwipePlay(id, flick) {
      if (shMovePending()) return;
      const msg = state.shLastMsg;
      if (!msg || msg.phase !== 'play' || !msg.isMyTurn) { shTapCard(id); return; }
      if (shZone(msg) === 'faceDown') { shPlayFaceDown(id, flick); return; }
      const cards = shActiveZoneCards(msg);
      const card = cards.find(c => c.id === id);
      if (!card) return;
      if (!canPlayCard(card.rank, msg.pileTopRank, msg.pileCount || 0)) {
        tcShake(document.getElementById('shHand'), id);
        showToast(shRuleBannerText(msg.pileTopRank, msg.pileCount || 0), 'info');
        return;
      }
      const sameRank = state.shStacked
        ? cards.filter(c => c.rank === card.rank).map(c => c.id)
        : cards.filter(c => state.shSelectedCards.includes(c.id) && c.rank === card.rank).map(c => c.id);
      state.shSelectedCards = sameRank.includes(id) ? sameRank : [...sameRank, id];
      playSelectedCards(flick);
    }

    function shTapPile() {
      const msg = state.shLastMsg;
      if (!msg || !msg.isMyTurn || !state.shSelectedCards.length) return;
      if (shZone(msg) === 'faceDown') shPlayFaceDown(state.shSelectedCards[0]);
      else playSelectedCards();
    }

    function shCtaAction() {
      const action = document.getElementById('shCta').dataset.action;
      if (action === 'confirmSwap') confirmShSwap();
      else if (action === 'playCards') playSelectedCards();
      else if (action === 'playFaceDown') shPlayFaceDown(state.shSelectedCards[0]);
      else if (action === 'pickUpPile') pickUpPile();
    }

    function shToggleLayout() {
      tcSetLayout(tcLayout() === 'fan' ? 'rack' : 'fan');
      if (state.shLastMsg) renderShitheadState(state.shLastMsg);
    }

    function shSetSort(mode) {
      state.shSortMode = mode;
      state.shOrder = null;
      if (state.shLastMsg) renderShitheadState(state.shLastMsg);
    }

    function shCycleSort() {
      shSetSort(state.shSortMode === 'rank' || !state.shSortMode ? 'suit' : 'rank');
    }

    /** Stack same ranks once the hand no longer fits two rows of six. Pure, for tests. */
    function shHasStacks(cards) {
      if (!cards || cards.length <= 12) return false;
      return new Set(cards.map(c => c.rank)).size < cards.length;
    }

    function shToggleStacks() {
      state.shSplitStacks = !state.shSplitStacks;
      if (state.shLastMsg) renderShitheadState(state.shLastMsg);
    }

    function shSwapSelect(source, cardId) {
      if (source === 'hand') {
        state.shSwapSelected.hand = state.shSwapSelected.hand === cardId ? null : cardId;
      } else {
        state.shSwapSelected.faceUp = state.shSwapSelected.faceUp === cardId ? null : cardId;
      }
      if (state.shSwapSelected.hand && state.shSwapSelected.faceUp) {
        send({ type: 'GAME_ACTION', action: { type: 'swapCard', handCardId: state.shSwapSelected.hand, faceUpCardId: state.shSwapSelected.faceUp } });
        state.shSwapSelected = { hand: null, faceUp: null };
      }
      if (state.shLastMsg) renderShitheadState(state.shLastMsg);
    }

    function confirmShSwap() {
      if (shMovePending()) return;
      send({ type: 'GAME_ACTION', action: { type: 'confirmSwap' } });
      shMoveSent();
    }

    function updateShSelectionAssistUI() {
      const msg = state.shLastMsg;
      const assist = document.getElementById('shAssist');
      if (!msg || !assist) return;
      assist.innerHTML = '';
      if (msg.phase !== 'play' || !msg.isMyTurn || !state.shSelectedCards.length) return;
      const cards = shActiveZoneCards(msg);
      const first = cards.find(c => c.id === state.shSelectedCards[0]);
      if (!first) return;
      const same = cards.filter(c => c.rank === first.rank);
      if (same.length > 1 && state.shSelectedCards.length < same.length) {
        assist.innerHTML = '<button type="button" class="tc-btn tc-active" onclick="shSelectAllRank(' + tcNum(first.rank) + ')">All ' +
          escapeHtml(tcRankLabel(first.rank)) + 's (×' + same.length + ')</button>';
      }
    }

    function shSelectAllRank(rank) {
      const msg = state.shLastMsg;
      if (!msg) return;
      state.shSelectedCards = shActiveZoneCards(msg).filter(c => c.rank === Number(rank)).map(c => c.id);
      renderShitheadState(msg);
    }

    // A tap-to-play throws like a gentle flick, so the TV animation always runs.
    const SH_TAP_FLICK = { vx: 0, vy: -2.4 };

    /** Send the cards flying off the top of the phone now; the server's answer follows. */
    function shThrowCards(ids, flick) {
      const msg = state.shLastMsg;
      const handEl = document.getElementById('shHand');
      const known = msg ? shActiveZoneCards(msg) : [];
      ids.forEach((cid, i) => {
        const el = handEl.querySelector('[data-card-id="' + (window.CSS && CSS.escape ? CSS.escape(cid) : cid) + '"]');
        if (!el) return;
        const rect = (i === 0 && flick && flick.rect) ? flick.rect : el.getBoundingClientRect();
        const card = known.find(c => c.id === cid) || null;
        if (card) tcThrowToPile(card, rect, document.getElementById('shPileStack'), flick || SH_TAP_FLICK, i);
        el.style.visibility = 'hidden';
      });
    }

    function shFlickPayload(flick) {
      const f = flick || SH_TAP_FLICK;
      return { vx: f.vx || 0, vy: f.vy || 0 };
    }

    function playSelectedCards(flick) {
      if (state.shSelectedCards.length === 0 || shMovePending()) return;
      const ids = [...state.shSelectedCards];
      shThrowCards(ids, flick);
      send({ type: 'GAME_ACTION', action: { type: 'playCards', cardIds: ids, flick: shFlickPayload(flick) } });
      shMoveSent();
      state.shSelectedCards = [];
    }

    function shPlayFaceDown(cardId, flick) {
      if (!cardId || shMovePending()) return;
      state.shSelectedCards = [];
      const el = document.querySelector('#shHand [data-card-id="' + (window.CSS && CSS.escape ? CSS.escape(cardId) : cardId) + '"]');
      if (el) {
        // The blind card flies to the pile face down; the server's answer turns it over there.
        tcThrowToPile({ id: cardId }, el.getBoundingClientRect(), document.getElementById('shPileStack'), flick || SH_TAP_FLICK, 0);
        el.style.visibility = 'hidden';
      }
      send({ type: 'GAME_ACTION', action: { type: 'playFaceDown', cardId: cardId, flick: shFlickPayload(flick) } });
      shMoveSent();
    }

    function pickUpPile() {
      if (shMovePending()) return;
      state.shSelectedCards = [];
      send({ type: 'GAME_ACTION', action: { type: 'pickUpPile' } });
      shMoveSent();
    }

    function renderShOtherPlayers(msg) {
      const container = document.getElementById('shOpps');
      container.classList.add('tc-opps-seats');
      const finish = msg.finishOrder || [];
      const others = (msg.players || []).filter(p => p.playerId !== state.playerId);
      container.innerHTML = others.map(p => {
        const turn = msg.phase === 'play' && p.playerId === msg.currentPlayer;
        const place = finish.indexOf(p.playerId);
        const out = p.isOut || place >= 0;
        let tag = '';
        if (msg.phase === 'swap') tag = (msg.swapConfirmed || {})[p.playerId] ? '✓ ready' : 'swapping…';
        else if (out) tag = '✓ out' + (place >= 0 ? ' #' + (place + 1) : '');
        else if (turn) tag = '▶ playing';
        let row = '';
        if (!out) {
          row = '<span class="tc-opp-count" title="Cards in hand">' + renderCardChip(null) + '×' + tcNum(p.handCount) + '</span>' +
            (p.faceUp || []).map(renderCardChip).join('') +
            (p.faceDownCount ? '<span class="tc-opp-count tc-opp-blind" title="Face-down cards">+' + tcNum(p.faceDownCount) + '</span>' : '');
        }
        return '<div class="tc-opp' + (turn ? ' tc-opp-turn' : '') + (out ? ' tc-opp-out' : '') + '">' +
          '<div class="tc-opp-head"><span class="tc-opp-name">' + escapeHtml(tcAvatar(p.playerId) + tcName(p.playerId, msg)) + '</span>' +
          (tag ? '<span class="tc-opp-tag">' + escapeHtml(tag) + '</span>' : '') + '</div>' +
          (row ? '<div class="tc-opp-row">' + row + '</div>' : '') +
        '</div>';
      }).join('');
    }

    function setShDecks(n) {
      state.shitheadDecks = n;
      renderAdminControls();
    }

    function shRedraw() {
      if (state.shLastMsg) renderShitheadState(state.shLastMsg);
    }

    SH.registerGame('shithead', {
      section: 'shitheadSection',
      render(msg) {
        shMoveAnswered();
        renderShitheadState(msg);
        tcReleaseThrows(document.getElementById('shPileStack'));
      },
      redraw: shRedraw,
      reset: shMoveAnswered,
      lobbyOptions() {
        return '<div class="grid grid-cols-3 gap-2">' + [1, 2, 4].map(n =>
          '<button onclick="setShDecks(' + n + ')" class="p-2.5 rounded-xl border-2 text-xs font-extrabold transition ' +
          (state.shitheadDecks === n ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-sm' : 'bg-white/90 border-sky-200 text-slate-700') + '">' +
          n + ' deck' + (n > 1 ? 's' : '') + '<br><span class="font-normal text-[10px] opacity-75">' + (52 * n) + ' cards</span></button>'
        ).join('') + '</div>';
      },
      startConfig() { return { decks: state.shitheadDecks || 1 }; },
    });
