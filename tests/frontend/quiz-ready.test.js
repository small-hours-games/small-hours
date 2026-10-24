import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PHASE_DURATIONS } from '../../src/engine/games/quiz.js';
import { PHASE_DURATIONS as MUSIC_DURATIONS } from '../../src/engine/games/music-quiz.js';

const source = readFileSync(new URL('../../public/js/quiz-ready.js', import.meta.url), 'utf8');
afterEach(() => vi.useRealTimers());
describe('Quiz preparation countdown', () => {
  it('gives both quiz modes five seconds', () => {
    expect(PHASE_DURATIONS.countdown).toBe(5000);
    expect(MUSIC_DURATIONS.countdown).toBe(5000);
  });
  it('counts down remaining server time and stops before overwriting a question timer', () => {
    vi.useFakeTimers();
    const el = {};
    const context = { Date, setInterval, clearInterval, document: { getElementById: () => el } };
    runInNewContext(source, context);
    context.startQuizReadyCountdown('timer', 5);
    expect(el.textContent).toBe('5');
    vi.advanceTimersByTime(1000);
    expect(el.textContent).toBe('4');
    context.startQuizReadyCountdown('timer', 1.5);
    expect(el.textContent).toBe('2');
    vi.advanceTimersByTime(1500);
    expect(el.textContent).toBe('Go!');
    context.stopQuizReadyCountdown();
    el.textContent = '15';
    vi.advanceTimersByTime(1000);
    expect(el.textContent).toBe('15');
  });
});
