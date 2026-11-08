import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('node:fs/promises', () => ({ access: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('../../src/fetcher/gemini-tts.js', () => ({ synthesizeSpeech: vi.fn() }));
import { access, writeFile } from 'node:fs/promises';
import { synthesizeSpeech } from '../../src/fetcher/gemini-tts.js';
import { getNarration, warmQuizNarration } from '../../src/fetcher/cached-narration.js';
beforeEach(() => {
  vi.clearAllMocks();
  access.mockRejectedValue(new Error('missing'));
  synthesizeSpeech.mockResolvedValue({ ok: true, audioData: Buffer.from('wav') });
});
describe('Cached host narration', () => {
  it('reuses existing clips without calling the speech provider', async () => {
    access.mockResolvedValue(undefined);
    expect(await getNarration('Cached', { style: 'game-show' })).toMatchObject({ ok: true, cached: true });
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });
  it('shares concurrent generation and separates delivery profiles', async () => {
    const [a, b] = await Promise.all([
      getNarration('Question?', { style: 'game-show' }), getNarration('Question?', { style: 'game-show' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const plain = await getNarration('Question?');
    expect(plain.id).not.toBe(a.id);
  });
  it('does not save failed generation', async () => {
    synthesizeSpeech.mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'Unavailable' } });
    const result = await getNarration('Failed question', { style: 'game-show' });
    expect(result.ok).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('falls back to server-side TTS caching when Gemini returns HTTP 429 quota error', async () => {
    synthesizeSpeech.mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'HTTP 429: RESOURCE_EXHAUSTED' } });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer,
    })));
    const result = await getNarration('Question 3 after quota?', { style: 'game-show' });
    expect(result.ok).toBe(true);
    expect(result.fallback).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toMatch(/\.mp3$/);
    vi.unstubAllGlobals();
  });

  describe('the fallback voice', () => {
    const notFoundWav = path => (String(path).endsWith('.mp3') ? Promise.resolve() : Promise.reject(new Error('missing')));

    it('is not used while Gemini works, even when an old fallback clip exists', async () => {
      access.mockImplementation(notFoundWav);
      const result = await getNarration('Quota is back', { style: 'game-show' });
      expect(result).toMatchObject({ ok: true, cached: false });
      expect(result.fallback).toBeUndefined();
      expect(writeFile.mock.calls[0][0]).toMatch(/\.wav$/);
    });

    it('reuses a stored fallback clip while the quota is out', async () => {
      access.mockImplementation(notFoundWav);
      synthesizeSpeech.mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'HTTP 429: quota' } });
      expect(await getNarration('Still out', { style: 'game-show' })).toMatchObject({ ok: true, cached: true, fallback: true });
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('warmQuizNarration', () => {
    const questions = [{ question: 'Q1?', correct_answer: 'A1' }, { question: 'Q2?', correct_answer: 'A2' }];
    const texts = () => synthesizeSpeech.mock.calls.map(c => c[0]);
    beforeEach(() => { process.env.GEMINI_API_KEY = 'test'; });
    afterEach(() => { delete process.env.GEMINI_API_KEY; });

    it('keeps preparing the rest after one text fails', async () => {
      synthesizeSpeech.mockImplementation(async text => (text === 'Q1?'
        ? { ok: false, error: { code: 'NETWORK_ERROR', message: 'reset' } }
        : { ok: true, audioData: Buffer.from('wav') }));
      await warmQuizNarration(questions, { retryDelayMs: 0 });
      expect(texts()).toEqual(expect.arrayContaining(['The answer is: A1', 'Q2?', 'The answer is: A2']));
    });

    it('tries again when a reply has no audio', async () => {
      synthesizeSpeech.mockResolvedValueOnce({ ok: true, audioData: Buffer.from('wav') }) // the intro
        .mockResolvedValueOnce({ ok: false, error: { code: 'NO_AUDIO', message: 'none' } });
      await warmQuizNarration(questions.slice(0, 1), { retryDelayMs: 0 });
      expect(texts().filter(t => t === 'Q1?')).toHaveLength(2);
    });

    it('stops when the key is rejected', async () => {
      synthesizeSpeech.mockResolvedValueOnce({ ok: true, audioData: Buffer.from('wav') })
        .mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'HTTP 401: bad key' } });
      await warmQuizNarration(questions, { retryDelayMs: 0 });
      expect(texts()).toHaveLength(2);
    });
  });
});
