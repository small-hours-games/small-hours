# SPY GAME Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deduction word-guessing game where one player is the spy (doesn't know the word), others give simultaneous clues, and score based on whether the spy guesses correctly.

**Architecture:** Game state machine with 5 phases (setup → clues → guess → reveal → score). Server manages word selection, spy assignment, clue collection, and scoring. Frontend shows secret word to non-spies only (never on TV display). WebSocket messages sync phases across all players.

**Tech Stack:** Node.js + Express (server), WebSocket (ws library), Vanilla JS + HTML (frontend), JSON word list.

---

## Task 1: Create Spy Game Folder Structure

**Files:**
- Create: `games/spy/server/index.js`
- Create: `games/spy/server/game.js`
- Create: `games/spy/public/index.html`
- Create: `games/spy/public/display.html`
- Create: `games/spy/public/spy-game.js`
- Create: `games/spy/data/words.json`
- Create: `games/spy/package.json`

**Step 1: Create folder structure**

```bash
mkdir -p games/spy/server
mkdir -p games/spy/public
mkdir -p games/spy/data
```

**Step 2: Create `games/spy/package.json`**

```json
{
  "name": "spy-game",
  "version": "1.0.0",
  "description": "Deduction word-guessing game for small-hours",
  "main": "server/index.js"
}
```

**Step 3: Verify folder structure**

```bash
ls -la games/spy/
# Expected: server/, public/, data/, package.json
```

**Step 4: Commit**

```bash
git add games/spy/
git commit -m "feat: create spy game folder structure"
```

---

## Task 2: Create Word List

**Files:**
- Create: `games/spy/data/words.json`

**Step 1: Write `games/spy/data/words.json`**

```json
{
  "words": [
    "penguin", "telescope", "tornado", "volcano", "lighthouse",
    "butterfly", "keyboard", "refrigerator", "microscope", "earthquake",
    "unicorn", "thunderstorm", "hourglass", "carnival", "skeleton",
    "algorithm", "constellation", "sarcophagus", "chrysalis", "kaleidoscope",
    "phoenix", "avalanche", "labyrinth", "paradox", "silhouette",
    "staircase", "sundial", "wildebeest", "xylophone", "yacht",
    "zealot", "ant", "bear", "cat", "dog", "elephant", "fish",
    "giraffe", "horse", "island", "jungle", "kite", "lamp", "mountain",
    "needle", "ocean", "pyramid", "queen", "rocket", "sandwich", "triangle",
    "umbrella", "whale", "xray", "yarn", "zebra"
  ]
}
```

**Step 2: Verify file exists**

```bash
cat games/spy/data/words.json | head -5
# Expected: JSON with words array
```

**Step 3: Commit**

```bash
git add games/spy/data/words.json
git commit -m "feat: add word list for spy game"
```

---

## Task 3: Create Game State Machine (SpyGame class)

**Files:**
- Create: `games/spy/server/game.js`

**Step 1: Write `games/spy/server/game.js`** (see full task for code)

**Step 2: Test the file exists and is valid JS**

```bash
node -c games/spy/server/game.js
# Expected: (no output = valid syntax)
```

**Step 3: Commit**

```bash
git add games/spy/server/game.js
git commit -m "feat: implement spy game state machine"
```

---

## Task 4: Create Server Integration (handlers & exports)

**Files:**
- Create: `games/spy/server/index.js`

**Step 1: Write `games/spy/server/index.js`** (see full task for code)

**Step 2: Verify file is valid JS**

```bash
node -c games/spy/server/index.js
# Expected: (no output = valid)
```

**Step 3: Commit**

```bash
git add games/spy/server/index.js
git commit -m "feat: add spy game server handlers and integration"
```

---

## Task 5: Create Player Phone UI

**Files:**
- Create: `games/spy/public/index.html`

**Step 1: Write `games/spy/public/index.html`** (see full task for code)

**Step 2: Verify HTML is valid**

```bash
cat games/spy/public/index.html | head -20
# Expected: HTML doctype visible
```

**Step 3: Commit**

```bash
git add games/spy/public/index.html
git commit -m "feat: create spy game player phone UI"
```

---

## Task 6: Create Display (TV) UI

**Files:**
- Create: `games/spy/public/display.html`

**Step 1: Write `games/spy/public/display.html`** (see full task for code)

**Step 2: Verify HTML is valid**

```bash
cat games/spy/public/display.html | head -20
# Expected: HTML doctype visible
```

**Step 3: Commit**

```bash
git add games/spy/public/display.html
git commit -m "feat: create spy game display (TV) UI"
```

---

## Task 7: Create Frontend Game Controller

**Files:**
- Create: `games/spy/public/spy-game.js`

**Step 1: Write `games/spy/public/spy-game.js`** (see full task for code)

**Step 2: Verify JS file is valid**

```bash
node -c games/spy/public/spy-game.js
# Expected: (no output = valid)
```

**Step 3: Commit**

```bash
git add games/spy/public/spy-game.js
git commit -m "feat: create spy game frontend controller"
```

---

## Task 8: Register Game with Server

**Files:**
- Modify: `server.js`

Steps: Register spy game in server.js game loading section.

---

## Task 9: Add Spy Game Route to Landing Page

**Files:**
- Modify: `public/index.html`

Steps: Add spy game button/option to game selection.

---

## Task 10: Create Spy Game Route Handler

**Files:**
- Modify: `server.js`

Steps: Add route handlers for `/group/:roomCode/spy` and display variant.

---

## Task 11: Testing & Verification

Manual E2E testing in browser.

---

## Task 12: Documentation

**Files:**
- Create: `games/spy/README.md`

Steps: Write documentation with rules, architecture, customization.
