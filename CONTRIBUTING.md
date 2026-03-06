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

**Prerequisites:** Node.js >= 18, npm, Docker (optional).

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

Open `http://localhost:3000` in your browser. Create a room from the landing page, then share the room link or QR code with players. The display/TV view is at `/group/CODE/display` and players join at `/group/CODE`.

---

## Project Structure

```
small-hours/
├── server.js              # Entry point: Express routes, WS upgrade, game module registration
├── server/                # Server-side modules
│   ├── rooms.js           # Room registry (Map), room creation, lobby state builder
│   ├── handlers.js        # WebSocket message dispatch, player disconnect/reconnect, game lifecycle
│   └── broadcast.js       # Broadcast helpers (all clients, displays only, single client)
├── game.js                # Quiz Game class — state machine (LOBBY -> QUESTION_ACTIVE -> REVEAL -> ...)
├── shithead.js            # Shithead card game logic
├── cah.js                 # Cards Against Humanity game logic
├── questions.js           # Question fetching (local DB first, then OpenTDB API)
├── local-db.js            # Local question cache (data/questions-db.json)
├── translator.js          # Optional question translation
├── games/                 # Self-contained game modules
│   └── spy/               # Spy game (pattern for adding new games)
│       ├── server/        # Game logic + WS handlers, exports { handlers, routes }
│       ├── public/        # Client-side HTML/JS
│       └── data/          # Game data (word lists, etc.)
├── public/                # Static front-end
│   ├── index.html         # Landing page (create/join room)
│   ├── group/
│   │   ├── index.html     # Player view (room lobby + game selection)
│   │   └── display.html   # Display/TV view
│   └── games/
│       ├── quiz/          # Quiz player UI
│       ├── shithead/      # Shithead player UI
│       └── cah/           # Cards Against Humanity player UI
├── tests/                 # E2E browser tests (puppeteer-core)
├── .env.example           # Environment variable template
├── Dockerfile             # Container build
└── docker-compose.yml
```

Key architectural decisions:
- **Room-based multiplayer.** Each room has a 4-letter code, its own player registry (`Map`), game instances, and socket sets (`playerSockets`, `displaySockets`). Multiple rooms run concurrently on the same server.
- Rooms are created via `POST /api/rooms` and auto-cleaned after 30 seconds idle with zero connections.
- The first player to join a room becomes the admin and can start games, remove players, and return to the lobby.
- Questions are served from `data/questions-db.json` if present, falling back to the OpenTDB API.

---

## Coding Standards

- **`'use strict'`** at the top of every `.js` file.
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
npm test        # Run tests via Node's built-in test runner (auto-discovers *.test.js files)
npm run coverage  # Coverage report with nyc (outputs to coverage/)
```

E2E browser tests live in `tests/` and use puppeteer-core. These scripts (`fullgame.mjs`, `restart.mjs`, `continue.mjs`) automate the full player flow in a headless browser.

**Manual testing procedure:**

1. `npm start`
2. Open `http://localhost:3000` and create a room.
3. Open the display view (`/group/CODE/display`) in one browser tab.
4. Open the player view (`/group/CODE`) in another tab (or a phone on the same network via QR code).
5. Join with a player name, select a game, play through several rounds.
6. Verify: scoring, answer reveal, game-over screen, return to lobby, and continue-game flows.

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
| Add/change quiz game rules or scoring | `game.js` — `Game` class methods |
| Add a new REST endpoint | `server.js` — Express route handlers |
| Add a new WebSocket message | `server/handlers.js` (message dispatch) + relevant game class |
| Handle room lifecycle or player connect/disconnect | `server/handlers.js`, `server/rooms.js` |
| Change how questions are fetched or filtered | `questions.js`, `local-db.js` |
| Change the player lobby or display UI | `public/group/index.html` or `public/group/display.html` |
| Change a game-specific player UI | `public/games/{quiz,shithead,cah}/` |
| Add an entirely new game | Follow the `games/spy/` pattern: export `{ handlers, routes }` and register in `server.js` |

### Things to Keep in Mind

- **Room-based multiplayer:** There is no global game state. Each room (`server/rooms.js`) has its own player registry, game instances, and socket sets. All game actions operate on a specific room object.
- **State machine:** `Game` progresses through states defined in the `STATE` constant. Respect state transitions — never skip states.
- **Broadcasting:** Use `broadcastAll(room, msg)` to reach all clients in a room, `broadcastToDisplays(room, msg)` for display-only messages, or `sendTo(ws, msg)` for a single client. Inside game classes, use `this._broadcast(msg)` which is scoped to the room.
- **Room cleanup:** Rooms auto-delete after 30 seconds with zero connections and an idle game state. Be aware of this when testing disconnect/reconnect flows.
- **No circular dependencies:** `questions.js` and `local-db.js` each duplicate the tiny `fetchJSON` helper to avoid this.
- **`'use strict'` is required** in all server-side files.

### Prompting Tips

When asking an AI agent to work on this repo, include context like:

> "This is a Node.js WebSocket party game platform. Players join rooms via 4-letter codes. The server logic is split across `server/rooms.js` (room registry), `server/handlers.js` (message dispatch), and `server/broadcast.js` (broadcast helpers). Game logic lives in separate classes (`game.js`, `shithead.js`, `cah.js`). All messages use `{ type: 'MESSAGE_TYPE', ...payload }` format. Prefer minimal changes and respect the existing code style."

For UI changes, add:

> "The player lobby UI is in `public/group/index.html` and the display/TV view is in `public/group/display.html`. Game-specific UIs are in `public/games/{quiz,shithead,cah}/`. They communicate with the server via WebSocket."

For adding a new game, add:

> "Follow the `games/spy/` pattern. A game module exports `{ handlers, routes }`. Handlers are keyed by WS message type. Routes are Express GET handlers. Register the module in `server.js`."

---

## Submitting a Pull Request

1. Fork the repository and create a feature branch: `git checkout -b feature/my-change`.
2. Make your changes, following the coding standards above.
3. Run `npm test` and verify manually (see [Testing](#testing)).
4. Open a Pull Request against `main` with a clear description of what changed and why.
5. Reference any related issue numbers in the PR description.

For bug reports and feature requests, please use the [issue templates](.github/ISSUE_TEMPLATE/).
