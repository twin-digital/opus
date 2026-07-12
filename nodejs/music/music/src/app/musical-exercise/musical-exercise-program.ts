import { createStateMachineProgram } from '../state-machine-program.js'
import { createCallAndResponseStateMachine, type CallAndResponseOptions } from './call-and-response-state-machine.js'

const MidiChannels = {
  Challenge: 4,
  CorrectFeedback: 5,
  Echo: 3,
  IncorrectFeedack: 6,
  Input: 0,
} as const

export const createMusicalExerciseProgram = (
  options: Omit<CallAndResponseOptions, 'challengeChannel' | 'echoChannel' | 'feedbackChannel' | 'inputChannel'>,
) =>
  createStateMachineProgram(
    createCallAndResponseStateMachine({
      ...options,
      challengeChannel: MidiChannels.Challenge,
      feedbackChannel: MidiChannels.CorrectFeedback,
      echoChannel: MidiChannels.Echo,
      inputChannel: MidiChannels.Input,
    }),
  )
