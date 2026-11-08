// Phone + TV card-table screens for Gin Rummy and Palace, driven by real engine
// views. Functions are cut out of player.html / host.html and run with node:vm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createTestGame, act, viewFor } from '../engine/game-harness.js';
import { getHostView } from '../../src/transport/host-view.js';
import ginRummy from '../../src/engine/games/gin-rummy.js';
import shithead from '../../src/engine/games/shithead.js';

const read = file => readFileSync(new URL('../../public/' + file, import.meta.url), 'utf8');
const KIT = read('js/table-cards.js');
const PLAYER = read('player.html');
const HOST = read('host.html');

function fn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  const end = source.indexOf('\n    }\n', start);
  return source.slice(start, end + 7);
}

function phoneContext(playerId) {
  const context = { state: { playerId, playerNames: { p1: 'Anna', p2: 'Bo', p3: 'Cy' } } };
  runInNewContext(KIT, context);
  const names = ['tcName', 'canPlayCard', 'shHasStacks', 'shZone', 'shActiveZoneCards', 'shCtaState', 'grOpponentId', 'grCtaState', 'grStatusText'];
  runInNewContext(names.map(n => fn(PLAYER, n)).join('\n'), context);
  return context;
}

function tvRender(fnName, view) {
  const content = { innerHTML: '' };
  const context = {
    state: { playerNames: { p1: 'Anna', p2: 'Bo', p3: 'Cy' } },
    audio: { play() {} },
    lastGrState: {},
    lastShState: {},
    document: { getElementById: () => content },
    escapeHtml: t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    playerAvatarHtml: () => '',
    tcFitTv: () => {},
  };
  runInNewContext(KIT, context);
  const block = HOST.slice(HOST.indexOf('    // ===== Card table on the TV'), HOST.indexOf('    function playerAvatarHtml(playerId) {'));
  runInNewContext(block + '\n' + fn(HOST, 'shitheadRuleHintText'), context);
  context[fnName]({ ...view, playerNames: context.state.playerNames });
  return content.innerHTML;
}

const SUIT_NAMES = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const ariaOf = c => 'aria-label="' + (LABELS[c.rank] || c.rank) + ' of ' + SUIT_NAMES[c.suit] + '"';

describe('Gin Rummy phone: next-move button follows the engine phases', () => {
  it('walks upcard → draw → discard', () => {
    let game = createTestGame(ginRummy, ['p1', 'p2']);
    const first = game.state.players[game.state.currentPlayerIndex];
    const ctx = phoneContext(first);
    const v1 = viewFor(game, first);
    expect(ctx.grCtaState(v1, null)).toMatchObject({ action: 'takeUpcard' });
    expect(ctx.grStatusText(v1)).toBe('Take the upcard or decline it');

    game = act(game, 'takeUpcard', first).game;
    const v2 = viewFor(game, first);
    expect(v2.turnPhase).toBe('discard');
    expect(ctx.grCtaState(v2, null)).toMatchObject({ disabled: true, label: 'Tap a card to discard' });
    expect(ctx.grCtaState(v2, v2.lastDrawnCardId)).toMatchObject({ disabled: true });
    const other = v2.myHand.find(c => c.id !== v2.lastDrawnCardId);
    expect(ctx.grCtaState(v2, other.id)).toMatchObject({ action: 'discard' });

    game = act(game, 'discard', first, { cardId: other.id }).game;
    const second = game.state.players.find(id => id !== first);
    const v3 = viewFor(game, second);
    expect(phoneContext(second).grCtaState(v3, null)).toMatchObject({ action: 'drawStock' });
    expect(ctx.grCtaState(viewFor(game, first), null)).toMatchObject({ disabled: true, label: 'Waiting for ' + (second === 'p1' ? 'Anna' : 'Bo') + '…' });
  });

  it('offers Next hand during scoring', () => {
    const ctx = phoneContext('p1');
    expect(ctx.grCtaState({ phase: 'scoring' }, null)).toMatchObject({ action: 'nextHand' });
  });
});

