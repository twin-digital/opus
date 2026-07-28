/**
 * The error classes the fakes throw. `@minecraft/server` ships no runtime JavaScript, so none of
 * the engine's own error classes can be imported by a test process; these carry the engine's
 * declared shapes and observed messages, plus two of the library's own.
 */

/**
 * Thrown by a member of an entity whose reference has gone invalid — the state `remove()` and the
 * `invalidate` free function both leave a reference in. Carries the id and type of the entity, as
 * the engine's declaration does.
 */
export class InvalidEntityError extends Error {
  constructor(
    readonly id: string,
    readonly type: string,
    message: string,
  ) {
    super(message)
    this.name = 'InvalidEntityError'
  }
}

/** Thrown where a numeric argument falls outside the bounds the engine enforces. */
export class ArgumentOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgumentOutOfBoundsError'
  }
}

/** Thrown where an argument's value is one the engine rejects outright. */
export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgumentError'
  }
}

/**
 * Thrown by a member this cycle of the library does not model. The member exists — it is part of
 * the declared shape — and calling it says so rather than answering with a fabricated value.
 */
export class NotImplementedError extends Error {
  constructor(readonly member: string) {
    super(`${member} is declared by @minecraft/server but is not modelled by this library.`)
    this.name = 'NotImplementedError'
  }
}

/**
 * Thrown by a modelled member reading a value the test never supplied, where the engine could not
 * have lacked it — an entity's `nameTag` before one was set, an attribute component's bounds.
 */
export class UnsetValueError extends Error {
  constructor(readonly member: string) {
    super(`${member} was never supplied. Set it when creating the fake, or supply it before reading.`)
    this.name = 'UnsetValueError'
  }
}

/** The message the engine's plain `Error` carries for a property read on an invalid owner. */
export const failedPropertyMessage = (name: string): string => `Failed to get property '${name}'.`

/** The message the engine's plain `Error` carries for a call on an invalid owner. */
export const failedCallMessage = (name: string): string => `Failed to call function '${name}'.`
