# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Small Hours Games** — a real-time multiplayer party game engine. One shared screen (TV/monitor) as the display, players join from phones via room code. This repo is a ground-up rewrite focused on building the engine first, not infrastructure.

Planning state is in `.planning/`.

## Development

```bash
npm start               # start server (port 3001, or PORT env var)
npm run dev             # start server with --watch (auto-restart on changes)
npm test                # run all tests (vitest run)
npm run test:watch      # vitest in watch mode
npx vitest run <file>   # run a single test file
```

Server runs on `http://localhost:3001`. Health check at `/health`.

## Architecture (3 Layers)

The engine is a pure function: `(state, action) => {newState, events}`. Everything else layers on top.

```
src/
├── transport/           # Layer 1: Transport
│   ├── http.js          #   Express routes: /health, /api/rooms, static files
│   └── ws-adapter.js    #   WebSocket server: message dispatch, rate limiting, heartbeat
├── session/             # Layer 2: Session
│   ├── manager.js       #   RoomManager singleton: creates/tracks/cleans up rooms
│   └── room.js          #   Room class: players, lobby state, game lifecycle, GAME_REGISTRY
├── engine/              # Layer 3: Engine (pure functions, no I/O)
│   ├── engine.js        #   Core: createGame, processAction, getView, checkEnd
│   └── games/           #   Game definitions (plain objects, not classes)
│       ├── index.js     #   Re-exports all games
│       ├── number-guess.js
│       ├── quiz.js
│       ├── question-form.js
│       ├── shithead.js
│       ├── gin-rummy.js
│       ├── spy.js
│       └── template.js  #   Minimal reference game (use as starting point for new games)
├── fetcher/             # External data fetching with caching
│   ├── opentrivia.js    #   OpenTrivia DB API client
│   ├── cached-fetcher.js #  Disk-cached wrapper around opentrivia (data/questions/)
│   ├── cached-tts.js    #   Disk-cached TTS audio generation
│   ├── gemini-tts.js    #   Gemini API TTS (text-to-speech for quiz questions)
│   └── question-file.js #   Load/save question JSON files from questions/ directory
└── server.js            # Entry point: wires Express + WebSocket + RoomManager
```

**Key architecture decisions** (see `.planning/research/ARCHITECTURE.md` for rationale):
- No 100ms tick loop — event-driven, broadcast on state change
- No GameController base class — games are plain objects with `{setup, actions, view, endIf}`
- No WebSocket-specific protocol — engine is transport-agnostic JSON in/out
- No Display/Phone as engine concepts — presentation layer concern
- Timers are synthetic actions fed to the engine by the session layer

## How the Layers Connect

1. **WebSocket message arrives** in `ws-adapter.js` → parsed, rate-limited, dispatched by `msg.type`
2. **Session layer** (`room.js`) manages player join/leave, lobby state, and calls `room.startGame(gameType)`
3. **Game actions** flow through: `ws-adapter.handleGameAction` → `engine.processAction(game, action)` → per-player views via `engine.getView` → broadcast back via WebSocket
4. **Game registry** lives in `room.js` as `GAME_REGISTRY` object mapping type strings to game definitions. New games must be imported and added there **and** re-exported from `src/engine/games/index.js`.

## Tech Stack

- **Runtime:** Node.js 22 LTS, JavaScript ESM (no TypeScript, no build step)
- **Server:** Express 5 + ws (WebSocket)
- **Testing:** Vitest (globals: false — must import `describe`, `it`, `expect` explicitly)
- **Dependencies philosophy:** Earn dependencies when needed (see `.planning/research/STACK.md`)

## Design Principles

- **Engine-first, not infra-first.** Build games, let infrastructure needs emerge.
- **No abstraction before the second use case.** Build 2-3 games, then extract shared patterns.
- **JSON boundary.** Engine input/output is always JSON. Transport is someone else's problem.
- **Players are ephemeral.** No auth, no accounts, no persistent identity — by design.

## Game Definition Pattern

Each game exports a plain object (not a class):

```js
export default {
  setup(ctx)                        // => initial state  (ctx = { players, config })
  actions: { guess(state, payload) } // => { state, events }  (payload includes playerId)
  view(state, playerId)             // => visible state for that player
  endIf(state)                      // => null if ongoing, or { winner, scores }
}
```

