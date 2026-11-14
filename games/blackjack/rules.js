import { createDeck } from '../../src/cards/deck.js';

const STARTING_CHIPS = 1000;
const RESCUE_CHIPS = 100;
const MIN_BET = 10;
const DEFAULT_ROUNDS = 5;
const RESHUFFLE_THRESHOLD = 40;

function error(state, playerId, message) {
  return { state, events: [{ type: 'error', playerId, message }] };
}

export function cardPoint(card) {
  if (card.rank === 1) return 11;
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function evalHand(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) aces++;
    total += cardPoint(c);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return {
    total,
    soft: aces > 0,
    isBlackjack: cards.length === 2 && total === 21,
    isBusted: total > 21,
  };
}

function drawCard(shoe) {
  const next = shoe.length > 0 ? [...shoe] : createDeck({ decks: 4, aceHigh: false });
  const card = next.pop();
  return { card, shoe: next };
}

function ensureShoe(shoe) {
  if (shoe.length >= RESHUFFLE_THRESHOLD) return shoe;
  return createDeck({ decks: 4, aceHigh: false });
}

function makeHand(cards, bet, { fromSplit = false } = {}) {
  const ev = evalHand(cards);
  const isNatural = !fromSplit && ev.isBlackjack;
  return {
    cards,
    bet,
    status: isNatural ? 'blackjack' : ev.isBusted ? 'busted' : ev.total === 21 ? 'stood' : 'active',
    doubled: false,
    fromSplit,
    outcome: null,
    payout: 0,
  };
}

function findNextTurn(players, seats, startPlayerIdx = 0, startHandIdx = 0) {
  for (let offset = 0; offset < players.length; offset++) {
    const pIdx = (startPlayerIdx + offset) % players.length;
    const id = players[pIdx];
    const seat = seats[id];
    const hStart = offset === 0 ? startHandIdx : 0;
    for (let hIdx = hStart; hIdx < seat.hands.length; hIdx++) {
      if (seat.hands[hIdx].status === 'active') {
        return { playerId: id, playerIndex: pIdx, handIndex: hIdx };
      }
    }
  }
  return null;
}

function playDealerAndSettle(state, { dealerNatural = false } = {}) {
  let shoe = [...state.shoe];
  let dealerHand = [...state.dealerHand];

  const hasLiveStoodHand = state.players.some(id =>
    state.seats[id].hands.some(h => h.status === 'stood')
  );

  if (!dealerNatural && hasLiveStoodHand) {
    while (evalHand(dealerHand).total < 17) {
      if (shoe.length === 0) shoe = createDeck({ decks: 4, aceHigh: false });
      const drawn = drawCard(shoe);
      dealerHand.push(drawn.card);
      shoe = drawn.shoe;
    }
  }

  const dealerEval = evalHand(dealerHand);
  const nextSeats = {};

  for (const id of state.players) {
    const seat = state.seats[id];
    let totalPayout = 0;
    let totalBet = 0;

    const settledHands = seat.hands.map(hand => {
      totalBet += hand.bet;
      const ev = evalHand(hand.cards);
      let outcome = 'lose';
      let payout = 0;

      if (hand.status === 'busted') {
        outcome = 'bust';
        payout = 0;
      } else if (hand.status === 'blackjack') {
        if (dealerEval.isBlackjack) {
          outcome = 'push';
          payout = hand.bet;
        } else {
          outcome = 'blackjack';
          payout = hand.bet + Math.floor(hand.bet * 1.5);
        }
      } else if (dealerEval.isBlackjack) {
        outcome = 'lose';
        payout = 0;
      } else if (dealerEval.isBusted || ev.total > dealerEval.total) {
        outcome = 'win';
        payout = hand.bet * 2;
      } else if (ev.total === dealerEval.total) {
        outcome = 'push';
        payout = hand.bet;
      } else {
        outcome = 'lose';
        payout = 0;
      }

      totalPayout += payout;
      return { ...hand, outcome, payout };
    });

    nextSeats[id] = {
      ...seat,
      chips: seat.chips + totalPayout,
      hands: settledHands,
      lastNet: totalPayout - totalBet,
    };
  }

  const finished = state.round >= state.maxRounds;
  return {
    ...state,
    shoe,
    dealerHand,
    seats: nextSeats,
    turn: null,
    activeHandIndex: 0,
    phase: finished ? 'finished' : 'settled',
  };
}

