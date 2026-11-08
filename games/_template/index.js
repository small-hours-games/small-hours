import rules from './rules.js';

// Copy this folder to games/<your-id>/ and set id to that same name.
export default {
  ...rules,
  id: '_template',
  label: 'Match Up',
  icon: '🃏',
  min: 2,
  max: 6,
  blurb: '2–6 players • Match the pile, be first out!',
  music: true,
};
