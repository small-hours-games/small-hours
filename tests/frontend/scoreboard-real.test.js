import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { runInNewContext } from 'node:vm';

// The real scoreboard code: the TV page's default, with each game's own scoreboard().
const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');

function scoreboard(gameType, tvFile) {
  const plugins = {};
  const context = { SH: { registerGame: (id, p) => { plugins[id] = p; }, game: id => plugins[id] || null } };
  const host = read('public/host.html');
  runInNewContext(host.slice(host.indexOf('    function getScoreboardData('), host.indexOf('    function renderScoreboard(')), context);
  if (tvFile) {
    // Only the registration matters here: it holds the scoreboard().
    const source = read(tvFile);
    runInNewContext(source.slice(source.indexOf('    SH.registerGame(')), { ...context, renderShithead() {}, renderGinRummy() {}, renderQuiz() {} });
  }
  return msg => context.getScoreboardData({ playerNames: { a: 'Anna', b: 'Bo' }, ...msg }, gameType);
}

describe('TV scoreboard', () => {
  it('ranks accumulated points by default', () => {
    const { entries, status } = scoreboard('anything')({ scores: { a: 10, b: 30 }, phase: 'finished' });
    expect(entries.map(e => [e.id, e.valueText, e.rank])).toEqual([['b', '30 p', 1], ['a', '10 p', 2]]);
    expect(status).toBe('Done');
  });

  it('Palace ranks who went out first and counts the cards of the others', () => {
    const { entries } = scoreboard('shithead', 'games/shithead/client/tv.js')({
      scores: { a: 0, b: 1 }, finishOrder: ['b'], players: [{ playerId: 'a', handCount: 2, faceUp: [{}], faceDownCount: 0 }],
    });
    expect(entries.map(e => [e.id, e.valueText, e.isOut])).toEqual([['b', 'Place 1', true], ['a', '3 cards', false]]);
  });

  it('Gin Rummy labels the hand and the quiz labels the question', () => {
    expect(scoreboard('gin-rummy', 'games/gin-rummy/client/tv.js')({ scores: {}, handNumber: 2 }).roundLabel).toBe('Hand 2');
  });
});

describe('getScoreboardData — unified scoreboard CSS contract', () => {
  const css = fs.readFileSync(new URL('../../public/css/smallhours.css', import.meta.url), 'utf-8');

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