function dealRound(state) {
  let shoe = state.shoe;
  const handsByPlayer = Object.fromEntries(state.players.map(id => [id, []]));
  const dealerHand = [];

  for (let r = 0; r < 2; r++) {
    for (const id of state.players) {
      const drawn = drawCard(shoe);
      handsByPlayer[id].push(drawn.card);
      shoe = drawn.shoe;
    }
    const dDrawn = drawCard(shoe);
    dealerHand.push(dDrawn.card);
    shoe = dDrawn.shoe;
  }

  const nextSeats = {};
  for (const id of state.players) {
    const seat = state.seats[id];
    nextSeats[id] = {
      ...seat,
      hands: [makeHand(handsByPlayer[id], seat.pendingBet)],
      pendingBet: 0,
      lastNet: 0,
    };
  }

  const nextState = {
    ...state,
    shoe,
    dealerHand,
    seats: nextSeats,
  };

  if (evalHand(dealerHand).isBlackjack) {
    return playDealerAndSettle(nextState, { dealerNatural: true });
  }

  const firstTurn = findNextTurn(state.players, nextSeats, 0, 0);
  if (!firstTurn) {
    return playDealerAndSettle(nextState);
  }

  return {
    ...nextState,
    phase: 'playing',
    turn: firstTurn.playerId,
    activeHandIndex: firstTurn.handIndex,
  };
}

function advanceAfterHand(state, playerId, handIndex) {
  const pIdx = state.players.indexOf(playerId);
  const next = findNextTurn(state.players, state.seats, pIdx, handIndex);
  if (!next) {
    return playDealerAndSettle(state);
  }
  return {
    ...state,
    turn: next.playerId,
    activeHandIndex: next.handIndex,
  };
}

function updateSeatHand(state, playerId, handIndex, updater, extraSeat = {}) {
  const seat = state.seats[playerId];
  const nextHands = seat.hands.map((h, i) => (i === handIndex ? updater(h) : h));
  return {
    ...state,
    seats: {
      ...state.seats,
      [playerId]: { ...seat, ...extraSeat, hands: nextHands },
    },
  };
}

