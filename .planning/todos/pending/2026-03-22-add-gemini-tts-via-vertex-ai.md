---
created: 2026-03-22T05:45:48.971Z
title: Add Gemini TTS via Vertex AI
area: general
files: []
---

## Problem

Need text-to-speech capability using Google Gemini via Vertex AI. The API key is stored in the `.env` file as `GEMENI_API_KEY`. This would enable spoken feedback, announcements, or game narration via the Gemini TTS API.

## Solution

- Use curl or a Node.js HTTP client to call the Gemini Vertex AI text-to-speech endpoint
- Read `GEMENI_API_KEY` from `.env` (already loaded via env_file in docker-compose)
- Integrate as a server-side service that the frontend can request audio from
- Consider caching common phrases to reduce API calls
