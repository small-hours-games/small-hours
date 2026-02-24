'use strict';

const https = require('https');
const { getQuestionsFromLocalDB, DIFFICULTY_CONFIG } = require('./local-db');

const OPENTDB_BASE = 'https://opentdb.com';
const ANSWER_IDS = ['A', 'B', 'C', 'D'];

// Fetch JSON from a URL, returns a promise
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON from ' + url));
        }
      });
    }).on('error', reject);
  });
}

// Fisher-Yates shuffle (in-place)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Get (or refresh) a session token to prevent repeat questions
let sessionToken = null;

async function getSessionToken() {
  if (sessionToken) return sessionToken;
  const data = await fetchJSON(`${OPENTDB_BASE}/api_token.php?command=request`);
  if (data.response_code === 0) {
    sessionToken = data.token;
  }
  return sessionToken;
}

async function resetSessionToken() {
  if (!sessionToken) return;
  await fetchJSON(`${OPENTDB_BASE}/api_token.php?command=reset&token=${sessionToken}`);
}

// Fetch all available categories
async function fetchCategories() {
  const data = await fetchJSON(`${OPENTDB_BASE}/api_category.php`);
  return data.trivia_categories; // [{id, name}]
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Fetch questions for given category IDs
// totalCount = desired total number of questions across all categories (default 20)
// Returns array of processed question objects ready for the game, trimmed to totalCount
async function fetchQuestions(categoryIds, totalCount = 20, gameDifficulty = 'easy', seenQuestions = null) {
  // Try local DB first — instant, no rate limits
  const local = getQuestionsFromLocalDB(categoryIds, totalCount, gameDifficulty, seenQuestions);
  if (local !== null) {
    console.log(`Using local DB: ${local.length} questions [${gameDifficulty}]`);
    return local;
  }

  // opentdb allows 1 request per 5 seconds. Cap total API calls and add delay.
  const MAX_CALLS = Math.min(categoryIds.length, Math.min(5, Math.ceil(totalCount / 10)));
  const shuffledCats = shuffle([...categoryIds]);
  const catsToFetch = shuffledCats.slice(0, MAX_CALLS);
  const perCat = Math.min(50, Math.ceil(totalCount / catsToFetch.length));

  // Pass difficulty directly to OpenTDB — easy/medium/hard map 1:1
  const cfg = DIFFICULTY_CONFIG[gameDifficulty] || DIFFICULTY_CONFIG.easy;
  const diffParam = `&difficulty=${gameDifficulty}`;

  console.log(`Fetching ${totalCount} questions from API [${gameDifficulty}]: ${catsToFetch.length} categories, ${perCat} each`);

  let token = await getSessionToken();
  const allQuestions = [];

  for (let i = 0; i < catsToFetch.length; i++) {
    if (i > 0) await sleep(5500); // respect opentdb 5s rate limit
    const catId = catsToFetch[i];

    // ── Multiple-choice ────────────────────────────────────────────────────
    const url = `${OPENTDB_BASE}/api.php?amount=${perCat}&category=${catId}&type=multiple&encode=url3986&token=${token}${diffParam}`;
    try {
      const data = await fetchJSON(url);

      if (data.response_code === 5) {
        console.warn(`Rate limited on category ${catId}, waiting 6s...`);
        await sleep(6000);
        const retry = await fetchJSON(url);
        if (retry.response_code === 0) allQuestions.push(...processQuestions(retry.results, gameDifficulty));
      } else if (data.response_code === 3 || data.response_code === 4) {
        await resetSessionToken();
        sessionToken = null;
        token = await getSessionToken();
        const retryUrl = `${OPENTDB_BASE}/api.php?amount=${perCat}&category=${catId}&type=multiple&encode=url3986&token=${token}${diffParam}`;
        const retry = await fetchJSON(retryUrl);
        if (retry.response_code === 0) allQuestions.push(...processQuestions(retry.results, gameDifficulty));
      } else if (data.response_code === 0) {
        allQuestions.push(...processQuestions(data.results, gameDifficulty));
      }
    } catch (err) {
      console.warn(`Failed to fetch questions for category ${catId}:`, err.message);
    }

    // ── True/False ─────────────────────────────────────────────────────────
    await sleep(5500);
    const urlBool = `${OPENTDB_BASE}/api.php?amount=10&category=${catId}&type=boolean&encode=url3986&token=${token}${diffParam}`;
    try {
      const data = await fetchJSON(urlBool);
      if (data.response_code === 0 && data.results.length > 0) {
        allQuestions.push(...processQuestions(data.results, gameDifficulty));
      }
    } catch (err) {
      console.warn(`Failed to fetch T/F questions for category ${catId}:`, err.message);
    }
  }

  shuffle(allQuestions);
  return allQuestions.slice(0, totalCount);
}

// Transform raw API results into game-ready question objects
function processQuestions(results, gameDifficulty = 'easy') {
  const cfg = DIFFICULTY_CONFIG[gameDifficulty] || DIFFICULTY_CONFIG.easy;
  return results.map((raw, idx) => {
    const question = decodeURIComponent(raw.question);
    const correct = decodeURIComponent(raw.correct_answer);
    const incorrect = raw.incorrect_answers.map(a => decodeURIComponent(a));
    const category = decodeURIComponent(raw.category);
    const difficulty = raw.difficulty;

    const pool = [correct, ...incorrect];
    shuffle(pool);
    const answers = pool.map((text, i) => ({ id: ANSWER_IDS[i], text }));
    const correctId = answers.find(a => a.text === correct).id;

    const isTF = incorrect.length === 1;
    const baseTime = isTF ? 10 : (difficulty === 'hard' ? 25 : difficulty === 'medium' ? 20 : 15);
    const timeLimit = Math.max(5, Math.round(baseTime * cfg.timeMult));

    return {
      questionId: `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      difficulty,
      question,
      answers,
      correctId,
      timeLimit,
      scoreMult: cfg.scoreMult,
    };
  });
}

module.exports = { fetchCategories, fetchQuestions };
