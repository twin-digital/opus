import type { Id, Model } from '@thrashplay/wishem-core'

/** The ID of the component type of the view `ClearColor`. */
export const CLEAR_COLOR_TYPE: Id = 'ct_c47a0a86-b82f-43a8-8b0b-31a1e4ef6f37'
export const COLOR_FIELD: Id = 'fld_6f0d3b5e-8a41-4c7e-9d52-1b7a0e4c93a8'
export const SCREEN_ENTITY: Id = 'e_2c9e7d14-5b3a-4f68-a1d0-83e5c7b4f192'

/** The colors of the clear-color entity, in the order of the ticks. */
export const COLORS = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207'] as const

/** The length of one tick of the clock in milliseconds. */
export const STEP_MS = 500

/** The default port of the link. */
export const DEFAULT_PORT = 4749

export const CONSTRUCT_MODEL: Model = {
  definitions: [
    {
      id: CLEAR_COLOR_TYPE,
      label: 'Clear color',
      fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }],
    },
  ],
  entities: [{ id: SCREEN_ENTITY, components: { [CLEAR_COLOR_TYPE]: { [COLOR_FIELD]: COLORS[0] } } }],
}
