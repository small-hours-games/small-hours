# State: Small Hours Game Engine

**Last updated:** 2026-03-15
**Session:** Milestone v1.1 — Engine Foundation

## Project Reference

**Core value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

**Current focus:** Research — challenging SPEC.md design assumptions

## Current Position

Phase: Not started (researching design decisions)
Plan: —
Status: Researching
Last activity: 2026-03-15 — Milestone v1.1 started

## Accumulated Context

### Key Pivot
- Shifted from "build the full platform" to "build the engine"
- 10 fundamental design questions identified from SPEC.md analysis
- Every architectural assumption being challenged before adoption

### Design Questions Under Research
1. 100ms tick vs event-driven
2. WebSocket vs HTTP/SSE for turn-based games
3. Display+Phone as architecture vs generic clients
4. Room system scope — engine concern or session concern?
5. Admin concept — platform or lobby concern?
6. Bots — platform feature or game-specific logic?
7. Message protocol — premature specificity?
8. Persistence (history, stats) — v1 or later?
9. Game extension pattern — prescribed or discovered?
10. Security/rate limiting — for a local network party game?

### Todos
- [ ] Research all 10 design questions
- [ ] Create phases from research findings
- [ ] Define requirements based on resolved decisions

## Session Continuity

### To Resume
1. Read this file to orient
2. Check research status in .planning/research/
3. Continue with requirement definition or phase planning

### Files
- `.planning/PROJECT.md` — updated project context
- `SPEC.md` — original functional specification (reference, not gospel)

---
*State initialized: 2026-03-15*
