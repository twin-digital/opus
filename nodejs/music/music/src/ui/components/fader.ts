import { currentTimeMillis } from '../../engine/timer.js'
import type { RgbColor } from '../color.js'
import type { Drawable } from '../drawable.js'
import type { HoldEvent, InteractionEvent, PressEvent, ReleaseEvent } from '../input/input-event.js'

/**
 * Creates a `Drawable` which displays a virtual fader of a specified size and color.
 */
export const createFader = ({
  initialDelay = 500,
  length = 8,
  onChange,
  orientation = 'vertical',
  value,
  color = [127, 127, 127],
}: {
  /**
   * Initial delay, in milliseconds, before beginning a gradual "fade" (versus simply jumping).
   */
  initialDelay?: number

  /**
   * Length of the fader (i.e. the height of a vertical fader or the width of a horizontal one.)
   * @defaultValue 8
   */
  length?: number

  /**
   * Optional callback to invoke when the value of the fader changes.
   */
  onChange?: (value: number) => void

  /**
   * Orientation of the fader.
   * @defaultValue 'vertical'
   */
  orientation?: 'horizontal' | 'vertical'

  /**
   * Current value of the fader, in the range [0, 127].
   */
  value: number

  /**
   * Color of the fader
   * @defaultValue [127, 127, 127] (Bright white)
   */
  color?: RgbColor
}): (() => Drawable) => {
  const maxValueForPosition = (position: number) => {
    return position === length - 1 ? 127 : Math.floor(cellSize * (position + 1))
  }

  const getPosition = (event: InteractionEvent) => (orientation === 'vertical' ? event.y : event.x)

  const updateValue = (event: InteractionEvent) => {
    const position = getPosition(event)

    if (hold && currentTimeMillis() - hold.pressedAt > initialDelay) {
      const increasing = hold.initialValue < maxValueForPosition(getPosition(event))

      const unitsPerSecond = 127 / 1.75
      const duration = (currentTimeMillis() - (hold.pressedAt + initialDelay)) / 1000
      const delta = unitsPerSecond * duration

      if (increasing) {
        currentValue = Math.min(hold.initialValue + delta, maxValueForPosition(position))
      } else {
        currentValue = Math.max(hold.initialValue - delta, maxValueForPosition(position - 1))
      }
    } else if (event.type === 'release') {
      currentValue = maxValueForPosition(position)
    }

    onChange?.(Math.ceil(currentValue))
  }

  const onPress = (event: PressEvent) => {
    hold ??= {
      initialValue: currentValue,
      pressedAt: currentTimeMillis(),
      position: getPosition(event),
    }
  }

  const onRelease = (event: ReleaseEvent) => {
    updateValue(event)
    hold = undefined
  }

  const onHold = (event: HoldEvent) => {
    if (currentTimeMillis() - event.pressedAt < initialDelay) {
      return
    }
    updateValue(event)
  }

  let hold: { initialValue: number; pressedAt: number; position: number } | undefined = undefined
  let currentValue = value
  const cellSize = Math.floor(127 / length)

  const scaleColor = (original: RgbColor, intensity: number) =>
    [original[0] * intensity, original[1] * intensity, original[2] * intensity] satisfies RgbColor

  return () => {
    const fullLitCells = Math.floor(currentValue / cellSize)
    const partialIntensity = Math.max((currentValue - fullLitCells * cellSize) / cellSize, 0.07)
    const offColor: RgbColor = scaleColor(color, 0.07)
    const partialColor: RgbColor = scaleColor(color, partialIntensity)

    return {
      draw: () =>
        Array.from({ length }, (_, i) => ({
          onHold,
          onPress,
          onRelease,
          value:
            i < fullLitCells ? color
            : i === fullLitCells ? partialColor
            : offColor,
          x: orientation === 'vertical' ? 0 : i,
          y: orientation === 'vertical' ? i : 0,
        })),
    }
  }
}
