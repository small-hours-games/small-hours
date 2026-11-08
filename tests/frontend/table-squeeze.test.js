// Phone card tables: the pinned hand zone must never cover the piles, and Palace's
// final screen says who went out first and who keeps the palace.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function fn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  const end = source.indexOf('\n    }\n', start);
  return source.slice(start, end + 7);
}

describe('squeezing the card table to fit', () => {
  const ctx = {};
  runInNewContext(fn(src('public/js/table-cards-phone.js'), 'tcSqueezeLevel'), ctx);

  it('fits when the table ends above the pinned hand zone', () => {
    expect(ctx.tcSqueezeLevel(380, 280, 664)).toBe(true);
    expect(ctx.tcSqueezeLevel(394, 348, 664)).toBe(false);   // Palace on an iPhone before the fix
  });

  it('every squeeze level has styles, and hidden boxes really hide', () => {
    const css = src('public/css/table-cards.css');
    for (const lvl of [1, 2, 3]) expect(css).toContain('.tc-screen.tc-sq' + lvl);
    expect(css).toMatch(/\.tc-screen \[hidden\] \{ display: none !important; \}/);
  });
});

describe('Palace final standings on the phone', () => {
  const ctx = { state: { playerId: 'p2' } };
  runInNewContext(fn(src('public/js/table-cards-phone.js'), 'tcName') + fn(src('games/shithead/client/phone.js'), 'shStandingsText'), ctx);
  const msg = {
    playerNames: { p1: 'Anna', p2: 'Bo', p3: 'Cy' },
    players: [{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p3' }],
    finishOrder: ['p3', 'p1'],
  };

  it('lists the places and names the one left with the palace', () => {
    expect(ctx.shStandingsText(msg)).toBe('🥇 Cy  ·  🥈 Anna  ·  💩 You');
  });
});
