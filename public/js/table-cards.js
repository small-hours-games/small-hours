// public/js/table-cards.js
// Card-table kit for the card games (Gin Rummy, Palace) on phone and TV:
// vector playing cards, card stacks, hand racks/fans, hand ordering and the
// tap / swipe-up / drag gesture handling. Plain browser script exposing globals,
// loaded after cards.js. Engine cards are { id, suit: 'h'|'d'|'c'|'s', rank }.

var TC_SUITS = {
  h: { symbol: '♥', red: true, order: 1, name: 'hearts' },
  d: { symbol: '♦', red: true, order: 3, name: 'diamonds' },
  c: { symbol: '♣', red: false, order: 2, name: 'clubs' },
  s: { symbol: '♠', red: false, order: 0, name: 'spades' },
};
var TC_RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
var TC_COURT_NAMES = { 1: 'ACE', 11: 'JACK', 12: 'QUEEN', 13: 'KING', 14: 'ACE' };

// Suit glyph paths (32x32), drawn to stay crisp at any card size.
var TC_SUIT_PATHS = {
  s: 'M16 3C10 11 4 15.2 4 20.5A6.2 6.2 0 0010.2 26.7c2.1 0 3.9-1 4.8-2.4-.2 2.4-1.2 4.3-3 5.7h8c-1.8-1.4-2.8-3.3-3-5.7.9 1.4 2.7 2.4 4.8 2.4A6.2 6.2 0 0028 20.5C28 15.2 22 11 16 3z',
  h: 'M16 28.5C16 28.5 4 20.2 4 11.5A6.8 6.8 0 0116 7.2a6.8 6.8 0 0112 4.3c0 8.7-12 17-12 17z',
  d: 'M16 2.5L27.5 16 16 29.5 4.5 16 16 2.5z',
  c: 'M16 4.5a5.5 5.5 0 00-4.4 8.8A5.8 5.8 0 009.5 24c2.1 0 4-1.1 5-2.7-.2 2.9-1.2 5.4-3.1 7.2h9.2c-1.9-1.8-2.9-4.3-3.1-7.2 1 1.6 2.9 2.7 5 2.7a5.8 5.8 0 00-2.1-10.7A5.5 5.5 0 0016 4.5z',
};

