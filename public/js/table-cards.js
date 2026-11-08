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

// Four-colour suits (clubs blue, diamonds orange): on by default on the TV, an
// option on the phone. Pages call tcSetFourColour(); cards rendered after that
// use it (the art for A to 10 comes from /cards/faces-4c).
var tcFourColourOn = false;
function tcSetFourColour(on) {
  tcFourColourOn = !!on;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle('tc-four-colour', tcFourColourOn);
  }
}

function tcEscape(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A finite number from any value (0 otherwise), for numbers written into HTML. */
function tcNum(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
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
      '<div class="tc-back-inner"><div class="tc-back-logo"></div></div></div>';
  }

  var suit = TC_SUITS[card.suit];
  if (suit.red) classes.push('tc-red');
  classes.push('tc-suit-' + card.suit);
  var label = tcRankLabel(card.rank);
  // The face is the classic deck in /cards/faces (pip layouts, drawn court figures);
  // a bold corner index sits on top so the rank reads at any size, even fanned.
  var index = '<span class="tc-rank">' + tcEscape(label) + '</span>' + tcSuitSvg(card.suit, 'tc-idx-suit');
  var ten = label === '10' ? ' tc-cidx-ten' : '';
  // On the 9 and 10 the deck's top-left pip reaches just below the index; a taller patch hides it.
  if (label === '9' || label === '10') ten += ' tc-cidx-tall';
  var badge = '';
  if (opts.isNew) badge = '<span class="tc-badge tc-badge-new">NEW</span>';
  else if (opts.badge) badge = '<span class="tc-badge">' + tcEscape(opts.badge) + '</span>';
  else if (opts.meld === 'set') badge = '<span class="tc-badge tc-badge-set">SET</span>';
  else if (opts.meld === 'run') badge = '<span class="tc-badge tc-badge-run">RUN</span>';
  // A stack of same-rank cards in the hand: the count sits on the corner, outside the face.
  var stackCount = opts.count > 1 ? '<span class="tc-stack-count">×' + tcNum(opts.count) + '</span>' : '';

  return '<div class="' + classes.join(' ') + '"' + attrs + ' aria-label="' + tcEscape(label + ' of ' + suit.name) + '">' +
    '<div class="tc-face">' +
      '<div class="tc-art" style="background-image:url(' + tcFaceUrl(card) + ')"></div>' +
      '<div class="tc-cidx tc-cidx-tl' + ten + '">' + index + '</div>' +
      badge +
      '<div class="tc-cidx tc-cidx-br' + ten + '">' + index + '</div>' +
    '</div>' + stackCount + '</div>';
}

var TC_FACE_SUITS = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };
var TC_FACE_COURTS = { 11: '11-JACK', 12: '12-QUEEN', 13: '13-KING' };

