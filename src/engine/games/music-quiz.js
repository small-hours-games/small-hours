// Small Hours - Music Quiz
// The quiz game with questions built from Deezer playlists. Every question comes
// from a randomly picked genre (playlist); its wrong options come from the same
// genre. Phases, scoring and views are the regular quiz's.
import quiz, { PHASE_DURATIONS as QUIZ_DURATIONS } from './quiz.js';
import { musicPlaylists, fetchPlaylistTracks, buildMusicQuestions } from '../../fetcher/deezer.js';

// Songs need longer than trivia to recognise; the 30 s clip runs on through the reveal
const PHASE_DURATIONS = { ...QUIZ_DURATIONS, question: 20000 };

/**
 * Pick one question per slot from a random genre, never the same genre twice
 * in a row when there's a choice.
 *
 * @param {Array<{playlist: object, tracks: Array}>} genres - playlists with their tracks
 * @param {number} amount
 * @param {Set<string>} usedIds - question ids the room has already heard
 * @param {() => number} [rng]
 * @returns {Array} quiz-shaped questions
 */
export function buildMixedQuestions(genres, amount, usedIds, rng = Math.random) {
  const taken = new Set(usedIds);
  const questions = [];
  let previous = null;
  while (questions.length < amount) {
    // One pick per available genre per cycle keeps a random draw from dominating.
    const cycle = [...genres];
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }
    if (cycle.length > 1 && cycle[0] === previous) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    let added = false;
    for (const genre of cycle) {
      if (questions.length >= amount) break;
      const [q] = buildMusicQuestions(genre.tracks, 1, {
        usedIds: taken, category: genre.playlist.name, rng, offset: questions.length,
      });
      if (!q) continue;
      taken.add(q.id);
      questions.push(q);
      previous = genre;
      added = true;
    }
    if (!added) break;
  }
  return questions;
}

const musicQuiz = {
  ...quiz,

  async prepare(config, { usedQuestionIds }) {
    const amount = config.questionCount || 10;

    // Fresh tracks every game: Deezer preview URLs expire after ~30 minutes
    const results = await Promise.all(musicPlaylists().map(async playlist => ({
      playlist,
      result: await fetchPlaylistTracks(playlist.id),
    })));
    const genres = results
      .filter(({ result }) => result.ok && result.tracks.length >= 4)
      .map(({ playlist, result }) => ({ playlist, tracks: result.tracks }));
    if (genres.length === 0) {
      const firstError = results.find(r => !r.result.ok)?.result.error.message || 'no playable songs';
      throw new Error(`Failed to load music: ${firstError}`);
    }

    const selected = buildMixedQuestions(genres, amount, usedQuestionIds);
    // Preserve every fresh pick, then unlock old songs from oldest to newest.
    // Keep picks from this round excluded so no song plays twice in one game.
    const excluded = new Set([...usedQuestionIds, ...selected.map(q => q.id)]);
    for (const id of usedQuestionIds) {
      if (selected.length >= amount) break;
      if (selected.some(q => q.id === id)) continue;
      excluded.delete(id);
      const extra = buildMixedQuestions(genres, 1, excluded);
      if (extra.length) {
        // Continue artist/title alternation at the actual question position.
        const genre = genres.find(g => g.tracks.some(t => 'dz_' + t.id === extra[0].id));
        const [question] = buildMusicQuestions(genre.tracks, 1, {
          usedIds: new Set(genre.tracks.filter(t => 'dz_' + t.id !== extra[0].id).map(t => 'dz_' + t.id)), category: genre.playlist.name, offset: selected.length,
        });
        selected.push(question);
        excluded.add(question.id);
      }
    }
    if (selected.length === 0) {
      throw new Error('No playable songs right now');
    }

    return {
      config: { ...config, questions: selected, questionDuration: PHASE_DURATIONS.question },
      trackIds: selected.map(q => q.id),
    };
  },
};

export { PHASE_DURATIONS };
export default musicQuiz;
