// Resolve and disk-cache non-spoiler illustrations/photos for Quiz questions.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CACHE_PATH = fileURLToPath(new URL('../../data/question-images.json', import.meta.url));
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const WIKI_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'SmallHoursGames/2.0 (https://smallhours.games)';

const STOP_WORDS = new Set([
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'many', 'much', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'from',
  'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'can', 'will', 'just', 'should', 'now', 'does', 'did', 'has', 'have', 'had',
  'following', 'these', 'considered', 'commonly', 'known', 'name', 'called',
  'located', 'founded', 'first', 'last', 'main', 'mainly', 'used', 'part',
]);

const CATEGORY_FALLBACKS = [
  [/geograph/i, 'World map'],
  [/history/i, 'History'],
  [/science|nature/i, 'Science'],
  [/sport/i, 'Sports equipment'],
  [/film|movie/i, 'Cinema'],
  [/music/i, 'Musical instrument'],
  [/television|tv/i, 'Television'],
  [/video game|gaming/i, 'Video game'],
  [/book|literature/i, 'Book'],
  [/art/i, 'Painting'],
  [/mythology/i, 'Greek mythology'],
  [/animal/i, 'Wildlife'],
  [/vehicle|auto/i, 'Car'],
];

let memoryCache = null;

function decodeText(str = '') {
  return String(str)
    .replace(/&shy;/gi, '')
    .replace(/&ldquo;|&rdquo;|&quot;|&#0*34;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&([a-z])(acute|grave|circ|uml|tilde|ring|slash|cedil);/gi, '$1')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(str = '') {
  return decodeText(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isSpoilerTopic(topic, question) {
  const t = norm(topic);
  if (!t) return true;
  const answers = [question.correct_answer, ...(question.incorrect_answers || [])]
    .map(norm)
    .filter(Boolean);
  for (const ans of answers) {
    if (t === ans) return true;
    if (ans.length >= 4 && (t.includes(ans) || ans.includes(t))) return true;
  }
  return false;
}

export function extractLocalCandidates(question) {
  const text = decodeText(question.question || '');
  const candidates = [];

  // 1. Quoted phrases inside the question (e.g. "Maid of the Mist", "Jurassic Park")
  for (const match of text.matchAll(/"([^"]{3,50})"/g)) {
    candidates.push(match[1].trim());
  }

  // 2. Capitalized proper-noun sequences (skipping the first word of the sentence)
  const withoutLead = text.replace(/^[A-Za-z]+\s+/, '');
  for (const match of withoutLead.matchAll(/\b([A-Z][A-Za-z0-9'.-]*(?:\s+(?:of|the|and|in|on|for|&|[A-Z][A-Za-z0-9'.-]*)){0,4})\b/g)) {
    const phrase = match[1].replace(/\s+(of|the|and|in|on|for)$/i, '').trim();
    if (phrase.length >= 3 && !STOP_WORDS.has(phrase.toLowerCase())) {
      candidates.push(phrase);
    }
  }

  // 3. Meaningful keywords from the question text
  const words = text
    .replace(/[?"'.,:;!()[\]]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length > 0) {
    candidates.push(words.slice(0, 3).join(' '));
    if (words.length > 1) candidates.push(words[words.length - 1]);
  }

  // 4. Category visual fallback
  const cat = String(question.category || '');
  for (const [pattern, title] of CATEGORY_FALLBACKS) {
    if (pattern.test(cat)) {
      candidates.push(title);
      break;
    }
  }
  candidates.push('Encyclopedia');

  const seen = new Set();
  return candidates.filter(c => {
    const k = norm(c);
    if (!k || seen.has(k) || isSpoilerTopic(c, question)) return false;
    seen.add(k);
    return true;
  });
}

async function suggestTopicsWithGemini(questions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || questions.length === 0) return null;

  const payload = questions.map(q => ({
    question: decodeText(q.question),
    category: q.category || 'General Knowledge',
    forbidden: [q.correct_answer, ...(q.incorrect_answers || [])].map(decodeText),
  }));

  const prompt = [
    'For each trivia question below, return a JSON array of arrays of 3 Wikipedia article titles: [primarySubjectInQuestion, secondarySubjectInQuestion, concreteVisualNounFallback].',
    'Rules:',
    '1. Pick concrete subjects mentioned IN the question itself that visually suit the question on a TV quiz show.',
    '2. NEVER output, include, or hint at any of the forbidden answers for that question.',
    '3. The 3rd title must be a concrete, common physical object or place with a Wikipedia photo (e.g. "Playing card", "Mining", "Flag", "Book", "Compass", "Globe").',
    `Questions:\n${JSON.stringify(payload)}`,
  ].join('\n');

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
  if (!text) return null;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : null;
}

