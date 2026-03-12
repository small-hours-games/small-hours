'use strict';

const fs = require('fs').promises;
const path = require('path');

class Persistence {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.gameHistoryPath = path.join(this.dataDir, 'gameHistory.json');
    this.playerStatsPath = path.join(this.dataDir, 'playerStats.json');

    // Ensure data directory exists
    this._ensureDir();
  }

  async _ensureDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }

  /**
   * Save completed game to history
   */
  async saveGameHistory(gameRecord) {
    try {
      const line = JSON.stringify(gameRecord) + '\n';
      await fs.appendFile(this.gameHistoryPath, line);
      console.log(`[Persistence] Saved game history: ${gameRecord.gameId}`);
    } catch (error) {
      console.error('Failed to save game history:', error);
    }
  }

  /**
   * Update player stats after game
   */
  async updatePlayerStats(username, score, gameType, win = false) {
    try {
      let stats = await this._loadPlayerStats();

      if (!stats[username]) {
        stats[username] = {
          gamesPlayed: 0,
          totalScore: 0,
          wins: 0,
          averageScore: 0,
          lastPlayed: new Date().toISOString().split('T')[0],
          favoriteGame: gameType
        };
      }

      stats[username].gamesPlayed++;
      stats[username].totalScore += score;
      if (win) {
        stats[username].wins++;
      }
      stats[username].averageScore = Math.round(
        stats[username].totalScore / stats[username].gamesPlayed
      );
      stats[username].lastPlayed = new Date().toISOString().split('T')[0];

      await fs.writeFile(this.playerStatsPath, JSON.stringify(stats, null, 2));
      console.log(`[Persistence] Updated stats for ${username}`);
    } catch (error) {
      console.error('Failed to update player stats:', error);
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 10) {
    try {
      const stats = await this._loadPlayerStats();
      return Object.entries(stats)
        .map(([username, data]) => ({ username, ...data }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      return [];
    }
  }

  /**
   * Get player stats
   */
  async getPlayerStats(username) {
    try {
      const stats = await this._loadPlayerStats();
      return stats[username] || null;
    } catch (error) {
      console.error('Failed to load player stats:', error);
      return null;
    }
  }

  /**
   * Get recent games
   */
  async getRecentGames(limit = 20) {
    try {
      try {
        const content = await fs.readFile(this.gameHistoryPath, 'utf-8');
        const lines = content.trim().split('\n');
        return lines
          .slice(-limit)
          .reverse()
          .map(line => JSON.parse(line));
      } catch (err) {
        // File doesn't exist yet
        return [];
      }
    } catch (error) {
      console.error('Failed to load recent games:', error);
      return [];
    }
  }

  /**
   * Private helpers
   */

  async _loadPlayerStats() {
    try {
      const content = await fs.readFile(this.playerStatsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist or is invalid JSON, return empty stats
      return {};
    }
  }
}

module.exports = new Persistence();
