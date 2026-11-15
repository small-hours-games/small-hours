import { describe, it, expect, vi } from 'vitest';
import { handleSurrender, handleGameAction } from '../../src/transport/handlers/game.js';
import shithead from '../../games/shithead/rules.js';
import blackjack from '../../games/blackjack/rules.js';
import { createGame } from '../../src/engine/engine.js';

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
    schedulePhaseTimer: vi.fn(),
    scheduleBotTurn: vi.fn(),
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

  it('dispatches engine forfeit when a turn-holding human surrenders in 3-player Palace', () => {
    const ctx = makeMockCtx();
    const room = makeRoom([
      { id: 'p1', username: 'Alice', isAdmin: true },
      { id: 'p2', username: 'Bob' },
      { id: 'p3', username: 'Cy' },
    ]);
    let game = createGame(shithead, { players: ['p1', 'p2', 'p3'], config: {} });
    game = { ...game, state: { ...game.state, phase: 'play', currentPlayerIndex: 0 } };
    room.game = game;

    handleSurrender({}, { playerId: 'p1' }, room, {}, ctx);

    expect(room.game.state.surrendered?.p1).toBe(true);
    expect(room.game.state.players[room.game.state.currentPlayerIndex]).toBe('p2');
  });

  it('requires consensus readyNextRound on Blackjack before advancing unless admin forces nextRound', () => {
    const ctx = makeMockCtx();
    ctx.roomGameTypes.set('ABCD', 'blackjack');
    const room = makeRoom([
      { id: 'p1', username: 'Alice', isAdmin: true },
      { id: 'p2', username: 'Bob', isAdmin: false },
    ]);
    room.game = createGame(blackjack, { players: ['p1', 'p2'], config: {} });
    room.game.state = { ...room.game.state, phase: 'settled' };

    handleGameAction({}, { playerId: 'p2' }, room, { action: { type: 'readyNextRound' } }, ctx);
    expect(room.game.state.round).toBe(1);
    expect(room.game.state.nextReady?.p2).toBe(true);

    handleGameAction({}, { playerId: 'p1' }, room, { action: { type: 'readyNextRound' } }, ctx);
    expect(room.game.state.round).toBe(2);
  });
});
