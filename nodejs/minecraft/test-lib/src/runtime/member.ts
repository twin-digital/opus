/* eslint-disable @typescript-eslint/no-explicit-any -- the delegation seam is untyped by design:
   a generated member's declared return type is the contract, and the behaviour behind it is
   reached through one cast rather than 1010. */

import { failedCallMessage, failedPropertyMessage, InvalidEntityError, NotImplementedError } from '../errors.js'

export { NotImplementedError } from '../errors.js'

/** Where a generated member's state lives. A symbol, so it stays out of `Object.keys` and `for-in`. */
const kState = Symbol('minecraft-test-lib.state')

/**
 * The per-instance record behind every fake. `own` holds the values emitted as own data properties
 * (an entity's `typeId` and `id`); `data` is whatever the behaviour for that class keeps; `owner`
 * is the entity a component or effect hangs off, whose validity it follows.
 */
export interface FakeState<D = unknown> {
  readonly className: string
  readonly own: Readonly<Record<string, unknown>>
  readonly owner?: FakeState
  valid: boolean
  data: D
}

/** Attaches a state record to a fake under construction. */
export const initFake = (fake: object, state: FakeState): void => {
  Object.defineProperty(fake, kState, { value: state, enumerable: false, writable: false })
}

/** The state record behind a fake, typed as the behaviour that owns the class expects it. */
export const stateOf = <D>(fake: object): FakeState<D> => {
  const state = (fake as Record<symbol, FakeState<D> | undefined>)[kState]
  if (!state) {
    throw new TypeError('not a fake from this library')
  }
  return state
}

/** Whether a fake is still valid — a component or effect is invalid once its owner is. */
export const isValidFake = (state: FakeState): boolean =>
  state.valid && (state.owner === undefined || isValidFake(state.owner))

/** The entity identity an `InvalidEntityError` carries: the fake's own, or its owner's. */
const identityOf = (state: FakeState): { id: string; type: string } => {
  const entity = state.owner ?? state
  return {
    id: typeof entity.own.id === 'string' ? entity.own.id : '',
    type: typeof entity.own.typeId === 'string' ? entity.own.typeId : '',
  }
}

/** How the engine's `InvalidEntityError` message names the access that hit the guard. */
export type AccessShape = 'get property' | 'set property' | 'call function'

/**
 * The guard the engine puts on most members of an invalidated entity. Emitted into a member's
 * prologue where the guard data says that member throws `InvalidEntityError`.
 */
export const guardInvalidEntity = (fake: object, shape: AccessShape, name: string): void => {
  const state = stateOf(fake)
  if (isValidFake(state)) {
    return
  }
  const { id, type } = identityOf(state)
  throw new InvalidEntityError(
    id,
    type,
    `Failed to ${shape} '${name}' due to Entity being invalid (has the Entity been removed?).`,
  )
}

/**
 * The check a control-plane free function makes before it reshapes an entity. Those functions act
 * on a live entity, so one that has gone invalid refuses the way a member would.
 */
export const assertLiveEntity = (entity: object, called: string): void => {
  const state = stateOf(entity)
  if (isValidFake(state)) {
    return
  }
  const { id, type } = identityOf(state)
  throw new InvalidEntityError(id, type, `${called} was called on an entity that is no longer valid.`)
}

/** The plain `Error` an attribute component's value getters and an effect's members throw. */
export const guardFailedProperty = (fake: object, name: string): void => {
  if (!isValidFake(stateOf(fake))) {
    throw new Error(failedPropertyMessage(name))
  }
}

/** The plain `Error` an attribute component's resets throw. */
export const guardFailedCall = (fake: object, name: string): void => {
  if (!isValidFake(stateOf(fake))) {
    throw new Error(failedCallMessage(name))
  }
}

/**
 * The engine's arity check, which runs ahead of the validity guard. Only the minimum is enforced;
 * extra arguments pass through, as the engine has never been observed rejecting them. `expected`
 * is pre-rendered by the generator, since the message names both bounds where they differ.
 */
export const checkArity = (received: number, minimum: number, expected: string): void => {
  if (received < minimum) {
    throw new TypeError(`Incorrect number of arguments to function. Expected ${expected}, received ${String(received)}`)
  }
}

/** One member's behaviour: it takes the fake it was called on, then the member's own arguments. */
export type MemberBehaviour = (fake: any, ...args: any[]) => unknown

/** Every modelled member of one faked class, keyed by member name (`'nameTag='` for a setter). */
export type ClassBehaviour = Record<string, MemberBehaviour>

const behaviours = new Map<string, ClassBehaviour>()

/**
 * Registers the hand-written behaviour for a faked class. A member with no entry here is one this
 * cycle does not model, and throws `NotImplementedError` from the body the generator wrote for it.
 */
export const registerBehaviour = (className: string, behaviour: ClassBehaviour): void => {
  behaviours.set(className, { ...behaviours.get(className), ...behaviour })
}

/** The seam every generated member body ends in. */
export const delegate = (fake: object, className: string, member: string, args: unknown[]): any => {
  const behaviour = behaviours.get(className)?.[member]
  if (!behaviour) {
    throw new NotImplementedError(`${className}.${member.replace(/=$/, '')}`)
  }
  return behaviour(fake, ...args)
}

/**
 * Makes a generated class's prototype members enumerable, which `class` syntax alone does not.
 * A real entity's methods are enumerable, so `for-in` walks them; keeping them on the prototype
 * rather than in fields is what keeps `Object.keys` reading only the own data properties.
 */
export const defineMembersEnumerable = (prototype: object): void => {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (descriptor) {
      Object.defineProperty(prototype, name, { ...descriptor, enumerable: true })
    }
  }
}
