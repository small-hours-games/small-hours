// Small Hours - Deezer API client (Music Quiz)
// Public API, no key needed. Preview URLs are signed and expire (~30 min), so tracks
// are only cached in memory for a short while and never written to disk.

import { readFileSync } from 'node:fs';

const PLAYLISTS = JSON.parse(readFileSync(new URL('./music-playlists.json', import.meta.url), 'utf-8'));

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // playlistId -> { at, tracks }

// Deezer error codes: https://developers.deezer.com/api/errors
const ERROR_CODES = {
  4: { code: 'RATE_LIMITED', message: 'Deezer rate limit hit, try again in a few seconds' },
  800: { code: 'NOT_FOUND', message: 'Playlist not found on Deezer' },
};

/**
 * Curated playlists offered as Music Quiz categories.
 * @returns {Array<{id: number, name: string, icon: string}>}
 */
export function musicPlaylists() {
  return PLAYLISTS.map(p => ({ ...p }));
}

export function findPlaylist(id) {
  return PLAYLISTS.find(p => p.id === Number(id)) || null;
}

/**
 * Fetch a playlist's tracks that have a playable preview.
 *
 * @param {number} playlistId
 * @returns {Promise<{ok: true, title: string, tracks: Array} | {ok: false, error: {code: string, message: string}}>}
 */
export async function fetchPlaylistTracks(playlistId) {
  const hit = cache.get(playlistId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, title: hit.title, tracks: hit.tracks };
  }
  try {
    const response = await fetch(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}`);
    const data = await response.json();
    if (data.error) {
      const known = ERROR_CODES[data.error.code];
      return { ok: false, error: known ? { ...known } : { code: 'DEEZER_ERROR', message: data.error.message || 'Deezer error' } };
    }
    const tracks = (data.tracks?.data || [])
      .filter(t => t.preview && t.readable !== false && t.title && t.artist?.name)
      .map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist.name,
        album: t.album?.title || '',
        cover: t.album?.cover_medium || '',
        preview: t.preview,
        rank: t.rank || 0,
      }));
    cache.set(playlistId, { at: Date.now(), title: data.title, tracks });
    return { ok: true, title: data.title, tracks };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

/** Test hook. */
export function clearDeezerCache() {
  cache.clear();
}

// "Song (Remastered 2011)" / "Song - 2009 Remaster" -> "Song", so the correct
// option doesn't stand out from the distractors.
const VERSION_WORDS = /remaster|version|edit|mix|live|mono|stereo|feat\.?|ft\.|from |deluxe|acoustic|single|eurovision|grand prix/i;
export function cleanTitle(title) {
  let t = String(title)
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (m, inner) => (VERSION_WORDS.test(inner) ? '' : m))
    .replace(/\s+-\s+.*$/, m => (VERSION_WORDS.test(m) ? '' : m))
    .trim();
  return t || String(title).trim();
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distinctOthers(values, correct) {
  const seen = new Set([correct.toLowerCase()]);
  const out = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// Keep distractors grounded in the playlist. Other songs by the same artist
// make title questions less obvious; nearby popularity ranks keep artist options
// comparable. Shuffle a shortlist so alternatives still vary between games.
function plausibleAlternatives(tracks, track, kind, rng) {
  const correct = kind === 'artist' ? track.artist : cleanTitle(track.title);
  const candidates = shuffle(tracks, rng)
    .filter(t => t.id !== track.id)
    .sort((a, b) => {
      if (kind === 'title') {
        const sameA = a.artist.toLowerCase() === track.artist.toLowerCase();
        const sameB = b.artist.toLowerCase() === track.artist.toLowerCase();
        if (sameA !== sameB) return sameA ? -1 : 1;
      }
      return Math.abs((a.rank || 0) - (track.rank || 0)) -
        Math.abs((b.rank || 0) - (track.rank || 0));
    });
  const values = t => kind === 'artist' ? t.artist : cleanTitle(t.title);
  const sameArtist = kind === 'title'
    ? candidates.filter(t => t.artist.toLowerCase() === track.artist.toLowerCase()) : [];
  const preferred = distinctOthers(sameArtist.map(values), correct);
  const shortlist = distinctOthers(candidates.map(values), correct).slice(0, 8);
  return distinctOthers([...shuffle(preferred, rng), ...shuffle(shortlist, rng)], correct);
}

/**
 * Turn playlist tracks into quiz-shaped questions (same shape as OpenTrivia ones,
 * plus `media`). Alternates "artist" and "title" questions; distractors are other
 * artists/titles from the same playlist.
 *
 * @param {Array} tracks - from fetchPlaylistTracks
 * @param {number} amount
 * @param {{usedIds?: Set<string>, category?: string, rng?: () => number, offset?: number}} [opts]
 *   offset: question number to continue the artist/title alternation from
 * @returns {Array}
 */
export function buildMusicQuestions(tracks, amount, { usedIds = new Set(), category = 'Music', rng = Math.random, offset = 0 } = {}) {
  // Give every playable song a turn, rather than restricting each game to hits.
  const fresh = tracks.filter(t => !usedIds.has('dz_' + t.id));
  const pool = shuffle([...new Map(fresh.map(t => [t.id, t])).values()], rng);

  const questions = [];
  for (const track of pool) {
    if (questions.length >= amount) break;
    const title = cleanTitle(track.title);
    const options = {
      artist: { question: 'Who is the artist?', correct: track.artist, others: plausibleAlternatives(tracks, track, 'artist', rng) },
      title: { question: "What's the song called?", correct: title, others: plausibleAlternatives(tracks, track, 'title', rng) },
    };
    const preferred = (questions.length + offset) % 2 === 0 ? 'artist' : 'title';
    const kind = options[preferred].others.length >= 3 ? preferred : (preferred === 'artist' ? 'title' : 'artist');
    const q = options[kind];
    if (q.others.length < 3) continue;

    questions.push({
      id: 'dz_' + track.id,
      question: q.question,
      correct_answer: q.correct,
      incorrect_answers: q.others.slice(0, 3),
      category,
      difficulty: 'medium',
      media: { preview: track.preview, cover: track.cover, artist: track.artist, title },
    });
  }
  return questions;
}
