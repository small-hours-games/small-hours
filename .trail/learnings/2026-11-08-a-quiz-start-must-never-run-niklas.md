---
title: "A quiz start must never run twice, and easy question buckets must not bulk-generate audio"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 29, tokens: 190568 }
id: l-5cac4611
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - music/quiz-and-cards-two.mp3
  - music/quiz-and-cards.mp3
  - package-lock.json
  - package.json
  - public/host.html
  - public/js/lobby-music.js
  - public/js/quiz-narrator.js
  - src/transport/http.js
  - tests/frontend/lobby-music.test.js
---

## Decided
While a game is being prepared, further starts are ignored, and so are starts once a game is running. Preparing a quiz can take up to 3.5 seconds while it waits for the first question's narration, and nothing looked like it was happening, so a second tap on Start created a second game and reset the countdown to 5 on every screen.

Quiz plays easy questions first, then medium, and hard only when nothing else is left.

## Watch out
Only the mixed question buckets may trigger the background audio generation. Each difficulty bucket holds up to 50 questions, so generating audio for all of them would use up the Gemini quota, and each game already narrates the questions it uses.

In the code: startingGame in src/session/room.js and src/transport/handlers/game.js; difficulty in src/fetcher/cached-fetcher.js; easierFirst in src/engine/games/quiz.js.
