---
phase: 05
slug: card-game-gui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-27
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run tests/frontend` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/frontend`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | N/A (assets + module) | automated | `ls public/cards/faces/ \| wc -l && grep -c 'function cardSvgSrc' public/js/cards.js` | N/A | pending |
| 05-01-02 | 01 | 1 | N/A (CSS + tests) | automated | `npx vitest run tests/frontend/card-renderer.test.js` | tests/frontend/card-renderer.test.js | pending |
| 05-02-01 | 02 | 2 | N/A (player SVG) | automated | `grep -c 'renderCardImg' public/player.html` | N/A | pending |
| 05-02-02 | 02 | 2 | N/A (host SVG + sound) | automated | `grep -c 'renderCardImg' public/host.html && grep -c 'audio.play' public/host.html` | N/A | pending |
| 05-03-01 | 03 | 3 | N/A (visual) | checkpoint | User visual verification | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- Existing test infrastructure (vitest) covers automated verification needs.
- Test file `tests/frontend/card-renderer.test.js` is created as part of Plan 01, Task 2.
- No separate Wave 0 task needed — test creation is embedded in the plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SVG cards render correctly | N/A | Visual appearance | Open host.html with a shithead game, verify all cards show SVG faces |
| Card flip animation | N/A | CSS animation timing | Start gin-rummy, knock — verify scoring reveal shows flip animation |
| Sound effects play | N/A | Audio playback | Play a card in shithead, verify card-play sound fires on TV |
| Phone card rendering | N/A | Mobile layout | Open player.html on phone, verify cards render at correct size |

These are all covered by Plan 03's checkpoint:human-verify task.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoint:human-verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test created in Plan 01 Task 2)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
