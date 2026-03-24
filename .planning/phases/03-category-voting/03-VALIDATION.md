---
phase: 03
slug: category-voting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/fetcher/ tests/session/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/fetcher/ tests/session/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CVOTE-01 | unit | `npx vitest run tests/fetcher/` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CVOTE-01 | unit | `npx vitest run tests/fetcher/` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | CVOTE-02, CVOTE-04 | unit | `npx vitest run tests/session/` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | CVOTE-03 | unit | `npx vitest run tests/session/` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | CVOTE-02, CVOTE-04 | integration | `npx vitest run tests/transport/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fetcher/categories.test.js` — stubs for category fetching and caching
- [ ] `tests/session/category-voting.test.js` — stubs for room voting flow

*Existing test infrastructure (vitest) covers all framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Category list displays on phone | CVOTE-01 | Visual rendering in browser | Start quiz game, verify categories appear on player.html |
| Vote tally updates in real-time on host | CVOTE-04 | WebSocket + DOM rendering | Vote from player, verify host.html updates live |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
