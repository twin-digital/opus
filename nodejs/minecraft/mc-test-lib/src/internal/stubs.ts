import { NotImplementedError } from '../errors.js'

/**
 * Installs throwing accessors for every unbuilt member of a fake class. Reads and writes both
 * throw `NotImplementedError` naming the member; a `guard` runs first where the declarations
 * put a validity guard on the member, so an invalid owner throws its guard's error instead.
 */
export const installStubs = (
  prototype: object,
  className: string,
  members: readonly string[],
  guard?: (self: unknown) => void,
): void => {
  for (const member of members) {
    const stub = function (this: unknown): never {
      guard?.(this)
      throw new NotImplementedError(`${className}.${member}`)
    }
    Object.defineProperty(prototype, member, {
      get: stub,
      set: stub,
      configurable: true,
      enumerable: false,
    })
  }
}
