---
created: 2026-03-22
title: Check if SPEC.md still is worth saving
area: docs
files:
  - SPEC.md
---

## Problem

SPEC.md contains the original game spec, but the implementation has diverged from several of its assumptions (no tick loop, no GameController base class, no WebSocket-specific protocol, etc.). It may contain outdated or misleading information that conflicts with the actual architecture documented in CLAUDE.md and `.planning/research/ARCHITECTURE.md`.

## Action

Review SPEC.md against the current codebase and decide whether to:
1. Update it to reflect reality
2. Archive it as historical context
3. Remove it entirely if superseded by other docs
