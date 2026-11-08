---
title: "A quiz start must never run twice, and the quiz voice is only generated per game"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 9, tokens: 658049 }
id: l-92c4a555
scope: repo
status: active
replaces: l-5cac4611
src: agent
touches:
  - src/session/room.js
  - src/transport/handlers/game.js
  - src/fetcher/cached-fetcher.js
  - games/quiz/rules.js
  - src/fetcher/cached-narration.js
  - games/quiz/client/lib/quiz-narrator.js
---

## Decided
While a game is being prepared, further starts are ignored, and so are starts once a game is running. Preparing a quiz can take up to 3.5 seconds while it waits for the first question's narration, and nothing looked like it was happening, so a second tap on Start created a second game and reset the countdown to 5 on every screen.

Quiz plays easy questions first, then medium, and hard only when nothing else is left.

Narration is only generated for the questions a game uses. Generating audio for whole question buckets in the background used up the Gemini quota, which pushed the quiz itself onto the robotic fallback voice.

## Watch out
The robotic fallback clip must only be used after Gemini has just answered with a quota error, or it stays forever once it is saved.

A slow clip is only replaced by the browser voice when the browser has voices. Some TV WebViews have none, and there a late clip is better than silence.

In the code: startingGame in src/session/room.js and src/transport/handlers/game.js; difficulty in src/fetcher/cached-fetcher.js; easierFirst in games/quiz/rules.js; getNarration in src/fetcher/cached-narration.js; canUseBrowserVoice in games/quiz/client/lib/quiz-narrator.js.
