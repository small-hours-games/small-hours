# Requirements: Small Hours Games

**Defined:** 2026-03-22
**Core Value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

## v2.1 Requirements

Requirements for Quiz Question Pipeline milestone. Each maps to roadmap phases.

### Question Source

- [ ] **QSRC-01**: Quiz fetches questions from OpenTrivia DB API at game start
- [ ] **QSRC-02**: Questions are HTML-decoded before use (API returns encoded entities)
- [ ] **QSRC-03**: Quiz falls back gracefully when API is unreachable (error message, not crash)

### Question Cache

- [ ] **QCACHE-01**: Fetched questions are saved to disk as JSON files organized by category
- [ ] **QCACHE-02**: Subsequent games in the same category use cached questions before hitting API
- [ ] **QCACHE-03**: Cache tracks which questions have been used to avoid repeats within a session

### Category Voting

- [ ] **CVOTE-01**: Available categories are fetched from OpenTrivia DB and presented to players
- [ ] **CVOTE-02**: Players can vote for a category in the lobby before quiz starts
- [ ] **CVOTE-03**: Admin starts quiz with the winning category (or admin's choice on tie)
- [ ] **CVOTE-04**: Category vote results are broadcast to all players and host display

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
| QSRC-01 | -- | Pending |
| QSRC-02 | -- | Pending |
| QSRC-03 | -- | Pending |
| QCACHE-01 | -- | Pending |
| QCACHE-02 | -- | Pending |
| QCACHE-03 | -- | Pending |
| CVOTE-01 | -- | Pending |
| CVOTE-02 | -- | Pending |
| CVOTE-03 | -- | Pending |
| CVOTE-04 | -- | Pending |

**Coverage:**
- v2.1 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
