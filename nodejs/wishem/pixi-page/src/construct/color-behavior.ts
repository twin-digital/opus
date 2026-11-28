import type { NativeBehavior } from '@thrashplay/wishem-update'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD } from './model.ts'

/** Sets the `Color` field to the color at the position `ticks` modulo the number of colors. */
export const colorBehavior: NativeBehavior = {
  id: 'pixi-page/color',
  componentType: CLEAR_COLOR_TYPE,
  update: (fields, tick) => ({ ...fields, [COLOR_FIELD]: COLORS[tick.ticks % COLORS.length] }),
}
