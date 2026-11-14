import { describe, it, expect } from 'vitest';
import { computeSessionPoints, SESSION_PLACE_POINTS } from '../../src/session/scoring.js';

function makeRoom(playerIds, bots = [], surrendered = []) {
  return {
    players: new Map(playerIds.map(id => [id, { id, connected: true }])),
    bots,
    surrendered: new Set(surrendered),
  };
}

describe('unified cross-game session scoring', () => {
  it('awards identical placement points for Quiz, Gin Rummy, Palace, and winner-only games', () => {
    const room = makeRoom(['p1', 'p2', 'p3']);

    // Quiz with thousands of points
    const quizPts = computeSessionPoints(room, {
      winner: 'p1',
      scores: { p1: 8500, p2: 4200, p3: 1100 },
    });
    // Palace with 0..3 points
    const palacePts = computeSessionPoints(room, {
      winner: 'p1',
      loser: 'p3',
      scores: { p1: 3, p2: 2, p3: 0 },
    });
    // Gin Rummy with 100..300 points (2 players)
    const ginRoom = makeRoom(['p1', 'p2']);
    const ginPts = computeSessionPoints(ginRoom, {
      winner: 'p1',
      scores: { p1: 245, p2: 40 },
    });
    // Winner-only game (no scores object)
    const winnerOnlyPts = computeSessionPoints(room, { winner: 'p1' });

    expect(quizPts).toEqual({ p1: 100, p2: 60, p3: 35 });
    expect(palacePts).toEqual({ p1: 100, p2: 60, p3: 35 });
    expect(ginPts).toEqual({ p1: 100, p2: 60 });
    expect(winnerOnlyPts.p1).toBe(SESSION_PLACE_POINTS[0]);
  });

  it('handles ties fairly with competition ranking', () => {
    const room = makeRoom(['p1', 'p2', 'p3']);
    const pts = computeSessionPoints(room, {
      scores: { p1: 500, p2: 500, p3: 200 },
    });
    expect(pts).toEqual({ p1: 100, p2: 100, p3: 35 });
  });

  it('ranks AI bots alongside humans and gives 0 to surrendered players', () => {
    const room = makeRoom(['p1'], ['bot_1', 'bot_2']);
    // Bot won, human finished 2nd
    const lostToBot = computeSessionPoints(room, {
      winner: 'bot_1',
      scores: { bot_1: 3, p1: 2, bot_2: 0 },
    });
    expect(lostToBot).toEqual({ p1: 60 });

    // Human beat both bots
    const beatBots = computeSessionPoints(room, {
      winner: 'p1',
      scores: { p1: 3, bot_1: 2, bot_2: 0 },
    });
    expect(beatBots).toEqual({ p1: 100 });

    // Surrendered player gets 0
    const surrRoom = makeRoom(['p1', 'p2'], [], ['p1']);
    const surrPts = computeSessionPoints(surrRoom, {
      winner: 'p2',
      scores: { p1: 500, p2: 100 },
    });
    expect(surrPts).toEqual({ p1: 0, p2: 100 });
  });
});
