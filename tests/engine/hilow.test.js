import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import hilow from '../../src/engine/games/hilow.js';

describe('hilow (Högt/Lågt) engine', () => {
  it('sets up with a current card and zeroed scores', () => {
    const g = createGame(hilow, { players: ['alice', 'bob'], config: { target: 3 } });
    const v = getView(g, 'alice');
    expect(v.phase).toBe('guessing');
    expect(v.current).not.toBeNull();
    expect(v.target).toBe(3);
    expect(v.scores).toEqual({ alice: 0, bob: 0 });
    expect(v.activePlayer).toBe('alice');
    expect(v.isActive).toBe(true);
  });

  it('rejects guess from the active player', () => {
    const g = createGame(hilow, { players: ['alice', 'bob'], config: { target: 3 } });
    const r = processAction(g, { type: 'guess', playerId: 'alice', direction: 'higher' });
    expect(r.events[0].type).toBe('error');
  });

  it('rejects invalid direction', () => {
    const g = createGame(hilow, { players: ['alice', 'bob'], config: { target: 3 } });
    const r = processAction(g, { type: 'guess', playerId: 'bob', direction: 'sideways' });
    expect(r.events[0].type).toBe('error');
  });

  it('scores correct guesses and rotates active player', () => {
    const g0 = createGame(hilow, { players: ['alice', 'bob'], config: { target: 5 } });
    // Force a known deck so the next card is deterministic regardless of shuffle.
    const g = { ...g0, state: { ...g0.state } };
    // alice is active; bob guesses. Make the next card higher than current.
    const currentRank = g.state.current.rank;
    const nextRank = currentRank >= 14 ? 2 : currentRank + 1; // ensure higher unless at max
    // Inject a known next card of rank nextRank (suit irrelevant).
    const knownNext = { id: `next${nextRank}`, suit: 'h', rank: nextRank };
    g.state.deck.push(knownNext); // it will be popped last -> becomes "next"
    // Move it to top of deck (pop takes from end)
    g.state.deck = [...g.state.deck.slice(0, -1), g.state.deck[g.state.deck.length - 1]];

    const r = processAction(g, { type: 'guess', playerId: 'bob', direction: 'higher' });
    expect(r.game.state.lastResult).not.toBeNull();
    // If the forced card is actually higher, bob should score.
    if (nextRank > currentRank) {
      expect(r.game.state.scores.bob).toBe(1);
    }
    // Active player rotates to bob.
    expect(r.game.state.activePlayer).toBe('bob');
    expect(r.game.state.round).toBe(2);
  });

  it('ends when a player reaches the target', () => {
    let g = createGame(hilow, { players: ['alice', 'bob'], config: { target: 1 } });
    // Drive rounds until someone hits target by always guessing and rotating.
    let turns = 0;
    while (!checkEnd(g) && turns < 500) {
      const s = g.state;
      const active = s.activePlayer;
      const guesser = s.players.find(p => p !== active);
      // guess higher most of the time; correctness is random but target=1 means
      // the first correct guess ends it.
      g = processAction(g, { type: 'guess', playerId: guesser, direction: 'higher' }).game;
      turns++;
    }
    const over = checkEnd(g);
    expect(over).not.toBeNull();
    expect(over.winner).toBeTruthy();
    expect(g.state.phase).toBe('finished');
  });

  it('view hides nothing sensitive and exposes lastResult card views', () => {
    const g = createGame(hilow, { players: ['alice', 'bob'], config: { target: 5 } });
    const v = getView(g, 'bob');
    expect(v.current).toHaveProperty('label');
    expect(v.myGuess).toBeNull();
    expect(v.isActive).toBe(false);
  });
});
