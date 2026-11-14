import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enrichQuestionsWithImages,
  isSpoilerTopic,
  isSpoilerImageUrl,
  extractLocalCandidates,
} from '../../src/fetcher/cached-question-images.js';

describe('Quiz question image resolver', () => {
  let tempDir;
  let cachePath;
  const origFetch = globalThis.fetch;
  const origKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-qimg-'));
    cachePath = join(tempDir, 'question-images.json');
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('filters out spoiler topics that match or contain any answer choice', () => {
    const q = {
      question: 'Who is the author of Jurassic Park?',
      correct_answer: 'Michael Crichton',
      incorrect_answers: ['Stephen King', 'Peter Benchley', 'Irvine Welsh'],
    };
    expect(isSpoilerTopic('Michael Crichton', q)).toBe(true);
    expect(isSpoilerTopic('Novel by Michael Crichton', q)).toBe(true);
    expect(isSpoilerTopic('Stephen King', q)).toBe(true);
    expect(isSpoilerTopic('Jurassic Park', q)).toBe(false);
  });

  it('extracts non-spoiler local candidates from question text and category', () => {
    const q = {
      question: 'Who is the author of "Jurassic Park"?',
      correct_answer: 'Michael Crichton',
      incorrect_answers: ['Stephen King', 'Peter Benchley', 'Irvine Welsh'],
      category: 'Entertainment: Books',
    };
    const candidates = extractLocalCandidates(q);
    expect(candidates).toContain('Jurassic Park');
    expect(candidates).toContain('Book');
    expect(candidates).not.toContain('Michael Crichton');
  });

  it('serves cached question images from disk without making network calls', async () => {
    writeFileSync(cachePath, JSON.stringify({ otdb_1: 'https://img.example/jurassic.jpg' }));
    globalThis.fetch = vi.fn();

    const questions = [{
      id: 'otdb_1',
      question: 'Who wrote Jurassic Park?',
      correct_answer: 'Michael Crichton',
      incorrect_answers: ['A', 'B', 'C'],
    }];

    const enriched = await enrichQuestionsWithImages(questions, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBe('https://img.example/jurassic.jpg');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses Gemini candidates, skips spoiler titles, resolves Wikipedia thumbnails, and persists to disk', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  // First candidate is a spoiler ("Copper") and must be rejected; second ("El Teniente") is valid
                  text: JSON.stringify([['Copper', 'El Teniente', 'Mining']]),
                }],
              },
            }],
          }),
        };
      }
      if (String(url).includes('en.wikipedia.org')) {
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: {
                1: {
                  title: 'El Teniente',
                  thumbnail: { source: 'https://upload.wikimedia.org/el_teniente.jpg' },
                },
              },
            },
          }),
        };
      }
      throw new Error('Unexpected URL: ' + url);
    });

    const questions = [{
      id: 'otdb_mine',
      question: 'Located in Chile, El Teniente is the largest underground mine for what metal?',
      correct_answer: 'Copper',
      incorrect_answers: ['Iron', 'Nickel', 'Silver'],
      category: 'General Knowledge',
    }];

    const enriched = await enrichQuestionsWithImages(questions, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBe('https://upload.wikimedia.org/el_teniente.jpg');

    const saved = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(saved.otdb_mine).toBe('https://upload.wikimedia.org/el_teniente.jpg');
  });

  it('skips Music Quiz questions that have media', async () => {
    globalThis.fetch = vi.fn();
    const musicQ = [{
      id: 'dz_1',
      question: 'Which song is playing?',
      correct_answer: 'Song A',
      incorrect_answers: ['B', 'C', 'D'],
      media: { preview: 'https://cdn.deezer.com/clip.mp3' },
    }];

    const enriched = await enrichQuestionsWithImages(musicQ, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not attach or fetch flag images for flag questions such as the Japanese flag circle question', async () => {
    globalThis.fetch = vi.fn();
    const questions = [{
      id: 'otdb_0fabb19bd5f8',
      question: 'What colour is the circle on the Japanese flag?',
      correct_answer: 'Red',
      incorrect_answers: ['White', 'Yellow', 'Black'],
      category: 'Geography',
    }];

    const enriched = await enrichQuestionsWithImages(questions, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not serve a previously cached flag image for a flag question', async () => {
    writeFileSync(cachePath, JSON.stringify({
      otdb_0fabb19bd5f8: 'https://upload.wikimedia.org/Flag_of_Japan.svg.png',
    }));
    globalThis.fetch = vi.fn();
    const questions = [{
      id: 'otdb_0fabb19bd5f8',
      question: 'What colour is the circle on the Japanese flag?',
      correct_answer: 'Red',
      incorrect_answers: ['White', 'Yellow', 'Black'],
      category: 'Geography',
    }];

    const enriched = await enrichQuestionsWithImages(questions, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks cached flag URLs when an answer mentions flag even if the question text does not', async () => {
    writeFileSync(cachePath, JSON.stringify({
      otdb_3b65ea96dc7b: 'https://upload.wikimedia.org/Burgee_flag.png',
    }));
    globalThis.fetch = vi.fn();
    const questions = [{
      id: 'otdb_3b65ea96dc7b',
      question: 'What is a Burgee?',
      correct_answer: 'A flag',
      incorrect_answers: ['A rope', 'A window', 'A type of food'],
      category: 'General Knowledge',
    }];

    const enriched = await enrichQuestionsWithImages(questions, { allowInTests: true, cachePath });
    expect(enriched[0].image).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks flag topics and Flag_of_Japan.svg for visual feature questions without the word flag', async () => {
    const q = {
      id: 'otdb_japan_circle',
      question: "What color does Japan's circle have in the middle?",
      correct_answer: 'Red',
      incorrect_answers: ['White', 'Blue', 'Yellow'],
      category: 'Geography',
    };

    expect(isSpoilerTopic('Flag of Japan', q)).toBe(true);
    expect(isSpoilerImageUrl('https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg', q)).toBe(true);
    expect(isSpoilerImageUrl('https://upload.wikimedia.org/wikipedia/commons/1/1b/Mount_Fuji.jpg', q)).toBe(false);

    // Cached Flag_of_Japan.svg must not be served
    writeFileSync(cachePath, JSON.stringify({
      otdb_japan_circle: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg',
    }));
    globalThis.fetch = vi.fn();
    const cachedEnriched = await enrichQuestionsWithImages([q], { allowInTests: true, cachePath });
    expect(cachedEnriched[0].image).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Fresh Wikipedia fetch returning Flag_of_Japan.svg must also be rejected
    rmSync(cachePath, { force: true });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            1: {
              title: 'Japan',
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg' },
            },
          },
        },
      }),
    }));
    const fetchedEnriched = await enrichQuestionsWithImages([q], { allowInTests: true, cachePath });
    expect(fetchedEnriched[0].image).toBeUndefined();
  });
});
