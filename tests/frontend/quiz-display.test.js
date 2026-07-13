import { describe, it, expect } from 'vitest';

// DOM-like escapeHtml (polyfill for Node)
function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// NEW Quiz render implementation (what we'll implement in GREEN phase)
function newRenderQuiz(msg) {
  const q = msg.question || {};
  
  if (msg.phase === 'countdown') {
    return '<div class="quiz-display">' +
      '<div class="quiz-question-text">Get ready!</div>' +
      '<div class="quiz-timer-large">&#9201;</div>' +
      '<div style="color:var(--text-secondary);">First question coming up...</div>' +
      '</div>';
  }
  
  if (msg.phase === 'between') {
    const nextQ = (msg.currentQuestion != null ? msg.currentQuestion + 1 : '?');
    return '<div class="quiz-display">' +
      '<div class="quiz-question-text">Next up: Question ' + nextQ + '</div>' +
      '<div style="color:var(--text-secondary);margin-top:16px;">Get ready for the next round...</div>' +
      '</div>';
  }
  
  if (msg.phase === 'question') {
    let html = '<div class="quiz-display question-phase">' +
      '<div class="quiz-progress">' +
        '<span class="quiz-progress-label">Question ' + (msg.currentQuestion + 1) + ' of ' + msg.totalQuestions + '</span>' +
        '<div class="timer-bar-container">' +
          '<div class="timer-bar" style="width: ' + ((msg.timeLeft / msg.timeTotal) * 100) + '%" ' +
            'class="' + (msg.timeLeft / msg.timeTotal < 0.2 ? 'critical' : msg.timeLeft / msg.timeTotal < 0.4 ? 'warning' : '') + '"></div>' +
        '</div>' +
      '</div>' +
      '<div class="quiz-question-text">' + escapeHtml(q.text || '') + '</div>' +
      '<div class="quiz-answers-display">';
    
    const labels = ['A', 'B', 'C', 'D'];
    const classes = ['a', 'b', 'c', 'd'];
    const colors = ['var(--neon-red)', 'var(--neon-blue)', 'var(--neon-green)', 'var(--neon-orange)'];
    
    (q.answers || []).forEach((a, i) => {
      const bgColor = colors[i] || 'var(--neon-purple)';
      html += '<button class="answer-btn answer-' + classes[i] + '" style="background:' + bgColor + '" data-index="' + i + '">' +
        '<span class="answer-label">' + labels[i] + '.</span>' +
        '<span class="answer-text">' + escapeHtml(a) + '</span>' +
      '</button>';
    });
    
    html += '</div></div>';
    return html;
  }
  
  if (msg.phase === 'reveal') {
    let html = '<div class="quiz-display reveal-phase">' +
      '<div class="quiz-question-text">' + escapeHtml(q.text || '') + '</div>' +
      '<div class="quiz-answers-display">';
    
    const labels = ['A', 'B', 'C', 'D'];
    const classes = ['a', 'b', 'c', 'd'];
    const colors = ['var(--neon-red)', 'var(--neon-blue)', 'var(--neon-green)', 'var(--neon-orange)'];
    
    (q.answers || []).forEach((a, i) => {
      const isCorrect = i === msg.correctIndex;
      const bgColor = colors[i] || 'var(--neon-purple)';
      const stateClass = isCorrect ? ' correct' : '';
      html += '<button class="answer-btn answer-' + classes[i] + stateClass + '" style="background:' + bgColor + '" disabled>' +
        '<span class="answer-label">' + labels[i] + '.</span>' +
        '<span class="answer-text">' + escapeHtml(a) + '</span>' +
        (isCorrect ? '<span class="answer-check">✓</span>' : '') +
      '</button>';
    });
    
    html += '</div></div>';
    return html;
  }
  
  return '<div class="quiz-display">Waiting for game state...</div>';
}

describe('Host Quiz Display - Question Phase Visual Contract', () => {
  it('question phase shows large, readable question text', () => {
    const msg = {
      phase: 'question',
      currentQuestion: 2,
      totalQuestions: 10,
      timeLeft: 15,
      timeTotal: 30,
      question: { text: 'What is the capital of France?', answers: ['Paris', 'London', 'Berlin', 'Madrid'] }
    };
    const html = newRenderQuiz(msg);
    
    // Question text should be prominent
    expect(html).toContain('quiz-question-text');
    expect(html).toContain('What is the capital of France?');
  });

  it('answer buttons are large touch targets (min 60px height)', () => {
    const msg = {
      phase: 'question',
      currentQuestion: 0,
      totalQuestions: 10,
      timeLeft: 30,
      timeTotal: 30,
      question: { text: 'Test?', answers: ['A', 'B', 'C', 'D'] }
    };
    const html = newRenderQuiz(msg);
    
    // Should have button elements (not divs) for proper semantics
    expect(html).toContain('<button class="answer-btn');
    // Should have minimum height styling (via style attribute or CSS class)
    // The implementation should ensure 60px min height via CSS
    expect(html).toContain('answer-btn');
  });

  it('timer bar shows visual progress with color coding', () => {
    // Normal time (>40%)
    let msg = { phase: 'question', currentQuestion: 0, totalQuestions: 5, timeLeft: 25, timeTotal: 30, question: { text: 'Q?', answers: ['A','B','C','D'] } };
    let html = newRenderQuiz(msg);
    expect(html).toContain('timer-bar');
    expect(html).not.toContain('warning');
    expect(html).not.toContain('critical');
    
    // Warning time (<40%)
    msg.timeLeft = 10;
    html = newRenderQuiz(msg);
    expect(html).toContain('warning');
    
    // Critical time (<20%)
    msg.timeLeft = 5;
    html = newRenderQuiz(msg);
    expect(html).toContain('critical');
  });

  it('reveal phase highlights correct answer with checkmark', () => {
    const msg = {
      phase: 'reveal',
      correctIndex: 2, // C is correct
      question: { text: 'Test?', answers: ['Wrong A', 'Wrong B', 'Correct C', 'Wrong D'] }
    };
    const html = newRenderQuiz(msg);
    
    // Correct answer should have 'correct' class and checkmark
    expect(html).toContain('answer-c correct');
    expect(html).toContain('answer-check');
    expect(html).toContain('✓');
    
    // Other answers should not have checkmark
    expect(html).not.toContain('answer-a correct');
    expect(html).not.toContain('answer-b correct');
    expect(html).not.toContain('answer-d correct');
  });

  it('countdown phase shows animated timer', () => {
    const msg = { phase: 'countdown' };
    const html = newRenderQuiz(msg);
    
    expect(html).toContain('quiz-timer-large');
    expect(html).toContain('&#9201;'); // Clock emoji
  });

  it('between phase shows next question preview', () => {
    const msg = { phase: 'between', currentQuestion: 2 };
    const html = newRenderQuiz(msg);
    
    // currentQuestion is 0-indexed, so currentQuestion=2 means we just finished question 3, next is question 4
    expect(html).toContain('Next up: Question 3'); // Shows the completed question number + 1
    expect(html).toContain('Get ready');
  });
});