function tcEscape(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tcRankLabel(rank) {
  return TC_RANK_LABELS[rank] || String(rank == null ? '' : rank);
}

function tcCardShort(card) {
  if (!card) return '';
  var suit = TC_SUITS[card.suit];
  return tcRankLabel(card.rank) + (suit ? suit.symbol : '');
}

function tcSuitSvg(suit, cls) {
  var path = TC_SUIT_PATHS[suit];
  if (!path) return '';
  return '<svg class="' + (cls || '') + '" viewBox="0 0 32 32" aria-hidden="true"><path d="' + path + '"/></svg>';
}

/**
 * HTML for one playing card.
 * opts: size ('sm'|'md'|'hand'|'lg'|'xl'), facedown, selected, meld ('set'|'run'),
 *       badge (text), isNew, dim, playable, className, style, dataId (defaults to card.id)
 */
function renderTableCard(card, opts) {
  opts = opts || {};
  var size = opts.size || 'md';
  var classes = ['tc-card', 'tc-' + size];
  if (opts.selected) classes.push('tc-selected');
  if (opts.meld === 'set') classes.push('tc-meld-set');
  if (opts.meld === 'run') classes.push('tc-meld-run');
  if (opts.dim) classes.push('tc-dim');
  if (opts.playable) classes.push('tc-playable');
  if (opts.isNew) classes.push('tc-new');
  if (opts.className) classes.push(opts.className);
  var id = opts.dataId != null ? opts.dataId : (card && card.id);
  var attrs = (id != null && id !== '' ? ' data-card-id="' + tcEscape(id) + '"' : '') +
    (opts.style ? ' style="' + tcEscape(opts.style) + '"' : '');

  if (opts.facedown || !card || !TC_SUITS[card.suit]) {
    classes.push('tc-back');
    return '<div class="' + classes.join(' ') + '"' + attrs + ' aria-label="Face-down card">' +
      '<div class="tc-back-inner"><div class="tc-back-gem"><i></i></div></div></div>';
  }

  var suit = TC_SUITS[card.suit];
  if (suit.red) classes.push('tc-red');
  var label = tcRankLabel(card.rank);
  var court = TC_COURT_NAMES[card.rank];
  var index = '<span class="tc-rank">' + tcEscape(label) + '</span>' + tcSuitSvg(card.suit, 'tc-idx-suit');
  var center = court
    ? '<div class="tc-court"><span class="tc-court-name">' + court + '</span>' + tcSuitSvg(card.suit, 'tc-court-suit') + '</div>'
    : tcSuitSvg(card.suit, 'tc-pip');
  var badge = '';
  if (opts.isNew) badge = '<span class="tc-badge tc-badge-new">NEW</span>';
  else if (opts.badge) badge = '<span class="tc-badge">' + tcEscape(opts.badge) + '</span>';
  else if (opts.meld === 'set') badge = '<span class="tc-badge tc-badge-set">SET</span>';
  else if (opts.meld === 'run') badge = '<span class="tc-badge tc-badge-run">RUN</span>';

  return '<div class="' + classes.join(' ') + '"' + attrs + ' aria-label="' + tcEscape(label + ' of ' + suit.name) + '">' +
    '<div class="tc-face">' +
      '<div class="tc-idx tc-idx-tl">' + index + '</div>' +
      badge +
      '<div class="tc-center">' + center + '</div>' +
      '<div class="tc-idx tc-idx-br">' + index + '</div>' +
    '</div></div>';
}

/**
 * A pile of cards drawn as a small 3D stack: up to 3 offset layers plus the top card.
 * cards: face-up preview (last = top) or null; count: total cards in the pile.
 * opts: size, facedown, emptyLabel, highlight
 */
function renderTableStack(cards, count, opts) {
  opts = opts || {};
  var size = opts.size || 'lg';
  var preview = Array.isArray(cards) ? cards.filter(Boolean) : (cards ? [cards] : []);
  var total = count != null ? count : preview.length;
  var cls = 'tc-stack tc-stack-' + size + (opts.highlight ? ' tc-stack-hot' : '');
  if (!total) {
    return '<div class="' + cls + '"><div class="tc-card tc-' + size + ' tc-empty"><span>' +
      tcEscape(opts.emptyLabel || 'Empty') + '</span></div></div>';
  }
  var layers = Math.min(3, total - 1);
  var html = '<div class="' + cls + '">';
  for (var i = layers; i >= 1; i--) {
    var under = !opts.facedown && preview.length > i ? preview[preview.length - 1 - i] : null;
    html += renderTableCard(under, {
      size: size, facedown: opts.facedown || !under, dataId: '',
      className: 'tc-layer', style: '--tc-layer:' + i,
    });
  }
  var top = preview.length ? preview[preview.length - 1] : null;
  html += renderTableCard(top, { size: size, facedown: opts.facedown || !top, dataId: '', className: 'tc-top' });
  return html + '</div>';
}

/**
 * Order a hand for display. Keeps the player's own arrangement across server
 * updates: in 'custom' mode cards keep their saved position, new cards go last,
 * cards that left the hand are dropped.
 * mode: 'rank' | 'suit' | 'melds' | 'custom'; order: saved ids; melds: [{ cards }]
 */
function orderHand(hand, mode, order, melds) {
  var cards = (hand || []).slice();
  var bySuitThenRank = function (a, b) {
    return (TC_SUITS[a.suit].order - TC_SUITS[b.suit].order) || (a.rank - b.rank);
  };
  var byRankThenSuit = function (a, b) {
    return (a.rank - b.rank) || (TC_SUITS[a.suit].order - TC_SUITS[b.suit].order);
  };
  if (mode === 'custom' && order && order.length) {
    var pos = {};
    order.forEach(function (id, i) { pos[id] = i; });
    var known = cards.filter(function (c) { return pos[c.id] != null; })
      .sort(function (a, b) { return pos[a.id] - pos[b.id]; });
    var fresh = cards.filter(function (c) { return pos[c.id] == null; });
    return known.concat(fresh);
  }
  if (mode === 'suit') return cards.sort(bySuitThenRank);
  if (mode === 'melds' && melds && melds.length) {
    var seen = {};
    var out = [];
    melds.forEach(function (m) {
      (m.cards || []).slice().sort(m.type === 'run' ? bySuitThenRank : byRankThenSuit).forEach(function (mc) {
        var c = cards.find(function (x) { return x.id === mc.id; });
        if (c && !seen[c.id]) { seen[c.id] = true; out.push(c); }
      });
    });
    return out.concat(cards.filter(function (c) { return !seen[c.id]; }).sort(byRankThenSuit));
  }
  return cards.sort(byRankThenSuit);
}

/** Map of cardId -> 'set' | 'run' from a meld list ([{ type, cards }]). */
function tcMeldMap(melds) {
  var map = {};
  (melds || []).forEach(function (m) {
    (m.cards || []).forEach(function (c) { map[c.id] = m.type === 'run' ? 'run' : 'set'; });
  });
  return map;
}

/**
 * Lay out a hand as a 2-row rack (rows of up to ~7) or a single curved fan.
 * Each card sits in a .tc-slot positioned by inline styles so the card itself
 * stays free to lift when selected.
 * opts: layout ('rack'|'fan'), width (px available), size, cardOpts(card) -> renderTableCard opts
 */
function renderHandRack(cards, opts) {
  opts = opts || {};
  var size = opts.size || 'hand';
  var cardW = { sm: 44, md: 68, hand: 74, lg: 88, xl: 120 }[size] || 74;
  var width = Math.max(cardW, opts.width || 340);
  var n = cards.length;
  if (!n) return '<div class="tc-rack tc-rack-empty">' + tcEscape(opts.emptyText || 'No cards') + '</div>';
  var rowsCount = opts.layout === 'fan' ? 1 : (n <= 6 ? 1 : (n <= 20 ? 2 : 3));
  var perRow = Math.ceil(n / rowsCount);
  var html = '<div class="tc-rack tc-rack-' + (opts.layout === 'fan' ? 'fan' : 'rows') + '">';
  for (var r = 0; r < rowsCount; r++) {
    var row = cards.slice(r * perRow, (r + 1) * perRow);
    if (!row.length) continue;
    var count = row.length;
    var step = count > 1 ? Math.min(cardW * 0.78, (width - cardW) / (count - 1)) : 0;
    var spread = step * (count - 1) + cardW;
    html += '<div class="tc-rack-row" style="width:' + Math.round(spread) + 'px">';
    row.forEach(function (card, i) {
      var norm = count > 1 ? i / (count - 1) - 0.5 : 0;
      var rot = opts.layout === 'fan' ? norm * Math.min(18, count * 2) : norm * 4;
      var drop = opts.layout === 'fan' ? Math.pow(norm * 2, 2) * 14 : Math.pow(norm * 2, 2) * 3;
      var slotStyle = 'left:' + Math.round(i * step) + 'px;transform:translateY(' + drop.toFixed(1) +
        'px) rotate(' + rot.toFixed(2) + 'deg);z-index:' + (10 + i);
      var cardOpts = Object.assign({ size: size }, opts.cardOpts ? opts.cardOpts(card) : {});
      html += '<div class="tc-slot" style="' + slotStyle + '">' + renderTableCard(card, cardOpts) + '</div>';
    });
    html += '</div>';
  }
  return html + '</div>';
}

/**
 * Classify a finished pointer interaction on a hand card.
 * Returns 'tap' (barely moved), 'swipe-up' (flicked or dragged clearly upward)
 * or 'drag' (anything else, used for reordering).
 */
function classifyHandGesture(g) {
  var dx = g.dx || 0;
  var dy = g.dy || 0;
  if (Math.hypot(dx, dy) <= 8) return 'tap';
  if (dy < -55 && Math.abs(dy) > Math.abs(dx)) return 'swipe-up';
  return 'drag';
}

/**
 * Pointer handling for a hand container that holds [data-card-id] cards.
 * handlers: onTap(id), onPlay(id) on swipe-up, onReorder(id, targetId) on drag-drop.
 * The dragged card follows the finger, lifted above the thumb on touch screens.
 * Safe to call on every render: listeners are attached to the container once.
 */
function attachHandGestures(container, handlers) {
  if (!container) return;
  container._tcHandlers = handlers;
  if (container._tcBound) return;
  container._tcBound = true;
  var drag = null;

  container.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    var el = e.target.closest('[data-card-id]');
    if (!el || !container.contains(el) || !el.dataset.cardId) return;
    drag = { el: el, id: el.dataset.cardId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', moved: false, pointerId: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });

  container.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      drag.el.classList.add('tc-dragging');
    }
    if (drag.moved) {
      var lift = drag.touch ? -28 : 0;
      drag.el.style.transform = 'translate(' + dx + 'px,' + (dy + lift) + 'px) scale(1.1) rotate(' + Math.max(-12, Math.min(12, dx * 0.05)) + 'deg)';
    }
  });

  function finish(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;
    d.el.classList.remove('tc-dragging');
    d.el.style.transform = '';
    if (cancelled) return;
    var h = container._tcHandlers || {};
    var kind = classifyHandGesture({ dx: e.clientX - d.x, dy: e.clientY - d.y });
    if (kind === 'tap') { if (h.onTap) h.onTap(d.id); return; }
    if (kind === 'swipe-up') { if (h.onPlay) h.onPlay(d.id); return; }
    if (!h.onReorder) return;
    // Drop target: the card whose centre is nearest to where the finger let go.
    var best = null;
    var bestDist = Infinity;
    container.querySelectorAll('[data-card-id]').forEach(function (other) {
      if (other === d.el || !other.dataset.cardId) return;
      var r = other.getBoundingClientRect();
      var dist = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
      if (dist < bestDist) { bestDist = dist; best = other.dataset.cardId; }
    });
    if (best) h.onReorder(d.id, best);
  }
  container.addEventListener('pointerup', function (e) { finish(e, false); });
  container.addEventListener('pointercancel', function (e) { finish(e, true); });
}

/** Move id to targetId's position in an ordered id list (drag-to-reorder). */
function tcMoveId(ids, id, targetId) {
  var list = ids.slice();
  var from = list.indexOf(id);
  var to = list.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return list;
  list.splice(from, 1);
  list.splice(to, 0, id);
  return list;
}

/** Short shake on a card that cannot be played. */
function tcShake(container, id) {
  if (!container) return;
  var el = container.querySelector('[data-card-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (!el) return;
  el.classList.remove('tc-shake');
  void el.offsetWidth;
  el.classList.add('tc-shake');
}
