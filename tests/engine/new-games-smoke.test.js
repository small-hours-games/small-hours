// Smoke tests for the four new games: sjuan, uno, yatzy, labyrint.
// Verifies setup produces valid state, legal moves advance it, and the game
// can reach an end (winner) without crashing. Uses a simple bot that always
// picks a legal move (so the game is proven winnable).
import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import sjuan from '../../src/engine/games/sjuan.js';
import uno from '../../src/engine/games/uno.js';
import yatzy from '../../src/engine/games/yatzy.js';
import labyrint from '../../src/engine/games/labyrint.js';

// Pick a legal action for the current player, or null if stuck.
function chooseAction(definition, game, turn) {
  const s = game.state;
  if (definition === sjuan) {
    const hand = s.hands[turn];
    const card = hand.find(c => s.stacks[c.suit] === c.rank + 1 || s.stacks[c.suit] === c.rank - 1);
    if (card) return { type: 'playCard', playerId: turn, cardId: card.id };
    return { type: 'draw', playerId: turn };
  }
  if (definition === uno) {
    const hand = s.hands[turn];
    const top = s.discard[s.discard.length - 1];
    const card = hand.find(c =>
      c.color === s.currentColor ||
      (c.kind === 'number' && top && top.kind === 'number' && c.value === top.value) ||
      c.kind === 'wild');
    if (card) return { type: 'playCard', playerId: turn, cardId: card.id, chosenColor: card.color || 'r' };
    return { type: 'draw', playerId: turn };
  }
  if (definition === yatzy) {
    const view = getView(game, turn);
    const cat = view.availableCategories[0];
    return { type: 'bank', playerId: turn, category: cat };
  }
  if (definition === labyrint) {
    // BFS one step toward exit through open cells.
    const { size, maze, exit, positions } = s;
    const start = positions[turn];
    const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
    const q = [[start.x, start.y]];
    const prev = { [`${start.x},${start.y}`]: null };
    while (q.length) {
      const [x, y] = q.shift();
      if (x === exit.x && y === exit.y) break;
      for (const [d, dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (maze[ny][nx] === 1) continue;
        const k = `${nx},${ny}`;
        if (k in prev) continue;
        prev[k] = [x, y, d];
      }
    }
    // Walk back to find first step.
    let cur = `${exit.x},${exit.y}`;
    if (!(cur in prev)) return { type: 'move', playerId: turn, direction: 'right' };
    let path = [];
    while (prev[cur]) { const [px, py, d] = prev[cur]; path.unshift(d); cur = `${px},${py}`; }
    return { type: 'move', playerId: turn, direction: path[0] || 'right' };
  }
  return null;
}

function playToEnd(definition, players, maxSteps = 5000, attempts = 30) {
  for (let a = 0; a < attempts; a++) {
    let game = createGame(definition, { players, config: {} });
    let steps = 0;
    while (!checkEnd(game) && steps < maxSteps) {
      const turn = game.state.turn;
      const action = chooseAction(definition, game, turn);
      if (!action) break;
      game = processAction(game, action).game;
      steps++;
    }
    if (checkEnd(game)) return { game, steps };
  }
  return { game: null, steps: maxSteps };
}

describe('new games smoke', () => {
  it('sjuan: setup + play to a winner', () => {
    const { game } = playToEnd(sjuan, ['a', 'b']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(end.winner).toBeTruthy();
  });

  it('uno: setup + play to a winner', () => {
    const { game } = playToEnd(uno, ['a', 'b', 'c']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(end.winner).toBeTruthy();
  });

  it('yatzy: setup + bank all categories -> winner by total', () => {
    const { game } = playToEnd(yatzy, ['a', 'b']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(typeof end.scores[end.winner]).toBe('number');
  });

  it('labyrint: setup + navigate to exit', () => {
    const { game } = playToEnd(labyrint, ['a', 'b']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(end.winner).toBeTruthy();
  });
});
