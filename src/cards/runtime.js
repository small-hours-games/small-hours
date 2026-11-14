// Small Hours - Declarative Card Game Runtime
// Builds a pure Small Hours game definition from a JSON card-game spec,
// reusing src/cards/deck.js and the shared Phone/TV table-cards contract.

import { createDeck, deal, shuffle, SUITS } from './deck.js';

const PLAY_MATCH_MODES = new Set(['any', 'suitOrRank', 'higherOrEqual', 'lowerOrEqual', 'sameRank']);
const SPECIAL_EFFECTS = new Set(['skip', 'reverse', 'nextDraw2', 'nextDraw4', 'burn', 'reset']);

export function validateCardSpec(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Game spec must be an object' };
  const id = String(raw.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(id)) {
    return { ok: false, error: 'id must be 3-40 lowercase letters, numbers, or hyphens' };
  }
  const label = String(raw.label || '').trim();
  if (!label || label.length > 40) return { ok: false, error: 'label (1-40 chars) is required' };

  const min = raw.min == null ? 2 : Number(raw.min);
  const max = raw.max == null ? 6 : Number(raw.max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 12 || min > max) {
    return { ok: false, error: 'min and max must be integers (1 <= min <= max <= 12)' };
  }

  const deck = {
    decks: Math.min(6, Math.max(1, Number(raw.deck?.decks) || 1)),
    aceHigh: Boolean(raw.deck?.aceHigh),
    opaqueIds: Boolean(raw.deck?.opaqueIds),
  };
  const dealCfg = {
    hand: Math.min(20, Math.max(1, Number(raw.deal?.hand) || 7)),
    flipStarter: raw.deal?.flipStarter !== false,
  };

  const rawRules = raw.rules || {};
  const playMatch = rawRules.playMatch || 'suitOrRank';
  if (!PLAY_MATCH_MODES.has(playMatch)) {
    return { ok: false, error: `rules.playMatch must be one of: ${[...PLAY_MATCH_MODES].join(', ')}` };
  }

  const wildRanks = Array.isArray(rawRules.wildRanks)
    ? rawRules.wildRanks.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 14)
    : [];

  const specialEffects = {};
  if (rawRules.specialEffects && typeof rawRules.specialEffects === 'object') {
    for (const [k, v] of Object.entries(rawRules.specialEffects)) {
      const rank = Number(k);
      if (!Number.isInteger(rank) || rank < 1 || rank > 14) continue;
      if (!SPECIAL_EFFECTS.has(v)) {
        return { ok: false, error: `Unknown specialEffects action "${v}" for rank ${k}` };
      }
      specialEffects[rank] = v;
    }
  }

  const rules = {
    playMatch,
    wildRanks,
    allowMultiSameRank: Boolean(rawRules.allowMultiSameRank),
    drawOnPass: Math.min(5, Math.max(0, rawRules.drawOnPass == null ? 1 : Number(rawRules.drawOnPass))),
    specialEffects,
    reshuffleDiscardWhenEmpty: rawRules.reshuffleDiscardWhenEmpty !== false,
    allowPass: rawRules.allowPass !== false,
  };

  const aiMax = Math.min(5, Math.max(0, Number(raw.aiMax) || 0));

  return {
    ok: true,
    spec: {
      id,
      kind: 'card-rules',
      label,
      icon: String(raw.icon || '🃏').slice(0, 8),
      blurb: String(raw.blurb || 'Custom card game').slice(0, 120),
      story: raw.story ? String(raw.story).slice(0, 500) : undefined,
      music: raw.music !== false,
      visibility: raw.visibility === 'unlisted' ? 'unlisted' : 'public',
      min,
      max,
      aiMax,
      deck,
      deal: dealCfg,
      rules,
    },
  };
}

function advanceIndex(currentIndex, step, count, direction) {
  return ((currentIndex + step * direction) % count + count) % count;
}

export function canPlayOnPile(card, state, rules) {
  if (!card) return false;
  if (rules.wildRanks.includes(card.rank)) return true;
  const top = state.pile[state.pile.length - 1];
  if (!top || state.pileReset) return true;
  const activeSuit = state.activeSuit || top.suit;

  switch (rules.playMatch) {
    case 'any': return true;
    case 'suitOrRank': return card.suit === activeSuit || card.rank === top.rank;
    case 'higherOrEqual': return card.rank >= top.rank;
    case 'lowerOrEqual': return card.rank <= top.rank;
    case 'sameRank': return card.rank === top.rank;
    default: return false;
  }
}

