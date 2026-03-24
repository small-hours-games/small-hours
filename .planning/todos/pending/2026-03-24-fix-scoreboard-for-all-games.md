---
created: 2026-03-24T11:24:12.351Z
title: Fix scoreboard for all games
area: ui
files:
  - src/engine/games/quiz.js
  - src/engine/games/spy.js
  - src/engine/games/shithead.js
  - src/engine/games/gin-rummy.js
---

## Problem

The scoreboard display on the TV/host screen needs a general fix across all games. Currently each game handles score display independently — there's no consistent scoreboard pattern. As more games are added (gin-rummy being the latest), a unified scoreboard approach would prevent per-game display bugs and ensure a consistent spectator experience.

## Solution

TBD — Audit each game's `view()` function for score-related fields, identify inconsistencies, and either:
1. Standardize score fields in each game's view output (e.g., always return `scores`, `currentRound`, `gameStatus`)
2. Or create a shared scoreboard component on the frontend that adapts to each game's score shape
