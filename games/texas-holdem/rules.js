import { createDeck } from '../../src/cards/deck.js';
import { evaluateBestHand } from './hand-eval.js';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const DEFAULT_HANDS = 10;
const STREETS = ['preflop', 'flop', 'turn', 'river'];

function error(state, playerId, message) {
  return { state, events: [{ type: 'error', playerId, message }] };
}

function nextActiveAfter(activePlayers, fromIndex, predicate) {
  const n = activePlayers.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIndex + offset) % n;
    const id = activePlayers[idx];
    if (predicate(id, idx)) return { id, idx };
  }
  return null;
}

function postBlind(chips, streetBets, totalHandBets, allIn, id, amount) {
  const paid = Math.min(chips[id], amount);
  chips[id] -= paid;
  streetBets[id] = (streetBets[id] || 0) + paid;
  totalHandBets[id] = (totalHandBets[id] || 0) + paid;
  if (chips[id] === 0) allIn[id] = true;
  return paid;
}

function canAct(state, id) {
  return !state.folded[id] && !state.allIn[id];
}

function nonFoldedPlayers(state) {
  return state.activePlayers.filter(id => !state.folded[id]);
}

function settleFoldWin(state) {
  const contenders = nonFoldedPlayers(state);
  const winnerId = contenders[0];
  const pot = state.pot;
  const chips = { ...state.chips, [winnerId]: state.chips[winnerId] + pot };

  return {
    ...state,
    chips,
    phase: 'showdown',
    turn: null,
    showdown: {
      reason: 'fold',
      winners: [{ playerId: winnerId, amount: pot, handName: 'Opponents folded' }],
      revealedHands: {},
    },
  };
}

