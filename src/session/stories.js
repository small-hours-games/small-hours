// Small Hours - Game narratives ("the story")
// Each game has a short, punchy hero-journey intro shown on the host screen
// and read aloud by the host TTS voice when the game starts.
//
// `intro` is the narration text (also sent to TTS). `theme` drives accent color.

export const STORIES = {
  quiz: {
    title: 'Quiz Time',
    theme: 'purple',
    intro: 'De visas torn reser sig ur natten. Ett faktum i taget, krigare. Visa att ditt sinne är skarpare än deras, och skriv ditt namn i stjärnorna.',
  },
  shithead: {
    title: 'Palace',
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
};

export function getStory(gameType) {
  return STORIES[gameType] || { title: gameType, theme: 'purple', intro: 'Spelet börjar. Må turen vara med er.' };
}