describe('Palace phone: next-move button', () => {
  it('confirms the swap, then plays a selection', () => {
    let game = createTestGame(shithead, ['p1', 'p2', 'p3']);
    const ctx = phoneContext('p1');
    expect(ctx.shCtaState(viewFor(game, 'p1'), [])).toMatchObject({ action: 'confirmSwap' });
    for (const p of ['p1', 'p2', 'p3']) game = act(game, 'confirmSwap', p).game;
    const current = game.state.players[game.state.currentPlayerIndex];
    const pctx = phoneContext(current);
    const view = viewFor(game, current);
    expect(view.phase).toBe('play');
    const card = view.myHand[0];
    expect(pctx.shCtaState(view, [card.id]).label).toMatch(/^Play /);
    expect(pctx.shCtaState(view, [])).toMatchObject({ disabled: true, label: 'Tap cards to play' });
  });

  it('shows the played card on the button: verb, count and card', () => {
    const ctx = phoneContext('p1');
    const hand = [{ id: 'a', rank: 6, suit: 'c' }, { id: 'b', rank: 6, suit: 'h' }, { id: 'c', rank: 6, suit: 'd' }];
    const view = { phase: 'play', isMyTurn: true, myHand: hand, pileTopRank: 5, pileCount: 2 };
    expect(ctx.shCtaState(view, ['a', 'b', 'c'])).toMatchObject({ verb: 'Play', count: 3, label: 'Play 3× 6', action: 'playCards' });
    expect(ctx.shCtaState(view, ['a']).card).toMatchObject({ id: 'a' });
  });

  it('stacks same ranks only once a hand no longer fits two rows of six', () => {
    const ctx = phoneContext('p1');
    const hand = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + i, rank: 2 + (i % 11), suit: 'h' }));
    expect(ctx.shHasStacks(hand(12))).toBe(false);
    expect(ctx.shHasStacks(hand(13))).toBe(true);
    expect(ctx.shHasStacks(hand(11))).toBe(false);
  });

  it('asks to pick up the pile when nothing can be played', () => {
    const ctx = phoneContext('p1');
    const view = { phase: 'play', isMyTurn: true, myHand: [{ id: 'a', rank: 3, suit: 'h' }], pileTopRank: 13, pileCount: 5 };
    expect(ctx.shCtaState(view, [])).toMatchObject({ action: 'pickUpPile', label: 'Pick up the pile (5)' });
  });

  it('switches to blind face-down play at the end', () => {
    const ctx = phoneContext('p1');
    const view = { phase: 'play', isMyTurn: true, myHand: [], myFaceUp: [], myFaceDownIds: ['x1', 'x2'], pileCount: 0 };
    expect(ctx.shZone(view)).toBe('faceDown');
    expect(ctx.shCtaState(view, ['x1'])).toMatchObject({ action: 'playFaceDown' });
  });
});

describe('TV card tables never show private hands', () => {
  it('Gin Rummy: table and seats only, no hand cards', () => {
    const game = createTestGame(ginRummy, ['p1', 'p2']);
    const html = tvRender('renderGinRummy', getHostView(game, 'p1'));
    expect(html).toContain('tc-tv');
    expect(html).toContain('Stock');
    for (const pid of ['p1', 'p2']) {
      for (const c of game.state.hands[pid]) expect(html).not.toContain(ariaOf(c));
    }
    expect(html).toContain(ariaOf(game.state.discard[game.state.discard.length - 1]));
  });

  it('Gin Rummy: reveals both players melds once the hand is scored', () => {
    let game = createTestGame(ginRummy, ['p1', 'p2']);
    const first = game.state.players[game.state.currentPlayerIndex];
    game = { ...game, state: { ...game.state, phase: 'drawing', turnPhase: 'discard' } };
    // Give the current player a knockable hand: A-2-3-4 of hearts, 5-5-5, 9-9-9 (+ a 10 to keep 11 cards)
    const hand = [1, 2, 3, 4].map(r => ({ id: r + 'h_k', rank: r, suit: 'h' }))
      .concat(['s', 'c', 'd'].map(s => ({ id: '5' + s + '_k', rank: 5, suit: s })))
      .concat(['s', 'c', 'd'].map(s => ({ id: '9' + s + '_k', rank: 9, suit: s })))
      .concat([{ id: '10s_k', rank: 10, suit: 's' }]);
    game = { ...game, state: { ...game.state, hands: { ...game.state.hands, [first]: hand } } };
    game = act(game, 'knock', first).game;
    expect(game.state.phase).toBe('scoring');
    const html = tvRender('renderGinRummy', getHostView(game, 'p1'));
    expect(html).toContain('(knocked)');
    expect(html).toContain('tc-meld-run');
    expect(html).toContain('tc-meld-set');
  });

  it('Palace: face-up cards are public, hands are not', () => {
    let game = createTestGame(shithead, ['p1', 'p2', 'p3']);
    for (const p of ['p1', 'p2', 'p3']) game = act(game, 'confirmSwap', p).game;
    const html = tvRender('renderShithead', getHostView(game, 'p1'));
    for (const pid of ['p1', 'p2', 'p3']) {
      for (const c of game.state.hands[pid]) expect(html).not.toContain(ariaOf(c));
      for (const c of game.state.faceUp[pid]) expect(html).toContain(ariaOf(c));
      for (const c of game.state.faceDown[pid]) expect(html).not.toContain(ariaOf(c));
    }
    expect(html).toContain('Draw deck');
    expect(html).toContain("'s turn");
  });
});

describe('TV card tables escape hostile values', () => {
  const evil = '<img src=x onerror=alert(1)>';
  it('Gin Rummy: numeric fields cannot inject markup', () => {
    const html = tvRender('renderGinRummy', {
      phase: 'drawing', turnPhase: 'draw', currentPlayer: 'p1', handNumber: evil,
      cumulative: { p1: evil, p2: 3 }, boxes: { p1: evil, p2: 0 }, playerCardCounts: { p1: evil, p2: 10 },
      stockCount: evil, discardCount: evil, discardTop: null, events: [],
    });
    expect(html).not.toContain('<img');
  });

  it('Palace: numeric fields cannot inject markup', () => {
    const html = tvRender('renderShithead', {
      phase: 'play', currentPlayer: 'p1', drawPileCount: evil, pileCount: evil, pileTopRank: 5,
      players: [{ playerId: 'p1', handCount: evil, faceUp: [], faceDownCount: evil, isOut: false }],
      finishOrder: [],
    });
    expect(html).not.toContain('<img');
  });
});
