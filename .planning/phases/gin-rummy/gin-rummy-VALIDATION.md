---
phase: gin-rummy
slug: research
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
---

# Phase gin-rummy — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (globals: false — must import describe/it/expect) |
| **Config file** | None detected (inline with package.json scripts) |
| **Quick run command** | `npx vitest run tests/engine/gin-rummy.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/engine/gin-rummy.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| setup-2p | 01 | 1 | - | unit | `npx vitest run tests/engine/gin-rummy.test.js` | ❌ W0 | ⬜ pending |
| cardValue | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| findAllMelds | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| findOptimalMelds | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| draw-stock | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| draw-discard | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| discard-constraint | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| knock-valid | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| gin-scoring | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| undercut | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| stock-exhaustion | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| layoff-rules | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| multi-hand | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| game-end-100 | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| view-filtering | 01 | 1 | - | unit | same | ❌ W0 | ⬜ pending |
| registration | 02 | 1 | - | unit | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/engine/gin-rummy.test.js` — created by TDD Plan 01 (test-first by design, no separate Wave 0 plan needed)
- [x] No framework install needed — vitest already configured

*TDD Plans 01 and 02 create tests before implementation by definition — Wave 0 is self-bootstrapping.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TV display shows scoreboard + event feed | D-03 | Visual/UI behavior | Start game with 2 players, verify TV shows events not cards |
| Scoring reveal shows both hands on TV | D-04 | Visual/UI behavior | Knock and verify TV reveals both hands with melds grouped |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-24 (TDD plans self-bootstrap test file in Wave 1)
