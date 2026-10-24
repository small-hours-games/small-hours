// Integration test: Music Quiz (its own game, mixed Deezer genres) and the trimmed
// quiz category vote.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/fetcher/deezer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlaylistTracks: vi.fn(),
}));
vi.mock('../../src/fetcher/cached-fetcher.js', async (importOriginal) => ({
  MAIN_CATEGORY_IDS: (await importOriginal()).MAIN_CATEGORY_IDS,
  fetchQuestions: vi.fn(),
  fetchCategories: vi.fn(),
}));

import { fetchPlaylistTracks, musicPlaylists } from '../../src/fetcher/deezer.js';
import { fetchQuestions, fetchCategories, MAIN_CATEGORY_IDS } from '../../src/fetcher/cached-fetcher.js';
import { buildMixedQuestions } from '../../src/engine/games/music-quiz.js';
import { Room } from '../../src/session/room.js';
import { processAction, getView } from '../../src/engine/engine.js';
import { handleStartCategoryVote } from '../../src/transport/handlers/vote.js';
import { handleStartVotedGame } from '../../src/transport/handlers/game.js';

// 12 tracks per playlist, ids unique across playlists
function tracksFor(playlistId) {
  return Array.from({ length: 12 }, (_, i) => ({
    id: playlistId * 100 + i, title: `Song ${playlistId}-${i}`, artist: `Artist ${playlistId}-${i}`, album: '',
    cover: `cover${i}.jpg`, preview: `https://cdnt-preview.dzcdn.net/${playlistId}-${i}.mp3`, rank: 1000 - i,
  }));
}

function makeCtx() {
  const sent = [];
  return {
    sent,
    send: (_ws, msg) => sent.push(msg),
    broadcastToRoom: (_code, msg) => sent.push(msg),
    sendToPlayer: () => {},
    roomGameTypes: new Map(),
    schedulePhaseTimer: () => {},
    getPlayerNames: () => ({}),
  };
}

const ALL_CATEGORIES = Array.from({ length: 24 }, (_, i) => ({ id: 9 + i, name: 'Category ' + (9 + i) }));
const Q = (id) => ({ id, question: id + '?', correct_answer: 'A', incorrect_answers: ['B', 'C', 'D'], category: 'General', difficulty: 'easy' });

describe('Quiz category vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCategories.mockResolvedValue({ ok: true, categories: ALL_CATEGORIES });
  });

  it('offers only the main categories, in order', async () => {
    const room = new Room('CATS');
    const admin = room.addPlayer('Alice').playerId;
    await handleStartCategoryVote({}, { playerId: admin }, room, {}, makeCtx());
    expect(room.availableCategories.map(c => c.id)).toEqual(MAIN_CATEGORY_IDS);
    expect(MAIN_CATEGORY_IDS.length).toBeGreaterThanOrEqual(5);
    expect(MAIN_CATEGORY_IDS.length).toBeLessThanOrEqual(6);
    expect(MAIN_CATEGORY_IDS).not.toContain(12); // music lives in the Music Quiz
  });
});

