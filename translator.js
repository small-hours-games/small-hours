'use strict';
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, 'translation-cache.json');

// Public LibreTranslate instances — tried in order until one succeeds
const INSTANCES = [
  'https://translate.fedilab.app',
  'https://libretranslate.de',
  'https://translate.argosopentech.com',
];

// Quiz lang code → LibreTranslate lang code
const LANG_MAP = { sv: 'sv', de: 'de', fr: 'fr', es: 'es', no: 'nb', da: 'da' };

let cache = null;
function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
  return cache;
}
function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (e) { console.warn('Cache save failed:', e.message); }
}
function cacheKey(text, lang) {
  return `${lang}:${crypto.createHash('md5').update(text).digest('hex')}`;
}

// POST one text to a LibreTranslate instance, return translated string
async function translateOne(text, ltLang, instance) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ q: text, source: 'en', target: ltLang, format: 'text' });
    const url  = new URL(`${instance}/translate`);
    const mod  = url.protocol === 'https:' ? https : http;
    const req  = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.translatedText) resolve(j.translatedText);
          else reject(new Error('No translatedText'));
        } catch { reject(new Error('Bad JSON')); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function translateWithFallback(text, targetLang) {
  if (!text || !text.trim()) return text;
  const ltLang = LANG_MAP[targetLang];
  if (!ltLang) return text;
  const key = cacheKey(text, targetLang);
  const c = loadCache();
  if (c[key]) return c[key];  // cache hit — instant
  for (const inst of INSTANCES) {
    try {
      const result = await translateOne(text, ltLang, inst);
      c[key] = result;
      return result;
    } catch { /* try next */ }
  }
  return text;  // all failed — return English original
}

// Translate all questions in parallel (all strings across all questions at once)
async function translateQuestions(questions, targetLang, onProgress) {
  if (targetLang === 'en' || !LANG_MAP[targetLang]) return questions;

  // Build flat task list: one entry per string to translate
  const tasks = [];
  questions.forEach((q, i) => {
    tasks.push({ i, field: 'question', text: q.question });
    q.answers.forEach((a, j) => tasks.push({ i, field: 'answer', j, text: a.text }));
  });

  // Translate all in parallel
  const results = await Promise.all(tasks.map(t => translateWithFallback(t.text, targetLang)));

  // Apply back
  const out = questions.map(q => ({ ...q, answers: q.answers.map(a => ({ ...a })) }));
  tasks.forEach((t, idx) => {
    if (t.field === 'question') out[t.i].question = results[idx];
    else out[t.i].answers[t.j].text = results[idx];
  });

  saveCache();
  if (onProgress) onProgress(questions.length, questions.length);
  return out;
}

module.exports = { translateQuestions };
