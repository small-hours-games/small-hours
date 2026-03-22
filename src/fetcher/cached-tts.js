// Disk-cached TTS wrapper for quiz questions.
// Generates audio files for question text and correct answer reveals.
// Audio is stored in data/audio/{questionId}_q.{ext} and {questionId}_a.{ext}.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { synthesizeSpeech } from './gemini-tts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = resolve(__dirname, '../../data/audio');

// Map MIME types to file extensions
const EXT_MAP = {
  'audio/wav': 'wav',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/L16': 'wav',
  'audio/pcm': 'pcm',
};

function extForMime(mimeType) {
  // Strip parameters (e.g. "audio/L16;codec=pcm;rate=24000" -> "audio/L16")
  const base = mimeType.split(';')[0];
  return EXT_MAP[base] || 'wav';
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate audio for a single question (question text + answer reveal).
 * Skips generation if audio files already exist on disk.
 *
 * @param {object} question - Question object with id, question, correct_answer
 * @returns {Promise<{question: string|null, answer: string|null}>} Paths to generated files (null if skipped/failed)
 */
export async function generateQuestionAudio(question) {
  await mkdir(AUDIO_DIR, { recursive: true });

  const results = { question: null, answer: null };

  // Generate question audio
  const qPath = join(AUDIO_DIR, `${question.id}_q`);
  const existingQ = await findExisting(qPath);
  if (!existingQ) {
    const result = await synthesizeSpeech(question.question);
    if (result.ok) {
      const ext = extForMime(result.mimeType);
      const fullPath = `${qPath}.${ext}`;
      await writeFile(fullPath, result.audioData);
      results.question = fullPath;
    } else {
      console.warn(`[tts] question audio failed for ${question.id}:`, result.error.message);
    }
  } else {
    results.question = existingQ;
  }

  // Generate answer reveal audio
  const aPath = join(AUDIO_DIR, `${question.id}_a`);
  const existingA = await findExisting(aPath);
  if (!existingA) {
    const answerText = `The answer is: ${question.correct_answer}`;
    const result = await synthesizeSpeech(answerText);
    if (result.ok) {
      const ext = extForMime(result.mimeType);
      const fullPath = `${aPath}.${ext}`;
      await writeFile(fullPath, result.audioData);
      results.answer = fullPath;
    } else {
      console.warn(`[tts] answer audio failed for ${question.id}:`, result.error.message);
    }
  } else {
    results.answer = existingA;
  }

  return results;
}

/**
 * Check if an audio file already exists with any extension.
 */
async function findExisting(basePath) {
  for (const ext of Object.values(EXT_MAP)) {
    const path = `${basePath}.${ext}`;
    if (await fileExists(path)) return path;
  }
  return null;
}

/**
 * Generate audio for a batch of questions.
 * Processes sequentially to respect API rate limits.
 *
 * @param {Array} questions - Array of question objects
 * @returns {Promise<number>} Number of questions that got at least one new audio file
 */
export async function generateAudioForQuestions(questions) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[tts] GEMINI_API_KEY not set, skipping audio generation');
    return 0;
  }

  let generated = 0;
  for (const question of questions) {
    try {
      const result = await generateQuestionAudio(question);
      if (result.question || result.answer) generated++;
    } catch (err) {
      console.warn(`[tts] error generating audio for ${question.id}:`, err.message);
    }
  }

  if (generated > 0) {
    console.log(`[tts] generated audio for ${generated}/${questions.length} questions`);
  }

  return generated;
}
