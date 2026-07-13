import { describe, it, expect } from 'vitest';
import { Room } from '../../src/session/room.js';
import { createGame, processAction, checkEnd } from '../../src/engine/engine.js';
import hilow from '../../src/engine/games/hilow.js';

const ALL_GAMES = ['number-guess', 'quiz', 'spy', 'shithead', 'gin-rummy', 'skogai', 'question-form', 'template', 'hilow'];

describe('all games are registered and startable', () => {
  it('hilow and spy are registered with correct metadata', () => {
    const r = new Room('T1');
    r.addPlayer('A'); r.addPlayer('B'); r.addPlayer('C');
    const avail = r.availableGames().map(g => g.type);
    expect(avail).toContain('hilow');
    expect(avail).toContain('spy');
  });

  it('every game type can be instantiated via the engine', async () => {
    for (const type of ALL_GAMES) {
      const r = new Room('R_' + type);
      // gin-rummy needs exactly 2; spy needs >=3; others fine with 2-3.
      const players = type === 'gin-rummy' ? ['A', 'B'] : ['A', 'B', 'C'];
      for (const p of players) r.addPlayer(p);
      const game = await r.startGame(type, {});
      expect(game, `game ${type} should start`).not.toBeNull();
      expect(r.game).not.toBeNull();
      r.endGame();
    }
  });

  it('hilow can be played to a winner and produced winner in endIf', () => {
    let g = createGame(hilow, { players: ['A', 'B'], config: { target: 1 } });
    let guard = 0;
    while (!checkEnd(g) && guard < 300) {
      const s = g.state;
      const active = s.activePlayer;
      const guesser = s.players.find(p => p !== active);
      g = processAction(g, { type: 'guess', playerId: guesser, direction: 'higher' }).game;
      guard++;
    }
    const end = checkEnd(g);
    expect(end).not.toBeNull();
    expect(end.winner).toBeTruthy();
  });
});
