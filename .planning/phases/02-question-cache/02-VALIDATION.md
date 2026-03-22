---
phase: 02
slug: question-cache
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/fetcher/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/fetcher/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | QCACHE-01, QCACHE-02 | unit | `npx vitest run tests/fetcher/cached-fetcher.test.js` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | QCACHE-03 | unit+integration | `npx vitest run tests/fetcher/ tests/integration/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fetcher/cached-fetcher.test.js` — stubs for QCACHE-01, QCACHE-02 (cache read/write, cache-first behavior)
- [ ] `tests/integration/quiz-start.test.js` — update mock target from opentrivia.js to cached-fetcher.js

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cache files appear on disk after game | QCACHE-01 | Filesystem side effect | Start quiz, check `data/questions/{categoryId}.json` exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
