# Quiz-trivia

A self-hosted multiplayer trivia game for local network parties. Players join from their phones, a host controls the game from a browser.

## Features

- Real-time multiplayer via WebSockets
- QR code for easy player join
- Questions from Open Trivia DB with local cache
- Optional HTTPS for iOS Safari compatibility
- Docker support

## Quick Start

```bash
# With Docker (recommended)
docker compose up --build

# Or run directly
npm start
```

Then open the printed URL in a browser to host. Players scan the QR code or go to `/join`.

## Configuration

Create a `.env` file (optional, see `.env.example`):

```env
PORT=3000
DOMAIN=yourdomain.com   # for custom domain / QR code URL
```

## HTTPS (iOS Safari)

Place `cert.pem` and `key.pem` in the `certs/` folder. The server auto-detects and switches to HTTPS.

## Architecture & Data Flow

```
Browser (Host View)          Browser (Player — phone)
        │                              │
   WebSocket /ws/host            WebSocket /ws/player
        │                              │
        └──────────────┬───────────────┘
                       │
                  server.js   ← Express HTTP + WebSocket server
                  (handleMessage)
                       │
                   game.js    ← Game state machine (LOBBY → FETCHING → COUNTDOWN → QUESTION_ACTIVE → REVEAL → BETWEEN_QUESTIONS → GAME_OVER)
                       │
                questions.js  ← Fetches questions (local DB first, then Open Trivia DB API)
                       │
                 local-db.js  ← Persistent question cache in data/questions-db.json
                       │
               translator.js  ← Optional translation layer for non-English rounds
```

### Core Files

| File | Purpose |
|------|---------|
| `server.js` | HTTP/HTTPS server, WebSocket upgrade handler, REST endpoints (`/api/qr`, `/api/categories`, `/api/db/*`) |
| `game.js` | `Game` class — state machine, player management, scoring (time-weighted + difficulty multiplier), streaks, reconnect logic |
| `questions.js` | Fetches and normalises questions from Open Trivia DB API; shuffles answers, assigns IDs A–D |
| `local-db.js` | Downloads and caches the full Open Trivia DB locally; LRU-based question selection to avoid repeats |
| `translator.js` | Translates question text when a non-English language is active |
| `public/` | Static front-end assets for host and player views |

### WebSocket Message Flow

Host sends → `START_GAME`, `SKIP`, `RESTART`, `CONTINUE_GAME`, `SET_LANGUAGE`  
Server broadcasts → `GAME_STARTING`, `COUNTDOWN_TICK`, `QUESTION`, `ANSWER_COUNT`, `REVEAL`, `NEXT_QUESTION`, `GAME_OVER`, `RESTARTED`  
Player sends → `JOIN`, `ANSWER`  
Server → player → `CONNECTED`, `JOIN_OK`, `ANSWER_CONFIRMED`, `ERROR`

## Stack

- Node.js + Express
- WebSockets (`ws`)
- Open Trivia DB API
- skogix was here

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards, how to run the project locally, and guidelines for both human and AI-assisted contributions.
