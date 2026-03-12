# Contributing to Small Hours

Thank you for your interest in contributing! This document covers how to set up the project locally, coding standards, testing, and guidance for both human contributors and AI-assisted contributions (e.g., GitHub Copilot, GPT-based agents).

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Coding Standards](#coding-standards)
4. [Making a Change — Walkthrough](#making-a-change--walkthrough)
5. [Testing](#testing)
6. [AI Agent Contribution Guide](#ai-agent-contribution-guide)
7. [Submitting a Pull Request](#submitting-a-pull-request)

---

## Getting Started

**Prerequisites:** Node.js >= 20, npm, Docker (optional).

```bash
# Clone the repository
git clone https://github.com/aldervall/Quiz-trivia.git
cd Quiz-trivia

# Install dependencies
npm install

# (Optional) Copy and customise environment variables
cp .env.example .env

# Start the server
npm start
```

Open `http://localhost:3000` in your browser. Create a room from the landing page, then share the room link or QR code with players. The TV/host display is at `/host/CODE` and players join at `/player/CODE`.

---

## Project Structure

```
small-hours/
├── server.js              # Entry point: Express, WebSocket upgrade, game auto-loader
├── server/                # Server-side modules
│   ├── GameController.js  # Base class for all games (state machine, lifecycle)
│   ├── rooms.js           # Room registry (Map), room creation, player management
│   ├── handlers.js        # WebSocket message dispatch, player lifecycle, game transitions
│   ├── broadcast.js       # Broadcast helpers (all clients, display-only, single client)
│   ├── persistence.js     # Game history and leaderboard storage
│   ├── BotController.js   # Bot player logic for solo play
│   ├── QuizController.js  # Quiz game logic
│   └── ShitHeadController.js # Shithead game logic (legacy)
├── games/                 # Modern GameController-based games
│   ├── guess/             # Number Guess (reference implementation)
│   │   ├── server.js      # GuessController extending GameController
│   │   └── host/index.html, player/index.html
│   ├── spy/               # Spy game (adapter pattern)
│   ├── lyrics/            # Lyrics game (adapter pattern)
│   └── cah/               # Cards Against Humanity (adapter pattern)
├── public/                # Static front-end
│   ├── index.html         # Landing page (create/join room)
│   ├── player/            # Player lobby and shared player UI
│   │   └── index.html
│   ├── host/              # Host/TV display
│   │   └── index.html
│   ├── shared/            # Shared utilities (WebSocket, sounds, confetti)
│   │   └── theme.css      # Tailwind + custom theme
│   └── games/             # Legacy game UIs (deprecated)
├── questions.js           # Question fetching (local DB → OpenTDB API)
├── local-db.js            # Local question cache (data/questions-db.json)
├── test/                  # Unit tests (Node.js built-in test runner)
├── tests/                 # E2E browser tests (Playwright, E2E smoke tests)
│   ├── fullgame.mjs       # Full 10-question game flow
│   ├── continue.mjs       # Two rounds with scoring
│   ├── restart.mjs        # Game restart flow
│   └── playwright/        # Playwright test suite
├── docs/                  # Documentation
│   ├── GAME_DEVELOPMENT_GUIDE.md
│   └── IMPLEMENTATION_COMPLETE.md
├── .env.example           # Environment variable template
├── Dockerfile             # Container build
└── docker-compose.yml
```

Key architectural decisions:
- **Display-centric multiplayer.** Each room has a 4-letter code, one TV/host display (`/host/:code`) showing the full game state, and many player phones (`/player/:code`). The server broadcasts identical state to all clients; each renders it differently.
- The first player to join becomes the admin and controls game flow (START_MINI_GAME, RETURN_TO_LOBBY).
- Games extend `GameController` (state machine: LOBBY → COUNTDOWN → ACTIVE → GAME_OVER). Complex games use the adapter pattern (e.g., `games/spy/server.js`).
- Rooms auto-delete after 30 seconds idle with zero connections.

---

## Coding Standards

- **`'use strict'`** at the top of every server-side `.js` file.
- Use `const` / `let`; avoid `var`.
- Prefer named functions over anonymous callbacks for anything non-trivial.
- Error handling: use `try/catch` around async operations; broadcast `{ type: 'ERROR', code, message }` to clients on failure.
- Keep server-side and client-side concerns separate — no business logic in `server.js`, it belongs in the game classes (`game.js`, `shithead.js`, `cah.js`) or in `server/handlers.js`.
- WebSocket message types use `SCREAMING_SNAKE_CASE`.
- Do not add new npm dependencies without a clear justification.

---

## Making a Change — Walkthrough

Below is a minimal example of adding a new player command `RESET_SCORES` that zeroes all player scores without restarting the game.

**1. Add the game logic in `game.js`:**

```js
resetScores() {
  for (const player of this.players.values()) {
    player.score = 0;
    player.streak = 0;
  }
  this._broadcast({ type: 'SCORES_RESET', scores: this._buildScores() });
}
```

**2. Handle the new message type in `server/handlers.js` inside the player switch:**

```js
case 'RESET_SCORES': {
  const username = room.wsToUsername.get(ws);
  if (username !== room.adminUsername) break;
  if (room.game) room.game.resetScores();
  break;
}
```

**3. Trigger the command from the player UI in `public/group/`.**

**4. Test manually:** open the landing page, create a room, open the display and player views, start a game, verify scores reset correctly.

---

## Testing

**Automated tests:**

```bash
npm test        # Run unit tests via Node's built-in test runner (auto-discovers *.test.js files)
npm run coverage  # Coverage report with nyc (outputs to coverage/)
```

E2E browser tests live in `tests/` and use puppeteer-core. These scripts (`fullgame.mjs`, `restart.mjs`, `continue.mjs`) automate the full player flow in a headless browser. Note: there are currently no unit test files — `npm test` will pass with zero tests. The E2E scripts are the primary automated coverage.

**Manual testing procedure:**

1. `npm start`
2. Open `http://localhost:3000` and create a room.
3. Open the TV/host display (`/host/CODE`) in one browser tab.
4. Open the player view (`/player/CODE`) in another tab (or a phone on the same network via QR code).
5. Join with a player name, select a game, play through several rounds.
6. Verify: scoring, game state sync between TV and phones, game-over screen, return to lobby, and continue-game flows.

When adding new features, verify:
- Happy path (expected inputs).
- Edge cases (e.g., player disconnects mid-round, all players answer before the timer).
- Error paths (e.g., API unavailable — local DB fallback should kick in).

---

## AI Agent Contribution Guide

This section is specifically for AI coding agents (GitHub Copilot, GPT-based tools, etc.) and developers using them.

### Entry Points

| Goal | File to edit |
|------|-------------|
| Add/change quiz game rules or scoring | `server/QuizController.js` — extends `GameController` |
| Add a new REST endpoint | `server.js` — Express route handlers |
| Add a new WebSocket message | `server/handlers.js` (message dispatch) + relevant GameController |
| Handle room lifecycle or player connect/disconnect | `server/handlers.js`, `server/rooms.js` |
| Change how questions are fetched or filtered | `questions.js`, `local-db.js` |
| Change the player lobby or display UI | `public/player/index.html` or `public/host/index.html` |
| Change a game-specific player UI | `games/{name}/player/index.html` or `games/{name}/host/index.html` |
| Add an entirely new game | See `docs/GAME_DEVELOPMENT_GUIDE.md` — extend `GameController` or use adapter pattern |

### Things to Keep in Mind

- **Display-centric architecture:** Server broadcasts identical game state to TV and all players (~10x/sec). Each UI renders it differently (TV shows full board; phones show only their relevant prompts).
- **GameController pattern:** All games extend `GameController` with three core methods:
  - `tick()` — called ~100ms by room, advances game state (timer ticks, state transitions, etc.)
  - `getState()` — returns full game state object; server broadcasts this to all clients
  - `handlePlayerAction(username, action)` — processes player input from WebSocket messages
- **State machine:** Phase-based (LOBBY → COUNTDOWN → ACTIVE → GAME_OVER). Respect transitions; never skip states.
- **Broadcasting:** Games never broadcast directly. Room calls `game.getState()` and sends via:
  - `broadcastAll(room, msg)` — TV + all players
  - `broadcastToPlayers(room, msg)` — players only
  - `broadcastToDisplays(room, msg)` — TV display only
- **Room cleanup:** Rooms auto-delete after 30 seconds with zero connections. Allow 30s grace period for page reloads.
- **Stale socket check:** Always validate `room.players.get(username).ws === ws` before processing messages (prevents old page tabs).
- **`'use strict'` is required** in all server-side `.js` files.

### Prompting Tips

When asking an AI agent to work on this repo, include context like:

> "This is a Node.js WebSocket multiplayer game platform using a display-centric architecture: one TV/host display (`/host/:code`) broadcasts game state to many player phones (`/player/:code`). Server logic is split across `server/rooms.js` (room registry), `server/handlers.js` (message dispatch), and `server/broadcast.js` (broadcast helpers). All games extend `GameController` and implement: `tick()`, `getState()`, `handlePlayerAction(username, action)`. WebSocket messages use `{ type: 'MESSAGE_TYPE', ...payload }` format (SCREAMING_SNAKE_CASE). Prefer minimal changes and respect the existing code style."

For UI changes, add:

> "The player lobby UI is in `public/player/index.html` and the TV/host display is in `public/host/index.html`. Game-specific UIs are in `games/{name}/player/index.html` (phones) and `games/{name}/host/index.html` (TV). Both connect via WebSocket and render the same game state differently."

For adding a new game, add:

> "See `docs/GAME_DEVELOPMENT_GUIDE.md` for the complete reference. Create `games/{name}/server.js` extending `GameController` (implement `tick()`, `getState()`, `handlePlayerAction()`), then create `games/{name}/player/index.html` (phones) and `games/{name}/host/index.html` (TV display). For complex pre-existing logic, use the adapter pattern: wrap existing code in a `GameController` adapter."

---

## Submitting a Pull Request

1. Fork the repository and create a feature branch: `git checkout -b feature/my-change`.
2. Make your changes, following the coding standards above.
3. Run `npm test` and verify manually (see [Testing](#testing)).
4. Open a Pull Request against `main` with a clear description of what changed and why.
5. Reference any related issue numbers in the PR description.

For bug reports and feature requests, please use the [issue templates](.github/ISSUE_TEMPLATE/).
