---
created: 2026-03-22T04:37:24.378Z
title: Fix shithead card 2 not playable
area: engine
files:
  - src/engine/games/shithead.js
---

## Problem

The card "2" in the Shithead game is not playable when it should be. In Shithead, the 2 is typically a special/reset card that can be played on any pile — it resets the pile so the next player can play any card. The current implementation appears to reject the 2 as an invalid play, likely due to the card validation logic not accounting for 2's special status.

## Solution

Investigate the play validation logic in `src/engine/games/shithead.js` — specifically the action handler that checks whether a card can be played on the current pile. The rank comparison or special card check likely doesn't include rank 2 as a valid play. Fix the validation to allow 2 to be played on any pile card.
