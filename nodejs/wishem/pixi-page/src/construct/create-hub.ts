import { createTime } from '@thrashplay/wishem-clock'
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import { withColorRule } from './color-rule.ts'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD, CONSTRUCT_MODEL, SCREEN_ENTITY } from './model.ts'

export interface PixiHubOptions {
  running: boolean
  onError?: (error: unknown) => void
}

/** A hub with `time` and the store with the color rule, in this order. Not started. */
export const createPixiHub = (options: PixiHubOptions): Hub => {
  const store = withColorRule(createStore({ model: CONSTRUCT_MODEL }), {
    entity: SCREEN_ENTITY,
    componentType: CLEAR_COLOR_TYPE,
    field: COLOR_FIELD,
    colors: COLORS,
  })
  return createHub({
    subsystems: [createTime({ running: options.running }), store],
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  })
}