/** Path of a card's face art in the classic deck (Chris Aguilar's Vector Playing Cards, LGPL-3.0). */
function tcFaceUrl(card) {
  // Built only from a known suit and a whole number, so nothing from the message reaches the URL.
  var rank = Math.round(tcNum(card.rank));
  if (rank === 14) rank = 1;
  var four = tcFourColourOn && (card.suit === 'c' || card.suit === 'd') && rank <= 10;
  return '/cards/' + (four ? 'faces-4c/' : 'faces/') + TC_FACE_SUITS[card.suit] + '-' + (TC_FACE_COURTS[rank] || rank) + '.svg';
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
 * Group an ordered hand into stacks of the same rank, in order of first appearance.
 * Returns [{ card, cards }] where card is the one shown on top.
 */
function tcStackHand(cards) {
  var groups = [];
  var byRank = {};
  (cards || []).forEach(function (c) {
    var g = byRank[c.rank];
    if (!g) { g = byRank[c.rank] = { card: c, cards: [] }; groups.push(g); }
    g.cards.push(c);
  });
  return groups;
}

/**
 * Lay out a hand as a 2-row rack (rows of up to ~7) or a single curved fan.
 * Each card sits in a .tc-slot positioned by inline styles so the card itself
 * stays free to lift when selected.
 * opts: layout ('rack'|'fan'), width (px available), size, cardW (px, overrides the
 * size's width so phones can fit cards to the screen), cardOpts(card) -> renderTableCard opts,
 * stack (true: same ranks share one slot with a ×N count; cardOpts gets the group as 2nd arg)
 */
function renderHandRack(cards, opts) {
  opts = opts || {};
  var size = opts.size || 'hand';
  var cardW = opts.cardW || { sm: 44, md: 68, hand: 74, lg: 88, xl: 120 }[size] || 74;
  var cardH = cardW * 1.42;
  var sized = opts.cardW ? '--tc-w:' + Math.round(cardW) + 'px' : '';
  var width = Math.max(cardW, opts.width || 340);
  var slots = opts.stack ? tcStackHand(cards) : (cards || []).map(function (c) { return { card: c, cards: [c] }; });
  var n = slots.length;
  if (!n) return '<div class="tc-rack tc-rack-empty">' + tcEscape(opts.emptyText || 'No cards') + '</div>';
  var rowsCount = opts.layout === 'fan' ? 1 : (n <= 6 ? 1 : (n <= 20 ? 2 : 3));
  var perRow = Math.ceil(n / rowsCount);
  var html = '<div class="tc-rack tc-rack-' + (opts.layout === 'fan' ? 'fan' : 'rows') + (opts.stack ? ' tc-rack-stacked' : '') + '">';
  for (var r = 0; r < rowsCount; r++) {
    var row = slots.slice(r * perRow, (r + 1) * perRow);
    if (!row.length) continue;
    var count = row.length;
    var step = count > 1 ? Math.min(cardW * 0.78, (width - cardW) / (count - 1)) : 0;
    var spread = step * (count - 1) + cardW;
    var rowStyle = 'width:' + Math.round(spread) + 'px';
    if (opts.cardW) {
      rowStyle += ';height:' + Math.round(cardH + (opts.layout === 'fan' ? 16 : 0)) + 'px';
      if (r > 0 && opts.layout !== 'fan') rowStyle += ';margin-top:' + Math.round(-cardH * 0.56) + 'px';
    }
    html += '<div class="tc-rack-row" style="' + rowStyle + '">';
    row.forEach(function (slot, i) {
      var card = slot.card;
      var norm = count > 1 ? i / (count - 1) - 0.5 : 0;
      var rot = opts.layout === 'fan' ? norm * Math.min(18, count * 2) : norm * 4;
      var drop = opts.layout === 'fan' ? Math.pow(norm * 2, 2) * 14 : Math.pow(norm * 2, 2) * 3;
      var slotStyle = 'left:' + Math.round(i * step) + 'px;transform:translateY(' + drop.toFixed(1) +
        'px) rotate(' + rot.toFixed(2) + 'deg);z-index:' + (10 + i);
      var cardOpts = Object.assign({ size: size }, sized ? { style: sized } : {}, opts.cardOpts ? opts.cardOpts(card, slot.cards) : {});
      var under = '';
      if (slot.cards.length > 1) {
        cardOpts.count = slot.cards.length;
        // Up to two cards peek out behind the top one, up and to the left.
        var behind = slot.cards.slice(1, 3);
        for (var k = behind.length; k >= 1; k--) {
          under += renderTableCard(behind[k - 1], {
            size: size, dataId: '', className: 'tc-stack-under',
            style: (sized ? sized + ';' : '') + '--tc-under:' + k,
          });
        }
      }
      html += '<div class="tc-slot" style="' + slotStyle + '">' + under + renderTableCard(card, cardOpts) + '</div>';
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
  var vx = g.vx || 0;
  var vy = g.vy || 0;
  if (Math.hypot(dx, dy) <= 8) return 'tap';
  if (dy < -55 && Math.abs(dy) > Math.abs(dx)) return 'swipe-up';
  // A quick throw counts even when short: upward release speed of at least
  // 0.6 px/ms, within ~38 degrees of vertical.
  if (dy < -24 && vy <= -0.6 && Math.abs(vx) < 0.8 * Math.abs(vy)) return 'swipe-up';
  // A slow, deliberate drag counts once it is let go high up the screen.
  if (g.releaseRatio != null && g.releaseRatio < 0.3 && dy < -40) return 'swipe-up';
  return 'drag';
}

/**
 * Release velocity (px/ms) from pointer samples [{x, y, t}]: a least-squares
 * slope over the last ~90 ms, and zero when the finger rested before letting go.
 */
function tcReleaseVelocity(samples, now) {
  if (!samples || samples.length < 2) return { vx: 0, vy: 0 };
  var end = now != null ? now : samples[samples.length - 1].t;
  if (end - samples[samples.length - 1].t > 50) return { vx: 0, vy: 0 };
  var recent = samples.filter(function (s) { return end - s.t <= 90; });
  if (recent.length < 2) recent = samples.slice(-2);
  var n = recent.length;
  var mt = 0, mx = 0, my = 0;
  recent.forEach(function (s) { mt += s.t; mx += s.x; my += s.y; });
  mt /= n; mx /= n; my /= n;
  var stt = 0, stx = 0, sty = 0;
  recent.forEach(function (s) {
    var dt = s.t - mt;
    stt += dt * dt; stx += dt * (s.x - mx); sty += dt * (s.y - my);
  });
  if (!stt) return { vx: 0, vy: 0 };
  return { vx: stx / stt, vy: sty / stt };
}

/**
 * Which hand card is under a point, from rects measured before anything lifted.
 * Later entries are drawn on top (DOM order), so the last hit wins. A finger
 * that slides a little above or below the row still counts as on it.
 */
function tcCardAt(snapshot, x, y) {
  var hit = null;
  for (var i = 0; i < snapshot.length; i++) {
    var r = snapshot[i].rect;
    if (x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 48) hit = snapshot[i];
  }
  return hit;
}

/**
 * Pointer handling for a hand container that holds [data-card-id] cards.
 * handlers: onTap(id), onPlay(id) on swipe-up, onReorder(id, targetId) on drag-drop,
 *   peek (true: on touch screens a finger down lifts and enlarges the card above the
 *   thumb, sliding sideways moves it to the next card, and letting go picks it as a tap;
 *   pushing up from there throws the lifted card).
 * The dragged card follows the finger, lifted above the thumb on touch screens.
 * Safe to call on every render: listeners are attached to the container once.
 */
function attachHandGestures(container, handlers) {
  if (!container) return;
  container._tcHandlers = handlers;
  if (container._tcBound) return;
  container._tcBound = true;
  var drag = null;

  function setPeek(d, item) {
    if (d.peek === item) return;
    if (d.peek) {
      d.peek.el.classList.remove('tc-peek');
      if (d.peek.el.parentElement) d.peek.el.parentElement.style.zIndex = d.peek.z;
    }
    d.peek = item;
    if (!item) return;
    var slot = item.el.parentElement;
    item.z = slot ? slot.style.zIndex : '';
    if (slot) slot.style.zIndex = 400;
    item.el.classList.add('tc-peek');
    d.el = item.el;
    d.id = item.id;
    if (navigator.vibrate && d.moved) navigator.vibrate(8);
  }

  container.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    var el = e.target.closest('[data-card-id]');
    if (!el || !container.contains(el) || !el.dataset.cardId) return;
    var h = container._tcHandlers || {};
    drag = { el: el, id: el.dataset.cardId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', moved: false, pointerId: e.pointerId,
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp || Date.now() }], mode: null, peek: null };
    if (drag.touch && h.peek) {
      drag.snapshot = Array.prototype.map.call(container.querySelectorAll('[data-card-id]'), function (c) {
        return { el: c, id: c.dataset.cardId, rect: c.getBoundingClientRect() };
      }).filter(function (c) { return c.id; });
      setPeek(drag, drag.snapshot.find(function (c) { return c.el === el; }) || null);
    }
    try { container.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });

  container.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp || Date.now() });
    if (drag.samples.length > 24) drag.samples.shift();
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
    if (!drag.moved) return;
    if (drag.snapshot && drag.mode !== 'throw') {
      // Peeking: a clear push upward throws the lifted card, anything else scrubs along the hand.
      if (dy < -28 && Math.abs(dy) > Math.abs(e.clientX - (drag.scrubX != null ? drag.scrubX : drag.x)) * 1.2) {
        drag.mode = 'throw';
        drag.throwX = e.clientX;
        drag.peek && drag.peek.el.classList.remove('tc-peek');
        drag.el.classList.add('tc-dragging');
      } else {
        drag.mode = 'scrub';
        drag.scrubX = e.clientX;
        var hit = tcCardAt(drag.snapshot, e.clientX, e.clientY);
        if (hit) setPeek(drag, hit);
        return;
      }
    }
    if (!drag.mode) {
      drag.mode = 'throw';
      drag.el.classList.add('tc-dragging');
    }
    var tx = e.clientX - (drag.throwX != null ? drag.throwX : drag.x);
    var lift = drag.touch ? -28 : 0;
    drag.el.style.transform = 'translate(' + tx + 'px,' + (dy + lift) + 'px) scale(1.1) rotate(' + Math.max(-12, Math.min(12, tx * 0.05)) + 'deg)';
  });

  function finish(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;
    d.rect = d.el.getBoundingClientRect(); // where the card was let go, for the throw animation
    d.el.classList.remove('tc-dragging');
    d.el.style.transform = '';
    setPeek(d, null);
    if (cancelled) return;
    var h = container._tcHandlers || {};
    if (d.snapshot && d.mode !== 'throw') {
      // Letting go after a peek picks the lifted card, like a tap on it.
      if (h.onTap) h.onTap(d.id);
      return;
    }
    var v = tcReleaseVelocity(d.samples, e.timeStamp || Date.now());
    var vh = window.innerHeight || 800;
    var startX = d.throwX != null ? d.throwX : d.x;
    var kind = classifyHandGesture({ dx: e.clientX - startX, dy: e.clientY - d.y, vx: v.vx, vy: v.vy, releaseRatio: e.clientY / vh });
    if (kind === 'tap') { if (h.onTap) h.onTap(d.id); return; }
    if (kind === 'swipe-up') {
      // Velocity in viewport heights per second, so every screen size sends the same scale.
      if (h.onPlay) h.onPlay(d.id, { vx: v.vx * 1000 / vh, vy: v.vy * 1000 / vh, el: d.el, rect: d.rect });
      return;
    }
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

/* ---------- Palace table: messy pile, move log, card flights ----------
   The state snapshot is the truth; the move event (msg.lastEvent, numbered by seq)
   only says how to animate from one snapshot to the next. */

/** FNV-1a hash of a string to a 32-bit seed. */
function tcHash(str) {
  var h = 0x811c9dc5;
  str = String(str == null ? '' : str);
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function tcRandom(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A card's resting tilt on the pile, the same on every screen (from its per-deal opaque id). */
function tcPileTilt(id) {
  var r = tcRandom(tcHash(id));
  return { rot: (r() * 2 - 1) * 14, dx: (r() * 2 - 1) * 7, dy: (r() * 2 - 1) * 5 };
}

/**
 * The play pile as a loose heap: the last few cards each at their own tilt, the top
 * one straighter so it stays readable. opts: size, emptyLabel, highlight
 */
function renderMessyPile(cards, count, opts) {
  opts = opts || {};
  var size = opts.size || 'md';
  var preview = (cards || []).filter(Boolean).slice(-4);
  var total = count != null ? tcNum(count) : preview.length;
  var cls = 'tc-pile' + (opts.highlight ? ' tc-pile-hot' : '');
  if (!total || !preview.length) {
    return '<div class="' + cls + '"><div class="tc-card tc-' + size + ' tc-empty"><span>' +
      tcEscape(opts.emptyLabel || 'Empty') + '</span></div></div>';
  }
  var html = '<div class="' + cls + '">';
  preview.forEach(function (card, i) {
    var top = i === preview.length - 1;
    var t = tcPileTilt(card.id);
    var rot = top ? t.rot * 0.4 : t.rot;
    html += renderTableCard(card, {
      size: size, dataId: '',
      className: 'tc-pile-card' + (top ? ' tc-pile-top' : ''),
      style: 'transform:translate(' + t.dx.toFixed(1) + 'px,' + t.dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)',
    });
  });
  return html + '</div>';
}

/** Add a move event to a short log (oldest first). A new game (seq restarts) starts a new log. */
function tcLogPush(log, ev, max) {
  log = log || [];
  if (!ev || ev.seq == null) return log;
  var last = log.length ? log[log.length - 1] : null;
  if (last && ev.seq === last.seq) return log;
  if (last && ev.seq < last.seq) return [ev];
  return log.concat([ev]).slice(-(max || 6));
}

/** A small, always-readable card tile (rank + suit) for logs and opponent rows. */
function renderCardChip(card) {
  if (!card || !TC_SUITS[card.suit]) return '<span class="tc-chip tc-chip-back" aria-label="Face-down card"></span>';
  var suit = TC_SUITS[card.suit];
  return '<span class="tc-chip tc-chip-' + card.suit + (suit.red ? ' tc-chip-red' : '') + '" aria-label="' + tcEscape(tcRankLabel(card.rank) + ' of ' + suit.name) + '">' +
    tcEscape(tcRankLabel(card.rank)) + tcSuitSvg(card.suit, 'tc-chip-suit') + '</span>';
}

function tcCardsShort(cards) {
  cards = cards || [];
  if (!cards.length) return '';
  if (cards.length > 1) return cards.length + '× ' + tcRankLabel(cards[0].rank);
  return tcCardShort(cards[0]);
}

/** One line for a move event. name(playerId) gives a display name. */
function tcEventText(ev, name) {
  var who = name(ev.by);
  var n = tcNum(ev.count);
  switch (ev.kind) {
    case 'play': return who + ' played ' + tcCardsShort(ev.cards);
    case 'burn': return who + ' burned the pile with ' + tcCardsShort(ev.cards);
    case 'pickup': return who + ' picked up ' + n + (n === 1 ? ' card' : ' cards');
    case 'blind-miss': return who + ' flipped ' + tcCardsShort(ev.cards) + ' blind and picked up ' + n;
    default: return who + ' moved';
  }
}

/** The move log, newest first. opts: name(id), avatar(id), max */
function renderMoveLog(log, opts) {
  opts = opts || {};
  var items = (log || []).slice(-(opts.max || 3)).reverse();
  if (!items.length) return '';
  return '<ol class="tc-log" aria-label="Recent moves">' + items.map(function (ev, i) {
    var cards = ev.kind === 'pickup'
      ? renderCardChip(null)
      : (ev.cards || []).slice(0, 4).map(renderCardChip).join('');
    return '<li class="tc-log-item tc-log-' + tcEscape(ev.kind) + (i === 0 ? ' tc-log-new' : '') + '">' +
      '<span class="tc-log-cards">' + cards + '</span>' +
      '<span class="tc-log-text">' + (opts.avatar ? tcEscape(opts.avatar(ev.by)) + ' ' : '') +
        tcEscape(tcEventText(ev, opts.name || String)) + '</span></li>';
  }).join('') + '</ol>';
}

function tcReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** A card drawn on top of the page, for flights. */
function tcGhost(card, rect, facedown) {
  var ghost = document.createElement('div');
  ghost.className = 'tc-flight';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.innerHTML = renderTableCard(card, { facedown: !!facedown, dataId: '', style: '--tc-w:' + rect.width.toFixed(1) + 'px' });
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * Phone: the thrown card leaves through the top edge at once, before the server answers.
 * rect: where the finger let go; flick: { vx, vy } in viewport heights per second.
 */
function tcThrowOff(card, rect, flick) {
  if (!rect || !card || typeof document === 'undefined') return;
  var ghost = tcGhost(card, rect);
  var vx = (flick && flick.vx) || 0;
  var speed = Math.max(1.2, Math.min(6, -((flick && flick.vy) || -2.5)));
  var dur = tcReducedMotion() ? 160 : Math.round(Math.max(220, Math.min(520, 900 / speed)));
  var drift = Math.max(-160, Math.min(160, vx * 60));
  var anim = ghost.animate([
    { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
    { transform: 'translate(' + drift.toFixed(0) + 'px, ' + (-(rect.bottom + 60)).toFixed(0) + 'px) rotate(' + (drift / 6).toFixed(1) + 'deg) scale(0.92)', opacity: 0.85 },
  ], { duration: dur, easing: 'cubic-bezier(.3, .6, .4, 1)', fill: 'forwards' });
  anim.onfinish = function () { ghost.remove(); };
}

/**
 * TV: fly a card from a seat to the pile and land it at its pile tilt.
 * fromRect: the seat; pileEl: the pile box; ev: the move event (seed, flick).
 * Faster throws fly faster (0.35 to 0.9 s). opts.burn: flare and vanish on landing.
 */
function tcFlyIn(card, fromRect, pileEl, ev, opts) {
  opts = opts || {};
  if (!card || !fromRect || !pileEl || typeof document === 'undefined') return null;
  // The pile box is one card's layout size (tilts are transforms), already zoomed on the TV.
  var to = pileEl.getBoundingClientRect();
  var w = to.width;
  var h = w * 1.42;
  var cx = to.left + to.width / 2;
  var cy = to.top + to.height / 2;
  var rnd = tcRandom((ev && ev.seed) || 7);
  var flick = (ev && ev.flick) || {};
  var speed = Math.hypot(flick.vx || 0, flick.vy || 0) || 2.4;
  var dur = tcReducedMotion() ? 200 : Math.round(Math.max(350, Math.min(900, 1900 / speed)));
  var side = Math.max(-80, Math.min(80, (flick.vx || 0) * 30));
  var sx = fromRect.left + fromRect.width / 2 + side;
  var sy = fromRect.top + fromRect.height / 2;
  var tilt = tcPileTilt(card.id);
  var end = opts.burn ? tilt.rot : tilt.rot * 0.4;
  var spin = (rnd() * 2 - 1) * 60 + side;
  var ghost = tcGhost(card, { left: cx - w / 2, top: cy - h / 2, width: w });
  var dx = (sx - cx).toFixed(0);
  var dy = (sy - cy).toFixed(0);
  var land = 'translate(' + tilt.dx.toFixed(1) + 'px, ' + tilt.dy.toFixed(1) + 'px) rotate(' + end.toFixed(1) + 'deg)';
  var frames = [
    { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + spin.toFixed(0) + 'deg) scale(1.4)', opacity: 0, offset: 0, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    { opacity: 1, offset: 0.1 },
    { transform: land + ' scale(1)', offset: 0.86 },
    { transform: land + ' scale(1.05, 0.95)', offset: 0.93 },
    { transform: land + ' scale(1)', opacity: 1, offset: 1 },
  ];
  var anim = ghost.animate(frames, { duration: dur, fill: 'forwards' });
  anim.onfinish = function () {
    if (opts.burn && !tcReducedMotion()) {
      ghost.classList.add('tc-flight-burn');
      var burn = ghost.animate([
        { transform: land + ' scale(1)', opacity: 1, filter: 'brightness(1)' },
        { transform: land + ' scale(1.25)', opacity: 0, filter: 'brightness(2.2)' },
      ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
      burn.onfinish = function () { ghost.remove(); if (opts.onDone) opts.onDone(); };
      return;
    }
    ghost.remove();
    if (opts.onDone) opts.onDone();
  };
  return anim;
}

/** TV: a picked-up pile slides from the pile to the seat as a few face-down cards. */
function tcSweepTo(fromEl, toRect, count) {
  if (!fromEl || !toRect || typeof document === 'undefined' || tcReducedMotion()) return;
  var from = fromEl.getBoundingClientRect();
  var w = Math.min(from.width, 90);
  var n = Math.min(4, Math.max(1, tcNum(count)));
  for (var i = 0; i < n; i++) {
    var ghost = tcGhost(null, { left: from.left + from.width / 2 - w / 2, top: from.top + from.height / 2 - w * 0.71, width: w }, true);
    var dx = (toRect.left + toRect.width / 2) - (from.left + from.width / 2);
    var dy = (toRect.top + toRect.height / 2) - (from.top + from.height / 2);
    var a = ghost.animate([
      { transform: 'translate(0, 0) rotate(' + (i * 7 - 10) + 'deg)', opacity: 1 },
      { transform: 'translate(' + dx.toFixed(0) + 'px, ' + dy.toFixed(0) + 'px) rotate(' + (i * 4) + 'deg) scale(0.6)', opacity: 0 },
    ], { duration: 520, delay: i * 70, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
    a.onfinish = (function (g) { return function () { g.remove(); }; })(ghost);
  }
}
