---
title: "A game is one folder, and the page shells must not know about any single game"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 40, tokens: 356828 }
id: l-7bfadc08
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - games/README.md
  - games/_template/client/phone.html
  - games/_template/client/phone.js
  - games/_template/client/tv.js
  - games/_template/index.js
  - games/_template/rules.js
  - games/_template/rules.test.js
  - games/gin-rummy/rules.js
---

## Decided
Games are plugins in games/<id>/, found at startup. Adding a game means adding a folder, and a screen needs registering with the page API rather than editing the shell pages. If a game needs something the shell lacks, the shell gets it as something every game can use.

Sjuan was built this way to prove it: only its own folder changed.

## Watch out
Only Quiz's category vote still names a game in the core, because it is a step before the game starts.

Two browser tabs on one room share a reconnect token in localStorage, so the second tab takes over the first player. Use separate profiles or block that key when testing several players in one browser.

The test runner cannot import a game from outside the project folder, so temporary plugin folders in tests go under tmp/.

In the code: src/games/registry.js, src/games/client.js, public/js/game-api.js, games/README.md.
