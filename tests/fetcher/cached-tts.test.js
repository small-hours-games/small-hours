import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../../src/fetcher/gemini-tts.js', () => ({
  synthesizeSpeech: vi.fn(),
}));

import { writeFile, mkdir, access } from 'node:fs/promises';
import { synthesizeSpeech } from '../../src/fetcher/gemini-tts.js';
import { generateQuestionAudio, generateAudioForQuestions } from '../../src/fetcher/cached-tts.js';

const SAMPLE_QUESTION = {
  id: 'otdb_abc123abc123',
  question: 'What is the capital of France?',
  correct_answer: 'Paris',
  incorrect_answers: ['London', 'Berlin', 'Madrid'],
};

const AUDIO_RESULT = {
  ok: true,
  audioData: Buffer.from('fake-audio'),
  mimeType: 'audio/L16;codec=pcm;rate=24000',
};

beforeEach(() => {
  vi.clearAllMocks();
  mkdir.mockResolvedValue(undefined);
  writeFile.mockResolvedValue(undefined);
  // Default: files don't exist (cache miss)
  access.mockRejectedValue(new Error('ENOENT'));
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.restoreAllMocks();
});

describe('generateQuestionAudio', () => {
  it('generates both question and answer audio files on cache miss', async () => {
    synthesizeSpeech.mockResolvedValue(AUDIO_RESULT);

    const result = await generateQuestionAudio(SAMPLE_QUESTION);

    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
    expect(synthesizeSpeech.mock.calls[0][0]).toBe('What is the capital of France?');
    expect(synthesizeSpeech.mock.calls[1][0]).toBe('The answer is: Paris');
    expect(result.question).toMatch(/otdb_abc123abc123_q\.wav$/);
    expect(result.answer).toMatch(/otdb_abc123abc123_a\.wav$/);
  });

  it('writes audio data to disk', async () => {
    synthesizeSpeech.mockResolvedValue(AUDIO_RESULT);

    await generateQuestionAudio(SAMPLE_QUESTION);

    expect(writeFile).toHaveBeenCalledTimes(2);
    const [qPath, qData] = writeFile.mock.calls[0];
    expect(qPath).toMatch(/otdb_abc123abc123_q\.wav$/);
    expect(Buffer.isBuffer(qData)).toBe(true);
  });

  it('creates audio directory on first call', async () => {
    synthesizeSpeech.mockResolvedValue(AUDIO_RESULT);

    await generateQuestionAudio(SAMPLE_QUESTION);

    expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/data[/\\]audio/), { recursive: true });
  });

  it('skips generation when audio files already exist (cache hit)', async () => {
    // Files exist
    access.mockResolvedValue(undefined);

    const result = await generateQuestionAudio(SAMPLE_QUESTION);

    expect(synthesizeSpeech).not.toHaveBeenCalled();
    expect(result.question).toBeTruthy();
    expect(result.answer).toBeTruthy();
  });

  it('returns null paths when TTS fails but does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    synthesizeSpeech.mockResolvedValue({
      ok: false,
      error: { code: 'API_ERROR', message: 'Bad request' },
    });

    const result = await generateQuestionAudio(SAMPLE_QUESTION);

    expect(result.question).toBeNull();
    expect(result.answer).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('maps MIME type to correct file extension', async () => {
    synthesizeSpeech.mockResolvedValue({
      ok: true,
      audioData: Buffer.from('data'),
      mimeType: 'audio/mp3',
    });

    const result = await generateQuestionAudio(SAMPLE_QUESTION);

    expect(result.question).toMatch(/\.mp3$/);
    expect(result.answer).toMatch(/\.mp3$/);
  });
});

describe('generateAudioForQuestions', () => {
  it('processes a batch of questions sequentially', async () => {
    synthesizeSpeech.mockResolvedValue(AUDIO_RESULT);

    const questions = [
      SAMPLE_QUESTION,
      { ...SAMPLE_QUESTION, id: 'otdb_def456def456', question: 'Q2?', correct_answer: 'A2' },
    ];

    const count = await generateAudioForQuestions(questions);

    // 2 questions × 2 calls each (question + answer) = 4 calls
    expect(synthesizeSpeech).toHaveBeenCalledTimes(4);
    expect(count).toBe(2);
  });

  it('skips all generation when GEMINI_API_KEY is not set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.GEMINI_API_KEY;

    const count = await generateAudioForQuestions([SAMPLE_QUESTION]);

    expect(synthesizeSpeech).not.toHaveBeenCalled();
    expect(count).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GEMINI_API_KEY'));
  });

  it('continues processing remaining questions when one fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // First question: synthesizeSpeech throws on first call, caught at question level
    // Second question: both calls succeed
    let callCount = 0;
    synthesizeSpeech.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve(AUDIO_RESULT);
    });

    const questions = [
      SAMPLE_QUESTION,
      { ...SAMPLE_QUESTION, id: 'otdb_def456def456', question: 'Q2?', correct_answer: 'A2' },
    ];

    const count = await generateAudioForQuestions(questions);

    // First question threw, second succeeded
    expect(count).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});
