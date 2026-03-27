// public/js/cards.js
// Shared card rendering and audio module for host.html and player.html.
// Plain browser script — loaded via <script src="/js/cards.js">.
// No CJS or ESM exports — functions are browser globals.

// Suit mapping: engine uses lowercase single char, SVGs use uppercase full name
const SUIT_MAP = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };

// Rank mapping: engine uses numeric, SVGs use number with face-card suffix
const RANK_MAP = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: '11-JACK', 12: '12-QUEEN', 13: '13-KING',
  14: '1'  // Shithead uses rank 14 for Ace-high; maps to same SVG as rank 1
};

function cardSvgSrc(c) {
  var suit = SUIT_MAP[c.suit] || c.suit.toUpperCase();
  var rank = RANK_MAP[c.rank] || String(c.rank);
  return '/cards/faces/' + suit + '-' + rank + '.svg';
}

function renderCardImg(c, opts) {
  opts = opts || {};
  var w = opts.width || 58;
  var h = opts.height || 82;
  var classes = ['playing-card'];
  if (opts.selected) classes.push('selected');
  if (opts.playable === true) classes.push('playable');
  if (opts.playable === false) classes.push('unplayable');
  if (opts.facedown) classes.push('facedown');
  if (opts.pileCard) classes.push('pile-card');
  if (opts.className) classes.push(opts.className);
  var src = opts.facedown ? '/cards/backs/back.svg' : cardSvgSrc(c);
  var onclick = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
  var id = opts.id ? ' id="' + opts.id + '"' : '';
  var style = opts.style ? ' style="' + opts.style + '"' : '';
  return '<img class="' + classes.join(' ') + '" src="' + src +
    '" width="' + w + '" height="' + h + '" draggable="false"' +
    onclick + id + style + '>';
}

// Web Audio singleton — host display only (TV speakers)
var audio = {
  ctx: null,
  buffers: {},
  init: function() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    var self = this;
    var sounds = ['draw', 'place', 'deck_redraw', 'win'];
    sounds.forEach(function(name) { self._load(name); });
  },
  _load: function(name) {
    var self = this;
    fetch('/cards/sounds/' + name + '.wav')
      .then(function(res) { return res.arrayBuffer(); })
      .then(function(buf) { return self.ctx.decodeAudioData(buf); })
      .then(function(decoded) { self.buffers[name] = decoded; })
      .catch(function(e) { console.warn('Sound load failed:', name, e); });
  },
  play: function(name) {
    if (!this.ctx || !this.buffers[name]) return;
    var src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.connect(this.ctx.destination);
    src.start(0);
  }
};
