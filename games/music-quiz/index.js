import rules, { PHASE_DURATIONS } from './rules.js';

export default {
  ...rules,
  id: 'music-quiz',
  order: 2,
  label: 'Music Quiz',
  icon: '🎵',
  min: 1,
  max: 20,
  blurb: 'Audio trivia • Hear the track & guess the hit',
  phases: PHASE_DURATIONS,
  privateKeys: ['hasAnswered', 'selectedAnswer', 'eliminatedAnswers'],
};
