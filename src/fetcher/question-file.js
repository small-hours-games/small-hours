// Small Hours - Question File Loader
// Loads questions from JSON files in the questions/ directory
// and saves answers back after a game completes.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_DIR = join(__dirname, '..', '..', 'questions');

/**
 * Load questions from a JSON file in the questions/ directory.
 * @param {string} filename - e.g. 'todo-poll.json'
 * @returns {{ ok: true, questions: Array, name: string } | { ok: false, error: string }}
 */
export async function loadQuestionFile(filename) {
  try {
    const filepath = join(QUESTIONS_DIR, filename);
    const raw = await readFile(filepath, 'utf-8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      return { ok: false, error: 'No questions found in file' };
    }

    return { ok: true, questions: data.questions, name: data.name || filename };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Save game answers back to the question file.
 * Appends a session entry to the "answers" array.
 *
 * @param {string} filename - e.g. 'todo-poll.json'
 * @param {Object} responses - { playerId: { questionIndex: value } }
 * @param {Object} playerNames - { playerId: username }
 */
export async function saveAnswers(filename, responses, playerNames) {
  try {
    const filepath = join(QUESTIONS_DIR, filename);
    const raw = await readFile(filepath, 'utf-8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.answers)) {
      data.answers = [];
    }

    const session = {
      timestamp: new Date().toISOString(),
      players: playerNames,
      responses,
    };

    data.answers.push(session);
    await writeFile(filepath, JSON.stringify(data, null, 2) + '\n');

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
