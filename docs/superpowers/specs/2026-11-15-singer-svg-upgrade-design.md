# Singing Girl SVG Rig Upgrade — Short Design

**Date:** 2026-11-15
**Scope:** Small change (first milestone before upgrading the 4 AI bots)
**Target:** `TBS_SINGER_SVG` and `drawSinger` in `public/js/topbar-show.js`

## Intent & Why
Upgrade the singing girl ("Looks Good To Me" topbar performer) to look newer, sharper, and more modern while keeping her zero-dependency SVG rig architecture. She serves as the visual benchmark before we upgrade the 4 AI bot rigs.

## Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Golden-yellow hair (`#fde047` / `#facc15` / `#ca8a04`) matching the Smallhours logo, with matching warm-dark hair outlines (`#713f12` / `#422006`) and glossy highlights.
  - Modernized **Cyber-Pop Idol 2.0** outfit & silhouette: cropped jacket with neon cyan/magenta trim, sharper layered tech-pleat skirt with rim highlight, sleeker knee-high cyber boots, and Smallhours fanned-card Moon emblem.
  - Expressive face & stage gear: larger multi-tone eyes with sparkle catchlights, smoother layered bangs, glowing stage earpiece, and a sleeker holographic/LED stage mic.
  - Subtle motion polish in `drawSinger`: beat-synced mic-arm bounce and neon trim glow without breaking existing `pose` inputs or DOM class hooks.
- **Non-Goals:**
  - Upgrading the 4 AI bots (`public/js/ai-robots.js`) — that comes in a follow-up after this rig is approved.
  - Adding external animation libraries (Lottie/Rive/Three.js).
- **Anti-Goals:**
  - Breaking `topbar-show.test.js` selectors/hooks (`.tbs-singer-svg`, `.tbs-root`, `.tbs-upper`, `.tbs-head`, `.tbs-face`, `.tbs-ears`, `.tbs-eyes`, `.tbs-mouth`, `.tbs-skirt`, `.tbs-arm-mic`, `.tbs-hair-back`, `.tbs-lock-l`, `.tbs-lock-r`, `.tbs-shadow`, etc.) or introducing per-frame DOM allocations.

## Constraints
- Vanilla browser JS, no frontend build step; must work cleanly at ~108px height in the TV topbar (`viewBox="0 0 120 152"`).
- Preserve all existing `drawSinger(pose, px, air, dt, exitLift)` and `tbsBotPose` contracts.

## Approaches Considered
1. **Approach 1 — Cyber-Pop Idol 2.0 (Picked):** Keep her Smallhours identity and existing SVG rig structure, upgrade her hair to Smallhours-logo yellow, modernize her outfit/face/mic/boots, and add subtle mic-arm & neon-glow polish. Best balance of "new and cool" with low risk.
2. **Approach 2 — Full Character Reinvention:** Replace her silhouette/concept entirely (e.g., visor/headphones streetwear). Rejected because it drops her recognizable Smallhours character identity.
3. **Approach 3 — Motion & Lighting Polish Only:** Keep the current outfit/face/hair as-is and only tweak motion/glow. Rejected because it wouldn't look noticeably newer at a glance.

## Decisions & What's Left to the Builder
- **Decided:** Yellow hair matching the Smallhours logo (`#facc15` base), Cyber-Pop Idol 2.0 styling, pure SVG rig in `public/js/topbar-show.js`.
- **Left to builder:** Exact SVG path coordinates, gradient stops, beat-reactive glow/mic-arm tuning, and verifying `npx vitest run tests/frontend/topbar-show.test.js` passes.
