import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enrichQuestionsWithImages,
  isSpoilerTopic,
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
});
