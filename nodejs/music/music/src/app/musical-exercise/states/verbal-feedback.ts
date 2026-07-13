import { speak } from '../../speak.js'
import type { CallAndResponseContext } from '../call-and-response-context.js'

/**
 * Consumes (speaks and clears) the round's verbal feedback from the context. Returns an
 * `isDone` gate the feedback state combines with its own audio completion, so the next
 * challenge's notes never play over the spoken words.
 */
export const consumeVerbalFeedback = (context: CallAndResponseContext): { isDone: () => boolean } => {
  const text = context.verbalFeedback
  context.verbalFeedback = undefined

  if (text === undefined) {
    return { isDone: () => true }
  }

  let done = false
  void speak(text).then(() => {
    done = true
  })
  return { isDone: () => done }
}
