import { createLauncher } from '../engine/launcher.js'
import type { Program } from '../engine/program.js'
import { logger } from '../logger.js'
import type { MidiDevice } from '../midi/midi-device.js'
import type { MidiScheduler } from '../midi/sequencing.js'
import type { Renderer } from '../ui/renderer.js'
import type { NovationLaunchpadMiniMk3 } from '../vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import { createMusicalExerciseProgram } from './musical-exercise/musical-exercise-program.js'
import { createSoundPickerProgram } from './sound-picker/sound-picker-program.js'

const log = logger.child({}, { msgPrefix: '[PROGRAM] ' })

export const createLauncherProgram = ({
  launchpad,
  options = {},
  renderer,
  scheduler,
  synthesizer,
}: {
  launchpad: NovationLaunchpadMiniMk3
  options?: {
    speakInstrumentNames?: boolean
  }

  /**
   * Renderer being used to draw program UIs.
   */
  renderer: Renderer<unknown>

  /**
   * MIDI scheduler used to playback event sequences.
   */
  scheduler: MidiScheduler

  /**
   * Synthesizer capable of playing back sounds
   */
  synthesizer: MidiDevice
}): Promise<Program> => {
  return createLauncher(
    [
      () => createSoundPickerProgram(launchpad, synthesizer, options),
      () =>
        createMusicalExerciseProgram({
          device: synthesizer,
          midi: scheduler,
        }),
    ],
    {
      onProgramChanged: () => {
        log.info('Resetting renderer.')
        renderer.reset()
      },
    },
  )
}
