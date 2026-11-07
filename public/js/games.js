// Shared game catalog for the dashboard (player) and the TV screen (host).
// Only games listed here can be voted for. Player limits mirror GAME_REGISTRY in
// src/session/room.js; `hasUi` marks games with phone/TV renderers.
var SH_GAMES = [
  { type: 'quiz',          label: 'Quiz',         icon: '🎯', min: 1, max: 20, hasUi: true,  blurb: 'Trivia challenge • Pick a topic & race the clock' },
  { type: 'music-quiz',    label: 'Music Quiz',   icon: '🎵', min: 1, max: 20, hasUi: true,  blurb: 'Audio trivia • Hear the track & guess the hit' },
  { type: 'shithead',      label: 'Palace',       icon: '👑', min: 2, max: 6,  hasUi: true,  blurb: '2–6 players • Beat the pile, don’t be last!' },
  { type: 'gin-rummy',     label: 'Gin Rummy',    icon: '♠️', min: 2, max: 4,  hasUi: true,  blurb: '2 players • Build sets & runs, knock low!' },
];

function shGame(type) {
  return SH_GAMES.find(g => g.type === type) || { type: type, label: type, icon: '🎮', min: 1, max: 99, hasUi: false };
}

// Emoji for an OpenTrivia category name (featured: Music, Geography).
function shCategoryIcon(name) {
  var n = (name || '').toLowerCase();
  var table = [
    // Most specific first: "Cartoon" contains "art", "Musicals" contains "music".
    ['musical', '🎭'], ['music', '🎵'], ['anime', '🍥'], ['cartoon', '🍿'], ['geograph', '🌍'],
    ['computer', '💻'], ['gadget', '📱'], ['math', '➗'], ['nature', '🌿'], ['science', '🔬'],
    ['history', '🏛️'], ['sport', '⚽'], ['film', '🎬'], ['television', '📺'], ['book', '📚'],
    ['video game', '🕹️'], ['board game', '♟️'], ['anim', '🐾'], ['vehicle', '🚗'], ['art', '🎨'],
    ['celebr', '🌟'], ['mytholog', '⚡'], ['politic', '🗳️'], ['comic', '💥'], ['general', '💡'],
  ];
  for (var i = 0; i < table.length; i++) if (n.indexOf(table[i][0]) !== -1) return table[i][1];
  return '❓';
}

// "Entertainment: Music" -> "Music"
function shCategoryLabel(name) {
  return String(name || '').replace(/^(Entertainment|Science):\s*/, '');
}
