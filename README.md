<div align="center">

# Small Hours Games

**A collection of local multiplayer party games for gatherings and sofa gaming**

[![GitHub](https://img.shields.io/badge/Organization-small--hours--games-blue?logo=github)](https://github.com/small-hours-games)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

A self-hosted multiplayer trivia game for local network parties. Players join from their phones, a host controls the game from a browser.

> **Part of [Small Hours Games](https://github.com/small-hours-games)** — A collection of local multiplayer party games designed for get-togethers and sofa-style gaming.

## About Small Hours Games

Small Hours Games is a collection of local multiplayer party games optimized for:
- 🎮 Local network play (no internet required)
- 📱 Phone/browser clients (no app install)
- 🎯 Get-togethers, parties, and casual gaming
- 🏠 Sofa-style gaming experiences

**Current Games:**
- 🎯 **Quiz** — Real-time multiplayer trivia with power-ups
- 🃏 **Shithead** — Fast-paced card game
- 🕵️ **Spy** — Word guessing game
- 🎵 **Lyrics** — Music lyric guessing
- 🎨 **Cards Against Humanity** — Party game
- 🎲 **Number Guess** — Reference implementation

## Features

- Real-time multiplayer via WebSockets
- QR code for easy player join
- Questions from Open Trivia DB with local cache
- Optional HTTPS for iOS Safari compatibility
- Docker support
- Responsive design for all screen sizes

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

## Organization

This project is part of **[Small Hours Games](https://github.com/small-hours-games)**.

- **Organization**: https://github.com/small-hours-games
- **Repository**: https://github.com/small-hours-games/small-hours
- **Live Demo**: https://quiz.aldervall.se

## License

MIT - Feel free to use, modify, and deploy for your own gatherings!
