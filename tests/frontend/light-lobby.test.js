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

  it('positions the 3D Lion & Frog card duel strictly to the right of the QR code panel and stops in-game', () => {
    const stageEl = {
      id: 'mascotDuelStage',
      style: {},
      dataset: {},
      innerHTML: '',
      classList: {
        classes: new Set(),
        add(...names) { names.forEach(n => this.classes.add(n)); },
        remove(...names) { names.forEach(n => this.classes.delete(n)); },
        contains(name) { return this.classes.has(name); },
      },
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    const invitePanel = { getBoundingClientRect: () => ({ left: 24, right: 392 }) };
    const qrContainer = { getBoundingClientRect: () => ({ left: 100, right: 280 }) };
    const bodyClasses = new Set();
    const document = {
      getElementById: id => (id === 'mascotDuelStage' ? stageEl : id === 'qrContainer' ? qrContainer : null),
      querySelector: sel => (sel === '.invite-panel' ? invitePanel : null),
      body: {
        classList: {
          contains: name => bodyClasses.has(name),
        },
      },
    };
    const context = { document, window: { addEventListener() {} }, setTimeout: () => 1, clearTimeout() {} };
    runInNewContext(read('js/mascot-duel.js'), context);

    const duel = context.createMascotDuel({ document, window: context.window });
    duel.start();

    // Must be placed strictly to the right of .invite-panel (392 + 24 = 416px)
    expect(Number(stageEl.dataset.safeLeft)).toBeGreaterThanOrEqual(416);
    expect(stageEl.style.left).toBe('416px');
    expect(stageEl.innerHTML).toContain('duel-fighter-lion');
    expect(stageEl.innerHTML).toContain('duel-fighter-frog');
    expect(stageEl.innerHTML).toContain('duel-card-stack-lion');
    expect(stageEl.innerHTML).toContain('duel-card-stack-frog');

    expect(duel.triggerDuel()).toBe(true);
    expect(duel.isRunning()).toBe(true);
    expect(stageEl.classList.contains('is-active')).toBe(true);
    expect(duel.getLastChaseDirection()).toBe('left');
    expect(stageEl.dataset.chaseDirection).toBe('left');

    // Stop and trigger the next duel: it should alternate and chase out to the right
    duel.stopDuel();
    expect(duel.triggerDuel()).toBe(true);
    expect(duel.getLastChaseDirection()).toBe('right');
    expect(stageEl.dataset.chaseDirection).toBe('right');

    // Entering a game immediately stops and hides the duel
    duel.setLobbyActive(false);
    expect(duel.isRunning()).toBe(false);
    expect(stageEl.classList.contains('is-active')).toBe(false);
  });

  it('removes bottom-left wobbling mascots and places wobbling avatar glyph next to contestant name', () => {
    const hostSource = read('host.html');
    expect(hostSource).not.toContain('class="lobby-mascots"');

    const elements = {};
    const document = {
      getElementById: id => (elements[id] ||= { style: {}, innerHTML: '', textContent: '' }),
    };
    const context = {
      state: {
        players: [{ playerId: 'p1', name: 'Alice', avatar: '🦁', connected: true, isAdmin: true, sessionScore: 10 }],
        lobby: { gameSuggestions: { p1: 'quiz' } },
      },
      document,
      escapeHtml,
    };
    runInNewContext(read('js/games.js'), context);
    runInNewContext(
      hostSource.slice(hostSource.indexOf('    function renderPlayers('), hostSource.indexOf('    // Live tallies:')),
      context
    );
    context.renderPlayers();
    expect(elements.playerGrid.innerHTML).toContain('<span class="lobby-avatar-glyph">🦁</span>');
    expect(elements.playerGrid.innerHTML).toContain('Alice');
  });
});
