import type { Channel } from 'easymidi'
import type { SequencedEvent } from '../../midi/sequencing.js'
import type { Drawable } from '../../ui/drawable.js'

/**
 * Result of a call-and-resposne challenge, based on input provided by the user so far.
 */
export type ChallengeResult =
  // the provided input is correct
  | 'correct'
  // the provided input is incorrect
  | 'incorrect'
  // more input notes are required
  | 'pending'

export interface CallAndResponseChallenge {
  /**
   * Play the challenge sequence, resolving the promise when playback is complete.
   * @param channel MIDI channel on which the challenge should be played
   */
  getChallengeSequence(channel: Channel): SequencedEvent[]

  /**
   * Returns the challenge's UI, if it requires UI selections from the user.
   */
  getChallengeUi?(): Drawable

  /**
   * Retrieves the current result based on the user's input so far.
   */
  getResult(): ChallengeResult

  /**
   * Called when a user plays a note in response to the challenge.
   */
  handleResponseNote(note: number, duration: number): void

  /**
   * Clear any input received so far, and prepare for a new response.
   */
  reset(): void
}
