---
title: "Card flights run at half the original speed, because ten times slower was too slow"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 1, tokens: 7893 }
id: l-2cee67c3
scope: repo
status: active
src: agent
touches:
  - package-lock.json
  - package.json
  - public/css/table-cards.css
  - public/host.html
  - public/js/table-cards.js
  - public/player.html
  - src/transport/ws-adapter.js
  - tests/frontend/card-table-screens.test.js
  - tests/frontend/table-cards.test.js
---

## Decided
Thrown cards take twice their original time. The owner first asked for 90% slower, then settled on 50% after that round.

## Tried and ruled out
Ten times slower meant flights of up to 9 seconds. Bots then had to wait about 8.5 seconds per Palace move for a card to land.

## Watch out
The bot's wait after a Palace card must stay longer than the TV flight, or the next card is thrown while the last one is in the air.

A hand card redrawn while it is held must get its lifted pose with transitions off. Measuring the hand first styles the new card at rest, so it sinks and lifts again, which looks like shaking.

When filming animations in headless Chromium, bring the tab to the front: background tabs run them slower and the timings mislead.

In the code: TC_FLIGHT_SLOWDOWN and _tcRedrawn in public/js/table-cards.js; BOT_AFTER_FLIGHT_MS in src/transport/ws-adapter.js (2000 ms against a usual flight of 1584 ms).
