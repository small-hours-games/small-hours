# Small Hours

**Real-time multiplayer party games. One screen, many phones, zero hassle.**

A shared TV/monitor shows the game. Players join from their phones via room code — no app downloads, no accounts, no friction. Just open a browser and play.

## What's Included

**6 Party Games:**
- **Number Guess** — Guess the number, closest wins
- **Quiz** — Trivia with power-ups and scoring
- **Spy** — Social deduction (find the spy among you)
- **Shithead** — Classic card game
- **Gin Rummy** — 2-player card classic
- **Question Form** — Interactive polling (great for dev workflows)

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3001`. Open it on your TV/computer, get a room code, share it with friends.

### Requirements
- Node.js 22+
- Modern browser (mobile or desktop)

## Architecture

**3 layers, clean separation:**

```
Transport (Express + WebSocket)
    ↓
Session (RoomManager, Player lifecycle)
    ↓
Engine (Pure functions: state + action → new state)
```

The engine is a pure function: `(state, action) => {newState, events}`. Transport-agnostic, testable in isolation, no I/O in game logic.

**Tech stack:**
- Node.js 22 ESM
- Express 5 + ws (WebSocket)
- Vitest for testing
- Vanilla JS frontend (no build step)

## Project Structure

```
src/
├── transport/       # HTTP routes, WebSocket handling
├── session/        # Room management, player lifecycle
├── engine/         # Pure game logic
│   └── games/      # Game definitions (plain objects)
├── fetcher/        # External APIs (OpenTrivia, TTS)
└── server.js       # Entry point

public/
├── host.html       # TV/display screen
├── player.html     # Phone controller
└── js/cards.js     # Shared card rendering
```

## Adding a New Game

Games are plain objects with four functions:

```js
export default {
  setup(ctx) { /* return initial state */ },
  actions: {
    someAction(state, payload) { /* return { state, events } */ }
  },
  view(state, playerId) { /* return player-specific view */ },
  endIf(state) { /* return null or { winner, scores } */ }
}
```

See `src/engine/games/template.js` for a minimal starter, or `number-guess.js` for a complete simple game.

## Development

```bash
npm run dev          # Start with auto-reload
npm test             # Run all tests
npm run test:watch   # Vitest watch mode
```

Health check: `GET /health`

## Deployment

Docker-ready with included `Dockerfile` and `docker-compose.yml`:

```bash
docker-compose up -d
```

## Documentation

- `CLAUDE.md` — Full development guide for AI assistants
- `.planning/` — GSD workflow, roadmap, requirements

## License

MIT