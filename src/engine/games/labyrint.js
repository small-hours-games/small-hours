// Small Hours - Labyrint (maze race) party game
// Players take turns moving one step through a randomly generated maze grid
// (walls block movement). First to reach the exit wins. Each player has a
// private position; everyone sees the maze layout.
//
// Engine pattern: { setup, actions, view, endIf }.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function genMaze(size) {
  // Start with all walls, then carve a guaranteed path start -> exit, then
  // sprinkle a few extra open cells so it feels maze-like but is always solvable.
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const start = { x: 0, y: Math.floor(size / 2) };
  const exit = { x: size - 1, y: Math.floor(size / 2) };
  let { x, y } = start;
  const path = [[x, y]];
  while (x !== exit.x || y !== exit.y) {
    // Move one step toward exit (prefer x, sometimes y) through unvisited.
    if (x < exit.x && (y === exit.y || Math.random() < 0.7)) x++;
    else if (y < exit.y) y++;
    else if (y > exit.y) y--;
    else x++;
    path.push([x, y]);
  }
  for (const [px, py] of path) grid[py][px] = 0;
  // A few extra open cells for branching.
  for (let i = 0; i < size; i++) {
    const ox = Math.floor(Math.random() * size);
    const oy = Math.floor(Math.random() * size);
    grid[oy][ox] = 0;
  }
  return grid;
}

function key(x, y) { return `${x},${y}`; }

const labyrint = {
  setup({ players, config }) {
    const size = (config && config.size) || 9;
    const start = { x: 0, y: Math.floor(size / 2) };
    const exit = { x: size - 1, y: Math.floor(size / 2) };
    const maze = genMaze(size);
    maze[start.y][start.x] = 0;
    maze[exit.y][exit.x] = 0;

    const positions = {};
    let i = 0;
    for (const id of players) {
      // All players start at the maze entrance (same row as the carved path),
      // staggered slightly in x so they don't occupy the exact same cell.
      const sx = i === 0 ? 0 : Math.min(i, size - 2);
      positions[id] = { x: sx, y: start.y };
      maze[positions[id].y][positions[id].x] = 0;
      i++;
    }

    return {
      phase: 'move',
      players: [...players],
      order: [...players],
      size,
      maze,
      exit,
      positions,
      turn: players[0],
      round: 1,
      lastMove: null,
      winner: null,
    };
  },

  actions: {
    move(state, { playerId, direction }) {
      if (state.phase !== 'move') return { state };
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      const [dx, dy] = DIRS[direction] || [0, 0];
      const pos = state.positions[playerId];
      const nx = pos.x + dx, ny = pos.y + dy;
      if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) return { state, events: [{ type: 'error', playerId, message: 'Out of bounds' }] };
      if (state.maze[ny][nx] === 1) return { state, events: [{ type: 'error', playerId, message: 'Wall there' }] };

      const positions = { ...state.positions, [playerId]: { x: nx, y: ny } };
      if (nx === state.exit.x && ny === state.exit.y) {
        return { state: { ...state, positions, phase: 'finished', winner: playerId, lastMove: { playerId, direction } }, events: [{ type: 'reached', playerId }] };
      }
      const idx = state.order.indexOf(playerId);
      const nextTurn = state.order[(idx + 1) % state.order.length];
      return { state: { ...state, positions, turn: nextTurn, round: state.round + 1, lastMove: { playerId, direction } }, events: [{ type: 'moved', playerId, direction }] };
    },
  },

  view(state, playerId) {
    return {
      phase: state.phase,
      size: state.size,
      maze: state.maze,
      exit: state.exit,
      myPos: state.positions[playerId],
      turn: state.turn,
      isMyTurn: playerId === state.turn,
      round: state.round,
      // Positions of others (not self) so players can see each other.
      others: Object.fromEntries(state.players.filter(p => p !== playerId).map(p => [p, state.positions[p]])),
      lastMove: state.lastMove,
      winner: state.winner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return { winner: state.winner, scores: { [state.winner]: 1 } };
  },
};

export default labyrint;
