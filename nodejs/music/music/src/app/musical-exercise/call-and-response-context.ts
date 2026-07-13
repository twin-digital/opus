import type { CallAndResponseChallenge } from './call-and-response-challenge.js'
import type { EarTrainingGame } from './games.js'

export interface CallAndResponseContext {
  /**
   * The currently active challenge.
   */
  challenge: CallAndResponseChallenge

  /**
   * The game being played; supplies new challenges and the game's presentation identity.
   */
  game: EarTrainingGame

  /**
   * Verbal feedback for the round that just ended, snapshotted by `wait-for-response.exit`
   * (before `reset()`), and consumed — spoken and cleared — by the feedback states.
   */
  verbalFeedback?: string
}

/**
 * A noop challenge used to initialize our context until a real one is selected.
 */
const NullChallenge = {
  getResult: () => 'pending',
  handleResponseNote: () => {
    /* noop */
  },
  getChallengeSequence: () => [],
  reset: () => {
    /* noop */
  },
} as const satisfies CallAndResponseChallenge

export const makeInitialContext = (game: EarTrainingGame): CallAndResponseContext => ({
  challenge: NullChallenge,
  game,
})
