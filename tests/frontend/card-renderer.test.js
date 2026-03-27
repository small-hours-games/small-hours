import { describe, it, expect } from 'vitest';

// Re-declare the pure mapping logic from public/js/cards.js for testing.
// These are small pure functions — duplicating them here avoids CJS/ESM issues
// since cards.js is a plain browser <script> with no module exports.
const SUIT_MAP = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };
const RANK_MAP = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: '11-JACK', 12: '12-QUEEN', 13: '13-KING',
  14: '1'
};

function cardSvgSrc(c) {
  const suit = SUIT_MAP[c.suit] || c.suit.toUpperCase();
  const rank = RANK_MAP[c.rank] || String(c.rank);
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

describe('cardSvgSrc', () => {
  it('maps ace of hearts (rank 1)', () => {
    expect(cardSvgSrc({rank: 1, suit: 'h'})).toBe('/cards/faces/HEART-1.svg');
  });
  it('maps shithead ace (rank 14) to rank 1 SVG', () => {
    expect(cardSvgSrc({rank: 14, suit: 's'})).toBe('/cards/faces/SPADE-1.svg');
  });
  it('maps jack (rank 11)', () => {
    expect(cardSvgSrc({rank: 11, suit: 'd'})).toBe('/cards/faces/DIAMOND-11-JACK.svg');
  });
  it('maps queen (rank 12)', () => {
    expect(cardSvgSrc({rank: 12, suit: 'c'})).toBe('/cards/faces/CLUB-12-QUEEN.svg');
  });
  it('maps king (rank 13)', () => {
    expect(cardSvgSrc({rank: 13, suit: 's'})).toBe('/cards/faces/SPADE-13-KING.svg');
  });
  it('maps numeric rank', () => {
    expect(cardSvgSrc({rank: 5, suit: 'd'})).toBe('/cards/faces/DIAMOND-5.svg');
  });
  it('maps rank 10', () => {
    expect(cardSvgSrc({rank: 10, suit: 'h'})).toBe('/cards/faces/HEART-10.svg');
  });
  it('maps all four suits', () => {
    expect(cardSvgSrc({rank: 2, suit: 'h'})).toContain('HEART');
    expect(cardSvgSrc({rank: 2, suit: 'd'})).toContain('DIAMOND');
    expect(cardSvgSrc({rank: 2, suit: 'c'})).toContain('CLUB');
    expect(cardSvgSrc({rank: 2, suit: 's'})).toContain('SPADE');
  });
});

describe('renderCardImg', () => {
  it('returns img tag with correct src', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {});
    expect(html).toContain('src="/cards/faces/CLUB-7.svg"');
    expect(html).toContain('<img');
    expect(html).toContain('draggable="false"');
  });
  it('uses back.svg when facedown', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {facedown: true});
    expect(html).toContain('src="/cards/backs/back.svg"');
  });
  it('adds selected class', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {selected: true});
    expect(html).toContain('selected');
  });
  it('adds unplayable class when playable is false', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {playable: false});
    expect(html).toContain('unplayable');
  });
  it('uses custom dimensions', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {width: 48, height: 64});
    expect(html).toContain('width="48"');
    expect(html).toContain('height="64"');
  });
  it('adds onclick handler', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {onclick: 'foo()'});
    expect(html).toContain('onclick="foo()"');
  });
  it('adds pile-card class', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {pileCard: true});
    expect(html).toContain('pile-card');
  });
  it('defaults to 58x82 dimensions', () => {
    const html = renderCardImg({rank: 7, suit: 'c'}, {});
    expect(html).toContain('width="58"');
    expect(html).toContain('height="82"');
  });
});
