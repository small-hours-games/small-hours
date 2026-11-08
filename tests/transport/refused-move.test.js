import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/engine/engine.js';
import { applyGameAction } from '../../src/transport/handlers/game.js';
import shithead from '../../games/shithead/rules.js';

function setup() {
  const room = {
    code: 'TEST',
    game: createGame(shithead, { players: ['p1', 'p2'], config: {} }),
    players: new Map([['p1', {}], ['p2', {}]]),
  };
  const toPlayers = [];
  const ctx = {
    broadcastToRoom() {},
    sendToPlayer: (id, msg) => toPlayers.push({ id, msg }),
    roomGameTypes: new Map(),
    schedulePhaseTimer() {},
    getPlayerNames: () => ({}),
  };
  return { room, ctx, toPlayers };
}

describe('a refused move', () => {
  it('tells only the player who made it, after their screen is redrawn', () => {
    const { room, ctx, toPlayers } = setup();
    applyGameAction(room, { type: 'playCards', playerId: 'p2', cardIds: ['nope'] }, ctx);

    const errors = toPlayers.filter(s => s.msg.type === 'ERROR');
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('p2');
    expect(errors[0].msg.message).toBe('Can only play cards during play phase');
    expect(toPlayers.map(s => s.msg.type)).toEqual(['GAME_STATE', 'GAME_STATE', 'ERROR']);
  });

  it('sends no error for a legal move', () => {
    const { room, ctx, toPlayers } = setup();
    const hand = room.game.state.hands.p1[0].id;
    const faceUp = room.game.state.faceUp.p1[0].id;
    applyGameAction(room, { type: 'swapCard', playerId: 'p1', handCardId: hand, faceUpCardId: faceUp }, ctx);
    expect(toPlayers.some(s => s.msg.type === 'ERROR')).toBe(false);
  });
});
