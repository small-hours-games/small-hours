import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadRenderer(file, name, next, context) {
  const source = readFileSync(new URL('../../public/' + file, import.meta.url), 'utf8');
  const start = source.indexOf('    function ' + name + '(');
  const end = source.indexOf('    function ' + next + '(', start);
  runInNewContext(source.slice(start, end), context);
  return context[name];
}
const question = { id: 'q1', text: 'Question?', answers: ['One', 'Two', 'Three', 'Four'] };
const escapeHtml = text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;');

describe('Actual quiz page renderers', () => {
  it('keeps the server-confirmed phone choice marked through reveal and reconnect', () => {
    const elements = {};
    const context = {
      stopQuizReadyCountdown() {}, startQuizReadyCountdown() {}, storyAudio: null,
      document: { getElementById: id => elements[id] ||= { style: {}, textContent: '', innerHTML: '', classList: { remove() {} } } },
      state: { selectedAnswer: null, powerupsUsed: {} },
      escapeHtml, updatePowerupBtns() {}, stopQuizCountdown() {}, renderQuizMedia() {},
    };
    const render = loadRenderer('player.html', 'renderQuizState', 'startQuizCountdown', context);
    render({ phase: 'question', question, selectedAnswer: 'Two' });
    expect(elements.quizAnswers.innerHTML).toContain('answer-b selected" disabled aria-pressed="true"');
    render({ phase: 'reveal', question, selectedAnswer: 'Two', correctIndex: 0 });
    expect(elements.quizAnswers.innerHTML).toContain('answer-b selected incorrect" aria-pressed="true"');
    expect(elements.quizAnswers.innerHTML).toContain('answer-a correct');
  });

  it('puts escaped player names beneath their guesses only at reveal on TV', () => {
    const elements = {};
    const context = {
      stopQuizReadyCountdown() {}, startQuizReadyCountdown() {}, storyAudio: null,
      document: { getElementById: id => elements[id] ||= { style: {}, innerHTML: '' } },
      state: { playerNames: { p1: '<Alice>', p2: 'Bob' } }, escapeHtml,
      playerAvatarHtml: () => '<span class="inline-player-avatar">🐸</span> ',
      syncMusic() {}, stopHostCountdown() {}, musicPanel: () => '', hostCountdown: {},
    };
    const render = loadRenderer('host.html', 'renderQuiz', 'renderSpy', context);
    elements.storyOverlay = { style: { display: 'flex' } };
    render({ phase: 'countdown', timeLeft: 5 });
    expect(elements.storyOverlay.style.display).toBe('none');
    expect(elements.gameContent.innerHTML).toContain('id="quizReadyNumber"');
    render({ phase: 'question', question, playerAnswers: { p1: 'Two' } });
    expect(elements.gameContent.innerHTML).not.toContain('Alice');
    render({ phase: 'reveal', question, correctIndex: 0, playerAnswers: { p1: 'Two', p2: 'One' } });
    const html = elements.gameContent.innerHTML;
    expect(html).toContain('One</span><span class="answer-mark correct"');
    expect(html).toContain('<span>Bob</span>');
    expect(html).toContain('inline-player-avatar">🐸</span>');
    expect(html).toContain('<span>&lt;Alice&gt;</span>');
    expect(html).toContain('No guesses');
  });
});
