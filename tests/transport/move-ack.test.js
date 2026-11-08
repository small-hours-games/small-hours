// A phone tags each move with an id. The mover's state carries it back (ack), and a move
// resent after a reconnect is not played twice.
import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/engine/engine.js';
import { handleGameAction } from '../../src/transport/handlers/game.js';
import shithead from '../../games/shithead/rules.js';

function setup() {
  const room = {
    code: 'TEST',
    game: createGame(shithead, { players: ['p1', 'p2'], config: {} }),
    players: new Map([['p1', {}], ['p2', {}]]),
  };
  const toPlayers = [];
  const ctx = {
    send: (ws, msg) => toPlayers.push({ id: 'ws', msg }),
    broadcastToRoom() {},
    sendToPlayer: (id, msg) => toPlayers.push({ id, msg }),
    roomGameTypes: new Map(),
    schedulePhaseTimer() {},
    getPlayerNames: () => ({}),
  };
  return { room, ctx, toPlayers };
}

describe('move acknowledgement', () => {
  it('acks the move to the mover only, and keeps the id out of the engine', () => {
    const { room, ctx, toPlayers } = setup();
    const hand = room.game.state.hands.p1[0].id;
    const faceUp = room.game.state.faceUp.p1[0].id;
    handleGameAction({}, { playerId: 'p1' }, room, { action: { type: 'swapCard', handCardId: hand, faceUpCardId: faceUp, moveId: 'abc-1' } }, ctx);
    const states = toPlayers.filter(s => s.msg.type === 'GAME_STATE');
    expect(states.find(s => s.id === 'p1').msg.ack).toBe('abc-1');
    expect(states.find(s => s.id === 'p2').msg.ack).toBeUndefined();
    expect(room.game.state.hands.p1.map(c => c.id)).toContain(faceUp);
  });

  it('does not play a resent move twice', () => {
    const { room, ctx, toPlayers } = setup();
    const hand = room.game.state.hands.p1[0].id;
    const faceUp = room.game.state.faceUp.p1[0].id;
    const msg = { action: { type: 'swapCard', handCardId: hand, faceUpCardId: faceUp, moveId: 'abc-2' } };
    handleGameAction({}, { playerId: 'p1' }, room, msg, ctx);
    const after = room.game.state;
    toPlayers.length = 0;
    handleGameAction({}, { playerId: 'p1' }, room, msg, ctx);   // the same move again after a reconnect
    expect(room.game.state).toBe(after);                         // nothing swapped back
    expect(toPlayers).toHaveLength(1);
    expect(toPlayers[0]).toMatchObject({ id: 'p1', msg: { type: 'GAME_STATE', ack: 'abc-2' } });
    expect(toPlayers.some(s => s.msg.type === 'ERROR')).toBe(false);
  });
});
