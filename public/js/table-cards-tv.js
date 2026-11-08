// Card games on the TV: what every card game shares on top of table-cards.js.

    // Scale the card table so all of it fits the screen: smaller on a 720p TV,
    // bigger on 1080p. CSS zoom changes layout size (unlike transform), so the
    // page never scrolls under it.
    function tcFitTv() {
      const content = document.getElementById('gameContent');
      const table = content && content.querySelector('.tc-tv');
      if (!table) return;
      const availW = content.clientWidth;
      const availH = window.innerHeight - content.getBoundingClientRect().top - 12;
      if (availW < 200 || availH < 200) return;
      // Measure the natural size once, unzoomed. The seat row is centered, so when
      // it is too wide it spills past both edges: measure its children, not scrollWidth.
      table.classList.add('tc-tv-fit');
      table.style.zoom = 1;
      table.style.width = availW + 'px';
      table.style.minHeight = '0px';
      const pad = parseFloat(getComputedStyle(table).paddingLeft) * 2 || 0;
      let left = Infinity;
      let right = -Infinity;
      for (const part of table.children) {
        for (const el of part.classList.contains('tc-tv-row') ? part.children : [part]) {
          const r = el.getBoundingClientRect();
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
        }
      }
      const natW = Math.max(right - left + pad, 320);
      const natH = table.scrollHeight;
      const zoom = Math.max(0.5, Math.min(1.6, availW / natW, availH / natH));
      table.style.zoom = zoom.toFixed(3);
      table.style.width = (availW / zoom) + 'px';
      table.style.minHeight = Math.floor(availH / zoom) + 'px';
    }
    window.addEventListener('resize', tcFitTv);

    // ===== Card table on the TV (kit in /js/table-cards.js) =====
    // Four-colour suits are the default on the TV: read from across the room.
    if (typeof tcSetFourColour === 'function') tcSetFourColour(true);
    // Only shared fields are used here; per-player data never reaches host sockets.
    function tvFanHtml(count, size, max) {
      count = tcNum(count);
      const shown = Math.min(max || 10, count || 0);
      let html = '<div class="tc-fan" aria-label="' + (count || 0) + ' cards in hand">';
      for (let i = 0; i < shown; i++) html += renderTableCard(null, { size: size || 'sm', facedown: true, dataId: '' });
      if (count > shown) html += '<span class="tc-fan-more">+' + (count - shown) + '</span>';
      return html + '</div>';
    }

    function tvSeatHtml(pid, names, opts) {
      const cls = 'tc-seat' + (opts.turn ? ' tc-seat-turn' : '') + (opts.out ? ' tc-seat-out' : '');
      return '<div class="' + cls + '" data-player-id="' + escapeHtml(pid) + '"' + (opts.turn ? ' aria-current="true"' : '') + '>' +
        '<div class="tc-seat-head"><div class="tc-seat-name">' + playerAvatarHtml(pid) + '<span>' + escapeHtml(names[pid] || 'Player') + '</span></div>' +
        (opts.tag ? '<span class="tc-seat-tag ' + (opts.tagClass || '') + '">' + escapeHtml(opts.tag) + '</span>' : '') + '</div>' +
        (opts.stats ? '<div class="tc-seat-stats">' + opts.stats + '</div>' : '') +
        (opts.cards ? '<div class="tc-seat-cards">' + opts.cards + '</div>' : '') +
      '</div>';
    }

    function tvRevealHtml(title, melds, deadwood, layoffs) {
      let html = '<div class="tc-reveal"><div class="tc-reveal-head"><span>' + escapeHtml(title) + '</span>' +
        '<span>Deadwood ' + (deadwood || []).reduce((s, c) => s + Math.min(10, tcNum(c.rank)), 0) + '</span></div><div class="tc-meld-groups">';
      (melds || []).forEach(m => {
        html += '<div class="tc-meld-group">' + (m.cards || []).map(c => renderTableCard(c, { size: 'md', meld: m.type === 'set' ? 'set' : 'run', dataId: '' })).join('') + '</div>';
      });
      if ((layoffs || []).length) {
        html += '<div class="tc-meld-group">' + layoffs.map(c => renderTableCard(c, { size: 'md', badge: 'laid off', dataId: '' })).join('') + '</div>';
      }
      if ((deadwood || []).length) {
        html += '<div class="tc-meld-group tc-deadwood-group">' + deadwood.map(c => renderTableCard(c, { size: 'md', dataId: '' })).join('') + '</div>';
      }
      return html + '</div></div>';
    }
