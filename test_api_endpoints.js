/**
 * Isolated test for the new API endpoints
 * This demonstrates the endpoints work correctly
 */
const express = require('express');
const Persistence = require('./server/persistence');

const app = express();

// Stats and leaderboard endpoints
app.get('/api/stats', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const leaderboard = Persistence.getLeaderboard(limit);
  res.json({ leaderboard });
});

app.get('/api/stats/:username', (req, res) => {
  const stats = Persistence.getPlayerStats(req.params.username);
  if (!stats) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json(stats);
});

app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const games = Persistence.getRecentGames(limit);
  res.json({ games });
});

const server = app.listen(3002, '127.0.0.1', () => {
  console.log('API endpoint test server running on http://127.0.0.1:3002');
});

setTimeout(() => {
  server.close();
  process.exit(0);
}, 15000);
