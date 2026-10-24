import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../public/host.html', import.meta.url), 'utf8');

describe('Player avatars in live scores', () => {
  it('keeps avatars attached to player IDs when score order changes across games', () => {
    const list = {};
    const context = {
      state: { playerAvatars: { alice: '🐸', bob: '🦊' } },
      document: { getElementById: () => list },
      escapeHtml: text => String(text),
    };
    runInNewContext(source.slice(source.indexOf('    function playerAvatarHtml('), source.indexOf('    function returnToLobby(')), context);
    for (const game of ['quiz', 'music-quiz', 'gin-rummy', 'number-guess', 'shithead']) {
      context.renderScoreboard({ scores: { alice: 10, bob: 20 }, playerNames: { alice: 'Alice', bob: 'Bob' } }, game);
      expect(list.innerHTML).toContain('🐸</span> Alice');
      expect(list.innerHTML).toContain('🦊</span> Bob');
      context.renderScoreboard({ scores: { alice: 30, bob: 20 }, playerNames: { alice: 'Alice', bob: 'Bob' } }, game);
      expect(list.innerHTML).toContain('🐸</span> Alice');
      expect(list.innerHTML).toContain('🦊</span> Bob');
    }
  });
});