export default {
  setup({ players, config = {} }) {
    const maxRounds = Math.max(1, Number(config.rounds) || DEFAULT_ROUNDS);
    const shoe = createDeck({ decks: 4, aceHigh: false });
    const seats = Object.fromEntries(
      players.map(id => [
        id,
        { chips: STARTING_CHIPS, pendingBet: 0, betPlaced: false, hands: [], lastNet: 0 },
      ])
    );

    return {
      players: [...players],
      shoe,
      dealerHand: [],
      seats,
      phase: 'betting',
      round: 1,
      maxRounds,
      turn: null,
      activeHandIndex: 0,
    };
  },

  actions: {
    placeBet(state, { playerId, amount }) {
      if (state.phase !== 'betting') return error(state, playerId, 'Betting is closed.');
      const seat = state.seats[playerId];
      if (!seat) return error(state, playerId, 'Unknown player.');
      if (seat.betPlaced) return error(state, playerId, 'You already placed your bet.');

      const bet = Math.floor(Number(amount));
      const minAllowed = Math.min(MIN_BET, seat.chips);
      if (!Number.isFinite(bet) || bet < minAllowed || bet > seat.chips) {
        return error(state, playerId, `Bet must be between ${minAllowed} and ${seat.chips}.`);
      }

      const nextState = {
        ...state,
        seats: {
          ...state.seats,
          [playerId]: {
            ...seat,
            chips: seat.chips - bet,
            pendingBet: bet,
            betPlaced: true,
          },
        },
      };

      const allBet = nextState.players.every(id => nextState.seats[id].betPlaced);
      if (!allBet) {
        return { state: nextState, events: [] };
      }

      return { state: dealRound(nextState), events: [] };
    },

    hit(state, { playerId }) {
      if (state.phase !== 'playing') return error(state, playerId, 'Not in playing phase.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const hIdx = state.activeHandIndex;
      const hand = state.seats[playerId].hands[hIdx];
      if (!hand || hand.status !== 'active') return error(state, playerId, 'Hand is not active.');

      const { card, shoe } = drawCard(state.shoe);
      const nextCards = [...hand.cards, card];
      const ev = evalHand(nextCards);
      const status = ev.isBusted ? 'busted' : ev.total === 21 ? 'stood' : 'active';

      let nextState = updateSeatHand({ ...state, shoe }, playerId, hIdx, h => ({
        ...h,
        cards: nextCards,
        status,
      }));

      if (status !== 'active') {
        nextState = advanceAfterHand(nextState, playerId, hIdx);
      }

      return { state: nextState, events: [] };
    },

    stand(state, { playerId }) {
      if (state.phase !== 'playing') return error(state, playerId, 'Not in playing phase.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const hIdx = state.activeHandIndex;
      const hand = state.seats[playerId].hands[hIdx];
      if (!hand || hand.status !== 'active') return error(state, playerId, 'Hand is not active.');

      let nextState = updateSeatHand(state, playerId, hIdx, h => ({ ...h, status: 'stood' }));
      nextState = advanceAfterHand(nextState, playerId, hIdx);
      return { state: nextState, events: [] };
    },

    double(state, { playerId }) {
      if (state.phase !== 'playing') return error(state, playerId, 'Not in playing phase.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const seat = state.seats[playerId];
      const hIdx = state.activeHandIndex;
      const hand = seat.hands[hIdx];
      if (!hand || hand.status !== 'active' || hand.cards.length !== 2) {
        return error(state, playerId, 'Can only double on your first two cards.');
      }
      if (seat.chips < hand.bet) {
        return error(state, playerId, 'Not enough chips to double.');
      }

      const { card, shoe } = drawCard(state.shoe);
      const nextCards = [...hand.cards, card];
      const ev = evalHand(nextCards);
      const status = ev.isBusted ? 'busted' : 'stood';

      let nextState = updateSeatHand(
        { ...state, shoe },
        playerId,
        hIdx,
        h => ({ ...h, cards: nextCards, bet: h.bet * 2, doubled: true, status }),
        { chips: seat.chips - hand.bet }
      );

      nextState = advanceAfterHand(nextState, playerId, hIdx);
      return { state: nextState, events: [] };
    },

    split(state, { playerId }) {
      if (state.phase !== 'playing') return error(state, playerId, 'Not in playing phase.');
      if (state.turn !== playerId) return error(state, playerId, 'Not your turn.');

      const seat = state.seats[playerId];
      const hIdx = state.activeHandIndex;
      const hand = seat.hands[hIdx];
      if (!hand || hand.status !== 'active' || hand.cards.length !== 2) {
        return error(state, playerId, 'Can only split a two-card hand.');
      }
      if (seat.hands.length >= 2) {
        return error(state, playerId, 'Only one split per round.');
      }
      if (cardPoint(hand.cards[0]) !== cardPoint(hand.cards[1])) {
        return error(state, playerId, 'Cards must have the same value to split.');
      }
      if (seat.chips < hand.bet) {
        return error(state, playerId, 'Not enough chips to split.');
      }

      let shoe = state.shoe;
      const d1 = drawCard(shoe);
      shoe = d1.shoe;
      const d2 = drawCard(shoe);
      shoe = d2.shoe;

      const h1 = makeHand([hand.cards[0], d1.card], hand.bet, { fromSplit: true });
      const h2 = makeHand([hand.cards[1], d2.card], hand.bet, { fromSplit: true });

      let nextState = {
        ...state,
        shoe,
        seats: {
          ...state.seats,
          [playerId]: {
            ...seat,
            chips: seat.chips - hand.bet,
            hands: [h1, h2],
          },
        },
      };

      if (h1.status !== 'active') {
        nextState = advanceAfterHand(nextState, playerId, 0);
      }

      return { state: nextState, events: [] };
    },

    nextRound(state, { playerId }) {
      if (state.phase !== 'settled') return error(state, playerId, 'Round is not settled yet.');

      const shoe = ensureShoe(state.shoe);
      const nextSeats = {};
      for (const id of state.players) {
        const seat = state.seats[id];
        nextSeats[id] = {
          chips: seat.chips < MIN_BET ? seat.chips + RESCUE_CHIPS : seat.chips,
          pendingBet: 0,
          betPlaced: false,
          hands: [],
          lastNet: 0,
        };
      }

      return {
        state: {
          ...state,
          shoe,
          dealerHand: [],
          seats: nextSeats,
          phase: 'betting',
          round: state.round + 1,
          turn: null,
          activeHandIndex: 0,
        },
        events: [],
      };
    },
  },

  view(state, playerId) {
    const revealDealer = state.phase === 'settled' || state.phase === 'finished';
    const dealerCards = revealDealer
      ? state.dealerHand
      : state.dealerHand.length > 0
        ? [state.dealerHand[0]]
        : [];
    const dealerEval = revealDealer
      ? evalHand(state.dealerHand)
      : state.dealerHand.length > 0
        ? evalHand([state.dealerHand[0]])
        : { total: 0, soft: false, isBlackjack: false, isBusted: false };

    const seats = {};
    for (const id of state.players) {
      const s = state.seats[id];
      seats[id] = {
        chips: s.chips,
        pendingBet: s.pendingBet,
        betPlaced: s.betPlaced,
        lastNet: s.lastNet,
        hands: s.hands.map(h => ({
          ...h,
          ...evalHand(h.cards),
        })),
      };
    }

    const mySeat = seats[playerId] || null;
    const isMyTurn = state.phase === 'playing' && state.turn === playerId;
    let myCanDouble = false;
    let myCanSplit = false;
    if (isMyTurn && mySeat) {
      const activeHand = mySeat.hands[state.activeHandIndex];
      if (activeHand && activeHand.status === 'active') {
        myCanDouble = activeHand.cards.length === 2 && mySeat.chips >= activeHand.bet;
        myCanSplit =
          mySeat.hands.length < 2 &&
          activeHand.cards.length === 2 &&
          cardPoint(activeHand.cards[0]) === cardPoint(activeHand.cards[1]) &&
          mySeat.chips >= activeHand.bet;
      }
    }

    let winner = null;
    let scores = null;
    if (state.phase === 'finished') {
      scores = Object.fromEntries(state.players.map(id => [id, state.seats[id].chips]));
      winner = [...state.players].sort((a, b) => scores[b] - scores[a])[0] || null;
    }

    return {
      phase: state.phase,
      round: state.round,
      maxRounds: state.maxRounds,
      players: state.players,
      turn: state.turn,
      activeHandIndex: state.activeHandIndex,
      shoeCount: state.shoe.length,
      dealer: {
        cards: dealerCards,
        hiddenHole: !revealDealer && state.dealerHand.length > 1,
        ...dealerEval,
      },
      seats,
      mySeat,
      isMyTurn,
      myCanDouble,
      myCanSplit,
      winner,
      scores,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    const scores = Object.fromEntries(state.players.map(id => [id, state.seats[id].chips]));
    const winner = [...state.players].sort((a, b) => scores[b] - scores[a])[0] || null;
    return { winner, scores };
  },
};
