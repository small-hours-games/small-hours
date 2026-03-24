# Phase: Gin Rummy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** gin-rummy
**Areas discussed:** Party game fit, Display experience

---

## Party Game Fit

| Option | Description | Selected |
|--------|-------------|----------|
| Strict 2-player | Only startable with exactly 2 players in the room. Others can watch the TV but aren't in the game. | ✓ |
| 2-player with spectators | 2 players play, others watch on TV with a spectator view (see both hands, commentary-style). Lobby shows who's playing. | |
| Round-robin tournament | Multiple players take turns in 1v1 matches. Winner stays, loser rotates out. Leaderboard on TV. | |

**User's choice:** Strict 2-player
**Notes:** Game should be grayed out in lobby when more than two players are present. Player cards should NOT be on the TV/host. Score should be shown on TV.

### Follow-up: Enforcement Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Both (Recommended) | Lobby grays out the option AND engine throws if players.length !== 2. Defense in depth. | |
| Engine only | Engine throws error. Lobby doesn't need special handling. | |
| You decide | Claude's discretion on how to enforce the 2-player constraint. | ✓ |

**User's choice:** You decide

---

## Display Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Scoreboard only | Minimal: cumulative scores, hand number, whose turn it is. | |
| Scoreboard + discard pile | Scores plus the top of the discard pile visible on TV. | |
| Scoreboard + game events | Scores plus a feed of events narrating the game for spectators. | ✓ |

**User's choice:** Scoreboard + game events

### Follow-up: Scoring Phase Reveal

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, reveal on knock | TV shows both hands laid out with melds grouped and deadwood highlighted during scoring. | ✓ |
| No, scores only | Never show cards on TV. Just announce the result. | |
| You decide | Claude's discretion on scoring phase display. | |

**User's choice:** Yes, reveal on knock

---

## Claude's Discretion

- Player count enforcement strategy (engine-level, lobby-level, or both)
- First-turn upcard refusal flow implementation
- Big Gin bonus amount
- Event feed message format

## Deferred Ideas

- Manual layoff mode (interactive opponent layoff)
- Tournament/round-robin mode for >2 players
- Spectator view on phones
- Card animations on TV