describe('Quiz never starts empty', () => {
  beforeEach(() => vi.clearAllMocks());

  it('repeats questions once a room has played the whole cached pool', async () => {
    const pool = [Q('a'), Q('b'), Q('c')];
    fetchQuestions.mockResolvedValue({ ok: true, questions: pool });
    const room = new Room('REPT');
    room.addPlayer('Alice');
    for (const q of pool) room.usedQuestionIds.add(q.id);
    await room.startGame('quiz', { categoryId: 9, questionCount: 3 });
    expect(room.game.state.questions.map(q => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('prefers unplayed questions before repeating', async () => {
    fetchQuestions.mockResolvedValue({ ok: true, questions: [Q('a'), Q('b'), Q('c'), Q('d')] });
    const room = new Room('PREF');
    room.addPlayer('Alice');
    room.usedQuestionIds.add('a');
    room.usedQuestionIds.add('b');
    await room.startGame('quiz', { categoryId: 9, questionCount: 3 });
    expect(room.game.state.questions.slice(0, 2).map(q => q.id).sort()).toEqual(['c', 'd']);
    expect(room.game.state.questions[2].id).toBe('a');
  });
});

describe('Music Quiz', () => {
  let room, admin;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchPlaylistTracks.mockImplementation(async id => ({ ok: true, title: 'Deezer ' + id, tracks: tracksFor(id) }));
    room = new Room('MUSC');
    admin = room.addPlayer('Alice').playerId;
    room.addPlayer('Bob');
  });

  it('starts straight from the dashboard vote, without a category vote', async () => {
    room.suggestGame(admin, 'music-quiz');
    const ctx = makeCtx();
    await handleStartVotedGame({}, { playerId: admin }, room, {}, ctx);
    expect(ctx.sent.find(m => m.type === 'ERROR')).toBeUndefined();
    expect(room.votingActive).toBe(false);
    expect(fetchCategories).not.toHaveBeenCalled();
    expect(ctx.sent.find(m => m.type === 'MINI_GAME_STARTING').gameType).toBe('music-quiz');
    expect(room.game.state.questions).toHaveLength(10);
  });

  it('picks a random genre for every question, never the same twice in a row', async () => {
    await room.startGame('music-quiz', {});
    const { questions } = room.game.state;
    const genreNames = musicPlaylists().map(p => p.name);
    expect(questions.every(q => genreNames.includes(q.category))).toBe(true);
    for (let i = 1; i < questions.length; i++) expect(questions[i].category).not.toBe(questions[i - 1].category);
    expect(new Set(questions.map(q => q.category)).size).toBeGreaterThan(2);
    expect(new Set(questions.map(q => q.id)).size).toBe(questions.length);
    expect(questions.map(q => q.question)).toEqual(Array.from({ length: 10 }, (_, i) => (i % 2 ? "What's the song called?" : 'Who is the artist?')));
  });

  it('wrong options come from the same genre as the song', async () => {
    await room.startGame('music-quiz', {});
    for (const q of room.game.state.questions) {
      const playlist = musicPlaylists().find(p => p.name === q.category);
      const genreValues = tracksFor(playlist.id).flatMap(t => [t.artist, t.title]);
      for (const option of q.incorrect_answers) expect(genreValues).toContain(option);
    }
  });

  it('hides the song until reveal, but always exposes the clip and genre', async () => {
    await room.startGame('music-quiz', { questionCount: 4 });
    let game = processAction(room.game, { type: 'timerExpired', phase: 'countdown' }).game;
    const q = getView(game, admin).question;
    expect(q.media).toEqual({ preview: expect.stringContaining('dzcdn.net') });
    expect(q.category).toBeTruthy();

    game = processAction(game, { type: 'timerExpired', phase: 'question' }).game;
    const revealed = getView(game, admin).question.media;
    expect(revealed).toEqual(expect.objectContaining({ cover: expect.any(String), artist: expect.any(String), title: expect.any(String) }));
  });

  it('plays on when some genres fail to load', async () => {
    const [ok] = musicPlaylists();
    fetchPlaylistTracks.mockImplementation(async id => (id === ok.id
      ? { ok: true, title: 'x', tracks: tracksFor(id) }
      : { ok: false, error: { code: 'RATE_LIMITED', message: 'Deezer rate limit hit' } }));
    await room.startGame('music-quiz', { questionCount: 5 });
    expect(room.game.state.questions.every(q => q.category === ok.name)).toBe(true);
  });

  it('fails clearly when Deezer is unavailable', async () => {
    fetchPlaylistTracks.mockResolvedValue({ ok: false, error: { code: 'NETWORK_ERROR', message: 'offline' } });
    await expect(room.startGame('music-quiz', {})).rejects.toThrow(/Failed to load music: offline/);
  });
});

describe('buildMixedQuestions', () => {
  it('stops short instead of looping when songs run out', () => {
    const genres = [{ playlist: { name: 'Tiny' }, tracks: tracksFor(1).slice(0, 5) }];
    const qs = buildMixedQuestions(genres, 10, new Set());
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(new Set(qs.map(q => q.id)).size).toBe(qs.length);
  });
});


describe('Question rotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves replayed trivia to the back of the room history', async () => {
    fetchQuestions.mockResolvedValue({ ok: true, questions: ['a', 'b', 'c', 'd'].map(Q) });
    const room = new Room('ROTA');
    room.addPlayer('Alice');
    for (const id of ['a', 'b', 'c', 'd']) room.usedQuestionIds.add(id);
    await room.startGame('quiz', { questionCount: 2 });
    expect(room.game.state.questions.map(q => q.id)).toEqual(['a', 'b']);
    await room.startGame('quiz', { questionCount: 2 });
    expect(room.game.state.questions.map(q => q.id)).toEqual(['c', 'd']);
  });

  it('balances all available genres across a round', () => {
    const genres = [1, 2, 3].map(id => ({ playlist: { name: String(id) }, tracks: tracksFor(id) }));
    const questions = buildMixedQuestions(genres, 12, new Set());
    for (const category of ['1', '2', '3']) {
      expect(questions.filter(q => q.category === category)).toHaveLength(4);
    }
  });

  it('keeps the last fresh song when topping up an almost exhausted music pool', async () => {
    fetchPlaylistTracks.mockImplementation(async id => ({ ok: true, tracks: tracksFor(id) }));
    const room = new Room('LAST');
    room.addPlayer('Alice');
    const all = musicPlaylists().flatMap(p => tracksFor(p.id));
    for (const track of all.slice(0, -1)) room.usedQuestionIds.add('dz_' + track.id);
    await room.startGame('music-quiz', { questionCount: 5 });
    const ids = room.game.state.questions.map(q => q.id);
    expect(ids[0]).toBe('dz_' + all.at(-1).id);
    expect(new Set(ids).size).toBe(5);
    expect(ids.slice(1)).toEqual(all.slice(0, 4).map(t => 'dz_' + t.id));
  });
});
