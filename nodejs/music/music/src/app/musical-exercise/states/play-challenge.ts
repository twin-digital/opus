import type { Channel } from 'easymidi'
import type { MidiScheduler } from '../../../midi/sequencing.js'
import type { CallAndResponseContext } from '../call-and-response-context.js'

export const makePlayChallengeState =
  ({
    channel,
    midi,
  }: {
    /**
     * MIDI channel on which the challenge will be played.
     */
    channel: Channel

    /**
     * MIDI scheduler which should be used to play challenges.
     */
    midi: MidiScheduler
  }) =>
  ({ challenge }: CallAndResponseContext) => {
    let done = false

    return {
      enter: () => {
        midi.addSequence(challenge.getChallengeSequence(channel), () => {
          done = true
        })
      },
      getResult: () => 'wait-for-response' as const,
      isDone: () => done,
      stateName: 'play-challenge' as const,
    }
  }
