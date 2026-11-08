// Game catalog helpers for the phone and the TV. The server writes the list itself
// (SH_GAMES) into the page, from the manifests in games/.

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
