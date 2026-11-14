// Small Hours - Unified Cross-Game Session Scoring
// Normalizes every finished game onto the same placement point scale
// regardless of whether the game's internal scores are 0..3 or 0..10000.

export const SESSION_PLACE_POINTS = [100, 60, 35, 20, 10];

function pointsForRank(rankIndex) {
  return SESSION_PLACE_POINTS[Math.min(rankIndex, SESSION_PLACE_POINTS.length - 1)];
}

/**
 * Compute standardized session points for all connected human players in `room`
 * from a game's `endResult` ({ winner, loser?, scores? }).
 *
 * @param {object} room
 * @param {object} endResult
 * @returns {Record<string, number>}
 */
export function computeSessionPoints(room, endResult) {
  if (!room || !endResult) return {};
  const surrendered = room.surrendered instanceof Set ? room.surrendered : new Set();
  const humanIds = [...room.players.entries()]
    .filter(([, p]) => p.connected !== false)
    .map(([id]) => id);
  if (humanIds.length === 0) return {};

  const rawScores = (endResult.scores && typeof endResult.scores === 'object') ? endResult.scores : null;
  const participantIds = new Set(humanIds);
  if (rawScores) {
    for (const id of Object.keys(rawScores)) participantIds.add(id);
  }
  for (const botId of (room.bots || [])) participantIds.add(botId);

  // Build sortable entries for all participants (humans + bots)
  const entries = [...participantIds].map(id => {
    const isSurrendered = surrendered.has(id);
    let score = rawScores && rawScores[id] != null ? Number(rawScores[id]) : (id === endResult.winner ? 1 : 0);
    if (!Number.isFinite(score)) score = 0;
    return {
      id,
      score: isSurrendered ? -Infinity : score,
      isWinner: !isSurrendered && id === endResult.winner,
      isLoser: id === endResult.loser || isSurrendered,
    };
  });

  // Sort: winner first if tied/present, loser last, otherwise highest raw score
  entries.sort((a, b) => {
    if (a.isLoser !== b.isLoser) return a.isLoser ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    return 0;
  });

  // Solo game (e.g. solo Quiz): 100 pts if scored > 0 or won, else 10 pts
  if (entries.length === 1) {
    const only = entries[0];
    if (!room.players.has(only.id)) return {};
    if (surrendered.has(only.id)) return { [only.id]: 0 };
    return { [only.id]: (only.score > 0 || only.isWinner) ? SESSION_PLACE_POINTS[0] : SESSION_PLACE_POINTS[4] };
  }

  // Assign tie-aware placement points
  const awarded = {};
  let currentRank = 0;
  for (let i = 0; i < entries.length; i++) {
    const prev = i > 0 ? entries[i - 1] : null;
    const cur = entries[i];
    const tiedWithPrev = prev &&
      prev.score === cur.score &&
      prev.isWinner === cur.isWinner &&
      prev.isLoser === cur.isLoser;
    if (!tiedWithPrev) currentRank = i;

    if (room.players.has(cur.id)) {
      awarded[cur.id] = surrendered.has(cur.id) ? 0 : pointsForRank(currentRank);
    }
  }
  return awarded;
}
