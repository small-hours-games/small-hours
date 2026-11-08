import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadKit() {
  const context = { Math, Object, String };
  runInNewContext(readFileSync(new URL('../../public/js/table-cards.js', import.meta.url), 'utf8'), context);
  return context;
}

const kit = loadKit();
const card = (rank, suit, id = rank + suit) => ({ id, rank, suit });

describe('renderTableCard', () => {
  it('shows A for rank 1 and Palace ace-high 14, and court names', () => {
    expect(kit.renderTableCard(card(1, 's'))).toContain('<span class="tc-rank">A</span>');
    expect(kit.renderTableCard(card(14, 'h'))).toContain('<span class="tc-rank">A</span>');
    expect(kit.renderTableCard(card(12, 'd'))).toContain('QUEEN');
    expect(kit.renderTableCard(card(7, 'c'))).toContain('<span class="tc-rank">7</span>');
  });

  it('colours hearts and diamonds red only', () => {
    expect(kit.renderTableCard(card(5, 'h'))).toContain('tc-red');
    expect(kit.renderTableCard(card(5, 'd'))).toContain('tc-red');
    expect(kit.renderTableCard(card(5, 's'))).not.toContain('tc-red');
  });

  it('renders a back for face-down or unknown cards, without revealing the card', () => {
    const html = kit.renderTableCard(card(9, 'h'), { facedown: true });
    expect(html).toContain('tc-back');
    expect(html).not.toContain('tc-rank');
    expect(kit.renderTableCard(null)).toContain('tc-back');
  });

  it('adds meld, selection and NEW states with badges', () => {
    expect(kit.renderTableCard(card(3, 's'), { meld: 'set' })).toMatch(/tc-meld-set[\s\S]*>SET</);
    expect(kit.renderTableCard(card(3, 's'), { meld: 'run' })).toMatch(/tc-meld-run[\s\S]*>RUN</);
    expect(kit.renderTableCard(card(3, 's'), { selected: true })).toContain('tc-selected');
    expect(kit.renderTableCard(card(3, 's'), { isNew: true, meld: 'set' })).toContain('>NEW<');
  });

  it('escapes card ids and badge text', () => {
    const html = kit.renderTableCard(card(4, 'c', '"><img src=x onerror=alert(1)>'), { badge: '<b>' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('data-card-id="&quot;&gt;&lt;img');
  });
});

describe('renderTableStack', () => {
  it('shows an empty slot, or up to 3 layers under the top card', () => {
    expect(kit.renderTableStack(null, 0, { emptyLabel: 'Empty' })).toContain('tc-empty');
    const html = kit.renderTableStack([card(2, 'h'), card(3, 'h'), card(4, 'h')], 30, {});
    expect((html.match(/tc-layer[ "]/g) || []).length).toBe(3);
    expect(html).toMatch(/tc-top[\s\S]*tc-rank">4</);
  });
});

describe('orderHand', () => {
  const hand = [card(9, 'h'), card(2, 's'), card(9, 'c'), card(13, 'd')];

  it('sorts by rank or by suit', () => {
    expect(kit.orderHand(hand, 'rank').map(c => c.id)).toEqual(['2s', '9h', '9c', '13d']);
    expect(kit.orderHand(hand, 'suit').map(c => c.id)).toEqual(['2s', '9h', '9c', '13d'].sort((a, b) => {
      const order = { s: 0, h: 1, c: 2, d: 3 };
      return order[a.slice(-1)] - order[b.slice(-1)];
    }));
  });

  it('puts meld cards first, grouped, then deadwood by rank', () => {
    const melds = [{ type: 'set', cards: [card(9, 'c'), card(9, 'h')] }];
    expect(kit.orderHand(hand, 'melds', null, melds).map(c => c.id)).toEqual(['9h', '9c', '2s', '13d']);
  });

  it('keeps a custom order across updates: new cards last, removed cards dropped', () => {
    const order = ['13d', '9c', '2s', '9h'];
    const next = [card(9, 'h'), card(2, 's'), card(13, 'd'), card(5, 'd')]; // 9c discarded, 5d drawn
    expect(kit.orderHand(next, 'custom', order).map(c => c.id)).toEqual(['13d', '2s', '9h', '5d']);
  });

  it('moves an id to a target position', () => {
    expect(kit.tcMoveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(kit.tcMoveId(['a', 'b'], 'x', 'b')).toEqual(['a', 'b']);
  });
});

describe('renderHandRack', () => {
  const ten = Array.from({ length: 10 }, (_, i) => card(i + 1, 'h'));

  it('uses two rows for a 10-card rack and one row for a fan', () => {
    expect((kit.renderHandRack(ten, { layout: 'rack' }).match(/"tc-rack-row"/g) || []).length).toBe(2);
    expect((kit.renderHandRack(ten, { layout: 'fan' }).match(/"tc-rack-row"/g) || []).length).toBe(1);
    expect((kit.renderHandRack(ten.slice(0, 5), { layout: 'rack' }).match(/"tc-rack-row"/g) || []).length).toBe(1);
  });

  it('keeps every row within the available width', () => {
    const html = kit.renderHandRack(Array.from({ length: 20 }, (_, i) => card((i % 13) + 1, 'sdhc'[i % 4], 'c' + i)), { layout: 'fan', width: 340 });
    const width = Number(html.match(/tc-rack-row" style="width:(\d+)px/)[1]);
    expect(width).toBeLessThanOrEqual(340);
  });

  it('passes per-card options through', () => {
    const html = kit.renderHandRack([card(4, 's')], { cardOpts: () => ({ selected: true }) });
    expect(html).toContain('tc-selected');
  });
});

describe('classifyHandGesture', () => {
  it('tells taps, upward swipes and drags apart', () => {
    expect(kit.classifyHandGesture({ dx: 3, dy: -4 })).toBe('tap');
    expect(kit.classifyHandGesture({ dx: 10, dy: -80 })).toBe('swipe-up');
    expect(kit.classifyHandGesture({ dx: 90, dy: -60 })).toBe('drag');
    expect(kit.classifyHandGesture({ dx: 0, dy: 70 })).toBe('drag');
  });
});

describe('tcNum', () => {
  it('keeps numbers and turns anything else into 0', () => {
    expect(kit.tcNum(12)).toBe(12);
    expect(kit.tcNum('7')).toBe(7);
    expect(kit.tcNum('<img src=x onerror=alert(1)>')).toBe(0);
    expect(kit.tcNum(undefined)).toBe(0);
    expect(kit.tcNum(Infinity)).toBe(0);
  });
});

describe('flick detection', () => {
  it('counts a short, fast upward throw as a play', () => {
    expect(kit.classifyHandGesture({ dx: 4, dy: -30, vx: 0.1, vy: -1.2 })).toBe('swipe-up');
    expect(kit.classifyHandGesture({ dx: 4, dy: -30, vx: 0.1, vy: -0.2 })).toBe('drag');
    expect(kit.classifyHandGesture({ dx: 40, dy: -30, vx: 1.5, vy: -1 })).toBe('drag');
  });

  it('counts a slow drag released high up the screen as a play', () => {
    expect(kit.classifyHandGesture({ dx: 30, dy: -45, releaseRatio: 0.25 })).toBe('swipe-up');
    expect(kit.classifyHandGesture({ dx: 30, dy: -45, releaseRatio: 0.6 })).toBe('drag');
  });

  it('measures release velocity and drops it after a pause', () => {
    const samples = [0, 16, 32, 48, 64, 80].map(t => ({ x: 100, y: 500 - t, t }));
    const v = kit.tcReleaseVelocity(samples, 80);
    expect(v.vy).toBeCloseTo(-1, 5);
    expect(kit.tcReleaseVelocity(samples, 200)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('move log and pile', () => {
  it('keeps new events, skips repeats and restarts with a new game', () => {
    let log = kit.tcLogPush([], { seq: 1, kind: 'play' });
    log = kit.tcLogPush(log, { seq: 1, kind: 'play' });
    log = kit.tcLogPush(log, { seq: 2, kind: 'burn' });
    expect(log.map(e => e.seq)).toEqual([1, 2]);
    expect(kit.tcLogPush(log, { seq: 1, kind: 'play' }).map(e => e.seq)).toEqual([1]);
  });

  it('describes moves in plain words', () => {
    const name = id => ({ bot_1: 'Robo' })[id] || id;
    expect(kit.tcEventText({ kind: 'pickup', by: 'bot_1', count: 5 }, name)).toBe('Robo picked up 5 cards');
    expect(kit.tcEventText({ kind: 'burn', by: 'bot_1', cards: [{ id: 'c1', suit: 's', rank: 10 }] }, name)).toBe('Robo burned the pile with 10♠');
  });

  it('gives a card the same pile tilt every time', () => {
    expect(kit.tcPileTilt('c17')).toEqual(kit.tcPileTilt('c17'));
    expect(kit.tcPileTilt('c17')).not.toEqual(kit.tcPileTilt('c18'));
  });
});

describe('four-colour suits', () => {
  it('uses the four-colour art for clubs and diamonds A to 10 only, when switched on', () => {
    const k = loadKit();
    expect(k.tcFaceUrl(card(7, 'c'))).toBe('/cards/faces/CLUB-7.svg');
    k.tcSetFourColour(true);
    expect(k.tcFaceUrl(card(7, 'c'))).toBe('/cards/faces-4c/CLUB-7.svg');
    expect(k.tcFaceUrl(card(14, 'd'))).toBe('/cards/faces-4c/DIAMOND-1.svg');
    expect(k.tcFaceUrl(card(12, 'd'))).toBe('/cards/faces/DIAMOND-12-QUEEN.svg');
    expect(k.tcFaceUrl(card(7, 'h'))).toBe('/cards/faces/HEART-7.svg');
    expect(k.tcFaceUrl(card(7, 's'))).toBe('/cards/faces/SPADE-7.svg');
  });

  it('marks cards and chips with their suit so the index can be coloured', () => {
    expect(kit.renderTableCard(card(5, 'c'))).toContain('tc-suit-c');
    expect(kit.renderCardChip(card(5, 'd'))).toContain('tc-chip-d');
  });
});

describe('stacked hand', () => {
  it('groups same ranks in order of first appearance', () => {
    const groups = kit.tcStackHand([card(6, 'h'), card(2, 's'), card(6, 'c'), card(6, 'd'), card(9, 'h')]);
    expect(groups.map(g => g.card.id)).toEqual(['6h', '2s', '9h']);
    expect(groups[0].cards.map(c => c.id)).toEqual(['6h', '6c', '6d']);
  });

  it('draws one slot per rank with a count, and only the top card is interactive', () => {
    const html = kit.renderHandRack([card(6, 'h'), card(6, 'c'), card(6, 'd'), card(9, 'h')], { stack: true, width: 360 });
    expect((html.match(/class="tc-slot"/g) || []).length).toBe(2);
    expect(html).toContain('tc-stack-count">×3<');
    expect((html.match(/data-card-id=/g) || []).length).toBe(2);
    expect((html.match(/tc-stack-under/g) || []).length).toBe(2);
  });

  it('passes the whole group to cardOpts', () => {
    const seen = [];
    kit.renderHandRack([card(6, 'h'), card(6, 'c')], { stack: true, cardOpts: (c, group) => { seen.push(group.length); return {}; } });
    expect(seen).toEqual([2]);
  });
});

describe('press-and-slide hand', () => {
  const rect = (left, top) => ({ left, right: left + 70, top, bottom: top + 100 });
  const snap = [{ id: 'a', rect: rect(0, 500) }, { id: 'b', rect: rect(50, 500) }, { id: 'c', rect: rect(100, 500) }];

  it('picks the card on top under the finger', () => {
    expect(kit.tcCardAt(snap, 30, 550).id).toBe('a');
    expect(kit.tcCardAt(snap, 60, 550).id).toBe('b');
    expect(kit.tcCardAt(snap, 160, 550).id).toBe('c');
  });

  it('keeps the row when the finger drifts a little above or below it', () => {
    expect(kit.tcCardAt(snap, 60, 485).id).toBe('b');
    expect(kit.tcCardAt(snap, 60, 640).id).toBe('b');
    expect(kit.tcCardAt(snap, 60, 300)).toBeNull();
  });
});

describe('card tempo', () => {
  // Motion guidance (Material, NN/g): under ~0.5 s, longer for slower throws, never instant.
  it('flies a card to the TV pile in 0.3 to 0.52 s, faster for a harder throw', () => {
    expect(kit.tcFlightMs(2.4)).toBe(458);
    expect(kit.tcFlightMs(100)).toBe(300);
    expect(kit.tcFlightMs(0.1)).toBe(520);
  });

  it('lands a thrown card on the phone pile in 0.18 to 0.32 s', () => {
    expect(kit.tcPileThrowMs(300, 2.4)).toBe(255);
    expect(kit.tcPileThrowMs(300, 6)).toBe(180);
    expect(kit.tcPileThrowMs(900, 1.2)).toBe(320);
    expect(kit.tcPileThrowMs(0, 2.4)).toBe(180);
  });

  it('keeps the old off-screen throw quick too', () => {
    expect(kit.tcThrowMs(2.4)).toBe(375);
    expect(kit.tcThrowMs(6)).toBe(220);
  });
});

describe('Palace hand order', () => {
  it('goes low to high and keeps the 2s and 10s (play on anything) last', () => {
    const hand = [card(10, 'h', 'a'), card(14, 's', 'b'), card(2, 'c', 'c'), card(5, 'd', 'd'), card(13, 'c', 'e'), card(3, 's', 'f')];
    expect(kit.orderHand(hand, 'palace').map(c => c.rank)).toEqual([3, 5, 13, 14, 2, 10]);
  });
});

describe('tcNewCardIds', () => {
  it('finds only the cards that were not in the hand before', () => {
    expect(kit.tcNewCardIds(['a', 'b'], [card(3, 's', 'b'), card(4, 's', 'c')])).toEqual(['c']);
  });

  it('reports nothing without an earlier hand, so a deal does not count as a draw', () => {
    expect(kit.tcNewCardIds(null, [card(3, 's', 'a')])).toEqual([]);
  });
});
