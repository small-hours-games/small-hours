---
phase: 05
slug: card-game-gui
status: draft
nyquist_compliant: false
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
| **Quick run command** | `npx vitest run tests/engine` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/engine`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | N/A (assets) | manual | Verify SVG files exist in public/images/cards/ | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | N/A (render) | manual | Open host.html, verify cards render as SVG images | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | N/A (sound) | manual | Verify WAV files exist in public/sounds/ | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | N/A (anim) | manual | Open host.html, verify CSS flip/deal animations | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.
- This phase is primarily visual/asset work — automated tests verify card rendering helper functions, manual verification covers visual appearance.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SVG cards render correctly | N/A | Visual appearance | Open host.html with a shithead game, verify all cards show SVG faces |
| Card flip animation | N/A | CSS animation timing | Start gin-rummy, knock — verify scoring reveal shows flip animation |
| Sound effects play | N/A | Audio playback | Play a card in shithead, verify card-play sound fires on TV |
| Phone card rendering | N/A | Mobile layout | Open player.html on phone, verify cards render at correct size |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
