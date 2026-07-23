import type { InvalidEntityError as DeclaredInvalidEntityError } from '@minecraft/server'

import type { Expect } from './internal/type-checks.js'

/**
 * Thrown by fake members whose real counterparts throw `InvalidEntityError` when the entity
 * reference has become invalid (unloaded or removed).
 *
 * `@minecraft/server` declares this class but ships no runtime code, so the library defines its
 * own with the declared name and shape: it extends `Error` and carries the `id` and `type` of
 * the entity that is now invalid. Catch it by class:
 *
 * ```typescript
 * try {
 *   entity.applyDamage(2)
 * } catch (error) {
 *   if (error instanceof InvalidEntityError) {
 *     // entity unloaded between selection and use
 *   }
 * }
 * ```
 */
export class InvalidEntityError extends Error {
  /** Id of the entity that is now invalid. */
  readonly id: string

  /** Type of the entity that is now invalid. */
  readonly type: string

  constructor(id: string, type: string) {
    super(`Entity is invalid: ${type} (${id})`)
    this.name = 'InvalidEntityError'
    this.id = id
    this.type = type
  }
}

type _matchesDeclaredShape = Expect<InvalidEntityError extends DeclaredInvalidEntityError ? true : false>

/**
 * Thrown when a test touches surface the fakes do not model: members outside the built slice,
 * state the spawn spec never supplied, or arguments (like entity query options) whose handling
 * has no fidelity reference. A loud throw here is deliberate — the alternative is a fabricated
 * value and a test that passes against the fake but not the engine.
 *
 * The message names the member or missing state, e.g. `Entity.teleport` or
 * `Entity.location (not staged in the spawn spec)`.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented by @twin-digital/minecraft-test-lib: ${what}`)
    this.name = 'NotImplementedError'
  }
}
