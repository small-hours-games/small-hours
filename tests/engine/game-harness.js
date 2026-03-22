// Runtime game test harness
// Drives any game definition through the engine API for integration testing.

import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';

export function createTestGame(gameDefinition, players = ['p1', 'p2'], config = {}) {
  return createGame(gameDefinition, { players, config });
}

export function act(game, type, playerId, payload = {}) {
  return processAction(game, { type, playerId, ...payload });
}

export function actChain(game, actions) {
  let current = game;
  const allEvents = [];
  for (const [type, playerId, payload] of actions) {
    const result = act(current, type, playerId, payload || {});
    current = result.game;
    allEvents.push(...result.events);
  }
  return { game: current, events: allEvents };
}

export function viewFor(game, playerId) {
  return getView(game, playerId);
}

export function isOver(game) {
  return checkEnd(game);
}

export function playUntilEnd(game, actionFn, maxTurns = 100) {
  let current = game;
  let turns = 0;
  while (!isOver(current) && turns < maxTurns) {
    const action = actionFn(current, turns);
    if (!action) break;
    const [type, playerId, payload] = action;
    current = act(current, type, playerId, payload || {}).game;
    turns++;
  }
  return { game: current, turns };
}