Reference implementations: `src/engine/games/number-guess.js` (simplest game), `src/engine/games/template.js` (minimal starting point for new games).

## Test Harness

`tests/engine/game-harness.js` provides helpers for testing game definitions:
- `createTestGame(gameDef, players, config)` — set up a game via the engine
- `act(game, type, playerId, payload)` — process a single action
- `actChain(game, actions)` — process a sequence of `[type, playerId, payload]` tuples
- `viewFor(game, playerId)` — get a player's view
- `isOver(game)` — check if game has ended
- `playUntilEnd(game, actionFn, maxTurns)` — drive a game to completion

## Question Form Game (Dev Workflow Tool)

The `question-form` game turns dev questions into an interactive polling experience on the shared screen. Instead of answering questions via CLI, they appear as a game that players answer on their phones.

**Game type:** `question-form`

**Question types supported:**
- `text` — free-form text input (max 500 chars)
- `choice` — multiple choice from predefined options
- `yesno` — yes/no toggle
- `rating` — numeric scale (configurable `min`/`max`, default 1-5)

**Starting the game via WebSocket:**
```js
{
  type: 'START_MINI_GAME',
  gameType: 'question-form',
  config: {
    questions: [
      { text: 'Should we use TypeScript?', type: 'yesno' },
      { text: 'Preferred framework?', type: 'choice', options: ['React', 'Vue', 'Svelte'] },
      { text: 'Rate the DX (1-5)', type: 'rating', min: 1, max: 5 },
      { text: 'Any other feedback?', type: 'text', label: 'Feedback' }
    ]
  }
}
```

**Phases:** `answering` → `review` → `finished`
- **answering:** Players swipe through questions on phones, answers auto-save, then submit all at once. Phase auto-advances to review when all players have submitted.
- **review:** Host navigates between questions viewing aggregated results (tally bars for choice/yesno, average for rating, individual text responses). Any player can trigger `reviewQuestion` to navigate, `finishReview` to end.
- **finished:** Game ends (no winner/scores — it's a form, not a competition).

**Actions:**
- `answer` — `{ questionIndex, value }` — save an answer (can overwrite before submit)
- `submit` — lock in all answers
- `reviewQuestion` — `{ questionIndex }` — navigate review to a specific question
- `finishReview` — end the game

**Files:** `src/engine/games/question-form.js`, tests in `tests/engine/question-form.test.js`

## Frontend Layer

The client UI is **vanilla browser JavaScript** — no framework, no build step. Files live in `public/` and are served as static assets by Express.

- `public/host.html` — display screen (TV/monitor); connects via `/ws/host/:code`
- `public/player.html` — phone UI; connects via `/ws/player/:code`
- `public/js/cards.js` — shared card rendering and audio module; loaded as a plain `<script>` tag, exposes browser globals (`renderCardImg`, `audio`, etc.)
- `public/cards/faces/` — SVG card face images (`SUIT-RANK.svg`, e.g. `HEART-11-JACK.svg`)
- `public/cards/backs/back.svg` — card back
- `public/cards/sounds/` — WAV audio clips for card events (draw, place, win, deck_redraw)

Card suit/rank encoding: engine uses lowercase single-char suits (`h`, `d`, `c`, `s`) and numeric ranks (1–14). `cards.js` maps these to SVG filenames. Rank 14 is Ace-high in Shithead and maps to the same SVG as rank 1.

Frontend tests use `tests/frontend/card-renderer.test.js` (JSDOM environment via Vitest).

## WebSocket Protocol

Clients connect to `/ws/host/:code` (display) or `/ws/player/:code` (phone). Messages are JSON with a `type` field. Game actions are wrapped as `{ type: 'GAME_ACTION', action: { type: '<action-name>', ...payload } }`.

## GSD Workflow

This project uses the GSD (Get Shit Done) planning system via `/gsd:*` slash commands. Planning state lives in `.planning/`. Key files:
- `.planning/PROJECT.md` — current milestone and requirements
- `.planning/ROADMAP.md` — 12-phase roadmap with success criteria
- `.planning/REQUIREMENTS.md` — 83 v1 requirements with traceability
