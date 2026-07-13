import { type Channel } from 'easymidi'
import type { MidiDevice } from '../../../midi/midi-device.js'
import type { ChallengeResponse } from '../call-and-response-challenge.js'
import type { CallAndResponseContext } from '../call-and-response-context.js'
import { ChallengeInputHandler } from '../ressponse-input-handler.js'
import { currentTimeMillis } from '../../../engine/timer.js'

export const makeWaitForResponseState =
  ({
    channel,
    device,
    echoChannel,
    timeout = 4000,
  }: {
    /**
     * MIDI channel on which user input will be received
     */
    channel: Channel

    /**
     * MIDI device through which the user will provide a response.
     */
    device: MidiDevice

    /**
     * MIDI channel to which notes played by the user will be retransmitted.
     */
    echoChannel: Channel

    /**
     * Timeout, in millseconds, before the challenge is replayed.
     * @default 4000
     */
    timeout?: number
  }) =>
  (context: CallAndResponseContext) => {
    const { challenge } = context
    let replayChallengeAt = Number.MAX_SAFE_INTEGER

    // the machine records the last response itself: challenges stay free of temporal input
    // state, and the record is judged before reset() can touch anything (see exit below)
    let lastResponse: ChallengeResponse | undefined
    const input = new ChallengeInputHandler(device, channel, echoChannel, (note, duration) => {
      lastResponse = { note, duration }
      challenge.handleResponseNote(note, duration)
    })

    return {
      enter: () => {
        replayChallengeAt = currentTimeMillis() + timeout
        input.start()
      },
      exit: () => {
        input.stop()

        // snapshot the verbal feedback while the round is fully intact — reset() runs before
        // the feedback state enters, so this is the only safe moment to ask
        const result = challenge.getResult()
        if (result !== 'pending') {
          context.verbalFeedback = challenge.getVerbalFeedback?.(result, lastResponse)
        }

        challenge.reset()
      },
      getDrawable: challenge.getChallengeUi?.bind(challenge),
      getResult: () => {
        switch (challenge.getResult()) {
          case 'correct':
            return 'correct'
          case 'incorrect':
            return 'incorrect'
          default:
            if (currentTimeMillis() > replayChallengeAt) {
              return 'replay-challenge'
            } else {
              throw new Error('Unexpected call to getResult while challenge is still pending.')
            }
        }
      },
      isDone: () => challenge.getResult() !== 'pending' || currentTimeMillis() > replayChallengeAt,
      stateName: 'wait-for-response' as const,
    }
  }
