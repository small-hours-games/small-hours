// Card games on the phone: what every card game shares on top of table-cards.js.

    // Card sizes depend on the screen, so redraw the open card table on rotate/resize.
    let tcResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(tcResizeTimer);
      tcResizeTimer = setTimeout(() => {
        SH.game(state.gameType)?.redraw?.();
      }, 150);
    });

    // The card screen fills the rest of the viewport so the hand zone ends at the bottom.
    function tcFitScreen(sectionId) {
      const el = document.getElementById(sectionId);
      if (!el || !el.classList.contains('active')) return;
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0;
      document.documentElement.style.setProperty('--tc-screen-top', Math.round(el.getBoundingClientRect().top + window.scrollY + pad) + 'px');
    }

    // The hand zone is pinned to the bottom of the screen. On a short phone (or with many
    // opponents) it would slide over the piles, so tighten the layout one step at a time
    // until the table ends above it. Call after the screen has been drawn.
    const TC_SQUEEZE_LEVELS = 3;
    function tcSqueezeLevel(tableBottom, zoneHeight, viewportHeight) {
      return tableBottom + zoneHeight <= viewportHeight + 1;
    }
    function tcSqueeze(sectionId) {
      const el = document.getElementById(sectionId);
      if (!el || !el.classList.contains('active')) return 0;
      const table = el.querySelector('.tc-table:not([hidden])');
      const zone = el.querySelector('.tc-hand-zone');
      let level = 0;
      for (; level <= TC_SQUEEZE_LEVELS; level++) {
        for (let i = 1; i <= TC_SQUEEZE_LEVELS; i++) el.classList.toggle('tc-sq' + i, i <= level);
        if (!table || !zone) break;
        // The move log trims itself to the room that is left, so only its newest line counts.
        const log = table.querySelector('.tc-log-phone');
        const first = log && log.querySelector('.tc-log-item');
        const spare = log ? Math.max(0, log.offsetHeight - (first ? first.offsetHeight + 8 : 0)) : 0;
        const bottom = table.getBoundingClientRect().bottom + window.scrollY - spare;
        if (tcSqueezeLevel(bottom, zone.offsetHeight, window.innerHeight)) break;
      }
      return Math.min(level, TC_SQUEEZE_LEVELS);
    }

    // Cards that reach the hand fly in from the table and glow until a card leaves the hand.
    const tcArrivals = {};
    const TC_MAX_ARRIVAL_FLIGHTS = 4;

    /** Compare with the last update of this round; round null means no hand is in play. */
    function tcTrackArrivals(key, hand, round) {
      const t = tcArrivals[key] || (tcArrivals[key] = { ids: null, round: null, fresh: new Set(), flying: new Set() });
      const ids = hand.map(c => c.id);
      const sameRound = round != null && t.round === round && !!t.ids;
      const arrived = sameRound ? tcNewCardIds(t.ids, hand) : [];
      if (arrived.length) t.fresh = new Set(arrived);
      else if (!sameRound || t.ids.some(id => !ids.includes(id))) t.fresh.clear();
      t.ids = ids;
      t.round = round;
      arrived.slice(0, TC_MAX_ARRIVAL_FLIGHTS).forEach(id => t.flying.add(id));
      return { t, arrived };
    }

    function tcArrivalOpts(track, c, group) {
      const cards = group || [c];
      return {
        isNew: cards.some(g => track.t.fresh.has(g.id)),
        className: track.t.flying.has(c.id) ? 'tc-in-flight' : '',
      };
    }

    function tcLaunchArrivals(track, hand, fromEl, handEl, opts) {
      const wait = (opts && opts.delay) || 0;
      track.arrived.slice(0, TC_MAX_ARRIVAL_FLIGHTS).forEach((id, i) => {
        tcFlyToHand(hand.find(c => c.id === id), fromEl, handEl, {
          delay: wait + i * 90,
          onDone: () => {
            track.t.flying.delete(id);
            const el = tcHandCard(handEl, id);
            if (el) el.classList.remove('tc-in-flight');
          },
        });
      });
    }

    function tcLayout() {
      if (!state.tcLayout) {
        try { state.tcLayout = localStorage.getItem('sh_card_layout') || 'rack'; } catch { state.tcLayout = 'rack'; }
      }
      return state.tcLayout;
    }
    function tcSetLayout(layout) {
      state.tcLayout = layout;
      try { localStorage.setItem('sh_card_layout', layout); } catch { /* ignore */ }
    }
    function tcHandWidth(id) {
      const el = document.getElementById(id);
      const w = el && el.clientWidth ? el.clientWidth : window.innerWidth - 24;
      return Math.max(240, Math.min(w, 560) - 6);
    }
    // Hand cards grow with the phone: taller screens get bigger cards, and a row
    // always shows at least ~4 cards side by side.
    function tcHandCardW(id) {
      const byHeight = Math.round(window.innerHeight * 0.1);
      const byWidth = Math.floor(tcHandWidth(id) / 4.2);
      return Math.max(62, Math.min(92, byHeight, byWidth));
    }
    function tcName(id, msg) {
      const names = (msg && msg.playerNames) || state.playerNames || {};
      return names[id] || 'Player';
    }
    function tcAvatar(id) {
      if (String(id).startsWith('bot_')) return ((SH.aiPersona(id) || {}).avatar || '\u{1F916}') + ' ';
      const p = (state.players || []).find(x => x.playerId === id);
      return p && p.avatar ? p.avatar + ' ' : '';
    }
    function tcSetStatus(prefix, text, myTurn) {
      document.getElementById(prefix + 'StatusText').textContent = text;
      document.getElementById(prefix + 'Status').classList.toggle('tc-my-turn', !!myTurn);
      document.getElementById(prefix + 'StatusDot').classList.toggle('tc-dot-live', !!myTurn);
    }
    function tcBuzz(key, isTurn) {
      if (isTurn && !state[key] && navigator.vibrate) navigator.vibrate([50, 30, 50]);
      state[key] = !!isTurn;
    }
    // Four-colour suits on the phone: an option, remembered per phone.
    function tcFourColourPref() {
      try { return localStorage.getItem('sh_four_colour') === '1'; } catch { return false; }
    }
    tcSetFourColour(tcFourColourPref());
    function tcToggleFourColour() {
      tcSetFourColour(!tcFourColourOn);
      try { localStorage.setItem('sh_four_colour', tcFourColourOn ? '1' : '0'); } catch { /* ignore */ }
      SH.game(state.gameType)?.redraw?.();
    }
    function tcSyncColoursBtn(id) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.toggle('tc-active', tcFourColourOn);
      btn.setAttribute('aria-pressed', tcFourColourOn ? 'true' : 'false');
    }
    /** The big thumb button: a verb plus the card it plays ("Play [6♥]", "Play 3 × [6♣]"). */
    function tcSetCta(id, cta) {
      const btn = document.getElementById(id);
      if (cta.verb && cta.card) {
        btn.innerHTML = '<span class="tc-cta-label">' + escapeHtml(cta.verb + (cta.count > 1 ? ' ' + tcNum(cta.count) + ' ×' : '')) + '</span>' + renderCardChip(cta.card);
        btn.setAttribute('aria-label', cta.label);
      } else {
        btn.textContent = cta.label;
        btn.removeAttribute('aria-label');
      }
      btn.disabled = !!cta.disabled;
      btn.dataset.action = cta.action || '';
      btn.classList.toggle('tc-cta-gin', cta.action === 'knock-gin');
    }
