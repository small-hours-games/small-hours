// Small Hours - Custom Quiz Game Adapter
// Wraps games/quiz/rules.js so API-created quiz games run directly on the
// built-in Quiz engine, Phone/TV UI, and optional Gemini TTS narration.

import quizRules, { PHASE_DURATIONS } from '../../games/quiz/rules.js';
import { warmQuizNarration } from '../fetcher/cached-narration.js';

export function validateQuizSpec(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Quiz spec must be an object' };
  const id = String(raw.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(id)) {
    return { ok: false, error: 'id must be 3-40 lowercase letters, numbers, or hyphens' };
  }
  const label = String(raw.label || '').trim();
  if (!label || label.length > 40) return { ok: false, error: 'label (1-40 chars) is required' };

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    return { ok: false, error: 'questions must be a non-empty array' };
  }
  const questions = [];
  for (let i = 0; i < raw.questions.length; i++) {
    const q = raw.questions[i];
    if (!q || !q.question || !q.correctAnswer || !Array.isArray(q.incorrectAnswers) || q.incorrectAnswers.length === 0) {
      return { ok: false, error: `Question #${i + 1} needs question, correctAnswer, and incorrectAnswers[]` };
    }
    questions.push({
      id: String(q.id || `${id}_q${i + 1}`),
      question: String(q.question).slice(0, 300),
      correctAnswer: String(q.correctAnswer).slice(0, 120),
      incorrectAnswers: q.incorrectAnswers.slice(0, 5).map(a => String(a).slice(0, 120)),
      category: String(q.category || label).slice(0, 60),
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
      ...(q.imageUrl ? { imageUrl: String(q.imageUrl) } : {}),
    });
  }

  const phases = { ...PHASE_DURATIONS };
  if (raw.phases && typeof raw.phases === 'object') {
    for (const k of ['countdown', 'question', 'reveal', 'between']) {
      if (raw.phases[k] != null) {
        const ms = Number(raw.phases[k]);
        if (Number.isInteger(ms) && ms >= 1000 && ms <= 60000) phases[k] = ms;
      }
    }
  }

  return {
    ok: true,
    spec: {
      id,
      kind: 'quiz',
      label,
      title: String(raw.title || label).slice(0, 40),
      icon: String(raw.icon || '🎯').slice(0, 8),
      blurb: String(raw.blurb || `Custom quiz • ${questions.length} questions`).slice(0, 120),
      story: raw.story ? String(raw.story).slice(0, 500) : undefined,
      music: raw.music !== false,
      visibility: raw.visibility === 'unlisted' ? 'unlisted' : 'public',
      min: 1,
      max: Math.min(20, Math.max(1, Number(raw.max) || 20)),
      questionCount: Math.min(questions.length, Math.max(1, Number(raw.questionCount) || questions.length)),
      tts: raw.tts !== false,
      phases,
      questions,
    },
  };
}

export function buildCustomQuizDefinition(spec) {
  return {
    ...quizRules,
    id: spec.id,
    kind: 'quiz',
    label: spec.label,
    title: spec.title,
    icon: spec.icon,
    blurb: spec.blurb,
    ...(spec.story ? { story: spec.story } : {}),
    music: spec.music,
    min: spec.min,
    max: spec.max,
    hidden: spec.visibility === 'unlisted',
    phases: spec.phases,
    privateKeys: ['hasAnswered', 'selectedAnswer', 'eliminatedAnswers'],

    async prepare(config) {
      const pool = [...spec.questions];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const selected = pool.slice(0, Math.min(spec.questionCount, pool.length));
      if (spec.tts && selected.length > 0 && process.env.GEMINI_API_KEY) {
        await Promise.race([
          warmQuizNarration(selected.slice(0, 1), { maxRetries: 0 }),
          new Promise(resolve => setTimeout(resolve, 3500)),
        ]).catch(() => {});
        warmQuizNarration(selected).catch(() => {});
      }
      return {
        config: { ...config, questions: selected },
        trackIds: selected.map(q => q.id),
      };
    },
  };
}
