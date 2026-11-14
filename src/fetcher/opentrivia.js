// OpenTrivia DB fetcher module
// Fetches quiz questions from opentdb.com, decodes HTML entities,
// and returns structured results matching the quiz engine's expected shape.
import { decodeHtml } from './html-entities.js';

const RESPONSE_CODES = {
  0: null, // success
  1: { code: 'NO_RESULTS', message: 'Not enough questions available for this category/amount' },
  2: { code: 'INVALID_PARAMETER', message: 'Invalid category ID or amount' },
  3: { code: 'TOKEN_NOT_FOUND', message: 'Session token not found' },
  4: { code: 'TOKEN_EXHAUSTED', message: 'All questions exhausted for this token' },
  5: { code: 'RATE_LIMITED', message: 'Too many requests, please wait' },
};

/**
 * Fetch quiz questions from OpenTrivia DB.
 *
 * @param {number} [categoryId] - OpenTrivia DB category ID (omit for any category)
 * @param {number} [amount=10] - Number of questions to fetch
 * @param {{difficulty?: 'easy'|'medium'|'hard'}} [options]
 * @returns {Promise<{ok: true, questions: Array} | {ok: false, error: {code: string, message: string}}>}
 */
export async function fetchQuestions(categoryId, amount = 10, { difficulty } = {}) {
  try {
    let url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
    if (categoryId) {
      url += `&category=${categoryId}`;
    }
    if (difficulty) {
      url += `&difficulty=${difficulty}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    const errorInfo = RESPONSE_CODES[data.response_code];
    if (errorInfo !== null && errorInfo !== undefined) {
      return { ok: false, error: { ...errorInfo } };
    }

    // Unknown non-zero response code
    if (data.response_code !== 0) {
      return { ok: false, error: { code: 'UNKNOWN_ERROR', message: `Unknown response code: ${data.response_code}` } };
    }

    const questions = data.results.map((result, index) => ({
      id: `otdb_${index}_${Date.now()}`,
      question: decodeHtml(result.question),
      correct_answer: decodeHtml(result.correct_answer),
      incorrect_answers: result.incorrect_answers.map(a => decodeHtml(a)),
      category: decodeHtml(result.category),
      difficulty: result.difficulty,
    }));

    return { ok: true, questions };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

/**
 * Fetch available quiz categories from OpenTrivia DB.
 *
 * @returns {Promise<{ok: true, categories: Array<{id: number, name: string}>} | {ok: false, error: {code: string, message: string}}>}
 */
export async function fetchCategories() {
  try {
    const response = await fetch('https://opentdb.com/api_category.php');
    const data = await response.json();
    const categories = data.trivia_categories.map(c => ({ id: c.id, name: c.name }));
    return { ok: true, categories };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}
