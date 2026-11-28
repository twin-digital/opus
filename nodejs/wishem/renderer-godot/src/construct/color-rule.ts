import { TIME_ID } from '@thrashplay/wishem-clock'
import type { Id, Model } from '@thrashplay/wishem-core'
import { InputRefusedError } from '@thrashplay/wishem-hub'
import type { ModelSubsystem, RecordedInput } from '@thrashplay/wishem-hub'

export interface ColorRuleOptions {
  entity: Id
  componentType: Id
  field: Id
  colors: readonly string[]
}

const ADVANCE = 'time/advance'

const ticksOf = (time: unknown): number | undefined => {
  const ticks = typeof time === 'object' && time !== null ? (time as { ticks?: unknown }).ticks : undefined
  return typeof ticks === 'number' ? ticks : undefined
}

/** A model subsystem with the ID of the store that also applies `time/advance`. */
export const withColorRule = (store: ModelSubsystem<Model>, options: ColorRuleOptions): ModelSubsystem<Model> => ({
  id: store.id,
  inputs: [...store.inputs, ADVANCE],
  initial: store.initial,
  apply: (part, input, context) => {
    if (input.type !== ADVANCE) {
      return store.apply(part, input, context)
    }
    const ticks = ticksOf(context.read()[TIME_ID])
    if (ticks === undefined) {
      throw new InputRefusedError([{ message: `The joined state has no part "${TIME_ID}".`, path: [TIME_ID] }])
    }
    const { entity, componentType, field, colors } = options
    const setField: RecordedInput = {
      ...input,
      type: `${store.id}/set-field`,
      payload: { entity, componentType, field, value: colors[ticks % colors.length] },
    }
    return store.apply(part, setField, context)
  },
})
