import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPlaylistTracks, buildMusicQuestions, cleanTitle, musicPlaylists, findPlaylist, clearDeezerCache,
} from '../../src/fetcher/deezer.js';

function deezerTrack(id, title, artist, extra = {}) {
  return {
    id, title, readable: true, rank: 1000 - id,
    preview: `https://cdnt-preview.dzcdn.net/${id}.mp3`,
    artist: { name: artist },
    album: { title: title + ' (album)', cover_medium: `https://cdn-images.dzcdn.net/${id}.jpg` },
    ...extra,
  };
}

function stubFetch(body) {
  const fn = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(body) }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

// 12 tracks, 12 distinct artists and titles
const TRACKS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, title: `Song ${i + 1}`, artist: `Artist ${i + 1}`, album: '', cover: `c${i + 1}`,
  preview: `p${i + 1}`, rank: 100 - i,
}));

describe('fetchPlaylistTracks', () => {
  beforeEach(() => clearDeezerCache());
  afterEach(() => vi.unstubAllGlobals());

  it('maps tracks and drops ones without a preview', async () => {
    stubFetch({
      title: '80s Hits',
      tracks: { data: [deezerTrack(1, 'Take On Me', 'a-ha'), deezerTrack(2, 'No Clip', 'X', { preview: '' })] },
    });
    const result = await fetchPlaylistTracks(867825522);
    expect(result.ok).toBe(true);
    expect(result.title).toBe('80s Hits');
    expect(result.tracks).toEqual([{
      id: 1, title: 'Take On Me', artist: 'a-ha', album: 'Take On Me (album)',
      cover: 'https://cdn-images.dzcdn.net/1.jpg', preview: 'https://cdnt-preview.dzcdn.net/1.mp3', rank: 999,
    }]);
  });

  it('serves repeat requests from the short-lived cache', async () => {
    const fn = stubFetch({ title: 'x', tracks: { data: [deezerTrack(1, 'a', 'b')] } });
    await fetchPlaylistTracks(1);
    await fetchPlaylistTracks(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('maps Deezer errors', async () => {
    stubFetch({ error: { type: 'DataException', message: 'no data', code: 800 } });
    expect((await fetchPlaylistTracks(5)).error.code).toBe('NOT_FOUND');
    stubFetch({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } });
    expect((await fetchPlaylistTracks(6)).error.code).toBe('RATE_LIMITED');
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(await fetchPlaylistTracks(7)).toEqual({ ok: false, error: { code: 'NETWORK_ERROR', message: 'offline' } });
  });
});

describe('cleanTitle', () => {
  it('strips version suffixes but keeps meaningful brackets', () => {
    expect(cleanTitle('Bohemian Rhapsody (Remastered 2011)')).toBe('Bohemian Rhapsody');
    expect(cleanTitle('Here Comes The Sun - 2009 Remaster')).toBe('Here Comes The Sun');
    expect(cleanTitle('Lose Control (feat. X)')).toBe('Lose Control');
    expect(cleanTitle('(I Can\'t Get No) Satisfaction')).toBe('(I Can\'t Get No) Satisfaction');
    expect(cleanTitle('Waterloo')).toBe('Waterloo');
    expect(cleanTitle('Bangaranga (Eurovision)')).toBe('Bangaranga');
    expect(cleanTitle("Ne partez pas sans moi (Grand prix de L'Eurovision 1988)")).toBe('Ne partez pas sans moi');
  });
});

describe('buildMusicQuestions', () => {
  const seq = () => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

  it('builds quiz-shaped questions that alternate artist and title', () => {
    const qs = buildMusicQuestions(TRACKS, 6, { category: '80s Hits', rng: seq() });
    expect(qs).toHaveLength(6);
    expect(qs.map(q => q.question)).toEqual([
      'Who is the artist?', "What's the song called?", 'Who is the artist?',
      "What's the song called?", 'Who is the artist?', "What's the song called?",
    ]);
    for (const q of qs) {
      expect(q.id).toMatch(/^dz_\d+$/);
      expect(q.category).toBe('80s Hits');
      expect(q.incorrect_answers).toHaveLength(3);
      const all = [q.correct_answer, ...q.incorrect_answers].map(s => s.toLowerCase());
      expect(new Set(all).size).toBe(4);
      expect(q.media).toEqual(expect.objectContaining({ preview: expect.any(String), artist: expect.any(String), title: expect.any(String) }));
    }
    expect(new Set(qs.map(q => q.id)).size).toBe(6);
  });

  it('answers match the track they came from', () => {
    for (const q of buildMusicQuestions(TRACKS, 8, { rng: seq() })) {
      const expected = q.question === 'Who is the artist?' ? q.media.artist : q.media.title;
      expect(q.correct_answer).toBe(expected);
    }
  });

  it('skips songs the room has already heard', () => {
    const used = new Set(TRACKS.slice(0, 8).map(t => 'dz_' + t.id));
    const qs = buildMusicQuestions(TRACKS, 10, { usedIds: used, rng: seq() });
    expect(qs.map(q => q.id).every(id => !used.has(id))).toBe(true);
    expect(qs).toHaveLength(4);
  });

  it('falls back to title questions when artists repeat', () => {
    const sameArtist = TRACKS.map(t => ({ ...t, artist: 'ABBA' }));
    const qs = buildMusicQuestions(sameArtist, 4, { rng: seq() });
    expect(qs).toHaveLength(4);
    expect(qs.every(q => q.question === "What's the song called?")).toBe(true);
  });
});

describe('curated playlists', () => {
  it('have numeric ids that cannot collide with OpenTrivia categories', () => {
    const lists = musicPlaylists();
    expect(lists.length).toBeGreaterThanOrEqual(6);
    for (const p of lists) {
      expect(Number.isInteger(p.id)).toBe(true);
      expect(p.id).toBeGreaterThan(1000);
      expect(p.name).toBeTruthy();
    }
    expect(findPlaylist(String(lists[0].id))).toEqual(lists[0]);
    expect(findPlaylist(9)).toBeNull();
  });
});


describe('Full music pool rotation', () => {
  it('can select low-ranked songs even when higher-ranked songs remain', () => {
    const questions = buildMusicQuestions(TRACKS, 1, { rng: () => 0 });
    // Fisher-Yates with zero moves the first item to the end, keeping the
    // second item first. Reverse ranks to make this a low-ranked song.
    const reversed = TRACKS.map((t, i) => ({ ...t, rank: i }));
    expect(buildMusicQuestions(reversed, 1, { rng: () => 0 })[0].id).toBe(questions[0].id);
  });
});

describe('Plausible music alternatives', () => {
  it('prefers other songs by the same artist for title questions', () => {
    const tracks = Array.from({ length: 14 }, (_, i) => ({
      id: i, artist: i < 4 ? 'Same Artist' : 'Other ' + i,
      title: 'Song ' + i, rank: 100 - i, preview: 'clip', cover: '',
    }));
    const usedIds = new Set(tracks.slice(1).map(t => 'dz_' + t.id));
    const [q] = buildMusicQuestions(tracks, 1, { usedIds, offset: 1 });
    expect(q.correct_answer).toBe('Song 0');
    expect(q.incorrect_answers.sort()).toEqual(['Song 1', 'Song 2', 'Song 3']);
  });
  it('shortlists similarly popular artists while preserving four distinct answers', () => {
    const tracks = Array.from({ length: 20 }, (_, i) => ({
      id: i, artist: 'Artist ' + i, title: 'Song ' + i,
      rank: 10000 - i * 400, preview: 'clip', cover: '',
    }));
    const usedIds = new Set(tracks.slice(1).map(t => 'dz_' + t.id));
    const [q] = buildMusicQuestions(tracks, 1, { usedIds });
    expect(q.incorrect_answers).toHaveLength(3);
    for (const alternative of q.incorrect_answers) {
      expect(tracks.slice(1, 9).map(t => t.artist)).toContain(alternative);
    }
    expect(new Set([q.correct_answer, ...q.incorrect_answers]).size).toBe(4);
  });
});
