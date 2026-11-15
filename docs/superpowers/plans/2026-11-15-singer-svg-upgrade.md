# Singing Girl SVG Rig Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the singing girl's SVG rig (`TBS_SINGER_SVG`) and per-frame animation (`drawSinger`) in `public/js/topbar-show.js` to a Cyber-Pop Idol 2.0 look with Smallhours-logo golden-yellow hair.

**Architecture:** All changes live in the existing vanilla-JS SVG rig (`TBS_SINGER_SVG`) and its attribute-only per-frame driver (`drawSinger`) inside `public/js/topbar-show.js`. All existing `.tbs-*` class hooks and `viewBox="0 0 120 152"` coordinate system remain intact so `createTopbarShow`, `tbsBotPose`, and `topbar-show.test.js` continue to work with zero per-frame DOM allocations.

**Tech Stack:** Vanilla browser JavaScript (SVG + CSS transforms/attributes), Vitest (`tests/frontend/topbar-show.test.js`).

**Spec:** [2026-11-15-singer-svg-upgrade-design.md](file:///opt/small-hours/docs/superpowers/specs/2026-11-15-singer-svg-upgrade-design.md)

## Global Constraints
- Vanilla browser JS, no frontend build step or external animation packages.
- Keep `viewBox="0 0 120 152"` and feet anchored at `(60, 150)`.
- Preserve all existing `.tbs-*` class hooks queried by `createTopbarShow` (`tbs-root`, `tbs-upper`, `tbs-head`, `tbs-face`, `tbs-ears`, `tbs-eyes`, `tbs-mouth`, `tbs-skirt`, `tbs-mark`, `tbs-leg-o`, `tbs-leg`, `tbs-leg-hi`, `tbs-boot-l`, `tbs-boot-r`, `tbs-arm-o`, `tbs-arm`, `tbs-arm-hi`, `tbs-hand`, `tbs-arm-mic`, `tbs-hair-back`, `tbs-hair-back-hi`, `tbs-lock-l`, `tbs-lock-r`, `tbs-shadow`).
- Zero per-frame DOM allocations or layout reads inside `drawSinger`.

## Review Focus
- **Missing or broken `.tbs-*` selector**: `createTopbarShow` caches `q('.tbs-...')` once at mount; any missing element must be guarded with null checks or preserved in `TBS_SINGER_SVG`.
- **Gradient ID collisions or broken `url(#...)` references**: Every `fill="url(#...)"` in `TBS_SINGER_SVG` must match an `<linearGradient>` / `<radialGradient>` in `<defs>`.
- **Hair physics & outline contrast**: Yellow hair (`#fde047` / `#facc15` / `#ca8a04`) needs a warm-dark outline (`#422006`) and bright highlight (`#fef9c3`) so it pops against dark and lit topbar backgrounds without washing out.
- **Yaw/blink transforms**: `.tbs-face`, `.tbs-eyes`, `.tbs-mouth`, `.tbs-ears`, and `.tbs-mark` must stay centered on their expected pivot coordinates (`(60, 40)`, `(60, 50)`, `(60, 82)`).
- **Beat-reactive glow at `hit === 0` or reduced-motion**: New mic/trim glow must cleanly clamp to `[0, 1]` and never throw when optional `hit` is omitted or `0`.

---

### Task 1: Upgrade `TBS_SINGER_SVG` with Yellow Hair & Cyber-Pop Idol 2.0 Styling

**Files:**
- Modify: `public/js/topbar-show.js:786-900` (`TBS_SINGER_SVG`)
- Test: `tests/frontend/topbar-show.test.js:369-374`

**Interfaces:**
- Produces: Updated `TBS_SINGER_SVG` string containing all existing `.tbs-*` classes plus `.tbs-mic-glow` and `.tbs-trim-glow` elements for beat-reactive accents, and `tbs-g-hair` / `tbs-g-cap` gradients using Smallhours-logo golden-yellow stops (`#fef9c3`, `#fde047`, `#facc15`, `#ca8a04`).

- [ ] **Step 1: Write the failing test**

Add assertions in `tests/frontend/topbar-show.test.js` inside the `TBS_SINGER_SVG` test block verifying:
1. `kit.TBS_SINGER_SVG` uses Smallhours-logo yellow hair gradient stops (`#facc15` and `#fde047` inside `tbs-g-hair` / `tbs-g-cap`).
2. `kit.TBS_SINGER_SVG` includes the new cyber-pop accent hooks `tbs-mic-glow` and `tbs-trim-glow` alongside all existing articulated layer classes.
3. Every `url(#...)` reference in `kit.TBS_SINGER_SVG` has a matching `id="..."` in `<defs>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontend/topbar-show.test.js`
Expected: FAIL on the new assertions (`tbs-mic-glow` / `tbs-trim-glow` / yellow hair stops not present yet).

- [ ] **Step 3: Implement upgraded `TBS_SINGER_SVG` in `public/js/topbar-show.js:786-900`**

Update `TBS_SINGER_SVG` with:
1. **Yellow Hair (`tbs-g-hair`, `tbs-g-cap`, `.tbs-hair-back`, `.tbs-hair-back-hi`, `.tbs-lock-l`, `.tbs-lock-r`, bangs):**
   - Warm golden-yellow gradients (`#fef9c3` → `#fde047` → `#facc15` → `#ca8a04`), warm-dark outlines (`#422006`), crisp `#fef9c3` highlight, smoother layered bangs, and a cyan/magenta cyber hair-clip/scrunchie.
2. **Cyber-Pop Idol 2.0 Outfit & Boots:**
   - Cropped dark tech-jacket with glowing cyan/magenta neon piping (`.tbs-trim-glow`), crisp collar/shoulder seam highlights, and the Smallhours fanned-card Moon emblem (`.tbs-mark`).
   - Layered tech-pleat rose/magenta skirt (`.tbs-skirt`) with belt buckle and luminous hem rim.
   - Sleeker knee-high cyber boots (`.tbs-boot-l`, `.tbs-boot-r`) with dual cyan light strips and sculpted soles.
3. **Expressive Face & Stage Gear:**
   - Larger, brighter anime-style eyes (`.tbs-eyes`) with multi-tone iris, star/sparkle catchlights, and curved upper lashes.
   - Glowing stage earpiece on her ear and a sleeker wireless holographic/LED stage mic (`.tbs-arm-mic` + `.tbs-mic-glow`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frontend/topbar-show.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/topbar-show.js tests/frontend/topbar-show.test.js
git commit -m "feat(topbar-show): upgrade singer SVG to Cyber-Pop Idol 2.0 with yellow hair"
```

---

### Task 2: Add Beat-Synced Mic-Arm Bounce & Neon Trim Glow in `drawSinger`

**Files:**
- Modify: `public/js/topbar-show.js:1108-1114` (cache `micGlow`, `trimGlow` in `el`), `public/js/topbar-show.js:1315-1377` (`drawSinger`), `public/js/topbar-show.js:1417` (pass `hit` to `drawSinger`)
- Test: `tests/frontend/topbar-show.test.js`

**Interfaces:**
- Consumes: `TBS_SINGER_SVG` `.tbs-mic-glow` and `.tbs-trim-glow` from Task 1.
- Produces: `drawSinger(pose, px, air, dt, exitLift, hit)` updating `el.micGlow` and `el.trimGlow` opacity from `hit` (clamped `[0, 1]`, defaulting to `0` when omitted) and adding subtle beat-synced bounce to `el.armMic`.

- [ ] **Step 1: Write the failing test**

In `tests/frontend/topbar-show.test.js`, add a test verifying that when `createTopbarShow` mounts and `drawSinger` / frame update runs (or via DOM inspection of `.tbs-mic-glow` / `.tbs-trim-glow` attributes), `TBS_SINGER_SVG` mounts cleanly and `setT` / opacity updates don't throw when `hit` is `0` or `1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontend/topbar-show.test.js`
Expected: FAIL (until `drawSinger` / `el` handles `micGlow` and `trimGlow`).

- [ ] **Step 3: Implement `micGlow`, `trimGlow`, and mic-arm bounce in `public/js/topbar-show.js`**

1. Cache `micGlow: q('.tbs-mic-glow')` and `trimGlow: q('.tbs-trim-glow')` in `el`.
2. Update `drawSinger(pose, px, air, dt, exitLift, hit)`:
   - Clamp `var g = Math.max(0, Math.min(1, hit || 0))`.
   - Set `el.micGlow` opacity to `(0.35 + 0.65 * g).toFixed(2)` and `el.trimGlow` opacity to `(0.45 + 0.55 * g).toFixed(2)` (guarded with `if (el.micGlow)` / `if (el.trimGlow)`).
   - Add subtle beat-synced bounce to `el.armMic`: `translate(0 ' + (-g * 1.4).toFixed(2) + ') rotate(' + (pose.armMic - g * 3.5).toFixed(1) + ' 74 70)'`.
3. Pass `hit` at the `drawSinger(...)` call site on line 1417.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frontend/topbar-show.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/topbar-show.js tests/frontend/topbar-show.test.js
git commit -m "feat(topbar-show): add beat-reactive mic bounce and neon trim glow to singer"
```

---

### Task 3: Full Verification

**Files:**
- Test: `tests/`

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass with zero failures.
