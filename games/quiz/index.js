import rules, { PHASE_DURATIONS } from './rules.js';

export default {
  ...rules,
  id: 'quiz',
  order: 1,
  label: 'Quiz',
  title: 'Quiz Time',
  icon: '🎯',
  min: 1,
  max: 20,
  blurb: 'Trivia challenge • Pick a topic & race the clock',
  music: true,
  phases: PHASE_DURATIONS,
  privateKeys: ['hasAnswered', 'selectedAnswer', 'eliminatedAnswers'],
};