function settleShowdown(state) {
  let deck = [...state.deck];
  let board = [...state.board];
  while (board.length < 5 && deck.length > 0) {
    board.push(deck.pop());
  }

  const contenders = nonFoldedPlayers(state);
  const evals = {};
  const revealedHands = {};
  for (const id of contenders) {
    revealedHands[id] = state.hands[id];
    evals[id] = evaluateBestHand([...state.hands[id], ...board]);
  }

  // Build side-pot layers from each player's totalHandBets
  const levels = [...new Set(
    state.activePlayers.map(id => state.totalHandBets[id] || 0).filter(v => v > 0)
  )].sort((a, b) => a - b);

  const payouts = Object.fromEntries(state.activePlayers.map(id => [id, 0]));
  const dealerIdx = state.activePlayers.indexOf(state.dealerId);
  let prevLevel = 0;

  for (const level of levels) {
    const slice = level - prevLevel;
    prevLevel = level;
    let layerPot = 0;
    const eligible = [];

    for (const id of state.activePlayers) {
      const contrib = state.totalHandBets[id] || 0;
      if (contrib >= level) {
        layerPot += slice;
        if (!state.folded[id]) eligible.push(id);
      }
    }

    if (layerPot === 0 || eligible.length === 0) continue;

    let bestScore = -1;
    let layerWinners = [];
    for (const id of eligible) {
      const sc = evals[id].score;
      if (sc > bestScore) {
        bestScore = sc;
        layerWinners = [id];
      } else if (sc === bestScore) {
        layerWinners.push(id);
      }
    }

    const share = Math.floor(layerPot / layerWinners.length);
    let remainder = layerPot % layerWinners.length;

    // Order winners clockwise from left of dealer for odd chip
    const orderedWinners = [...layerWinners].sort((a, b) => {
      const ia = (state.activePlayers.indexOf(a) - dealerIdx - 1 + state.activePlayers.length) % state.activePlayers.length;
      const ib = (state.activePlayers.indexOf(b) - dealerIdx - 1 + state.activePlayers.length) % state.activePlayers.length;
      return ia - ib;
    });

    for (const id of orderedWinners) {
      payouts[id] += share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
  }

  const chips = { ...state.chips };
  const winners = [];
  for (const id of contenders) {
    if (payouts[id] > 0) {
      chips[id] += payouts[id];
      winners.push({
        playerId: id,
        amount: payouts[id],
        handName: evals[id].name,
      });
    }
  }

  return {
    ...state,
    deck,
    board,
    chips,
    phase: 'showdown',
    turn: null,
    showdown: {
      reason: 'showdown',
      winners,
      revealedHands,
      handNames: Object.fromEntries(contenders.map(id => [id, evals[id].name])),
    },
  };
}

function advanceStreetOrShowdown(state) {
  const contenders = nonFoldedPlayers(state);
  if (contenders.length === 1) return settleFoldWin(state);

  const canActCount = contenders.filter(id => !state.allIn[id]).length;
  const streetIdx = STREETS.indexOf(state.phase);
  if (streetIdx === STREETS.length - 1 || canActCount < 2) {
    return settleShowdown(state);
  }

  const nextPhase = STREETS[streetIdx + 1];
  const deck = [...state.deck];
  const board = [...state.board];
  const drawCount = nextPhase === 'flop' ? 3 : 1;
  for (let i = 0; i < drawCount; i++) {
    if (deck.length > 0) board.push(deck.pop());
  }

  const dealerIdx = state.activePlayers.indexOf(state.dealerId);
  const firstActor = nextActiveAfter(state.activePlayers, dealerIdx, id => !state.folded[id] && !state.allIn[id]);
  if (!firstActor) return settleShowdown({ ...state, deck, board });

  return {
    ...state,
    deck,
    board,
    phase: nextPhase,
    currentBet: 0,
    minRaise: BIG_BLIND,
    streetBets: Object.fromEntries(state.activePlayers.map(id => [id, 0])),
    acted: Object.fromEntries(state.activePlayers.map(id => [id, false])),
    turn: firstActor.id,
  };
}

function advanceTurn(state) {
  const contenders = nonFoldedPlayers(state);
  if (contenders.length === 1) return settleFoldWin(state);

  const stillToAct = contenders.filter(
    id => !state.allIn[id] && (!state.acted[id] || state.streetBets[id] < state.currentBet)
  );
  if (stillToAct.length === 0) {
    return advanceStreetOrShowdown(state);
  }

  const curIdx = state.activePlayers.indexOf(state.turn);
  const next = nextActiveAfter(
    state.activePlayers,
    curIdx,
    id => !state.folded[id] && !state.allIn[id] && (!state.acted[id] || state.streetBets[id] < state.currentBet)
  );
  if (!next) return advanceStreetOrShowdown(state);

  return { ...state, turn: next.id };
}

function dealNewHand(state) {
  const activePlayers = state.players.filter(id => state.chips[id] > 0);
  if (activePlayers.length <= 1 || state.handNumber > state.maxHands) {
    return { ...state, activePlayers, phase: 'finished', turn: null };
  }

  const deck = createDeck({ aceHigh: true });
  const hands = {};
  for (const id of activePlayers) {
    hands[id] = [deck.pop(), deck.pop()];
  }

  const dealerIdx = state.dealerCursor % activePlayers.length;
  const dealerId = activePlayers[dealerIdx];
  const isHeadsUp = activePlayers.length === 2;
  const sbIdx = isHeadsUp ? dealerIdx : (dealerIdx + 1) % activePlayers.length;
  const bbIdx = (sbIdx + 1) % activePlayers.length;
  const sbId = activePlayers[sbIdx];
  const bbId = activePlayers[bbIdx];

  const chips = { ...state.chips };
  const streetBets = Object.fromEntries(activePlayers.map(id => [id, 0]));
  const totalHandBets = Object.fromEntries(activePlayers.map(id => [id, 0]));
  const allIn = Object.fromEntries(activePlayers.map(id => [id, false]));
  const folded = Object.fromEntries(activePlayers.map(id => [id, false]));
  const acted = Object.fromEntries(activePlayers.map(id => [id, false]));

  const sbPaid = postBlind(chips, streetBets, totalHandBets, allIn, sbId, SMALL_BLIND);
  const bbPaid = postBlind(chips, streetBets, totalHandBets, allIn, bbId, BIG_BLIND);
  const currentBet = Math.max(sbPaid, bbPaid);
  const pot = sbPaid + bbPaid;

  const nextState = {
    ...state,
    deck,
    hands,
    board: [],
    activePlayers,
    dealerId,
    sbId,
    bbId,
    chips,
    pot,
    currentBet,
    minRaise: BIG_BLIND,
    streetBets,
    totalHandBets,
    allIn,
    folded,
    acted,
    phase: 'preflop',
    lastAction: null,
    showdown: null,
  };

  const canActCount = activePlayers.filter(id => !allIn[id]).length;
  if (canActCount < 2) {
    return settleShowdown(nextState);
  }

  const utg = nextActiveAfter(activePlayers, bbIdx, id => !allIn[id]);
  if (!utg) return settleShowdown(nextState);

  return { ...nextState, turn: utg.id };
}

export default {
  setup({ players, config = {} }) {
    const maxHands = Math.max(1, Number(config.hands) || DEFAULT_HANDS);
    const chips = Object.fromEntries(players.map(id => [id, STARTING_CHIPS]));
    return dealNewHand({
      players: [...players],
      chips,
      handNumber: 1,
      maxHands,
      dealerCursor: 0,
    });
  },

  actions: {
    fold(state, { playerId }) {
      if (!STREETS.includes(state.phase)) return error(state, playerId, 'Hand is not active.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const nextState = {
        ...state,
        folded: { ...state.folded, [playerId]: true },
        acted: { ...state.acted, [playerId]: true },
        lastAction: { playerId, type: 'fold' },
      };
      return { state: advanceTurn(nextState), events: [] };
    },

    check(state, { playerId }) {
      if (!STREETS.includes(state.phase)) return error(state, playerId, 'Hand is not active.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');
      if ((state.streetBets[playerId] || 0) < state.currentBet) {
        return error(state, playerId, 'Cannot check when facing a bet.');
      }

      const nextState = {
        ...state,
        acted: { ...state.acted, [playerId]: true },
        lastAction: { playerId, type: 'check' },
      };
      return { state: advanceTurn(nextState), events: [] };
    },

    call(state, { playerId }) {
      if (!STREETS.includes(state.phase)) return error(state, playerId, 'Hand is not active.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const alreadyBet = state.streetBets[playerId] || 0;
      const toCall = state.currentBet - alreadyBet;
      if (toCall <= 0) return error(state, playerId, 'Nothing to call.');

      const paid = Math.min(state.chips[playerId], toCall);
      const isAllIn = paid === state.chips[playerId];
      const nextState = {
        ...state,
        chips: { ...state.chips, [playerId]: state.chips[playerId] - paid },
        pot: state.pot + paid,
        streetBets: { ...state.streetBets, [playerId]: alreadyBet + paid },
        totalHandBets: { ...state.totalHandBets, [playerId]: (state.totalHandBets[playerId] || 0) + paid },
        allIn: { ...state.allIn, [playerId]: isAllIn },
        acted: { ...state.acted, [playerId]: true },
        lastAction: { playerId, type: isAllIn ? 'all-in' : 'call', amount: paid },
      };
      return { state: advanceTurn(nextState), events: [] };
    },

    raise(state, { playerId, to }) {
      if (!STREETS.includes(state.phase)) return error(state, playerId, 'Hand is not active.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const alreadyBet = state.streetBets[playerId] || 0;
      const maxTo = alreadyBet + state.chips[playerId];
      const targetTo = Math.floor(Number(to));
      const minRaiseTo = Math.min(maxTo, state.currentBet + state.minRaise);

      if (!Number.isFinite(targetTo) || targetTo <= state.currentBet) {
        return error(state, playerId, 'Raise must exceed the current bet.');
      }
      if (targetTo > maxTo) {
        return error(state, playerId, 'Not enough chips.');
      }
      if (targetTo < minRaiseTo && targetTo < maxTo) {
        return error(state, playerId, `Minimum raise to ${minRaiseTo}.`);
      }

      const added = targetTo - alreadyBet;
      const raiseDelta = targetTo - state.currentBet;
      const isAllIn = targetTo === maxTo;

      // Full raise re-opens action for others
      const nextActed = { ...state.acted, [playerId]: true };
      const nextMinRaise = raiseDelta >= state.minRaise ? raiseDelta : state.minRaise;
      if (raiseDelta >= state.minRaise) {
        for (const id of state.activePlayers) {
          if (id !== playerId && canAct(state, id)) nextActed[id] = false;
        }
      }

      const nextState = {
        ...state,
        chips: { ...state.chips, [playerId]: state.chips[playerId] - added },
        pot: state.pot + added,
        currentBet: targetTo,
        minRaise: nextMinRaise,
        streetBets: { ...state.streetBets, [playerId]: targetTo },
        totalHandBets: { ...state.totalHandBets, [playerId]: (state.totalHandBets[playerId] || 0) + added },
        allIn: { ...state.allIn, [playerId]: isAllIn },
        acted: nextActed,
        lastAction: { playerId, type: isAllIn ? 'all-in' : 'raise', amount: targetTo },
      };
      return { state: advanceTurn(nextState), events: [] };
    },

    nextHand(state, { playerId }) {
      if (state.phase !== 'showdown') return error(state, playerId, 'Not at showdown.');
      return {
        state: dealNewHand({
          ...state,
          handNumber: state.handNumber + 1,
          dealerCursor: state.dealerCursor + 1,
        }),
        events: [],
      };
    },
  },

  view(state, playerId) {
    const myHand = state.hands?.[playerId] || [];
    const isMyTurn = STREETS.includes(state.phase) && state.turn === playerId;
    const myStreetBet = state.streetBets?.[playerId] || 0;
    const myChips = state.chips?.[playerId] || 0;
    const myToCall = isMyTurn ? Math.max(0, state.currentBet - myStreetBet) : 0;
    const myMaxBetTo = myStreetBet + myChips;
    const myMinRaiseTo = Math.min(myMaxBetTo, state.currentBet + state.minRaise);
    const myCanCheck = isMyTurn && myToCall === 0;

    let winner = null;
    let scores = null;
    if (state.phase === 'finished') {
      scores = { ...state.chips };
      winner = [...state.players].sort((a, b) => scores[b] - scores[a])[0] || null;
    }

    return {
      phase: state.phase,
      handNumber: state.handNumber,
      maxHands: state.maxHands,
      players: state.players,
      activePlayers: state.activePlayers,
      dealerId: state.dealerId,
      sbId: state.sbId,
      bbId: state.bbId,
      turn: state.turn,
      board: state.board || [],
      pot: state.pot || 0,
      currentBet: state.currentBet || 0,
      minRaise: state.minRaise || BIG_BLIND,
      chips: state.chips,
      streetBets: state.streetBets || {},
      folded: state.folded || {},
      allIn: state.allIn || {},
      lastAction: state.lastAction || null,
      showdown: state.showdown || null,
      myHand,
      isMyTurn,
      myToCall,
      myMinRaiseTo,
      myMaxBetTo,
      myCanCheck,
      winner,
      scores,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    const scores = { ...state.chips };
    const winner = [...state.players].sort((a, b) => scores[b] - scores[a])[0] || null;
    return { winner, scores };
  },
};
