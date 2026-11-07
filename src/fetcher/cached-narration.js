// Cache narration by transcript and delivery profile; share concurrent requests.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { synthesizeSpeech } from './gemini-tts.js';

const AUDIO_DIR = fileURLToPath(new URL('../../data/audio/', import.meta.url));
const QUESTIONS_DIR = fileURLToPath(new URL('../../data/questions/', import.meta.url));
const pending = new Map();

let otdbTextMap = null;
function getOtdbTextMap() {
  if (otdbTextMap) return otdbTextMap;
  otdbTextMap = new Map();
  try {
    const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const items = JSON.parse(fs.readFileSync(QUESTIONS_DIR + file, 'utf8'));
      if (!Array.isArray(items)) continue;
      for (const q of items) {
        if (!q || !q.id) continue;
        if (q.question) otdbTextMap.set(q.question.trim(), `${q.id}_q`);
        if (q.correct_answer != null) {
          otdbTextMap.set(`The answer is: ${q.correct_answer}`.trim(), `${q.id}_a`);
        }
      }
    }
  } catch {
    // Optional lookup table; ignore if questions dir is missing in tests
  }
  return otdbTextMap;
}

function findPreCachedOtdbId(text) {
  try {
    const map = getOtdbTextMap();
    const candidateId = map.get(String(text || '').trim());
    if (candidateId && fs.existsSync(`${AUDIO_DIR}${candidateId}.wav`)) {
      return candidateId;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Split text into <=180-character chunks on sentence/word boundaries for fallback TTS.
 */
function splitTextChunks(text, maxLen = 180) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks = [];
  let remaining = cleaned;
  while (remaining.length > maxLen) {
    let slice = remaining.slice(0, maxLen);
    let splitAt = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('; '),
      slice.lastIndexOf(', ')
    );
    if (splitAt > 40) {
      splitAt += 1;
    } else {
      splitAt = slice.lastIndexOf(' ');
      if (splitAt <= 0) splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Server-side fallback TTS when Gemini Free-Tier daily quota (429) is exhausted.
 * Produces an MP3 buffer that is cached on disk in data/audio/tts_<id>.mp3.
 */
export async function synthesizeFallbackSpeech(text) {
  try {
    const chunks = splitTextChunks(text, 180);
    if (!chunks.length) {
      return { ok: false, error: { code: 'EMPTY_TEXT', message: 'Empty text' } };
    }
    const buffers = [];
    for (const chunk of chunks) {
      const q = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-GB&q=${q}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { ok: false, error: { code: 'FALLBACK_TTS_ERROR', message: `HTTP ${res.status}` } };
      }
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      if (!buf.length) {
        return { ok: false, error: { code: 'FALLBACK_NO_AUDIO', message: 'Empty fallback audio' } };
      }
      buffers.push(buf);
    }
    return { ok: true, audioData: Buffer.concat(buffers), ext: 'mp3', mimeType: 'audio/mpeg' };
  } catch (err) {
    return { ok: false, error: { code: 'FALLBACK_NETWORK_ERROR', message: err.message } };
  }
}

export async function getNarration(text, options = {}) {
  const id = createHash('sha256')
    .update(JSON.stringify(['narration-v2', options.voice || '', options.style || '', text]))
    .digest('hex');
  const wavPath = `${AUDIO_DIR}tts_${id}.wav`;
  const mp3Path = `${AUDIO_DIR}tts_${id}.mp3`;

  // 1. Primary narration-v2 WAV cache
  try { await access(wavPath); return { ok: true, id, cached: true }; } catch { /* check next */ }
  // 2. Fallback MP3 cache
  try { await access(mp3Path); return { ok: true, id, cached: true }; } catch { /* check next */ }
  // 3. Legacy narration-v1 WAV cache
  const v1Id = createHash('sha256')
    .update(JSON.stringify(['narration-v1', options.voice || '', options.style || '', text]))
    .digest('hex');
  try { await access(`${AUDIO_DIR}tts_${v1Id}.wav`); return { ok: true, id: v1Id, cached: true }; } catch { /* check next */ }
  // 4. Pre-cached OpenTrivia question/answer WAV (otdb_<id>_q.wav / otdb_<id>_a.wav)
  const otdbId = findPreCachedOtdbId(text);
  if (otdbId) return { ok: true, id: otdbId, cached: true };

  if (pending.has(id)) return pending.get(id);
  const generation = (async () => {
    const result = await synthesizeSpeech(text, options);
    if (result.ok) {
      await mkdir(AUDIO_DIR, { recursive: true });
      await writeFile(wavPath, result.audioData);
      return { ok: true, id, cached: false };
    }

    // If Gemini TTS hit a 429/503 quota limit, fall back to server-side TTS and cache it
    const errMsg = result.error?.message || '';
    if (errMsg.includes('429') || errMsg.includes('503')) {
      const fallback = await synthesizeFallbackSpeech(text);
      if (fallback.ok) {
        await mkdir(AUDIO_DIR, { recursive: true });
        await writeFile(mp3Path, fallback.audioData);
        return { ok: true, id, cached: false, fallback: true };
      }
    }

    return result;
  })();
  pending.set(id, generation);
  try { return await generation; }
  catch { return { ok: false, error: { code: 'CACHE_ERROR', message: 'Could not save narration audio' } }; }
  finally { pending.delete(id); }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const QUIZ_INTRO_TEXT = 'Welcome to Smallhours Quiz Challenge, Here We go 3...2...1';

// Start during game preparation so the opening countdown can hide generation time.
// Caches all questions and answers ahead of time so playback never cuts out after Question 2.
export async function warmQuizNarration(questions, options = {}) {
  if (!process.env.GEMINI_API_KEY || !Array.isArray(questions)) return;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const maxRetries = options.maxRetries ?? 2;

  // Ensure the countdown intro is cached first for standard Quiz games
  if (questions.some(q => q && !q.media)) {
    await getNarration(QUIZ_INTRO_TEXT, { style: 'game-show' });
  }

  for (const question of questions) {
    if (!question || question.media) continue;
    const prompts = [
      question.question,
      question.correct_answer != null ? `The answer is: ${question.correct_answer}` : null,
    ].filter(Boolean);

    for (const text of prompts) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        const result = await getNarration(text, { style: 'game-show' });
        if (result.ok) break;
        const msg = result.error?.message || '';
        const isRateLimit = msg.includes('429') || msg.includes('503');
        if (!isRateLimit) return; // Permanent provider/auth error — stop warming.
        attempt++;
        if (attempt <= maxRetries) {
          await sleep(retryDelayMs);
        }
      }
    }
  }
}
