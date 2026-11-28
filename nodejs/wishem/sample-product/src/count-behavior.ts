import type { NativeBehavior } from '@thrashplay/wishem-update'
import { COUNTER_TYPE, COUNT_FIELD } from './ids.js'

/** Adds 1 to the `count` of a `Counter` component at each tick. It keeps a `count` that is not a number. */
export const countBehavior: NativeBehavior = {
  id: 'sample-product/count',
  componentType: COUNTER_TYPE,
  update: (fields) => {
    const count = fields[COUNT_FIELD]
    return typeof count === 'number' ? { ...fields, [COUNT_FIELD]: count + 1 } : fields
  },
}

/** The native behaviors of the sample product. */
export const behaviors: readonly NativeBehavior[] = [countBehavior]
