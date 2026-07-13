// Small Hours - Game narratives ("the story")
// Each game has a short, punchy hero-journey intro shown on the host screen
// and read aloud by the host TTS voice when the game starts.
//
// `intro` is the narration text (also sent to TTS). `theme` drives accent color.

export const STORIES = {
  'number-guess': {
    title: 'Number Guess',
    theme: 'blue',
    intro: 'Mörkret sänker sig. Endast ett tal skiljer er från ära. Gissa rätt, och turen är din. De som dröjer blir kvar i skuggan.',
  },
  quiz: {
    title: 'Quiz Time',
    theme: 'purple',
    intro: 'De visas torn reser sig ur natten. Ett faktum i taget, krigare. Visa att ditt sinne är skarpare än deras, och skriv ditt namn i stjärnorna.',
  },
  spy: {
    title: 'Spy Game',
    theme: 'pink',
    intro: 'En förrädare gömmer sig bland er. Tystnaden är livsfarlig, misstanken dödlig. Avslöja spionen innan klockan når midnatt.',
  },
  shithead: {
    title: 'Shithead',
    theme: 'orange',
    intro: 'Korten är lagda. Äran tillhör den som blir av med allt först. Den siste kvar bär skammens krona. Spela klokt, krigare.',
  },
  'gin-rummy': {
    title: 'Gin Rummy',
    theme: 'green',
    intro: 'Två mästare, en runda. Drag, kasta, och väv ihop ditt öde. Den som knackar först skriver historien.',
  },
  hilow: {
    title: 'Högt/Lågt',
    theme: 'blue',
    intro: 'Ödet viskar genom korten. Är nästa högre, eller lägre? Satsa din blick, och låt turen avgöra vem som bär kronan ikväll.',
  },
  'question-form': {
    title: 'Question Form',
    theme: 'purple',
    intro: 'En fråga öppnar porten. Svara ärligt, för spegeln ljuger aldrig. Rösten du hör är din egen.',
  },
  template: {
    title: 'Template',
    theme: 'purple',
    intro: 'En ny värld tar form. Räkna, bygg, och nå toppen före de andra. Äran tillhör den som tar första steget.',
  },
  skogai: {
    title: 'SkogAI',
    theme: 'green',
    intro: 'Skogen vaknar. Dess röst ekar mellan träden. Lyssna noga, för den som förstår skogen vinner dess välsignelse.',
  },
};

export function getStory(gameType) {
  return STORIES[gameType] || { title: gameType, theme: 'purple', intro: 'Spelet börjar. Må turen vara med er.' };
}
