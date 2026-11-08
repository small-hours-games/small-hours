---
title: "A Palace move locks the phone until the server answers, and only a real server message may unlock it"
author: Niklas
date: 2026-11-08
branch: design/logo-card-tables
cost: { minutes: 27, tokens: 186325 }
id: l-1c880809
scope: repo
status: active
src: agent
touches:
  - games/README.md
  - games/shithead/client/phone.js
  - games/shithead/client/style.css
  - package-lock.json
  - package.json
  - src/transport/handlers/game.js
  - tests/transport/refused-move.test.js
  - public/css/topbar-show.css
  - public/js/topbar-show.js
  - README.md
---

## Decided
The phone hides a thrown card before the server answers, so a Palace move locks further moves until a game state arrives. If none comes within 3 seconds the card goes back with a message. Only a state from the server releases the lock. Local redraws (tap, sort, resize, error) must not, or a second card can be thrown while the first is still on its way.

A refused move now reaches the player who made it as a toast. Before this it only reached the TV, so the rules' error texts were never seen on a phone.

## Tried and ruled out
The reported "card flew off and vanished" in Palace was never reproduced, and the player could not recall the card. Phone and server disagreeing on legal cards is ruled out: all 182 rank and pile combinations gave the same answer. A refused move alone cannot make a card vanish, because the server resends the state and the hand is redrawn. Left as likely causes: a burn (10 or four of a kind empties the pile at once, and the thrower's phone showed nothing) and a lost connection (the move is dropped silently).

## Watch out
A face-down Palace card is still hidden with no throw animation.

To check the phone page without a real room, serve the rendered page at /player/<code> (it shows no game sections without a code) and stub WebSocket. That avoids the Discord webhook and the voice quota.

In the code: games/shithead/client/phone.js (shMoveSent, shMoveAnswered, shShowBurn), src/transport/handlers/game.js (applyGameAction), tests/transport/refused-move.test.js.
