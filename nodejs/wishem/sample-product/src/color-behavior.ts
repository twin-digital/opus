import type { NativeBehavior } from '@thrashplay/wishem-update'
import { COLOR_FIELD, COLOR_TYPE } from './ids.js'

/** The colors of the sample entity, in the order of the ticks. The first color is the color of the model. */
export const COLORS = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207'] as const

/** Sets the `color` of a `Color` component to the color at the position `ticks` modulo the number of colors. */
export const colorBehavior: NativeBehavior = {
  id: 'sample-product/color',
  componentType: COLOR_TYPE,
  update: (fields, tick) => ({ ...fields, [COLOR_FIELD]: COLORS[tick.ticks % COLORS.length] }),
}
