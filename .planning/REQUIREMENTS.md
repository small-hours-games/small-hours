# Requirements: Small Hours Games

**Defined:** 2026-03-22
**Core Value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

## v2.1 Requirements

Requirements for Quiz Question Pipeline milestone. Each maps to roadmap phases.

### Question Source

- [x] **QSRC-01**: Quiz fetches questions from OpenTrivia DB API at game start
- [x] **QSRC-02**: Questions are HTML-decoded before use (API returns encoded entities)
- [x] **QSRC-03**: Quiz falls back gracefully when API is unreachable (error message, not crash)

### Question Cache

- [x] **QCACHE-01**: Fetched questions are saved to disk as JSON files organized by category
- [x] **QCACHE-02**: Subsequent games in the same category use cached questions before hitting API
- [x] **QCACHE-03**: Cache tracks which questions have been used to avoid repeats within a session

### Category Voting

- [x] **CVOTE-01**: Available categories are fetched from OpenTrivia DB and presented to players
- [x] **CVOTE-02**: Players can vote for a category in the lobby before quiz starts
- [x] **CVOTE-03**: Admin starts quiz with the winning category (or admin's choice on tie)
- [x] **CVOTE-04**: Category vote results are broadcast to all players and host display

## Future Requirements

### Quiz Polish

- **QPOL-01**: Difficulty selection (easy/medium/hard affects timer duration)
- **QPOL-02**: Background question pre-fetching with progress tracking
- **QPOL-03**: Session tokens to prevent repeat questions across games

### Platform

- **PLAT-01**: Bot system for solo play
- **PLAT-02**: Game history and player statistics
- **PLAT-03**: HTTP rate limiting and security headers
- **PLAT-04**: CAH and Lyrics game implementations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom user-submitted questions | Future milestone, not needed for core quiz |
| Multiple question APIs | OpenTrivia DB is sufficient for v2.1 |
| Question difficulty filtering | Deferred to quiz polish milestone |
| Offline-only mode | Cache provides fallback; full offline not scoped |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| QSRC-01 | Phase 1 | Complete |
| QSRC-02 | Phase 1 | Complete |
| QSRC-03 | Phase 1 | Complete |
| QCACHE-01 | Phase 2 | Complete |
| QCACHE-02 | Phase 2 | Complete |
| QCACHE-03 | Phase 2 | Complete |
| CVOTE-01 | Phase 3 | Complete |
| CVOTE-02 | Phase 3 | Complete |
| CVOTE-03 | Phase 3 | Complete |
| CVOTE-04 | Phase 3 | Complete |

**Coverage:**
- v2.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation (traceability complete)*
