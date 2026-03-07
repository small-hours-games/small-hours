// server/GameController.js

/**
 * Abstract base class for all game controllers.
 * Each game (Quiz, Shithead, future) extends this.
 *
 * Room orchestrates via pull-based pattern:
 *   room.game.tick()           // Update game state
 *   room.game.getState()       // Broadcast to players/displays
 *
 * Games never call broadcast directly; room handles all WebSocket communication.
 */

class GameController {
  constructor() {
    this.phase = 'LOBBY'
    this.players = new Map()  // username -> playerObj
    this.startTime = null
    this.phaseStartTime = null
    this.phaseTimers = {}     // phase -> ms until next transition
  }

  /**
   * Lifecycle methods
   */

  start() {
    this.startTime = Date.now()
    this.transitionTo('COUNTDOWN')
  }

  tick() {
    // Called ~100ms by room
    // Subclass implements phase-specific logic
    throw new Error('GameController.tick() must be implemented by subclass')
  }

  cleanup() {
    // Cancel all timers, free resources
    Object.values(this.phaseTimers).forEach(timer => clearTimeout(timer))
    this.phaseTimers = {}
  }

  /**
   * State & phase management
   */

  getState() {
    // Return complete game state for broadcast
    throw new Error('GameController.getState() must be implemented by subclass')
  }

  getPhase() {
    return this.phase
  }

  transitionTo(newPhase) {
    this.phase = newPhase
    this.phaseStartTime = Date.now()
  }

  getRemainingTime() {
    // Remaining ms in current phase
    throw new Error('GameController.getRemainingTime() must be implemented by subclass')
  }

  /**
   * Player management
   */

  addPlayer(username, playerObj) {
    this.players.set(username, playerObj)
  }

  getPlayerState(username) {
    return this.players.get(username)
  }

  removePlayer(username) {
    this.players.delete(username)
  }

  getAllPlayers() {
    return Array.from(this.players.values())
  }

  /**
   * Message handling
   */

  handlePlayerAction(username, data) {
    // Process player action (answer, move, etc)
    throw new Error('GameController.handlePlayerAction() must be implemented by subclass')
  }

  /**
   * Utilities
   */

  elapsedInPhase() {
    return Date.now() - this.phaseStartTime
  }

  isPhaseExpired(ms) {
    return this.elapsedInPhase() >= ms
  }

  schedulePhaseTransition(delayMs, newPhase) {
    // Convenience: schedule next phase transition
    this.phaseTimers[newPhase] = setTimeout(() => {
      this.transitionTo(newPhase)
    }, delayMs)
  }
}

module.exports = GameController
