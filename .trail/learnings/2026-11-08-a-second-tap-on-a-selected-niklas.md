---
title: "A second tap on a selected card only deselects it, it never plays or discards"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 21, tokens: 219351 }
id: l-29038d8a
scope: repo
status: active
src: agent
touches:
  - public/player.html
  - tests/frontend/card-table-screens.test.js
  - public/js/table-cards.js
  - public/css/table-cards.css
  - public/host.html
---

## Decided
A second tap on an already selected hand card deselects it, in Gin Rummy and in Palace (single cards, stacks and blind cards). Sending a card away takes a deliberate act: the big Play/Discard button, a tap on the pile, or a swipe up.

The owner asked for this because quick double taps had thrown away cards by mistake many times.

## Watch out
Do not bring back "tap twice to play" as a shortcut, and keep the help texts from suggesting it.

In the code: shTapCard and grSelectCard in public/player.html; covered by "a double tap never sends a card away" in tests/frontend/card-table-screens.test.js.
