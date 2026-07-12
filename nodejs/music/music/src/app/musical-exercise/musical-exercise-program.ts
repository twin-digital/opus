import type { Program } from '../../engine/program.js'
import { speak } from '../speak.js'
import { createButton } from '../../ui/components/button.js'
import { createRectangle } from '../../ui/components/rectangle.js'
import { group } from '../../ui/components/group.js'
import { translate } from '../../ui/transform/translate.js'
import { createCallAndResponseStateMachine, type CallAndResponseOptions } from './call-and-response-state-machine.js'
import { EarTrainingGames, type EarTrainingGame } from './games.js'

const MidiChannels = {
  Challenge: 4,
  CorrectFeedback: 5,
  Echo: 3,
  IncorrectFeedack: 6,
  Input: 0,
} as const

const SelectedGameColor = [0, 127, 0] as const

export const createMusicalExerciseProgram = (
  options: Omit<
    CallAndResponseOptions,
    'challengeChannel' | 'echoChannel' | 'feedbackChannel' | 'game' | 'inputChannel'
  >,
): Program => {
  let selectedGame: EarTrainingGame = EarTrainingGames[0]

  const makeStateMachine = (game: EarTrainingGame) =>
    createCallAndResponseStateMachine({
      ...options,
      challengeChannel: MidiChannels.Challenge,
      feedbackChannel: MidiChannels.CorrectFeedback,
      echoChannel: MidiChannels.Echo,
      game,
      inputChannel: MidiChannels.Input,
    })

  let stateMachine = makeStateMachine(selectedGame)

  const selectGame = (game: EarTrainingGame) => {
    if (game.id === selectedGame.id) {
      return
    }

    // abandon the in-flight challenge and start fresh in the new game
    stateMachine.shutdown()
    selectedGame = game
    speak(game.name)
    stateMachine = makeStateMachine(game)
    stateMachine.initialize()
  }

  // game selector (right-edge column): every game lit in its identity color, the active one green
  const makeGameSelector = () =>
    group(
      ...EarTrainingGames.map((game, index) =>
        translate(
          8,
          7 - index,
          createButton({
            color: game.id === selectedGame.id ? [...SelectedGameColor] : game.color,
            onPress: () => {
              selectGame(game)
            },
          }),
        ),
      ),
    )

  // identity bar (playfield top row): carries the active game's color onto the main screen
  const makeIdentityBar = () =>
    translate(
      0,
      7,
      createRectangle({
        color: selectedGame.color,
        height: 1,
        width: 8,
      }),
    )

  return {
    getDrawable: () => group(stateMachine.getDrawable(), makeIdentityBar(), makeGameSelector()),
    initialize: () => {
      speak(selectedGame.name)
      stateMachine.initialize()
    },
    shutdown: () => {
      stateMachine.shutdown()
    },
    update: (elapsedSeconds: number) => {
      stateMachine.update(elapsedSeconds)
    },
  }
}
