import rules, { PHASE_DURATIONS } from './rules.js';

export default {
  ...rules,
  id: 'quiz',
  order: 1,
  label: 'Quiz',
  icon: '🎯',
  min: 1,
  max: 20,
  blurb: 'Trivia challenge • Pick a topic & race the clock',
  music: true,
  phases: PHASE_DURATIONS,
  privateKeys: ['hasAnswered', 'selectedAnswer', 'eliminatedAnswers'],
  story: {
    title: 'Quiz Time',
    theme: 'purple',
    intro: 'De visas torn reser sig ur natten. Ett faktum i taget, krigare. Visa att ditt sinne är skarpare än deras, och skriv ditt namn i stjärnorna.',
  },
};
