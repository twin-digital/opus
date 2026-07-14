import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import type { RgbColor } from '../../../ui/color.js'
import type { Drawable } from '../../../ui/drawable.js'

export type Side = 'left' | 'right'

/**
 * Seconds for one full breath of the selected side's pad.
 */
const BreathPeriodSeconds = 2

/**
 * Brightness fraction at the bottom of a breath; the top of a breath is the full display color. The floor is kept
 * well above zero so the pad never reads as unlit mid-breath.
 */
const BreathFloor = 0.3

/**
 * Seconds the split toggle holds each side's color while cycling.
 */
const ToggleColorSeconds = 1

/**
 * Seconds of black between the toggle's colors. The gaps make the cycle read as "two beats" even when both sides wear
 * the same color, so split state stays readable.
 */
const ToggleGapSeconds = 0.2

const Black: RgbColor = [0, 0, 0]

const scale = (color: RgbColor, factor: number): RgbColor => [color[0] * factor, color[1] * factor, color[2] * factor]

/**
 * A slow brightness pulse of `color`: one full breath every {@link BreathPeriodSeconds}.
 */
const breathe = (color: RgbColor, time: number): RgbColor => {
  const phase = 0.5 + 0.5 * Math.sin((2 * Math.PI * time) / BreathPeriodSeconds)
  return scale(color, BreathFloor + (1 - BreathFloor) * phase)
}

/**
 * Color of the split toggle at `time` while split is on: left color → black → right color → black.
 */
const toggleCycleColor = (leftColor: RgbColor, rightColor: RgbColor, time: number): RgbColor => {
  const cycle = 2 * (ToggleColorSeconds + ToggleGapSeconds)
  const t = time % cycle

  if (t < ToggleColorSeconds) {
    return leftColor
  }
  if (t < ToggleColorSeconds + ToggleGapSeconds) {
    return Black
  }
  if (t < 2 * ToggleColorSeconds + ToggleGapSeconds) {
    return rightColor
  }
  return Black
}

/**
 * The sound picker's side column: a side pad per hand plus the split toggle, drawn in the grid's rightmost column.
 *
 * Pads sit bottom-up to match low-to-high on the piano — the bottom pad is the left hand, the pad above it the right
 * hand, and the top pad toggles the split. A side's color is the caller's business (the family color of its selected
 * instrument); position answers "which side," color answers "what sound."
 *
 * Motion means split: with split on, the selected side breathes, the unselected side holds steady, and the toggle
 * cycles left color → black → right color → black. With split off everything is steady — only the side carrying the
 * sound is lit, and the toggle wears that sound's color.
 */
export const createSideColumn = ({
  leftColor,
  rightColor,
  onSideSelected,
  onSplitToggled,
  selectedSide,
  split,
  time,
}: {
  /**
   * Display color for the left hand's pad.
   */
  leftColor: RgbColor

  /**
   * Display color for the right hand's pad.
   */
  rightColor: RgbColor

  onSideSelected?: (side: Side) => void
  onSplitToggled?: () => void

  /**
   * Side whose sound the picker screens are editing.
   */
  selectedSide: Side

  /**
   * Whether the keyboard is split into two zones.
   */
  split: boolean

  /**
   * Seconds elapsed since the program started; drives the breathing and toggle-cycle animations.
   */
  time: number
}): Drawable => {
  const sidePad = (side: Side, y: number, color: RgbColor) =>
    translate(
      8,
      y,
      createButton({
        color: split && side === selectedSide ? breathe(color, time) : color,
        onPress: () => {
          onSideSelected?.(side)
        },
      }),
    )

  const selectedColor = selectedSide === 'left' ? leftColor : rightColor
  const toggle = translate(
    8,
    7,
    createButton({
      color: split ? toggleCycleColor(leftColor, rightColor, time) : selectedColor,
      onPress: () => {
        onSplitToggled?.()
      },
    }),
  )

  const pads = [toggle]
  if (split || selectedSide === 'left') {
    pads.push(sidePad('left', 0, leftColor))
  }
  if (split || selectedSide === 'right') {
    pads.push(sidePad('right', 1, rightColor))
  }

  return group(...pads)
}
