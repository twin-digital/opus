import type { Channel } from 'easymidi'
import { StateMachine } from '../state-machine.js'
import { makeInitialContext, type CallAndResponseContext } from './call-and-response-context.js'
import type { EarTrainingGame } from './games.js'
import type { MidiScheduler } from '../../midi/sequencing.js'
import { makePlayChallengeState } from './states/play-challenge.js'
import { makeWaitForResponseState } from './states/wait-for-response.js'
import type { MidiDevice } from '../../midi/midi-device.js'
import { makeStartNewChallenge } from './states/start-new-challenge.js'
import { makePlayPositiveFeedbackState } from './states/play-positive-feedback.js'
import { makePlayNegativeFeedbackState } from './states/play-negative-feedback.js'

type AllStateFactories =
  | ReturnType<typeof makePlayChallengeState>
  | ReturnType<typeof makePlayNegativeFeedbackState>
  | ReturnType<typeof makePlayPositiveFeedbackState>
  | ReturnType<typeof makeStartNewChallenge>
  | ReturnType<typeof makeWaitForResponseState>

export const createCallAndResponseStateMachine = ({
  challengeChannel,
  device,
  echoChannel,
  feedbackChannel,
  game,
  inputChannel,
  midi,
}: {
  /**
   * MIDI channel on which the challenge will be played.
   */
  challengeChannel: Channel

  /**
   * MIDI device through which the user will provide a response.
   */
  device: MidiDevice

  /**
   * MIDI channel to which notes played by the user will be retransmitted.
   */
  echoChannel: Channel

  /**
   * MIDI channel to which feedback such as applause will be played.
   */
  feedbackChannel: Channel

  /**
   * The game to play: supplies each new challenge.
   */
  game: EarTrainingGame

  /**
   * MIDI channel on which user input will be received
   */
  inputChannel: Channel

  /**
   * MIDI scheduler which should be used to play challenges.
   */
  midi: MidiScheduler
}): StateMachine<CallAndResponseContext, AllStateFactories> => {
  const createPlayChallengeState = makePlayChallengeState({
    channel: challengeChannel,
    midi,
  })

  const createPlayNegativeFeedbackState = makePlayNegativeFeedbackState({
    channel: feedbackChannel,
    midi,
  })

  const createPlayPositiveFeedbackState = makePlayPositiveFeedbackState({
    channel: feedbackChannel,
    midi,
  })

  const createStartNewChallenge = makeStartNewChallenge()

  const createWaitForResponseState = makeWaitForResponseState({
    channel: inputChannel,
    device,
    echoChannel,
  })

  class MusicalExerciseStateMachine extends StateMachine<CallAndResponseContext, AllStateFactories> {
    public constructor() {
      super(makeInitialContext(game), createStartNewChallenge, {
        'play-challenge': {
          'wait-for-response': createWaitForResponseState,
        },
        'play-negative-feedback': {
          done: createPlayChallengeState,
        },
        'play-positive-feedback': {
          done: createStartNewChallenge,
        },
        'start-new-challenge': {
          done: createPlayChallengeState,
        },
        'wait-for-response': {
          correct: createPlayPositiveFeedbackState,
          incorrect: createPlayNegativeFeedbackState,
          'replay-challenge': createPlayChallengeState,
        },
      })
    }
  }

  return new MusicalExerciseStateMachine()
}

export type CallAndResponseOptions = Parameters<typeof createCallAndResponseStateMachine>[0]
