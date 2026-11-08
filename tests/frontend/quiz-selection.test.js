import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadRenderer(file, name, next, context) {
  const source = readFileSync(new URL('../../games/quiz/client/' + file, import.meta.url), 'utf8');
  const start = source.indexOf('    function ' + name + '(');
  const end = source.indexOf(next.startsWith(' ') ? next : '    function ' + next + '(', start);
  runInNewContext(source.slice(start, end), context);
  return context[name];
}
const question = { id: 'q1', text: 'Question?', answers: ['One', 'Two', 'Three', 'Four'] };
const escapeHtml = text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;');

describe('Actual quiz page renderers', () => {
  it('keeps the server-confirmed phone choice marked through reveal and reconnect', () => {
    const elements = {};
    const context = {
      stopQuizReadyCountdown() {}, startQuizReadyCountdown() {}, storyAudio: null, quizNarrator: { sync() {} },
      document: { getElementById: id => elements[id] ||= { style: {}, textContent: '', innerHTML: '', classList: { remove() {} } } },
      state: { selectedAnswer: null, powerupsUsed: {} },
      escapeHtml, updatePowerupBtns() {}, stopQuizCountdown() {}, renderQuizMedia() {},
    };
    const render = loadRenderer('phone.js', 'renderQuizState', 'startQuizCountdown', context);
    render({ phase: 'question', question, selectedAnswer: 'Two' });
    expect(elements.quizAnswers.innerHTML).toContain('answer-b selected" disabled aria-pressed="true"');
    render({ phase: 'reveal', question, selectedAnswer: 'Two', correctIndex: 0 });
    expect(elements.quizAnswers.innerHTML).toContain('answer-b selected incorrect" aria-pressed="true"');
    expect(elements.quizAnswers.innerHTML).toContain('answer-a correct');
  });

  it('puts escaped player names beneath their guesses only at reveal on TV', () => {
    const elements = {};
    const context = {
      stopQuizReadyCountdown() {}, startQuizReadyCountdown() {}, storyAudio: null, quizNarrator: { sync() {} },
      document: { getElementById: id => elements[id] ||= { style: {}, innerHTML: '' } },
      state: { playerNames: { p1: '<Alice>', p2: 'Bob' } }, escapeHtml,
      playerAvatarHtml: () => '<span class="inline-player-avatar">🐸</span> ',
      syncMusic() {}, stopHostCountdown() {}, musicPanel: () => '', hostCountdown: {},
    };
    const render = loadRenderer('tv.js', 'renderQuiz', "    SH.registerGame('quiz'", context);
    elements.storyOverlay = { style: { display: 'flex' } };
    render({ phase: 'countdown', timeLeft: 5 });
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

  it('renders question pictures on both TV and phone for Quiz but not Music Quiz', () => {
    const hostEls = {};
    const hostCtx = {
      stopQuizReadyCountdown() {}, startQuizReadyCountdown() {}, storyAudio: null, quizNarrator: { sync() {} },
      document: { getElementById: id => hostEls[id] ||= { style: {}, innerHTML: '' } },
      state: { playerNames: {} }, escapeHtml, playerAvatarHtml: () => '',
      syncMusic() {}, stopHostCountdown() {}, musicPanel: () => '', hostCountdown: {},
    };
    const renderHost = loadRenderer('tv.js', 'renderQuiz', "    SH.registerGame('quiz'", hostCtx);
    hostEls.storyOverlay = { style: { display: 'none' } };

    const qWithImg = { ...question, image: 'https://upload.wikimedia.org/pic.jpg' };
    renderHost({ phase: 'question', question: qWithImg });
    expect(hostEls.gameContent.innerHTML).toContain('class="quiz-question-image"');
    expect(hostEls.gameContent.innerHTML).toContain('https://upload.wikimedia.org/pic.jpg');

    // Music quiz question should not render quiz-question-image
    renderHost({ phase: 'question', question: { ...qWithImg, media: { preview: 'song.mp3' } } });
    expect(hostEls.gameContent.innerHTML).not.toContain('class="quiz-question-image"');

    // Phone renderer (renderQuizMedia)
    const phoneEls = {};
    const phoneCtx = {
      document: { getElementById: id => phoneEls[id] ||= { className: '', innerHTML: '' } },
      escapeHtml, syncPhoneMusic() {}, musicBtnHtml: () => '<button id="musicBtn"></button>',
    };
    const renderMedia = loadRenderer('phone.js', 'renderQuizMedia', 'selectAnswer', phoneCtx);
    renderMedia({ phase: 'question', question: qWithImg });
    expect(phoneEls.quizMedia.className).toContain('quiz-phone-image-wrap');
    expect(phoneEls.quizMedia.innerHTML).toContain('https://upload.wikimedia.org/pic.jpg');

    renderMedia({ phase: 'question', question: { ...qWithImg, media: { preview: 'song.mp3' } } });
    expect(phoneEls.quizMedia.innerHTML).not.toContain('quiz-phone-image');
  });
});
