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
  IncorrectFeedback: 6,
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
  let running = false

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

  // Announce the game, then start it once the announcement finishes — the challenge notes
  // must not play under the spoken name in an ear-training game. Skipped if the program was
  // shut down or another switch replaced the machine while the speech was in flight.
  const announceThenStart = (machine: typeof stateMachine, name: string) => {
    void speak(name).then(() => {
      if (running && stateMachine === machine) {
        machine.initialize()
      }
    })
  }

  const selectGame = (game: EarTrainingGame) => {
    // presses can arrive outside the program's running window (stale drawables held by the
    // host) — never resurrect a machine the host isn't updating
    if (game.id === selectedGame.id || !running) {
      return
    }

    // abandon the in-flight challenge and start fresh in the new game; build the new machine
    // first so a throw leaves the current game fully intact
    const next = makeStateMachine(game)
    options.midi.cancelAllSequences()
    stateMachine.shutdown()
    stateMachine = next
    selectedGame = game
    announceThenStart(next, game.name)
  }

  // game selector (right-edge column): every game lit in its identity color, the active one green
  const makeGameSelector = () =>
    group(
      ...EarTrainingGames.map((game, index) =>
        translate(
          8,
          7 - index,
          createButton({
            color: game.id === selectedGame.id ? [...SelectedGameColor] : [...game.color],
            onPress: () => {
              selectGame(game)
            },
          }),
        ),
      ),
    )

  // identity corners: the active game's color on the playfield's four corners. Drawn after
  // the state machine, and the engine composites cells last-wins — so full-grid feedback
  // effects (the success flash, the red X) are painted over at these positions on every
  // frame, and the corners reappear intact the instant an effect ends.
  const IdentityCornerPositions = [
    [0, 0],
    [7, 0],
    [0, 7],
    [7, 7],
  ] as const

  const makeIdentityCorners = () =>
    group(
      ...IdentityCornerPositions.map(([x, y]) =>
        translate(
          x,
          y,
          createRectangle({
            color: [...selectedGame.color],
            height: 1,
            width: 1,
          }),
        ),
      ),
    )

  return {
    getDrawable: () => group(stateMachine.getDrawable(), makeIdentityCorners(), makeGameSelector()),
    initialize: () => {
      running = true
      announceThenStart(stateMachine, selectedGame.name)
    },
    shutdown: () => {
      running = false
      options.midi.cancelAllSequences()
      stateMachine.shutdown()
    },
    update: (elapsedSeconds: number) => {
      stateMachine.update(elapsedSeconds)
    },
  }
}
