'use strict';

// Generates lyrics quiz questions from small-hours-music lyrics files.
// Run: node games/lyrics/generate-questions.js
// Output: games/lyrics/data/questions.json

const fs = require('fs');
const path = require('path');

const LYRICS_DIR = path.join(__dirname, '..', '..', '..', 'small-hours-music', 'data', 'lyrics');
const TRACKS_PATH = path.join(__dirname, '..', '..', '..', 'small-hours-music', 'data', 'tracks.json');
const OUT_PATH = path.join(__dirname, 'data', 'questions.json');

function loadLyrics() {
  const tracks = JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
  const songs = [];

  for (const track of tracks) {
    const lyricsPath = path.join(LYRICS_DIR, `${track.sunoId}.txt`);
    if (!fs.existsSync(lyricsPath)) continue;

    const raw = fs.readFileSync(lyricsPath, 'utf8');
    // Clean lines: strip section markers, trim, filter empty/short
    const lines = raw
      .split('\n')
      .map(l => l.replace(/^\[.*?\]\s*/, '').trim())
      .filter(l => l.length >= 8);

    if (lines.length < 3) continue;
    songs.push({ id: track.sunoId, title: track.title, lines });
  }

  return songs;
}

function deduplicateSongs(songs) {
  // Many tracks are variations with identical lyrics — dedupe by first 3 lines
  const seen = new Set();
  return songs.filter(s => {
    const key = s.lines.slice(0, 3).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateQuestions(songs) {
  // Collect all unique lines across all songs for wrong-answer pool
  const allLines = new Set();
  for (const s of songs) {
    for (const l of s.lines) allLines.add(l);
  }
  const linePool = [...allLines];

  const questions = [];

  for (const song of songs) {
    const { lines, title, id } = song;

    // Create questions from consecutive line pairs
    for (let i = 0; i < lines.length - 1; i++) {
      const prompt = lines[i];
      const correctAnswer = lines[i + 1];

      // Skip if prompt or answer is too similar to avoid near-duplicates
      if (prompt === correctAnswer) continue;

      // Pick 3 wrong answers from other songs' lines
      const wrongs = [];
      const tried = new Set([correctAnswer, prompt]);
      let attempts = 0;
      while (wrongs.length < 3 && attempts < 100) {
        const candidate = linePool[Math.floor(Math.random() * linePool.length)];
        attempts++;
        if (tried.has(candidate)) continue;
        // Don't pick lines from the same song
        if (song.lines.includes(candidate)) continue;
        tried.add(candidate);
        wrongs.push(candidate);
      }

      if (wrongs.length < 3) continue;

      // Shuffle answer positions
      const answers = [correctAnswer, ...wrongs];
      const indices = [0, 1, 2, 3];
      for (let j = indices.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [indices[j], indices[k]] = [indices[k], indices[j]];
      }

      const shuffled = indices.map(idx => ({
        id: String.fromCharCode(65 + indices.indexOf(idx)),
        text: answers[idx],
      }));
      const correctId = shuffled.find(a => a.text === correctAnswer).id;

      questions.push({
        songId: id,
        songTitle: title,
        prompt,
        answers: shuffled,
        correctId,
      });
    }
  }

  return questions;
}

// Shuffle array in place
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function main() {
  const songs = deduplicateSongs(loadLyrics());
  console.log(`Loaded ${songs.length} unique songs with lyrics`);

  const questions = shuffle(generateQuestions(songs));
  console.log(`Generated ${questions.length} questions`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(questions, null, 2) + '\n');
  console.log(`Written to ${OUT_PATH}`);
}

main();
