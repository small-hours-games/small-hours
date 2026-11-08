import rules from './rules.js';

export default {
  ...rules,
  id: 'hilow',
  hidden: true, // no screens yet
  label: 'Högt/Lågt',
  icon: '🃏',
  min: 2,
  max: 8,
  privateKeys: ['isActive'],
  story: {
    title: 'Högt/Lågt',
    theme: 'blue',
    intro: 'Ödet viskar genom korten. Är nästa högre, eller lägre? Satsa din blick, och låt turen avgöra vem som bär kronan ikväll.',
  },
};
