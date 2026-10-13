import { describe, it, expect } from 'vitest';
import labyrint from '../../src/engine/games/labyrint.js';
import { createTestGame, act, viewFor, isOver } from './game-harness.js';

// Build a fully open size×size maze for deterministic movement tests.
function openMaze(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

// Return a game with an open 5×5 maze and controlled positions.
function openGame(players, overrides = {}) {
  const size = 5;
  const game = createTestGame(labyrint, players, { size });
  return {
    ...game, state: {
      ...game.state,
      maze: openMaze(size),
      size,
      exit: { x: 4, y: 2 },
      positions: Object.fromEntries(players.map((p, i) => [p, { x: i, y: 2 }])),
      turn: players[0],
      phase: 'move',
      ...overrides,
    },
  };
}

describe('Labyrint - setup', () => {
  it('initializes with move phase and default 9×9 maze', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    expect(game.state.phase).toBe('move');
    expect(game.state.size).toBe(9);
    expect(game.state.players).toEqual(['p1', 'p2']);
    expect(game.state.turn).toBe('p1');
    expect(game.state.winner).toBeNull();
  });

  it('maze grid is size×size with only 0s and 1s', () => {
    const game = createTestGame(labyrint, ['p1']);
    const { maze, size } = game.state;
    expect(maze).toHaveLength(size);
    for (const row of maze) {
      expect(row).toHaveLength(size);
      for (const cell of row) expect([0, 1]).toContain(cell);
    }
  });

  it('start and exit cells are always open (0)', () => {
    const game = createTestGame(labyrint, ['p1']);
    const { maze, size, exit } = game.state;
    const startY = Math.floor(size / 2);
    expect(maze[startY][0]).toBe(0);
    expect(maze[exit.y][exit.x]).toBe(0);
  });

  it('exit is at the right edge of the maze', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    expect(game.state.exit.x).toBe(game.state.size - 1);
  });

  it('first player starts at x=0', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    expect(game.state.positions.p1.x).toBe(0);
  });

  it('endIf returns null at start', () => {
    expect(isOver(createTestGame(labyrint, ['p1', 'p2']))).toBeNull();
  });
});

describe('Labyrint - move action: valid moves', () => {
  it('moves player right and passes turn', () => {
    const game = openGame(['p1', 'p2']);
    const { game: g2, events } = act(game, 'move', 'p1', { direction: 'right' });
    expect(g2.state.positions.p1).toEqual({ x: 1, y: 2 });
    expect(g2.state.turn).toBe('p2');
    expect(events[0].type).toBe('moved');
    expect(events[0].direction).toBe('right');
  });

  it('moves player down', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, positions: { p1: { x: 2, y: 1 }, p2: { x: 0, y: 2 } } } };
    const { game: g2 } = act(g, 'move', 'p1', { direction: 'down' });
    expect(g2.state.positions.p1).toEqual({ x: 2, y: 2 });
  });

  it('moves player up', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, positions: { p1: { x: 2, y: 2 }, p2: { x: 0, y: 0 } } } };
    const { game: g2 } = act(g, 'move', 'p1', { direction: 'up' });
    expect(g2.state.positions.p1).toEqual({ x: 2, y: 1 });
  });

  it('increments round counter on each move', () => {
    const game = openGame(['p1', 'p2']);
    const roundBefore = game.state.round;
    const { game: g2 } = act(game, 'move', 'p1', { direction: 'right' });
    expect(g2.state.round).toBe(roundBefore + 1);
  });

  it('wraps turn from last player back to first', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, turn: 'p2', positions: { p1: { x: 0, y: 2 }, p2: { x: 2, y: 2 } } } };
    const { game: g2 } = act(g, 'move', 'p2', { direction: 'left' });
    expect(g2.state.turn).toBe('p1');
  });
});

describe('Labyrint - move action: invalid moves', () => {
  it('rejects move when not your turn', () => {
    const game = openGame(['p1', 'p2']);
    const { events } = act(game, 'move', 'p2', { direction: 'right' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Not your turn');
  });

  it('rejects move out of bounds (left edge)', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, positions: { p1: { x: 0, y: 2 }, p2: { x: 2, y: 2 } } } };
    const { events } = act(g, 'move', 'p1', { direction: 'left' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Out of bounds');
  });

  it('rejects move out of bounds (top edge)', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, positions: { p1: { x: 2, y: 0 }, p2: { x: 0, y: 2 } } } };
    const { events } = act(g, 'move', 'p1', { direction: 'up' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Out of bounds');
  });

  it('rejects move into a wall cell', () => {
    const game = openGame(['p1', 'p2']);
    const maze = openMaze(5);
    maze[1][2] = 1; // wall directly above (2,2)
    const g = {
      ...game, state: {
        ...game.state,
        maze,
        positions: { p1: { x: 2, y: 2 }, p2: { x: 0, y: 2 } },
      },
    };
    const { events } = act(g, 'move', 'p1', { direction: 'up' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Wall there');
  });

  it('ignores move when game is already finished', () => {
    const game = openGame(['p1', 'p2']);
    const g = { ...game, state: { ...game.state, phase: 'finished', winner: 'p2' } };
    const { game: g2 } = act(g, 'move', 'p1', { direction: 'right' });
    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBe('p2');
  });
});

describe('Labyrint - reaching the exit', () => {
  it('wins game when player reaches the exit', () => {
    const game = openGame(['p1', 'p2'], { positions: { p1: { x: 3, y: 2 }, p2: { x: 0, y: 2 } } });
    const { game: g2 } = act(game, 'move', 'p1', { direction: 'right' });
    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBe('p1');
  });

  it('endIf returns winner and scores on finish', () => {
    const game = openGame(['p1', 'p2'], { positions: { p1: { x: 3, y: 2 }, p2: { x: 0, y: 2 } } });
    const { game: final } = act(game, 'move', 'p1', { direction: 'right' });
    const end = isOver(final);
    expect(end).toMatchObject({ winner: 'p1', scores: { p1: 1 } });
  });

  it('emits reached event on exit', () => {
    const game = openGame(['p1', 'p2'], { positions: { p1: { x: 3, y: 2 }, p2: { x: 0, y: 2 } } });
    const { events } = act(game, 'move', 'p1', { direction: 'right' });
    expect(events[0].type).toBe('reached');
    expect(events[0].playerId).toBe('p1');
  });
});

describe('Labyrint - view', () => {
  it('shows maze, own position, exit, and turn info', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.phase).toBe('move');
    expect(view.size).toBe(9);
    expect(view.maze).toBeTruthy();
    expect(view.myPos).toEqual(game.state.positions.p1);
    expect(view.exit).toEqual(game.state.exit);
    expect(view.isMyTurn).toBe(true);
    expect(view.round).toBe(1);
  });

  it('shows other players positions but not own under others', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.others).toHaveProperty('p2');
    expect(view.others).not.toHaveProperty('p1');
  });

  it('isMyTurn is false for non-active player', () => {
    const game = createTestGame(labyrint, ['p1', 'p2']);
    expect(viewFor(game, 'p2').isMyTurn).toBe(false);
  });

  it('shows winner after game ends', () => {
    const game = openGame(['p1', 'p2'], { positions: { p1: { x: 3, y: 2 }, p2: { x: 0, y: 2 } } });
    const { game: final } = act(game, 'move', 'p1', { direction: 'right' });
    const view = viewFor(final, 'p2');
    expect(view.winner).toBe('p1');
    expect(view.phase).toBe('finished');
  });
});