function drawFromDeck(drawPile, pile, count, reshuffle) {
  let deck = [...drawPile];
  let discard = [...pile];
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && reshuffle && discard.length > 1) {
      const top = discard[discard.length - 1];
      deck = shuffle(discard.slice(0, -1));
      discard = [top];
    }
    if (deck.length === 0) break;
    drawn.push(deck.pop());
  }
  return { drawn, drawPile: deck, pile: discard };
}

export function buildCardGameDefinition(spec) {
  const { rules, deck: deckCfg, deal: dealCfg } = spec;

  function findLegalMove(state, playerId) {
    const hand = state.hands[playerId] || [];
    const playable = hand.filter(c => canPlayOnPile(c, state, rules));
    if (playable.length > 0) {
      const card = playable[0];
      const payload = { cardIds: [card.id] };
      if (rules.wildRanks.includes(card.rank) && rules.playMatch === 'suitOrRank') {
        payload.chosenSuit = hand.find(c => c.id !== card.id)?.suit || card.suit;
      }
      return { type: 'playCards', ...payload };
    }
    if (state.drawPile.length > 0 || (rules.reshuffleDiscardWhenEmpty && state.pile.length > 1)) {
      return { type: 'drawCard' };
    }
    return { type: 'passTurn' };
  }

  return {
    id: spec.id,
    kind: 'card-rules',
    label: spec.label,
    icon: spec.icon,
    blurb: spec.blurb,
    ...(spec.story ? { story: spec.story } : {}),
    music: spec.music,
    min: spec.min,
    max: spec.max,
    hidden: spec.visibility === 'unlisted',
    privateKeys: ['myHand', 'isMyTurn'],
    ...(spec.aiMax > 0 ? {
      ai: {
        max: spec.aiMax,
        chooseMove: (state, botId) => findLegalMove(state, botId),
      },
    } : {}),

    setup({ players }) {
      const rawDeck = createDeck(deckCfg);
      const { hands, rest } = deal(rawDeck, players, dealCfg.hand);
      const drawPile = [...rest];
      const pile = dealCfg.flipStarter && drawPile.length ? [drawPile.pop()] : [];
      return {
        phase: 'play',
        players: [...players],
        currentIndex: 0,
        direction: 1,
        hands,
        drawPile,
        pile,
        activeSuit: pile.length ? pile[pile.length - 1].suit : null,
        pileReset: false,
        pendingDraw: 0,
        winner: null,
        seq: 0,
        lastEvent: null,
      };
    },

    actions: {
      playCards(state, { playerId, cardIds, chosenSuit }) {
        if (state.phase !== 'play') return { state, events: [{ type: 'error', message: 'Game is over' }] };
        if (state.players[state.currentIndex] !== playerId) {
          return { state, events: [{ type: 'error', message: 'Not your turn' }] };
        }
        const ids = Array.isArray(cardIds) ? cardIds : [];
        if (ids.length === 0) return { state, events: [{ type: 'error', message: 'Select at least one card' }] };
        const hand = state.hands[playerId] || [];
        const selected = ids.map(id => hand.find(c => c.id === id)).filter(Boolean);
        if (selected.length !== ids.length) {
          return { state, events: [{ type: 'error', message: 'Card not in hand' }] };
        }
        if (selected.length > 1) {
          if (!rules.allowMultiSameRank) {
            return { state, events: [{ type: 'error', message: 'Only one card per turn' }] };
          }
          if (!selected.every(c => c.rank === selected[0].rank)) {
            return { state, events: [{ type: 'error', message: 'Multi-card plays must share a rank' }] };
          }
        }
        if (!canPlayOnPile(selected[0], state, rules)) {
          return { state, events: [{ type: 'error', message: 'That card cannot be played on the pile' }] };
        }

        const playedSet = new Set(ids);
        const nextHand = hand.filter(c => !playedSet.has(c.id));
        let nextPile = [...state.pile, ...selected];
        let nextDirection = state.direction;
        let step = 1;
        let nextSuit = selected[selected.length - 1].suit;
        let pileReset = false;
        let burned = false;

        if (rules.wildRanks.includes(selected[0].rank) && SUITS.includes(chosenSuit)) {
          nextSuit = chosenSuit;
        }

        const effect = rules.specialEffects[selected[0].rank];
        let drawPenalty = 0;
        if (effect === 'reverse') {
          if (state.players.length === 2) step = 2;
          else nextDirection = state.direction * -1;
        } else if (effect === 'skip') {
          step = 2;
        } else if (effect === 'nextDraw2') {
          drawPenalty = 2;
        } else if (effect === 'nextDraw4') {
          drawPenalty = 4;
        } else if (effect === 'burn') {
          nextPile = [];
          nextSuit = null;
          burned = true;
        } else if (effect === 'reset') {
          pileReset = true;
        }

        let drawPile = state.drawPile;
        const hands = { ...state.hands, [playerId]: nextHand };

        // Apply draw penalty immediately to the next player and advance past them (or let them play)
        let targetIndex = advanceIndex(state.currentIndex, step, state.players.length, nextDirection);
        if (drawPenalty > 0 && nextHand.length > 0) {
          const victim = state.players[targetIndex];
          const res = drawFromDeck(drawPile, nextPile, drawPenalty, rules.reshuffleDiscardWhenEmpty);
          drawPile = res.drawPile;
          nextPile = res.pile;
          hands[victim] = [...(hands[victim] || []), ...res.drawn];
          targetIndex = advanceIndex(targetIndex, 1, state.players.length, nextDirection);
        }

        const winner = nextHand.length === 0 ? playerId : null;
        const seq = state.seq + 1;
        const lastEvent = {
          seq,
          kind: burned ? 'burn' : 'play',
          by: playerId,
          cards: selected,
          chosenSuit: rules.wildRanks.includes(selected[0].rank) ? nextSuit : null,
        };

        return {
          state: {
            ...state,
            phase: winner ? 'finished' : 'play',
            currentIndex: winner ? state.currentIndex : targetIndex,
            direction: nextDirection,
            hands,
            drawPile,
            pile: nextPile,
            activeSuit: nextSuit,
            pileReset,
            winner,
            seq,
            lastEvent,
          },
          events: [{ type: burned ? 'burn' : 'play', playerId, cards: selected }],
        };
      },

      drawCard(state, { playerId }) {
        if (state.phase !== 'play') return { state, events: [{ type: 'error', message: 'Game is over' }] };
        if (state.players[state.currentIndex] !== playerId) {
          return { state, events: [{ type: 'error', message: 'Not your turn' }] };
        }
        const count = Math.max(1, rules.drawOnPass || 1);
        const res = drawFromDeck(state.drawPile, state.pile, count, rules.reshuffleDiscardWhenEmpty);
        if (res.drawn.length === 0) {
          return { state, events: [{ type: 'error', message: 'No cards left to draw' }] };
        }
        const nextHand = [...(state.hands[playerId] || []), ...res.drawn];
        const seq = state.seq + 1;
        const nextIndex = advanceIndex(state.currentIndex, 1, state.players.length, state.direction);
        return {
          state: {
            ...state,
            currentIndex: nextIndex,
            hands: { ...state.hands, [playerId]: nextHand },
            drawPile: res.drawPile,
            pile: res.pile,
            seq,
            lastEvent: { seq, kind: 'draw', by: playerId, count: res.drawn.length },
          },
          events: [{ type: 'draw', playerId, count: res.drawn.length }],
        };
      },

      passTurn(state, { playerId }) {
        if (state.phase !== 'play') return { state, events: [{ type: 'error', message: 'Game is over' }] };
        if (state.players[state.currentIndex] !== playerId) {
          return { state, events: [{ type: 'error', message: 'Not your turn' }] };
        }
        if (!rules.allowPass) {
          return { state, events: [{ type: 'error', message: 'Passing is not allowed' }] };
        }
        const seq = state.seq + 1;
        const nextIndex = advanceIndex(state.currentIndex, 1, state.players.length, state.direction);
        return {
          state: {
            ...state,
            currentIndex: nextIndex,
            seq,
            lastEvent: { seq, kind: 'pass', by: playerId },
          },
          events: [{ type: 'pass', playerId }],
        };
      },
    },

    view(state, playerId) {
      const pileTop = state.pile.length ? state.pile[state.pile.length - 1] : null;
      return {
        phase: state.phase,
        currentPlayer: state.phase === 'play' ? state.players[state.currentIndex] : null,
        isMyTurn: state.phase === 'play' && state.players[state.currentIndex] === playerId,
        myHand: state.hands[playerId] || [],
        pileTop,
        pilePreview: state.pile.slice(-4),
        pileCount: state.pile.length,
        drawPileCount: state.drawPile.length,
        activeSuit: state.activeSuit,
        pileReset: state.pileReset,
        wildRanks: rules.wildRanks,
        allowMultiSameRank: rules.allowMultiSameRank,
        playMatch: rules.playMatch,
        players: state.players.map(id => ({
          playerId: id,
          handCount: (state.hands[id] || []).length,
          isOut: (state.hands[id] || []).length === 0,
        })),
        winner: state.winner,
        lastEvent: state.lastEvent,
      };
    },

    endIf(state) {
      if (state.phase !== 'finished' || !state.winner) return null;
      const scores = Object.fromEntries(
        state.players.map(id => [id, id === state.winner ? 100 : Math.max(0, 50 - (state.hands[id] || []).length * 5)])
      );
      return { winner: state.winner, scores };
    },
  };
}
