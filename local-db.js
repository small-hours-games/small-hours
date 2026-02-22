'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OPENTDB_BASE = 'https://opentdb.com';
const DB_PATH = path.join(__dirname, 'questions-db.json');
const RATE_LIMIT_DELAY = 5500; // ms between category requests

// ── Shared fetch helper (duplicated here to avoid circular deps) ──────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error from ' + url)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Download state ─────────────────────────────────────────────────────────

let state = {
  active: false,
  current: 0,   // categories done so far
  total: 0,     // total categories
  label: '',    // current category name
  error: null,
};

function getState() { return { ...state }; }

// ── Load / save ────────────────────────────────────────────────────────────

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not read local DB:', e.message);
  }
  return null;
}

function dbStatus() {
  const db = loadDB();
  if (!db) return { exists: false };
  const questionCount = db.categories.reduce((n, c) => n + c.questions.length, 0);
  return {
    exists: true,
    questionCount,
    categoryCount: db.categories.length,
    downloadedAt: db.downloadedAt,
  };
}

// ── Download all categories from opentdb ───────────────────────────────────

async function downloadDatabase() {
  if (state.active) return { ok: false, message: 'Download already in progress.' };

  state = { active: true, current: 0, total: 0, label: 'Fetching category list…', error: null };

  try {
    const catData = await fetchJSON(`${OPENTDB_BASE}/api_category.php`);
    const categories = catData.trivia_categories;
    state.total = categories.length;

    const db = { downloadedAt: new Date().toISOString(), categories: [] };

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      state.current = i;
      state.label = cat.name;

      if (i > 0) await sleep(RATE_LIMIT_DELAY);

      const url = `${OPENTDB_BASE}/api.php?amount=50&category=${cat.id}&type=multiple&encode=url3986`;
      try {
        let data = await fetchJSON(url);

        if (data.response_code === 5) {
          console.warn(`Rate limited on "${cat.name}", retrying after 6s…`);
          await sleep(6000);
          data = await fetchJSON(url);
        }

        if (data.response_code === 0 && data.results.length > 0) {
          // Decode all strings now, store decoded
          const questions = data.results.map(raw => ({
            category: cat.name,
            difficulty: raw.difficulty,
            question: decodeURIComponent(raw.question),
            correct_answer: decodeURIComponent(raw.correct_answer),
            incorrect_answers: raw.incorrect_answers.map(a => decodeURIComponent(a)),
          }));
          db.categories.push({ id: cat.id, name: cat.name, questions });
          console.log(`  ✓ ${cat.name} — ${questions.length} questions`);
        } else {
          console.warn(`  ✗ ${cat.name} — response_code ${data.response_code}`);
        }
      } catch (err) {
        console.warn(`  ✗ ${cat.name} — ${err.message}`);
      }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db));
    const total = db.categories.reduce((n, c) => n + c.questions.length, 0);
    console.log(`\nLocal DB saved: ${total} questions across ${db.categories.length} categories\n`);

    state = { active: false, current: categories.length, total: categories.length, label: 'Done', error: null };
    return { ok: true };

  } catch (err) {
    state = { active: false, current: 0, total: 0, label: '', error: err.message };
    return { ok: false, message: err.message };
  }
}

// ── Sample questions from local DB ─────────────────────────────────────────

const ANSWER_IDS = ['A', 'B', 'C', 'D'];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// time limits and scoring multiplier per game difficulty
const DIFFICULTY_CONFIG = {
  easy:   { filter: ['easy'],   timeMult: 1.0, scoreMult: 1.0 },
  medium: { filter: ['medium'], timeMult: 1.0, scoreMult: 1.5 },
  hard:   { filter: ['hard'],   timeMult: 1.0, scoreMult: 2.0 },
};

function processRaw(raw, gameDifficulty = 'easy') {
  const pool = [raw.correct_answer, ...raw.incorrect_answers];
  shuffle(pool);
  const answers = pool.map((text, i) => ({ id: ANSWER_IDS[i], text }));
  const correctId = answers.find(a => a.text === raw.correct_answer).id;

  const cfg = DIFFICULTY_CONFIG[gameDifficulty] || DIFFICULTY_CONFIG.easy;
  const baseTime = raw.difficulty === 'hard' ? 25 : raw.difficulty === 'medium' ? 20 : 15;
  const timeLimit = Math.max(5, Math.round(baseTime * cfg.timeMult));

  return {
    questionId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: raw.category,
    difficulty: raw.difficulty,
    question: raw.question,
    answers,
    correctId,
    timeLimit,
    scoreMult: cfg.scoreMult,
  };
}

// Returns processed questions from local DB for the given category IDs and count.
// Returns null if local DB doesn't exist.
function getQuestionsFromLocalDB(categoryIds, totalCount, gameDifficulty = 'easy') {
  const db = loadDB();
  if (!db) return null;

  const cfg = DIFFICULTY_CONFIG[gameDifficulty] || DIFFICULTY_CONFIG.easy;
  const catSet = new Set(categoryIds.map(Number));
  let pool = [];
  for (const cat of db.categories) {
    if (catSet.has(cat.id)) pool.push(...cat.questions);
  }

  // Filter by question difficulty if required
  if (cfg.filter) pool = pool.filter(q => cfg.filter.includes(q.difficulty));

  if (pool.length === 0) return null;

  shuffle(pool);
  return pool.slice(0, totalCount).map(q => processRaw(q, gameDifficulty));
}

module.exports = { downloadDatabase, getState, dbStatus, getQuestionsFromLocalDB, DIFFICULTY_CONFIG };
