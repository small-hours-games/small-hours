import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const page of ['player', 'host']) {
  const source = readFileSync(new URL('../../public/' + page + '.html', import.meta.url), 'utf8');
  describe(page + ' chat', () => {
    it('reads the server username and renders names separately from escaped message text', () => {
      const container = { children: [], appendChild(el) { this.children.push(el); }, style: {} };
      const context = {
        document: { getElementById: () => container, createElement: () => ({}) },
        escapeHtml: text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
      };
      const start = source.indexOf('    function addChatMessage(');
      const end = source.indexOf('    // ---', start);
      runInNewContext(source.slice(start, end), context);
      const dispatch = source.match(/case 'CHAT_MESSAGE':\s*([^;]+;)/)[1];
      context.msg = { username: '<Alice>', text: '<hello>', avatar: '🐸' };
      runInNewContext(dispatch, context);
      expect(container.children[0].innerHTML).toBe('<span class="author"><span class="chat-avatar" aria-hidden="true">🐸</span> &lt;Alice&gt;</span><span class="chat-text">&lt;hello&gt;</span>');
    });
  });
}
