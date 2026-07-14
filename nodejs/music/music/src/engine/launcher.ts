import { createButton } from '../ui/components/button.js'
import { translate } from '../ui/transform/translate.js'
import { group } from '../ui/components/group.js'
import { createRectangle } from '../ui/components/rectangle.js'
import type { Program } from './program.js'

export const createLauncher = async (
  programs: (() => Program)[],
  {
    onProgramChanged,
  }: {
    /**
     * Callback invoked when the current program is changed.
     */
    onProgramChanged?: (program: Program) => void
  } = {},
): Promise<Program> => {
  let activeProgramIndex: number
  let activeProgram: Program | undefined

  const selectProgram = async (index: number) => {
    if (index !== activeProgramIndex) {
      // A program is exposed to the render loop only between initialize() and shutdown() — the loop keeps drawing
      // while these awaits are in flight, so mid-transition the launcher shows its own chrome and nothing else.
      const previous = activeProgram
      activeProgram = undefined
      activeProgramIndex = index

      await previous?.shutdown?.()

      const next = programs[index]()
      await next.initialize?.()
      activeProgram = next
      onProgramChanged?.(next)
    }
  }

  const createLauncherUi = () => {
    const createProgramChangeButton = (direction: 1 | -1) =>
      createButton({
        color: [127, 127, 127],
        onPress: () => {
          const newIndex = (activeProgramIndex + direction + programs.length) % programs.length
          void selectProgram(newIndex)
        },
      })

    return group(translate(0, 8, createProgramChangeButton(-1)), translate(1, 8, createProgramChangeButton(1)))
  }

  await selectProgram(0)

  const launcherUi = createLauncherUi()
  const clearPad = createRectangle({
    color: [0, 0, 0],
    height: 9,
    width: 9,
  })

  return {
    getDrawable: () =>
      activeProgram === undefined ?
        group(clearPad, launcherUi)
      : group(clearPad, activeProgram.getDrawable(), launcherUi),
    update: (elapsedSeconds) => {
      activeProgram?.update?.(elapsedSeconds)
    },
  }
}
