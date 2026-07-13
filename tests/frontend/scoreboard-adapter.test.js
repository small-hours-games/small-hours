import { describe, it, expect } from 'vitest';
import fs from 'fs';

// --- Polyfilled getScoreboardData (mirrors host.html implementation) ---
// Keeps the test hermetic (no DOM needed) while asserting the exact contract
// the host screen relies on.
function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
  return text.replace(/[&<>"]/g, m => map[m]);
}

function getScoreboardData(msg, gameType) {
  const names = msg.playerNames || {};
  const scores = msg.scores || {};
  const ids = Object.keys(scores);

  let entries;
  let roundLabel = null;
  let status = (msg.phase === 'finished') ? 'Klart' : 'Spelar';

  if (gameType === 'shithead') {
    const finishOrder = msg.finishOrder || [];
    const rankedIds = [
      ...finishOrder,
      ...ids.filter(id => !finishOrder.includes(id)),
    ];
    entries = rankedIds.map((id, i) => ({
      id,
      name: names[id] || id,
      valueText: finishOrder.includes(id) ? 'Plats ' + (i + 1) : 'Spelar',
      rank: i + 1,
      isOut: finishOrder.includes(id),
    }));
  } else if (gameType === 'number-guess') {
    const maxRounds = msg.maxRounds || 0;
    const sorted = ids.slice().sort((a, b) => scores[b] - scores[a]);
    entries = sorted.map((id, i) => {
      const guessesLeft = scores[id];
      return {
        id,
        name: names[id] || id,
        valueText: guessesLeft + ' gissningar kvar',
        rank: i + 1,
        isOut: false,
      };
    });
    if (msg.round != null && maxRounds) {
      roundLabel = 'Round ' + (msg.round + 1) + ' / ' + maxRounds;
    }
  } else {
    const sorted = ids.slice().sort((a, b) => scores[b] - scores[a]);
    entries = sorted.map((id, i) => ({
      id,
      name: names[id] || id,
      valueText: scores[id] + ' p',
      rank: i + 1,
      isOut: false,
    }));
    if (gameType === 'quiz' && msg.totalQuestions) {
      roundLabel = 'Fråga ' + ((msg.currentQuestion || 0) + 1) + ' / ' + msg.totalQuestions;
    } else if (gameType === 'spy' && msg.totalRounds) {
      roundLabel = 'Round ' + (msg.round || 0) + ' / ' + msg.totalRounds;
    } else if (gameType === 'gin-rummy' && msg.handNumber != null) {
      roundLabel = 'Hand ' + msg.handNumber;
    }
  }

  return { roundLabel, status, entries };
}

const playerNames = { alice: 'Alice', bob: 'Bob', carol: 'Carol', dave: 'Dave' };

describe('getScoreboardData — quiz (accumulated points)', () => {
  const msg = {
    phase: 'question',
    scores: { alice: 300, bob: 500, carol: 100, dave: 0 },
    currentQuestion: 2,
    totalQuestions: 10,
    playerNames,
  };
  const { entries, roundLabel, status } = getScoreboardData(msg, 'quiz');

  it('sorts best-first by points', () => {
    expect(entries.map(e => e.id)).toEqual(['bob', 'alice', 'carol', 'dave']);
  });
  it('formats values as points', () => {
    expect(entries[0].valueText).toBe('500 p');
    expect(entries[3].valueText).toBe('0 p');
  });
  it('produces 1-based ranks', () => {
    expect(entries[0].rank).toBe(1);
    expect(entries[3].rank).toBe(4);
  });
  it('builds a question round label', () => {
    expect(roundLabel).toBe('Fråga 3 / 10');
  });
  it('reports live status', () => {
    expect(status).toBe('Spelar');
  });
});

describe('getScoreboardData — shithead (placement from finishOrder)', () => {
  const msg = {
    phase: 'play',
    scores: { alice: 3, bob: 0, carol: 2, dave: 1 }, // players.length(4) - pos
    finishOrder: ['alice', 'carol'],
    playerNames,
  };
  const { entries } = getScoreboardData(msg, 'shithead');

  it('ranks finished players first, in finish order', () => {
    expect(entries.map(e => e.id)).toEqual(['alice', 'carol', 'bob', 'dave']);
  });
  it('labels finished players with placement', () => {
    expect(entries.find(e => e.id === 'alice').valueText).toBe('Plats 1');
    expect(entries.find(e => e.id === 'carol').valueText).toBe('Plats 2');
  });
  it('marks finished players as out, others as playing', () => {
    expect(entries.find(e => e.id === 'alice').isOut).toBe(true);
    expect(entries.find(e => e.id === 'bob').isOut).toBe(false);
    expect(entries.find(e => e.id === 'bob').valueText).toBe('Spelar');
  });
});

describe('getScoreboardData — number-guess (guesses remaining)', () => {
  const msg = {
    phase: 'playing',
    scores: { alice: 5, bob: 2, carol: 8 }, // maxRounds - guesses
    maxRounds: 10,
    round: 3,
    playerNames,
  };
  const { entries, roundLabel } = getScoreboardData(msg, 'number-guess');

  it('sorts by guesses remaining (higher = better)', () => {
    expect(entries.map(e => e.id)).toEqual(['carol', 'alice', 'bob']);
  });
  it('labels values as guesses remaining (not raw score)', () => {
    expect(entries[0].valueText).toBe('8 gissningar kvar');
    expect(entries[2].valueText).toBe('2 gissningar kvar');
  });
  it('builds a Round label from round + maxRounds', () => {
    expect(roundLabel).toBe('Round 4 / 10');
  });
});

describe('getScoreboardData — gin-rummy / spy round labels', () => {
  it('gin-rummy shows Hand label', () => {
    const { roundLabel } = getScoreboardData(
      { phase: 'drawing', scores: { alice: 0, bob: 0 }, handNumber: 2, playerNames },
      'gin-rummy'
    );
    expect(roundLabel).toBe('Hand 2');
  });
  it('spy shows Round X / Y label', () => {
    const { roundLabel } = getScoreboardData(
      { phase: 'clues', scores: { alice: 1, bob: 1 }, round: 4, totalRounds: 10, playerNames },
      'spy'
    );
    expect(roundLabel).toBe('Round 4 / 10');
  });
});

describe('getScoreboardData — status on finished', () => {
  it('reports Klart when phase is finished', () => {
    const { status } = getScoreboardData({ phase: 'finished', scores: {}, playerNames }, 'quiz');
    expect(status).toBe('Klart');
  });
});

describe('getScoreboardData — unified scoreboard CSS contract', () => {
  const css = fs.readFileSync('/opt/data/small-hours/public/css/style.css', 'utf-8');

  it('has styles for the meta/round line', () => {
    expect(css).toContain('.score-panel-meta');
  });
  it('has rank medal colors', () => {
    expect(css).toContain('.score-rank.rank-gold');
    expect(css).toContain('.score-rank.rank-silver');
    expect(css).toContain('.score-rank.rank-bronze');
  });
  it('has out-badge and dimmed out styling', () => {
    expect(css).toContain('.score-out-badge');
    expect(css).toContain('.score-entry.is-out');
  });
  it('uses glass card base for entries', () => {
    expect(css).toContain('.score-entry');
    expect(css).toContain('.score-value');
    expect(css).toContain('.score-name');
  });
});