async function fetchWikiThumbnailsByTitles(titles) {
  const thumbMap = new Map();
  const unique = [...new Set(titles.map(t => String(t || '').trim()).filter(Boolean))];
  if (unique.length === 0) return { lookup: () => null };

  const redirectMap = new Map();
  const normMap = new Map();

  for (let i = 0; i < unique.length; i += 45) {
    const batch = unique.slice(i, i + 45);
    const url = `${WIKI_ENDPOINT}?action=query&titles=${encodeURIComponent(batch.join('|'))}&redirects=1&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=640&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const n of data.query?.normalized || []) {
      normMap.set(n.from.toLowerCase(), n.to.toLowerCase());
    }
    for (const r of data.query?.redirects || []) {
      redirectMap.set(r.from.toLowerCase(), r.to.toLowerCase());
    }
    for (const page of Object.values(data.query?.pages || {})) {
      if (page.thumbnail?.source && page.title) {
        thumbMap.set(page.title.toLowerCase(), {
          title: page.title,
          url: page.thumbnail.source,
        });
      }
    }
  }

  return {
    lookup(rawTitle) {
      let key = String(rawTitle || '').trim().toLowerCase();
      if (normMap.has(key)) key = normMap.get(key);
      if (redirectMap.has(key)) key = redirectMap.get(key);
      return thumbMap.get(key) || null;
    },
  };
}

async function searchWikiThumbnail(query, question) {
  if (!query) return null;
  const url = `${WIKI_ENDPOINT}?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=640&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const page of pages) {
    if (page.thumbnail?.source && !isSpoilerTopic(page.title, question)) {
      return page.thumbnail.source;
    }
  }
  return null;
}

async function loadCache(cachePath) {
  if (cachePath === DEFAULT_CACHE_PATH && memoryCache) return memoryCache;
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map(Object.entries(parsed));
    if (cachePath === DEFAULT_CACHE_PATH) memoryCache = map;
    return map;
  } catch {
    const map = new Map();
    if (cachePath === DEFAULT_CACHE_PATH) memoryCache = map;
    return map;
  }
}

async function saveCache(cachePath, map) {
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(Object.fromEntries(map)), 'utf8');
  } catch {
    // Non-fatal if disk write fails
  }
}

export async function enrichQuestionsWithImages(questions, options = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  if (process.env.VITEST && !options.allowInTests) return questions;

  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const cache = await loadCache(cachePath);

  const missing = questions.filter(q => q && !q.media && !q.image && (!q.id || !cache.has(q.id)));
  if (missing.length > 0) {
    let geminiLists = null;
    try {
      geminiLists = await suggestTopicsWithGemini(missing);
    } catch {
      geminiLists = null;
    }

    const candidatesPerQuestion = missing.map((q, idx) => {
      const aiList = Array.isArray(geminiLists?.[idx]) ? geminiLists[idx] : [];
      const validAi = aiList
        .map(t => String(t || '').trim())
        .filter(t => t && !isSpoilerTopic(t, q));
      const local = extractLocalCandidates(q);
      return [...new Set([...validAi, ...local])];
    });

    try {
      const { lookup } = await fetchWikiThumbnailsByTitles(candidatesPerQuestion.flat());
      let updated = false;

      for (let i = 0; i < missing.length; i++) {
        const q = missing[i];
        const candidates = candidatesPerQuestion[i];
        let imageUrl = null;

        for (const candidate of candidates) {
          const hit = lookup(candidate);
          if (hit && !isSpoilerTopic(hit.title, q)) {
            imageUrl = hit.url;
            break;
          }
        }

        if (!imageUrl && candidates.length > 0) {
          try {
            imageUrl = await searchWikiThumbnail(candidates[0], q);
          } catch {
            imageUrl = null;
          }
        }

        if (imageUrl && q.id) {
          cache.set(q.id, imageUrl);
          updated = true;
        }
        if (imageUrl) {
          q.image = imageUrl;
        }
      }

      if (updated) {
        await saveCache(cachePath, cache);
      }
    } catch {
      // Degrade gracefully without images if network is unreachable
    }
  }

  return questions.map(q => {
    if (!q || q.media) return q;
    const image = q.image || (q.id && cache.get(q.id)) || undefined;
    return image ? { ...q, image } : q;
  });
}
