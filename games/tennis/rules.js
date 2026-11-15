// Small Hours Tennis — 3D motion-controlled arcade tennis.
// TV runs 60 FPS court & ball physics; server tracks tennis points, games, and match winner.

const POINT_LABELS = ['0', '15', '30', '40'];

function formatTennisScore(ptsA, ptsB) {
  if (ptsA >= 3 && ptsB >= 3) {
    if (ptsA === ptsB) return ['40', '40'];
    return ptsA > ptsB ? ['AD', '40'] : ['40', 'AD'];
  }
  return [POINT_LABELS[Math.min(3, ptsA)] || '0', POINT_LABELS[Math.min(3, ptsB)] || '0'];
}

function gamesToWin(bestOf) {
  return Math.floor(bestOf / 2) + 1;
}

export default {
  setup({ players, config = {} }) {
    const ids = players.map(p => (typeof p === 'string' ? p : (p.id ?? p.playerId)));
    const bestOf = [1, 3, 5].includes(Number(config.bestOf)) ? Number(config.bestOf) : 3;
    const points = {};
    const games = {};
    const scores = {};
    for (const id of ids) {
      points[id] = 0;
      games[id] = 0;
      scores[id] = 0;
    }

    return {
      phase: 'playing', // playing | finished
      players: ids,
      bestOf,
      gamesToWin: gamesToWin(bestOf),
      serverIndex: 0,
      points,
      games,
      scores,
      pointSerial: 0,
      lastPointWinner: null,
      lastCall: null,
      winner: null,
    };
  },

  actions: {
    reportPoint(state, { winnerId, call = 'POINT', serial }) {
      if (state.phase !== 'playing') return { state, events: [] };
      if (!state.players.includes(winnerId)) return { state, events: [] };
      if (serial != null && Number(serial) <= state.pointSerial) return { state, events: [] };

      const p1 = state.players[0];
      const p2 = state.players[1];
      if (!p1 || !p2) return { state, events: [] };

      const loserId = winnerId === p1 ? p2 : p1;
      const nextPoints = { ...state.points };
      const nextGames = { ...state.games };
      const nextScores = { ...state.scores };

      nextPoints[winnerId] = (nextPoints[winnerId] || 0) + 1;
      const wPts = nextPoints[winnerId];
      const lPts = nextPoints[loserId] || 0;

      let gameWon = false;
      let nextServerIndex = state.serverIndex;
      if (wPts >= 4 && wPts - lPts >= 2) {
        gameWon = true;
        nextGames[winnerId] = (nextGames[winnerId] || 0) + 1;
        nextPoints[p1] = 0;
        nextPoints[p2] = 0;
        nextServerIndex = (state.serverIndex + 1) % 2;
      }

      // Session score: 1 pt per rally won + 3 bonus pts per game won
      nextScores[winnerId] = (nextScores[winnerId] || 0) + 1 + (gameWon ? 3 : 0);

      const matchWinner = nextGames[winnerId] >= state.gamesToWin ? winnerId : null;
      return {
        state: {
          ...state,
          phase: matchWinner ? 'finished' : 'playing',
          serverIndex: nextServerIndex,
          points: nextPoints,
          games: nextGames,
          scores: nextScores,
          pointSerial: serial != null ? Number(serial) : state.pointSerial + 1,
          lastPointWinner: winnerId,
          lastCall: String(call || 'POINT').slice(0, 32),
          winner: matchWinner,
        },
        events: [
          { type: 'pointScored', winnerId, gameWon, call },
          ...(matchWinner ? [{ type: 'gameEnded', winnerId: matchWinner }] : []),
        ],
      };
    },

    // Fallback/manual swing action over WS when WebRTC DataChannel is unavailable
    swing(state, { playerId }) {
      if (state.phase !== 'playing' || !state.players.includes(playerId)) return { state, events: [] };
      return { state, events: [] };
    },
  },

  view(state) {
    const p1 = state.players[0];
    const p2 = state.players[1];
    const [label1, label2] = formatTennisScore(state.points[p1] || 0, state.points[p2] || 0);
    return {
      phase: state.phase,
      players: state.players,
      bestOf: state.bestOf,
      gamesToWin: state.gamesToWin,
      serverId: state.players[state.serverIndex] || p1,
      points: state.points,
      pointLabels: { [p1]: label1, [p2]: label2 },
      games: state.games,
      scores: state.scores,
      pointSerial: state.pointSerial,
      lastPointWinner: state.lastPointWinner,
      lastCall: state.lastCall,
      winner: state.winner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return {
      winner: state.winner,
      scores: state.scores,
    };
  },
};
