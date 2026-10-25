import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read = file => readFileSync(new URL('../../public/' + file, import.meta.url), 'utf8');
const escapeHtml = text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;');

describe('Light lobby uses the multiplayer state', () => {
  it('renders phone votes with real selection, counts and player limits', () => {
    const context = {
      state: { playerId: 'p1', gameSuggestions: { p1: 'quiz', p2: 'quiz' }, leadingGame: 'quiz' },
      gameBlocker: game => game.type === 'shithead' ? '2+ players' : null,
      escapeHtml,
    };
    const list = {};
    context.document = { getElementById: () => list };
    runInNewContext(read('js/games.js'), context);
    const source = read('player.html');
    runInNewContext(source.slice(source.indexOf('    function renderVoteList('), source.indexOf('    function suggestGame(')), context);
    context.renderVoteList();
    expect(list.innerHTML).toContain('data-game="quiz" aria-pressed="true"');
    expect(list.innerHTML).toContain('lobby-vote-count">2</span>');
    expect(list.innerHTML).toContain('onclick="suggestGame(this.dataset.game)"');
    expect(list.innerHTML).toContain('data-game="shithead" aria-pressed="false" disabled');
    expect(list.innerHTML).toContain('2+ players');
  });
  it('uses live TV tallies and moves the same chat panel between lobby and gameplay', () => {
    const elements = {};
    const document = {
      getElementById: id => elements[id] ||= { style: {}, children: [], appendChild(child) { this.children.push(child); } },
      body: { classList: { toggle() {} }, appendChild: child => { document.body.child = child; } },
    };
    const context = { state: { lobby: { gameSuggestions: { p1: 'music-quiz' }, leadingGame: 'music-quiz' } }, document, escapeHtml };
    runInNewContext(read('js/games.js'), context);
    const source = read('host.html');
    runInNewContext(source.slice(source.indexOf('    function renderHostVotes('), source.indexOf('    // --- Render: Game ---')), context);
    context.renderHostVotes();
    expect(elements.hostVotes.innerHTML).toContain('is-selected" data-game="music-quiz"');
    expect(elements.voteCount.textContent).toBe('1 vote');
    context.placePartyChat(false);
    const panel = elements.chatPanel;
    expect(elements.lobbyChatMount.children[0]).toBe(panel);
    expect(panel.style.display).toBe('flex');
    context.placePartyChat(true);
    expect(document.body.child).toBe(panel);
    expect(panel.style.display).toBe('none');
    elements.chatMessages.children.push({});
    context.placePartyChat(true);
    expect(panel.style.display).toBe('flex');
    context.placePartyChat(false);
    expect(elements.lobbyChatMount.children.at(-1)).toBe(panel);
  });
});
