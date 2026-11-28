import { TIME_ID } from '@thrashplay/wishem-clock'
import { storeInputs, type FieldValue, type Id, type Model } from '@thrashplay/wishem-core'
import {
  InputRefusedError,
  type ApplyContext,
  type InputProblem,
  type ModelSubsystem,
  type RecordedInput,
} from '@thrashplay/wishem-hub'
import { checkBehaviors } from './check-behaviors.js'

const TICK = 'time/advance'

/** The fields of one component: field ID to value. */
export type Fields = Readonly<Record<Id, FieldValue>>

/** The facts of one tick that a behavior gets. */
export interface Tick {
  /** The length of the tick in milliseconds: the payload `ms` of `time/advance`. */
  readonly ms: number
  /** `ticks` of the part `time` after the tick. */
  readonly ticks: number
  /** `now` of the part `time` after the tick. */
  readonly now: number
}

/** A behavior whose code a person wrote. */
export interface NativeBehavior {
  /** Not empty, and unique in one list. For example `sample-product/count`. */
  readonly id: string
  /** The ID of the component type. */
  readonly componentType: Id
  /** A pure function. Returns the new fields, or the same object. */
  readonly update: (fields: Fields, tick: Tick) => Fields
}

export interface UpdateOptions {
  store: ModelSubsystem<Model>
  /** The order of the list is the order in a tick. */
  behaviors: readonly NativeBehavior[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const readTick = (input: RecordedInput, context: ApplyContext): Tick => {
  const time = context.read()[TIME_ID]
  const ticks = isRecord(time) ? time.ticks : undefined
  const now = isRecord(time) ? time.now : undefined
  if (typeof ticks !== 'number' || typeof now !== 'number') {
    throw new InputRefusedError([
      { message: `The joined state has no part "${TIME_ID}" with the numbers ticks and now.`, path: [TIME_ID] },
    ])
  }
  const ms = isRecord(input.payload) ? input.payload.ms : undefined
  return { ms: typeof ms === 'number' ? ms : 0, ticks, now }
}

const refuseBehavior = (behavior: NativeBehavior, entity: Id, problems: readonly InputProblem[]): never => {
  const prefix = `The behavior "${behavior.id}" for the entity "${entity}": `
  throw new InputRefusedError(
    problems.map((problem) => ({
      message: `${prefix}${problem.message}`,
      path: ['behaviors', behavior.id, entity, ...(problem.path ?? [])],
    })),
  )
}

/**
 * The update subsystem: a model subsystem with the ID and the first part of `store`. It applies each input
 * type of the store as the store does, and also `time/advance`. Put the `time` subsystem before it.
 * Throws the error of `checkBehaviors`.
 */
export const createUpdate = (options: UpdateOptions): ModelSubsystem<Model> => {
  const { store } = options
  const behaviors = checkBehaviors(options.behaviors)
  const inputs = storeInputs(store.id)

  const runBehavior = (
    behavior: NativeBehavior,
    start: Model,
    input: RecordedInput,
    context: ApplyContext,
    tick: Tick,
  ): Model => {
    let part = start
    for (const { id: entity } of start.entities) {
      const current = part.entities.find((candidate) => candidate.id === entity)
      const fields =
        current !== undefined && Object.hasOwn(current.components, behavior.componentType) ?
          current.components[behavior.componentType]
        : undefined
      if (fields === undefined) {
        continue
      }
      try {
        const result = behavior.update(fields, tick)
        for (const [field, value] of Object.entries(result)) {
          if (fields[field] === value) {
            continue
          }
          const write = inputs.setField({ entity, componentType: behavior.componentType, field, value })
          part = store.apply(part, { ...input, type: write.type, payload: write.payload }, context)
        }
      } catch (error) {
        if (error instanceof InputRefusedError) {
          return refuseBehavior(behavior, entity, error.problems)
        }
        return refuseBehavior(behavior, entity, [{ message: error instanceof Error ? error.message : String(error) }])
      }
    }
    return part
  }

  return {
    id: store.id,
    inputs: [...store.inputs, TICK],
    initial: store.initial,
    apply: (part, input, context) => {
      if (input.type !== TICK) {
        return store.apply(part, input, context)
      }
      const tick = readTick(input, context)
      return behaviors.reduce((current, behavior) => runBehavior(behavior, current, input, context, tick), part)
    },
  }
}
