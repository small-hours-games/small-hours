import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../public/js/quiz-narrator.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const question = { phase: 'question', timeLeft: 15, question: { id: 'q1', text: 'Question?' } };
function setup(fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ url: '/voice.wav' }) }))) {
  const clips = [];
  const browserSpeech = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }] };
  const context = { speechSynthesis: browserSpeech, SpeechSynthesisUtterance: function(text) { this.text = text; }, Date, fetch: fetcher, Audio: function(url) {
    const clip = { url, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
    clips.push(clip); return clip;
  } };
  runInNewContext(source, context);
  return { narrator: context.createQuizNarrator(), clips, fetcher, browserSpeech };
}
describe('TV game-show narration', () => {
  it('narrates countdown introduction and scales playbackRate to finish right as Question 1 starts', async () => {
    const { narrator, clips, fetcher } = setup();
    narrator.sync({ phase: 'countdown', timeLeft: 5, gameType: 'quiz' });
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      text: 'Welcome to Smallhours Quiz Challenge, Here We go 3...2...1',
      style: 'game-show',
    });
    expect(clips[0].playbackRate).toBeGreaterThan(1.15);
    expect(clips[0].playbackRate).toBeLessThanOrEqual(1.6);
    // Transitioning to question 1 immediately stops the intro clip
    narrator.sync(question);
    expect(clips[0].pause).toHaveBeenCalled();
  });

  it('reads once per phase and cancels the question at reveal', async () => {
    const { narrator, clips, fetcher } = setup();
    narrator.sync(question);
    narrator.sync(question);
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ text: 'Question?', style: 'game-show' });
    expect(clips[0].playbackRate).toBe(1.18);
    narrator.sync({ ...question, phase: 'reveal', correctAnswer: 'Paris' });
    expect(clips[0].pause).toHaveBeenCalled();
    await settle();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).text).toBe('The answer is: Paris');
    narrator.stop();
    expect(clips[1].pause).toHaveBeenCalled();
  });
  it('drops late responses after a phase changes', async () => {
    let resolve;
    const { narrator, clips } = setup(() => new Promise(r => { resolve = r; }));
    narrator.sync(question);
    narrator.sync({ phase: 'between' });
    resolve({ ok: true, json: async () => ({ url: '/late.wav' }) });
    await settle();
    expect(clips).toHaveLength(0);
  });
  it('honors mute and leaves music questions free of narration', async () => {
    const { narrator, fetcher, clips } = setup();
    narrator.setMuted(true);
    narrator.sync(question);
    expect(fetcher).not.toHaveBeenCalled();
    narrator.setMuted(false);
    narrator.sync({ ...question, question: { ...question.question, id: 'q2', media: { preview: 'song' } } });
    expect(fetcher).not.toHaveBeenCalled();
    narrator.sync({ ...question, question: { ...question.question, id: 'q3' } });
    await settle();
    narrator.setMuted(true);
    expect(clips[0].pause).toHaveBeenCalled();
  });
});


it('uses the browser host voice when Gemini is unavailable, retries /api/tts on next phase, and honors mute', async () => {
  const { narrator, fetcher, browserSpeech } = setup(vi.fn(async () => ({ ok: false })));
  narrator.sync(question);
  await settle();
  expect(browserSpeech.speak).toHaveBeenCalledTimes(1);
  expect(browserSpeech.speak.mock.calls[0][0].text).toBe('Question?');
  expect(browserSpeech.speak.mock.calls[0][0].rate).toBe(1.18);
  expect(browserSpeech.speak.mock.calls[0][0].pitch).toBe(0.88);
  narrator.sync({ ...question, phase: 'reveal', correctAnswer: 'Mars' });
  expect(browserSpeech.cancel).toHaveBeenCalled();
  await settle();
  expect(browserSpeech.speak.mock.calls[1][0].text).toBe('The answer is: Mars');
  expect(fetcher).toHaveBeenCalledTimes(2);
  narrator.setMuted(true);
  expect(browserSpeech.cancel).toHaveBeenCalledTimes(2);
});
