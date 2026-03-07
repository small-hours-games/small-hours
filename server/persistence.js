// server/persistence.js

const fs = require('fs')
const path = require('path')

class Persistence {
  constructor() {
    this.dataDir = path.join(__dirname, '../data')
    this.gameHistoryPath = path.join(this.dataDir, 'gameHistory.json')
    this.playerStatsPath = path.join(this.dataDir, 'playerStats.json')

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, {recursive: true})
    }
  }

  /**
   * Save completed game to history
   */
  saveGameHistory(gameRecord) {
    try {
      const line = JSON.stringify(gameRecord) + '\n'
      fs.appendFileSync(this.gameHistoryPath, line)
      console.log(`[Persistence] Saved game history: ${gameRecord.gameId}`)
    } catch (error) {
      console.error('Failed to save game history:', error)
    }
  }

  /**
   * Update player stats after game
   */
  updatePlayerStats(username, score, gameType) {
    try {
      let stats = this._loadPlayerStats()

      if (!stats[username]) {
        stats[username] = {
          gamesPlayed: 0,
          totalScore: 0,
          wins: 0,
          averageScore: 0,
          lastPlayed: new Date().toISOString().split('T')[0],
          favoriteGame: gameType
        }
      }

      stats[username].gamesPlayed++
      stats[username].totalScore += score
      stats[username].averageScore = Math.round(
        stats[username].totalScore / stats[username].gamesPlayed
      )
      stats[username].lastPlayed = new Date().toISOString().split('T')[0]

      fs.writeFileSync(this.playerStatsPath, JSON.stringify(stats, null, 2))
      console.log(`[Persistence] Updated stats for ${username}`)
    } catch (error) {
      console.error('Failed to update player stats:', error)
    }
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(limit = 10) {
    try {
      const stats = this._loadPlayerStats()
      return Object.entries(stats)
        .map(([username, data]) => ({username, ...data}))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit)
    } catch (error) {
      console.error('Failed to load leaderboard:', error)
      return []
    }
  }

  /**
   * Get player stats
   */
  getPlayerStats(username) {
    try {
      const stats = this._loadPlayerStats()
      return stats[username] || null
    } catch (error) {
      console.error('Failed to load player stats:', error)
      return null
    }
  }

  /**
   * Get recent games
   */
  getRecentGames(limit = 20) {
    try {
      if (!fs.existsSync(this.gameHistoryPath)) {
        return []
      }

      const lines = fs.readFileSync(this.gameHistoryPath, 'utf-8').trim().split('\n')
      return lines
        .slice(-limit)
        .reverse()
        .map(line => JSON.parse(line))
        .catch(err => {
          console.error('Failed to parse game history:', err)
          return []
        })
    } catch (error) {
      console.error('Failed to load recent games:', error)
      return []
    }
  }

  /**
   * Private helpers
   */

  _loadPlayerStats() {
    if (!fs.existsSync(this.playerStatsPath)) {
      return {}
    }

    const content = fs.readFileSync(this.playerStatsPath, 'utf-8')
    return JSON.parse(content)
  }
}

module.exports = new Persistence()
