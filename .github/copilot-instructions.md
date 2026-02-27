# GitHub Copilot Instructions

This file gives GitHub Copilot (and other AI coding agents) context about the Quiz-trivia project so suggestions and generated code stay consistent with the existing codebase.

## Project Overview

Quiz-trivia is a self-hosted, real-time multiplayer trivia game built with Node.js. A host runs the game from a browser (typically a TV); players join from their phones by scanning a QR code. All communication is over WebSockets.

## Repository Layout

```
server.js               — HTTP/HTTPS server, WebSocket upgrade handler, REST endpoints, room registry
game.js                 — Game class: state machine, scoring, player management
questions.js            — Fetch + normalise questions (local DB → Open Trivia DB API)
local-db.js             — Download and query the local question cache
translator.js           — Optional per-round translation of question text
public/
  index.html            — Landing page (create/join room)
  group/
    index.html          — In-room lobby (player view)
    display.html        — Big-screen display (TV/host view)
  games/
    quiz/index.html     — Quiz game (player view)
    shithead/index.html — Shithead card game (player view)
```

## Coding Conventions

- Always include `'use strict';` at the top of every server-side `.js` file.
- Use `const` and `let`; never `var`.
- Async operations use `async/await`; wrap them in `try/catch` and broadcast `{ type: 'ERROR', code, message }` to clients on failure.
- WebSocket message `type` values use `SCREAMING_SNAKE_CASE` (e.g., `GAME_STARTING`, `ANSWER_COUNT`).
- Keep game logic in `game.js`, not in `server.js`.
- Avoid adding new npm packages unless absolutely necessary.

## Game State Machine

The `Game` class in `game.js` cycles through these states:

```
LOBBY → FETCHING → COUNTDOWN → QUESTION_ACTIVE → REVEAL → BETWEEN_QUESTIONS
                                                                    ↓
                                                             (next question or)
                                                              GAME_OVER
```

Always check `this.state` before acting — most methods return early if the state is wrong.

## Key Patterns

### Broadcasting a message to all clients
```js
this._broadcast({ type: 'MY_EVENT', payload: value });
```

### Broadcasting to display/TV clients only (from server.js)
```js
broadcastToDisplays(room, { type: 'MY_HOST_EVENT', payload: value });
```

### Adding a new display (TV/host) WebSocket command
1. Add a `case 'MY_COMMAND':` inside the `role === 'display'` switch in `server.js → handleMessage`.
2. Implement the corresponding method on `Game` in `game.js`.

### Adding a new REST endpoint
Add it in `server.js` before the server `listen` call, following the existing `app.get` / `app.post` patterns.

## Room-based Architecture

The server maintains a `rooms` Map (room code → room object). Every WebSocket connects with a `?room=CODE&role=player|display` query string.

- **display** — the big-screen TV/host view; one or more per room (`room.displaySockets`)
- **player** — a participant joining from their phone (`room.playerSockets`)
- The first player to join a room becomes the **admin** (`room.adminUsername`); admin has privileges to start games, kick players, etc.
- A `Game` instance (`room.game`) is lazily created when the first player joins.
- Room codes are 4-character uppercase strings (e.g. `ABCD`). Create one via `POST /api/rooms`.

### Sending a message to one WebSocket
```js
sendTo(ws, { type: 'MY_EVENT', payload: value });
```

### Broadcasting to all sockets in a room
```js
broadcastAll(room, { type: 'MY_EVENT', payload: value });
```

## WebSocket Message Reference

| Direction | Type | Description |
|-----------|------|-------------|
| Display → Server | `START_GAME` | Begin a new game (compat for old host page) |
| Display → Server | `SKIP` | Skip the current reveal phase |
| Display → Server | `RESTART` | Reset to lobby |
| Display → Server | `CONTINUE_GAME` | Start another round, keeping scores |
| Display → Server | `SET_LANGUAGE` | Change active language |
| Player → Server | `JOIN` / `JOIN_LOBBY` | Register username, create or rejoin room |
| Player → Server | `ANSWER` | Submit an answer |
| Player → Server | `SET_READY` | Toggle ready state in lobby |
| Player → Server | `SUGGEST_GAME` | Vote for a game type (`quiz` or `shithead`) |
| Player → Server | `START_MINI_GAME` | Admin starts a specific game (admin only) |
| Player → Server | `REMOVE_PLAYER` | Admin kicks a player (admin only) |
| Player → Server | `RETURN_TO_LOBBY` / `RESTART` | Admin returns everyone to lobby (admin only) |
| Player → Server | `CATEGORY_VOTE` | Player votes for quiz categories |
| Player → Server | `SKIP` | Admin skips reveal (admin only) |
| Player → Server | `CONTINUE_GAME` | Admin continues after game over (admin only) |
| Player → Server | `SET_LANGUAGE` | Admin sets language (admin only) |
| Server → Display | `DISPLAY_OK` | Display connection confirmed + initial lobby state |
| Server → All | `LOBBY_UPDATE` | Full lobby state update (players, ready, votes, etc.) |
| Server → All | `VOTE_UPDATE` | Category vote tally update |
| Server → All | `QUESTION` | Question data + time limit |
| Server → All | `REVEAL` | Correct answer + score breakdown |
| Server → All | `GAME_OVER` | Final scores |
| Server → All | `GAME_FETCHING` | Questions are being loaded |
| Server → All | `GAME_STARTING` | Countdown before first question |
| Server → All | `COUNTDOWN_TICK` | Countdown tick |
| Server → All | `NEXT_QUESTION` | Transition to next question |
| Server → All | `RESTARTED` | Game reset to lobby |
| Server → All | `MINI_GAME_STARTING` | A mini-game is starting, includes URL |
| Server → All | `LANGUAGE_SET` | Language changed |
| Server → All | `ADMIN_CHANGED` | Admin role transferred to new player |
| Server → All | `PLAYER_JOINED` | Player list updated |
| Server → Player | `CONNECTED` | Player socket connected |
| Server → Player | `JOIN_OK` | Join confirmed (includes `isAdmin`, `roomCode`, `avatar`) |
| Server → Player | `ANSWER_CONFIRMED` | Answer received |
| Server → Player | `ANSWER_COUNT` | Count of how many players have answered |
| Server → Player | `PLAYER_REMOVED` | Player was kicked by admin |
| Server → All | `ERROR` | Error with `code` and `message` fields |

## What to Avoid

- Do not add business logic to `server.js` — it belongs in `game.js`.
- Do not introduce circular `require` dependencies between `questions.js` and `local-db.js`.
- Do not skip state checks in `game.js` methods.
- Do not commit secrets or credentials.
- Do not bypass the room registry — always look up `rooms.get(roomCode)` before acting on a room.
- Do not use `broadcastHosts` (it does not exist); use `broadcastToDisplays(room, msg)` instead.
