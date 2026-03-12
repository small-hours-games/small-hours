'use strict';

const GameController = require('./GameController')
const { fetchQuestions } = require('../questions')

/**
 * Quiz game controller
 * State machine: LOBBY → FETCHING → COUNTDOWN → QUESTION_ACTIVE → REVEAL → BETWEEN_QUESTIONS → GAME_OVER
 */

class QuizController extends GameController {
  constructor(categories = [], difficulty = 'mixed', questionCount = 10) {
    super()

    this.categories = categories || []
    this.difficulty = difficulty
    this.questionCount = questionCount

    this.questions = []
    this.currentQuestionIndex = 0
    this.currentQuestion = null

    this.questionTimeLimit = 15000  // ms, varies by difficulty
    this.revealDuration = 4000
    this.betweenDuration = 5000
    this.countdownDuration = 3000
  }

  /**
   * Lifecycle
   */

  start() {
    super.start()
    this.transitionTo('FETCHING')
    this._fetchQuestionsAsync()
  }

  async _fetchQuestionsAsync() {
    // Fetch questions, then transition to COUNTDOWN
    try {
      this.questions = await fetchQuestions(
        this.categories,
        this.questionCount,
        this.difficulty
      )
      if (this.phase === 'FETCHING') {  // Still in fetching phase
        this.transitionTo('COUNTDOWN')
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error)
      this.questions = []
      this.transitionTo('GAME_OVER')
    }
  }

  tick() {
    switch (this.phase) {
      case 'FETCHING':
        // Safety net: if fetching takes >30s, abort and end game
        if (this.isPhaseExpired(30000)) {
          this.transitionTo('GAME_OVER')
        }
        break

      case 'COUNTDOWN':
        if (this.isPhaseExpired(this.countdownDuration)) {
          this._loadNextQuestion()
          this.transitionTo('QUESTION_ACTIVE')
        }
        break

      case 'QUESTION_ACTIVE':
        if (this.isPhaseExpired(this.questionTimeLimit)) {
          this.transitionTo('REVEAL')
        }
        break

      case 'REVEAL':
        if (this.isPhaseExpired(this.revealDuration)) {
          if (this.currentQuestionIndex < this.questions.length - 1) {
            this.transitionTo('BETWEEN_QUESTIONS')
          } else {
            this.transitionTo('GAME_OVER')
          }
        }
        break

      case 'BETWEEN_QUESTIONS':
        if (this.isPhaseExpired(this.betweenDuration)) {
          this._loadNextQuestion()
          this.transitionTo('QUESTION_ACTIVE')
        }
        break

      case 'GAME_OVER':
        // Stay in game over until room cleanup
        break
    }
  }

  cleanup() {
    super.cleanup()
    this.questions = []
    this.currentQuestion = null
  }

  /**
   * State & phase
   */

  getState() {
    const playerArray = this.getAllPlayers()

    // Sort by score descending for ranking
    const sortedByScore = [...playerArray].sort((a, b) => (b.score || 0) - (a.score || 0))
    const rankedPlayers = sortedByScore.map((p, idx) => {
      const playerState = { ...p, rank: idx + 1 }

      // Apply fiftyFifty power-up filtering in the state view
      if (p.activePowerup === 'fiftyFifty' && this.currentQuestion && this.phase === 'QUESTION_ACTIVE') {
        // Show only correct answer + 1 wrong answer
        const correctIdx = this.currentQuestion.correctIndex
        const incorrectIndices = this.currentQuestion.answers
          .map((_, i) => i)
          .filter(i => i !== correctIdx)
        const hiddenIndices = incorrectIndices.slice(0, -1) // Hide all but 1 wrong answer
        playerState.filteredAnswerIndices = this.currentQuestion.answers
          .map((ans, i) => hiddenIndices.includes(i) ? '?' : ans)
      }

      return playerState
    })

    const state = {
      phase: this.phase,
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questionCount,
      timeRemaining: Math.max(0, this._getPhaseTimeRemaining()),
      players: rankedPlayers,
      currentQuestion: this.currentQuestion ? {
        text: this.currentQuestion.question,
        answers: this.currentQuestion.answers,
        difficulty: this.currentQuestion.difficulty,
        timeLimit: this.questionTimeLimit
      } : null
    }

    if (this.phase === 'REVEAL' && this.currentQuestion) {
      state.correctAnswerIndex = this.currentQuestion.correctIndex
    }

    return state
  }

  getRemainingTime() {
    return this._getPhaseTimeRemaining()
  }

  _getPhaseTimeRemaining() {
    switch (this.phase) {
      case 'COUNTDOWN':
        return Math.max(0, this.countdownDuration - this.elapsedInPhase())
      case 'QUESTION_ACTIVE':
        return Math.max(0, this.questionTimeLimit - this.elapsedInPhase())
      case 'REVEAL':
        return Math.max(0, this.revealDuration - this.elapsedInPhase())
      case 'BETWEEN_QUESTIONS':
        return Math.max(0, this.betweenDuration - this.elapsedInPhase())
      default:
        return 0
    }
  }

  /**
   * Question management
   */

  _loadNextQuestion() {
    if (this.currentQuestionIndex < this.questions.length) {
      const q = this.questions[this.currentQuestionIndex]
      this.currentQuestion = {
        question: q.question,
        answers: q.answers,
        correctIndex: q.correctIndex,
        difficulty: q.difficulty
      }
      this._setQuestionTimeLimit()
      this.currentQuestionIndex++
    }
  }

  _setQuestionTimeLimit() {
    const diff = this.currentQuestion.difficulty || 'medium'
    const isTrue = this.currentQuestion.answers.length === 2

    if (isTrue) {
      this.questionTimeLimit = 10000
    } else {
      switch (diff) {
        case 'easy':
          this.questionTimeLimit = 15000
          break
        case 'medium':
          this.questionTimeLimit = 20000
          break
        case 'hard':
          this.questionTimeLimit = 25000
          break
        default:
          this.questionTimeLimit = 20000
      }
    }
  }

  /**
   * Player actions
   */

  handlePlayerAction(username, data) {
    if (this.phase !== 'QUESTION_ACTIVE') {
      return  // Ignore answers outside active phase
    }

    const player = this.getPlayerState(username)
    if (!player) return

    const { answerIndex, powerup } = data

    // Check if player already answered (prevent double-answer)
    if (player.lastAnswerTime && Date.now() - player.lastAnswerTime < 100) {
      return
    }

    player.lastAnswerTime = Date.now()

    // Activate power-up if provided
    if (powerup && player.powerups[powerup] > 0) {
      player.activePowerup = powerup
      player.powerups[powerup]--

      // Apply timeFreeze power-up: add 10 seconds to question time limit
      if (powerup === 'timeFreeze') {
        this.questionTimeLimit += 10000
      }
    }

    // Calculate score
    const isCorrect = answerIndex === this.currentQuestion.correctIndex
    let points = 0

    if (isCorrect) {
      const basePoints = {
        'easy': 100,
        'medium': 150,
        'hard': 200
      }
      points = basePoints[this.currentQuestion.difficulty] || 100

      // Apply doublePoints power-up
      if (player.activePowerup === 'doublePoints') {
        points *= 2
      }

      player.score += points
      player.streak++
    } else {
      player.streak = 0
    }

    player.activePowerup = null
  }
}

module.exports = QuizController
