import { createTime } from '@thrashplay/wishem-clock'
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import { createUpdate } from '@thrashplay/wishem-update'
import { colorBehavior } from './color-behavior.ts'
import { CONSTRUCT_MODEL } from './model.ts'

export interface PixiHubOptions {
  running: boolean
  onError?: (error: unknown) => void
}

/** A hub with `time` and the update subsystem (ID `store`) with the color behavior, in this order. Not started. */
export const createPixiHub = (options: PixiHubOptions): Hub => {
  const update = createUpdate({ store: createStore({ model: CONSTRUCT_MODEL }), behaviors: [colorBehavior] })
  return createHub({
    subsystems: [createTime({ running: options.running }), update],
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  })
}
