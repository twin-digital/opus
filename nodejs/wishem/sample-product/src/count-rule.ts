import type { Entity, Id, Model } from '@thrashplay/wishem-core'
import type { ApplyContext, ModelSubsystem, RecordedInput } from '@thrashplay/wishem-hub'
import { COUNTER_TYPE, COUNT_FIELD } from './ids.js'

const TICK = 'time/advance'
const DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/

/**
 * Returns a model subsystem with the ID of `store`. It applies each input of the store as the store does.
 * For each `time/advance`, it adds 1 to each `count` of a `Counter` component that is a decimal integer.
 * Put the `time` subsystem before it in the list of subsystems.
 */
export const withCountRule = (store: ModelSubsystem<Model>): ModelSubsystem<Model> => ({
  id: store.id,
  inputs: [...store.inputs, TICK],
  initial: store.initial,
  apply: (part: Model, input: RecordedInput, context: ApplyContext): Model => {
    if (input.type !== TICK) {
      return store.apply(part, input, context)
    }
    const setFieldType = `${store.id}/set-field`
    return part.entities.reduce((current, entity) => {
      const component = entity.components[COUNTER_TYPE] as Entity['components'][Id] | undefined
      const count = component?.[COUNT_FIELD]
      if (typeof count !== 'string' || !DECIMAL_INTEGER.test(count)) {
        return current
      }
      const payload = {
        entity: entity.id,
        componentType: COUNTER_TYPE,
        field: COUNT_FIELD,
        value: String(BigInt(count) + 1n),
      }
      return store.apply(current, { ...input, type: setFieldType, payload }, context)
    }, part)
  },
})
