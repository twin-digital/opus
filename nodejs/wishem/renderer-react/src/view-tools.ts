import type { ComponentTypeDefinition, FieldValue, Id, SetFieldPayload } from '@thrashplay/wishem-core'
import { LinkClosedError, type Input, type InputProblem, type Port, type RejectionReason } from '@thrashplay/wishem-hub'
import { propNames, RESERVED_PROP_NAMES } from './field-names.js'

export { RESERVED_PROP_NAMES }

/** The operation of a port that sends. */
export type InputPort = Pick<Port, 'submit'>

export type InputOutcome =
  | { readonly ok: true; readonly seq: number }
  | {
      readonly ok: false
      /** `unknown`: the link ended before the result. `failed`: the hub failed to apply the input. */
      readonly reason: RejectionReason | 'unknown' | 'failed'
      readonly problems: readonly InputProblem[]
    }

/** The prop `wishem` of a view. The promises never reject. */
export interface ViewTools<Values extends object = Readonly<Record<string, FieldValue>>> {
  /** Sends `store/set-field` for the field whose prop has this name, in the component of the view. */
  setField<Name extends keyof Values & string>(name: Name, value: Values[Name]): Promise<InputOutcome>
  submit(input: Input): Promise<InputOutcome>
}

export type ViewToolsCall =
  | { readonly kind: 'setField'; readonly name: string; readonly value: FieldValue }
  | { readonly kind: 'submit'; readonly input: Input }

export interface ViewToolsStub<Values extends object> {
  readonly tools: ViewTools<Values>
  /** Each call, in order. */
  readonly calls: readonly ViewToolsCall[]
}

export interface ViewToolsTarget {
  /** With no value, each call has the outcome `not-permitted`. */
  input: InputPort | undefined
  entity: Id
  componentType: Id
  definition: ComponentTypeDefinition
}

const rejection = (reason: Extract<InputOutcome, { ok: false }>['reason'], problems: InputProblem[] = []) =>
  ({ ok: false, reason, problems }) as const

const send = async (input: InputPort | undefined, message: Input): Promise<InputOutcome> => {
  if (!input) {
    return rejection('not-permitted')
  }
  try {
    return await input.submit(message)
  } catch (error) {
    return rejection(error instanceof LinkClosedError ? 'unknown' : 'failed')
  }
}

/** The tools of one component. The tools keep the input port that they get. */
export const createViewTools = ({ input, entity, componentType, definition }: ViewToolsTarget): ViewTools => {
  const fields = new Map(propNames(definition).props.map(({ name, field }) => [name, field.id]))

  return {
    setField: (name, value) => {
      const field = fields.get(name)
      if (field === undefined) {
        return Promise.resolve(rejection('invalid', [{ message: `No field has the prop name "${name}"` }]))
      }
      const payload: SetFieldPayload = { entity, componentType, field, value }
      return send(input, { type: 'store/set-field', payload })
    },
    submit: (message) => send(input, message),
  }
}

/** Default outcome: `{ ok: true, seq: <number of the call> }`. A function can give a promise that never settles. */
export const stubViewTools = <Values extends object = Readonly<Record<string, FieldValue>>>(
  outcome?: InputOutcome | ((call: ViewToolsCall) => InputOutcome | Promise<InputOutcome>),
): ViewToolsStub<Values> => {
  const calls: ViewToolsCall[] = []
  const record = (call: ViewToolsCall): Promise<InputOutcome> => {
    calls.push(call)
    if (outcome === undefined) {
      return Promise.resolve({ ok: true, seq: calls.length })
    }
    return Promise.resolve(typeof outcome === 'function' ? outcome(call) : outcome)
  }
  return {
    tools: {
      setField: (name, value) => record({ kind: 'setField', name, value: value as FieldValue }),
      submit: (input) => record({ kind: 'submit', input }),
    },
    calls,
  }
}
