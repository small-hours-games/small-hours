# GitHub Copilot Instructions

This file gives GitHub Copilot (and other AI coding agents) context about the Quiz-trivia project so suggestions and generated code stay consistent with the existing codebase.

## Project Overview

Quiz-trivia is a self-hosted, real-time multiplayer trivia game built with Node.js. A host runs the game from a browser (typically a TV); players join from their phones by scanning a QR code. All communication is over WebSockets.

## Repository Layout

```
server.js      — HTTP/HTTPS server, WebSocket upgrade handler, REST endpoints
game.js        — Game class: state machine, scoring, player management
questions.js   — Fetch + normalise questions (local DB → Open Trivia DB API)
local-db.js    — Download and query the local question cache
translator.js  — Optional per-round translation of question text
public/        — Static front-end (host view + player view)
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

### Broadcasting to hosts only (from server.js)
```js
broadcastHosts({ type: 'MY_HOST_EVENT', payload: value });
```

### Adding a new host WebSocket command
1. Add a `case 'MY_COMMAND':` inside the `isHost` switch in `server.js → handleMessage`.
2. Implement the corresponding method on `Game` in `game.js`.

### Adding a new REST endpoint
Add it in `server.js` before the server `listen` call, following the existing `app.get` / `app.post` patterns.

## WebSocket Message Reference

| Direction | Type | Description |
|-----------|------|-------------|
| Host → Server | `START_GAME` | Begin a new game with categories/count/difficulty |
| Host → Server | `SKIP` | Skip the current reveal phase |
| Host → Server | `RESTART` | Reset to lobby |
| Host → Server | `CONTINUE_GAME` | Start another round, keeping scores |
| Host → Server | `SET_LANGUAGE` | Change active language |
| Player → Server | `JOIN` | Register username |
| Player → Server | `ANSWER` | Submit an answer |
| Server → All | `QUESTION` | Question data + time limit |
| Server → All | `REVEAL` | Correct answer + score breakdown |
| Server → All | `GAME_OVER` | Final scores |
| Server → Player | `JOIN_OK` | Join confirmed |
| Server → Player | `ANSWER_CONFIRMED` | Answer received |
| Server → All | `ERROR` | Error with `code` and `message` fields |

## What to Avoid

- Do not add business logic to `server.js` — it belongs in `game.js`.
- Do not introduce circular `require` dependencies between `questions.js` and `local-db.js`.
- Do not skip state checks in `game.js` methods.
- Do not commit secrets or credentials.
