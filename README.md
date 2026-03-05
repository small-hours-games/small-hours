# Small Hours Games - Quiz Trivia

A self-hosted multiplayer trivia game for local network parties. Players join from their phones, a host controls the game from a browser.

> Part of the [Small Hours Games](https://github.com/small-hours-games) collection of local multiplayer party games.

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

Create a `.env` file (optional):

```env
PORT=3000
DOMAIN=yourdomain.com   # for custom domain / QR code URL
```

## HTTPS (iOS Safari)

Place `cert.pem` and `key.pem` in the `certs/` folder. The server auto-detects and switches to HTTPS.

## Stack

- Node.js + Express
- WebSockets (`ws`)
- Open Trivia DB API

## Testing & Coverage

> **Node ≥ 20 required** for the built-in test runner and nyc coverage tool.

Tests use Node's built-in test runner, which auto-discovers files matching `**/*.test.{js,cjs,mjs}`. The `tests/` directory contains end-to-end browser automation scripts (not discoverable unit tests). Run the test suite with:

```bash
npm test
```

To generate a coverage report with [Istanbul/nyc](https://github.com/istanbuljs/nyc) across all server-side modules:

```bash
npm run coverage
```

After the run you will see a summary in the terminal, for example:

```
------------|---------|----------|---------|---------|-------------------
File        | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
------------|---------|----------|---------|---------|-------------------
All files   |   ...   |   ...    |   ...   |   ...   |
 game.js    |   ...   |   ...    |   ...   |   ...   |
 server.js  |   ...   |   ...    |   ...   |   ...   |
 ...        |         |          |         |         |
------------|---------|----------|---------|---------|-------------------
```

A detailed HTML report is written to `coverage/index.html` and an LCOV report
to `coverage/lcov.info` (suitable for uploading to coverage services such as
Codecov or Coveralls).
