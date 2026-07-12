import type { CallAndResponseContext } from '../call-and-response-context.js'

export const makeStartNewChallenge = () => (context: CallAndResponseContext) => {
  return {
    enter: () => {
      context.challenge = context.game.createChallenge()
    },
    getResult: () => 'done' as const,
    isDone: () => true,
    stateName: 'start-new-challenge' as const,
  }
}
