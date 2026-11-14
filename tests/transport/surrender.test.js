import { describe, it, expect, vi } from 'vitest';
import { handleSurrender } from '../../src/transport/handlers/game.js';

function makeMockCtx() {
  const broadcasts = [];
  const sent = [];
  const roomGameTypes = new Map([['ABCD', 'shithead']]);
  return {
    broadcasts,
    sent,
    roomGameTypes,
    send: (_ws, msg) => sent.push(msg),
    sendToPlayer: (id, msg) => sent.push({ to: id, ...msg }),
    broadcastToRoom: (_code, msg) => broadcasts.push(msg),
    cancelPhaseTimer: vi.fn(),
    cancelRoundCountdown: vi.fn(),
    cancelBotTurn: vi.fn(),
    getPlayerNames: room => Object.fromEntries([...room.players.values()].map(p => [p.id, p.username])),
  };
}

function makeRoom(playerList, bots = []) {
  const players = new Map(playerList.map(p => [p.id, { ...p, connected: true }]));
  return {
    code: 'ABCD',
    players,
    bots,
    game: {
      id: 'g1',
      state: { phase: 'play' },
      definition: { view: (_s, id) => ({ phase: 'play', playerId: id }) },
    },
    endGame: vi.fn(function () { this.game = null; }),
    awardScores: vi.fn(),
    getState: () => ({ code: 'ABCD', players: [...players.values()] }),
  };
}

describe('handleSurrender', () => {
  it('returns solo + AI-bot games straight to the lobby', () => {
    const ctx = makeMockCtx();
    const room = makeRoom([{ id: 'p1', username: 'Alice' }], ['bot_1', 'bot_2']);

    handleSurrender({}, { playerId: 'p1' }, room, {}, ctx);

    expect(room.endGame).toHaveBeenCalledTimes(1);
    expect(ctx.cancelPhaseTimer).toHaveBeenCalledWith('ABCD');
    expect(ctx.cancelBotTurn).toHaveBeenCalledWith('ABCD');
    expect(ctx.broadcasts.some(m => m.type === 'SURRENDER_LOBBY' && m.playerId === 'p1')).toBe(true);
    expect(ctx.broadcasts.some(m => m.type === 'LOBBY_UPDATE')).toBe(true);
  });

  it('awards win to the remaining player in a 1v1 human game', () => {
    const ctx = makeMockCtx();
    const room = makeRoom([
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ]);

    handleSurrender({}, { playerId: 'p1' }, room, {}, ctx);

    expect(room.endGame).toHaveBeenCalledTimes(1);
    const hostEnd = ctx.broadcasts.find(m => m.type === 'GAME_STATE' && m.phase === 'finished');
    expect(hostEnd.winner).toBe('p2');
    expect(hostEnd.surrenderedBy).toBe('p1');
  });

  it('broadcasts PLAYER_SURRENDERED in 3+ player games until 1 human remains', () => {
    const ctx = makeMockCtx();
    const room = makeRoom([
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
      { id: 'p3', username: 'Cy' },
    ]);

    handleSurrender({}, { playerId: 'p1' }, room, {}, ctx);
    expect(room.endGame).not.toHaveBeenCalled();
    expect(ctx.broadcasts.some(m => m.type === 'PLAYER_SURRENDERED' && m.playerId === 'p1')).toBe(true);

    handleSurrender({}, { playerId: 'p2' }, room, {}, ctx);
    expect(room.endGame).toHaveBeenCalledTimes(1);
    const hostEnd = ctx.broadcasts.find(m => m.type === 'GAME_STATE' && m.phase === 'finished');
    expect(hostEnd.winner).toBe('p3');
  });
});
