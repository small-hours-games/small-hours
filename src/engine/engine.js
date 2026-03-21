// Small Hours - Core Game Engine
// Pure functions, no I/O. Immutable state.

let gameCounter = 0;

function generateId() {
  gameCounter += 1;
  return `game_${Date.now()}_${gameCounter}`;
}

/**
 * Create a new game instance from a game definition and context.
 *
 * @param {object} gameDefinition - { setup, actions, view, endIf }
 * @param {object} ctx - { players, config }
 * @returns {object} game instance { id, state, definition }
 */
export function createGame(gameDefinition, ctx) {
  const state = gameDefinition.setup(ctx);
  return {
    id: generateId(),
    state,
    definition: gameDefinition,
  };
}

/**
 * Process a player action and return the updated game plus any events.
 *
 * @param {object} game - current game instance
 * @param {object} action - { type, playerId, ...payload }
 * @returns {object} { game: updatedGame, events: [...] }
 */
export function processAction(game, action) {
  const { definition, state } = game;
  const { type, ...payload } = action;

  const handler = definition.actions[type];
  if (!handler) {
    return {
      game,
      events: [{ type: 'error', message: `Unknown action: ${type}` }],
    };
  }

  const result = handler(state, payload);

  return {
    game: {
      ...game,
      state: result.state,
    },
    events: result.events || [],
  };
}

/**
 * Get the view of the game state visible to a specific player.
 *
 * @param {object} game - current game instance
 * @param {string} playerId - the player requesting the view
 * @returns {object} player-visible state
 */
export function getView(game, playerId) {
  return game.definition.view(game.state, playerId);
}

/**
 * Check if the game has ended.
 *
 * @param {object} game - current game instance
 * @returns {object|null} null if ongoing, or { winner, scores }
 */
export function checkEnd(game) {
  return game.definition.endIf(game.state);
}
