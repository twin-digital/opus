import type { Id, Model } from '@thrashplay/wishem-core'

export const CLEAR_COLOR_TYPE: Id = 'ct_768a9edd-1db9-4a37-9190-9ea4af8aeebe'
export const COLOR_FIELD: Id = 'fld_590c5266-eb3d-4022-bb6c-7856b920c4e1'
export const SCREEN_ENTITY: Id = 'e_4855a364-2589-4522-8019-7a01ed1005d4'

/** The colors of the clear-color entity, in the order of the ticks. */
export const COLORS = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207'] as const

/** The length of one tick of the clock in milliseconds. */
export const STEP_MS = 500

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
