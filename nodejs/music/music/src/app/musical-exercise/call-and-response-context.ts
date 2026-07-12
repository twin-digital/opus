import type { CallAndResponseChallenge } from './call-and-response-challenge.js'

export interface CallAndResponseContext {
  /**
   * The currently active challenge.
   */
  challenge: CallAndResponseChallenge
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

export const makeInitialContext = (): CallAndResponseContext => ({
  challenge: NullChallenge,
})
