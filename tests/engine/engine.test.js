// Unit tests for src/engine/engine.js
// Covers createGame, processAction, getView, checkEnd — including error paths.

import { describe, it, expect } from 'vitest';
import {
  createGame,
  processAction,
  getView,
  checkEnd,
} from '../../src/engine/engine.js';

// -----------------------------------------------------------------------
// Minimal stub game definition used across most tests
// -----------------------------------------------------------------------
const stubGame = {
  setup({ players, config }) {
    return {
      players,
      phase: 'playing',
      counter: config.startAt ?? 0,
      finished: false,
      winner: null,
    };
  },
  actions: {
    increment(state, { playerId, amount = 1 }) {
      if (state.finished) {
        return { state, events: [{ type: 'error', message: 'Game is over' }] };
      }
      const newCounter = state.counter + amount;
      const finished = newCounter >= 3;
      return {
        state: {
          ...state,
          counter: newCounter,
          phase: finished ? 'finished' : 'playing',
          finished,
          winner: finished ? playerId : null,
        },
        events: [{ type: 'incremented', playerId, counter: newCounter }],
      };
    },
    noop(state) {
      return { state, events: [] };
    },
  },
  view(state, playerId) {
    return {
      phase: state.phase,
      counter: state.counter,
      isPlayer: state.players.includes(playerId),
    };
  },
  endIf(state) {
    if (!state.finished) return null;
    return { winner: state.winner, scores: {} };
  },
};

// -----------------------------------------------------------------------
// createGame
// -----------------------------------------------------------------------
describe('createGame', () => {
  it('returns an object with id, state and definition', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    expect(game).toHaveProperty('id');
    expect(game).toHaveProperty('state');
    expect(game).toHaveProperty('definition');
  });

  it('id is a non-empty string', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    expect(typeof game.id).toBe('string');
    expect(game.id.length).toBeGreaterThan(0);
  });

  it('each call produces a unique id', () => {
    const g1 = createGame(stubGame, { players: ['p1'], config: {} });
    const g2 = createGame(stubGame, { players: ['p1'], config: {} });
    expect(g1.id).not.toBe(g2.id);
  });

  it('passes players and config to setup', () => {
    const game = createGame(stubGame, { players: ['p1', 'p2'], config: { startAt: 5 } });
    expect(game.state.players).toEqual(['p1', 'p2']);
    expect(game.state.counter).toBe(5);
  });

  it('stores the game definition on the returned object', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    expect(game.definition).toBe(stubGame);
  });

  it('state reflects setup initialisation', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    expect(game.state.phase).toBe('playing');
    expect(game.state.finished).toBe(false);
  });
});

// -----------------------------------------------------------------------
// processAction
// -----------------------------------------------------------------------
describe('processAction', () => {
  it('dispatches a known action and returns updated game + events', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: g2, events } = processAction(game, { type: 'increment', playerId: 'p1' });

    expect(g2.state.counter).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('incremented');
  });

  it('returns error event for unknown action type', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: same, events } = processAction(game, { type: 'unknownAction' });

    // State should be unchanged
    expect(same.state).toEqual(game.state);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/Unknown action/);
  });

  it('game id is preserved after action', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: g2 } = processAction(game, { type: 'noop', playerId: 'p1' });
    expect(g2.id).toBe(game.id);
  });

  it('definition is preserved after action', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: g2 } = processAction(game, { type: 'noop', playerId: 'p1' });
    expect(g2.definition).toBe(game.definition);
  });

  it('passes extra payload fields to the action handler', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: g2 } = processAction(game, { type: 'increment', playerId: 'p1', amount: 2 });
    expect(g2.state.counter).toBe(2);
  });

  it('does not mutate the original game', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const originalCounter = game.state.counter;
    processAction(game, { type: 'increment', playerId: 'p1' });
    expect(game.state.counter).toBe(originalCounter);
  });

  it('returns empty events array when action has none', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { events } = processAction(game, { type: 'noop', playerId: 'p1' });
    expect(events).toEqual([]);
  });

  it('action-level error still returns original game object', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    // Force finished state by incrementing to 3
    let g = game;
    g = processAction(g, { type: 'increment', playerId: 'p1', amount: 3 }).game;
    const { game: unchanged, events } = processAction(g, { type: 'increment', playerId: 'p1' });
    expect(unchanged.state).toEqual(g.state);
    expect(events[0].type).toBe('error');
  });
});

// -----------------------------------------------------------------------
// getView
// -----------------------------------------------------------------------
describe('getView', () => {
  it('returns the view for a known player', () => {
    const game = createGame(stubGame, { players: ['p1', 'p2'], config: {} });
    const view = getView(game, 'p1');
    expect(view.phase).toBe('playing');
    expect(view.isPlayer).toBe(true);
  });

  it('returns view for a player not in the state (isPlayer false)', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const view = getView(game, 'spectator');
    expect(view.isPlayer).toBe(false);
  });

  it('view reflects updated state after action', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: g2 } = processAction(game, { type: 'increment', playerId: 'p1' });
    const view = getView(g2, 'p1');
    expect(view.counter).toBe(1);
  });
});

// -----------------------------------------------------------------------
// checkEnd
// -----------------------------------------------------------------------
describe('checkEnd', () => {
  it('returns null while game is not over', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    expect(checkEnd(game)).toBeNull();
  });

  it('returns result object when game has ended', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const { game: done } = processAction(game, { type: 'increment', playerId: 'p1', amount: 3 });
    const result = checkEnd(done);
    expect(result).not.toBeNull();
    expect(result.winner).toBe('p1');
    expect(result).toHaveProperty('scores');
  });

  it('does not mutate game state', () => {
    const game = createGame(stubGame, { players: ['p1'], config: {} });
    const stateBefore = JSON.stringify(game.state);
    checkEnd(game);
    expect(JSON.stringify(game.state)).toBe(stateBefore);
  });
});
