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

/**
 * A response the state machine observed during `wait-for-response` — the last note the user
 * played, as delivered to `handleResponseNote`. Undefined when the round was decided without
 * machine-observed input (e.g. a challenge judged via its own pad UI).
 */
export interface ChallengeResponse {
  /**
   * MIDI note number of the response.
   */
  note: number

  /**
   * How long the note was held, in milliseconds.
   */
  duration: number
}

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
   * Returns a short phrase to speak aloud as feedback for a decided round, or undefined for
   * silence. Invoked by the state machine exactly once per answered round, at judgment time
   * (before `reset()`), with the machine's own record of the last response — implementations
   * should read only round-constant state from `this` and never record input themselves.
   * Playback, sequencing, and supersession are owned by the machine.
   *
   * @param result The round's outcome. Never 'pending' — the machine only asks once a round
   *   is decided.
   * @param response The last machine-observed response, if any input arrived via
   *   `handleResponseNote`.
   */
  getVerbalFeedback?(result: Exclude<ChallengeResult, 'pending'>, response?: ChallengeResponse): string | undefined

  /**
   * Called when a user plays a note in response to the challenge.
   */
  handleResponseNote(note: number, duration: number): void

  /**
   * Clear any input received so far, and prepare for a new response.
   */
  reset(): void
}
