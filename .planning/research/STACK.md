# Stack Research: Small Hours Game Engine

**Researched:** 2026-03-15
**Mode:** Ecosystem + First Principles
**Confidence:** HIGH

## Core Finding

The engine has **zero production npm dependencies**. A `(state, action) => newState` function runs on the JavaScript runtime. Every SPEC.md dependency assumes a running server with browser clients — that problem doesn't exist until you build the browser client.

## Now vs Later

| Item | Verdict | Reasoning |
|------|---------|-----------|
| Node.js 22 LTS | NOW | Runtime |
| JavaScript ESM | NOW | Module format, no build step |
| Vitest | NOW | Testing from day one |
| Node.js readline | NOW | Terminal client input |
| chalk (optional) | NOW | Readable terminal output |
| Express 5 | EARN IT | Only when HTTP endpoints exist |
| ws@8 | EARN IT | Only when browser clients connect |
| Vite 6 | EARN IT | Only when there's a frontend to build |
| better-sqlite3 | EARN IT | Only when persistence is proven needed |
| Helmet | EARN IT | Only when HTTP is exposed |
| Docker | EARN IT | Only when deploying somewhere |
| HTTPS/certs | EARN IT | Only when phones connect over network |
| Rate limiting | EARN IT | Only when untrusted clients exist |

## SPEC.md Challenges

- **100ms tick loop**: Architecture mistake for turn-based games, not a stack concern
- **WebSocket server**: Transport adapter, earned when browser client exists
- **Docker + health checks**: Deployment concern, earned when there's something to deploy
- **Helmet + security headers**: HTTP concern, earned when HTTP exists
- **OpenTrivia DB client**: Quiz-specific data concern, earned when Quiz is built

## Earn Triggers

| Item | Trigger |
|------|---------|
| Express | First HTTP endpoint needed |
| ws | First browser client connects |
| Vite | First frontend HTML/CSS/JS needed |
| better-sqlite3 | First data that must survive process restart |
| Docker | First deployment to non-dev machine |
| HTTPS | First iOS device connects |

## Open Questions

- When Quiz needs timers, does the timer live in the game or in a shared utility? Answer after Quiz exists.
- When does a base class become justified? Answer after 3 games exist.
