---
created: 2026-03-22T05:17:48.530Z
title: Research AI-generated voice for Quiz questions
area: general
files:
  - src/engine/games/quiz.js
---

## Problem

The quiz game currently displays questions as text only on the shared screen. Adding AI-generated voice narration would enhance the party game experience — questions read aloud create a more engaging, game-show atmosphere. Need to evaluate feasibility, cost, latency, and integration complexity.

## Solution

Research TTS API options and evaluate for this use case:

- **ElevenLabs** — high-quality voices, streaming support, pay-per-character
- **Google Cloud TTS** — wide language support, Neural2 voices, free tier available
- **OpenAI TTS** — simple API, good quality, streaming support
- **Browser Web Speech API** — free, no API key, but quality varies by browser/OS

Key considerations:
- Latency: questions should be voiced in real-time as they appear (pre-generate during cache write?)
- Cost: party games could burn through characters quickly
- Caching: voice audio could be cached alongside question JSON files
- Fallback: should work without voice (text-only degradation)
- Integration point: display screen plays audio, phones remain silent
