import rules from './rules.js';

export default {
  ...rules,
  id: 'runner',
  order: 10,
  label: 'After Hours Runner',
  icon: '⚡',
  min: 1,
  max: 4,
  blurb: '1–4 players • Race the synthwave cosmos, dodge barriers & collect H-O-U-R-S!',
  soloBlurb: 'Solo vs AI • Race the synthwave cosmos and outlast the bots!',
  music: true,
  roundCountdown: false,
  // TV 60 FPS runner simulation drives AI rivals; engine bot hook stays idle.
  ai: { default: 1, max: 3, choose: () => null },
};
