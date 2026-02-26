# Contributing to Quiz-trivia

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

**Prerequisites:** Node.js ≥ 18, npm, Docker (optional).

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

Open `http://localhost:3000` in your browser. The host view is at `/host/` and players join at `/join`.

---

## Project Structure

```
Quiz-trivia/
├── server.js        # Entry point: HTTP/WebSocket server, REST API routes
├── game.js          # Game class — state machine and all game logic
├── questions.js     # Question fetching (local DB first, then OpenTDB API)
├── local-db.js      # Local question cache (data/questions-db.json)
├── translator.js    # Optional question translation
├── public/          # Static front-end (host view, player view)
│   ├── host/        # TV/host browser interface
│   └── player/      # Mobile player interface
├── .env.example     # Environment variable template
├── Dockerfile       # Container build
└── docker-compose.yml
```

Key architectural decisions:
- All game state lives in the `Game` instance in `server.js` (single game per server).
- WebSocket connections are separated into `hostSockets` and `playerSockets` sets.
- Questions are served from `data/questions-db.json` if present, falling back to the OpenTDB API.

---

## Coding Standards

- **`'use strict'`** at the top of every `.js` file.
- Use `const` / `let`; avoid `var`.
- Prefer named functions over anonymous callbacks for anything non-trivial.
- Error handling: use `try/catch` around async operations; broadcast `{ type: 'ERROR', code, message }` to clients on failure.
- Keep server-side and client-side concerns separate — no business logic in `server.js`, it belongs in `game.js`.
- WebSocket message types use `SCREAMING_SNAKE_CASE`.
- Do not add new npm dependencies without a clear justification.

---

## Making a Change — Walkthrough

Below is a minimal example of adding a new host command `RESET_SCORES` that zeroes all player scores without restarting the game.

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

**2. Handle the new message type in `server.js` inside the `isHost` switch:**

```js
case 'RESET_SCORES':
  game.resetScores();
  break;
```

**3. Trigger the command from the host UI in `public/host/`.**

**4. Test manually:** open the host view and player view in two browser tabs, start a game, verify scores reset correctly.

---

## Testing

There is currently no automated test suite. Manual testing procedure:

1. `npm start`
2. Open `http://localhost:3000/host/` in one browser tab.
3. Open `http://localhost:3000/join` in another tab (or a phone on the same network).
4. Join with a player name, start the game, play through several questions.
5. Verify: scoring, answer reveal, game-over screen, restart, and continue-game flows.

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
| Add/change game rules or scoring | `game.js` — `Game` class methods |
| Add a new REST endpoint | `server.js` — Express route handlers |
| Add a new WebSocket message | `server.js` (`handleMessage`) + `game.js` |
| Change how questions are fetched or filtered | `questions.js`, `local-db.js` |
| Change the player or host UI | `public/player/` or `public/host/` |

### Things to Keep in Mind

- **State machine:** `Game` progresses through states defined in the `STATE` constant. Respect state transitions — never skip states.
- **Broadcasting:** Use `this._broadcast(msg)` in `game.js` to reach all clients, or `broadcastHosts(msg)` in `server.js` for host-only messages.
- **Single game instance:** There is one `Game` object for the whole server. Any change affecting global state must be thread-safe (Node.js is single-threaded, so `setTimeout`/`clearTimeout` sequences are the main concern).
- **No circular dependencies:** `questions.js` and `local-db.js` each duplicate the tiny `fetchJSON` helper to avoid this.
- **`'use strict'` is required** in all server-side files.

### Prompting Tips

When asking an AI agent to work on this repo, include context like:

> "This is a Node.js WebSocket quiz game. The game logic is in `game.js` (a state machine). `server.js` handles HTTP and WebSocket connections. All messages use `{ type: 'MESSAGE_TYPE', ...payload }` format. Prefer minimal changes and respect the existing code style."

For UI changes, add:

> "The host UI lives in `public/host/` and the player UI in `public/player/`. They communicate with the server via WebSocket."

---

## Submitting a Pull Request

1. Fork the repository and create a feature branch: `git checkout -b feature/my-change`.
2. Make your changes, following the coding standards above.
3. Test manually (see [Testing](#testing)).
4. Open a Pull Request against `master` with a clear description of what changed and why.
5. Reference any related issue numbers in the PR description.

For bug reports and feature requests, please use the [issue templates](.github/ISSUE_TEMPLATE/).
