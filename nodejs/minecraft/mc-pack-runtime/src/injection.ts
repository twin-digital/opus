/**
 * The value the kit's build injects into a namespaced pack's script bundle. The build assigns
 * `globalThis.__MC_PACK_RUNTIME__` ahead of every pack module, so a vendored library's own calls
 * and the vendoring package's code read the same value with nothing passed per call. A pack built
 * with namespacing off assigns nothing, and every read here answers `undefined`.
 */

/** What the build injects for a namespaced pack. */
export interface PackRuntimeInjection {
  /** The namespace every name the pack declares carries. */
  readonly namespace: string
  /** The token naming the built pack itself: its package name, the `@` dropped and the `/` a hyphen. */
  readonly packToken: string
  /**
   * The prefix tokens of the pack's vendored dependencies, sorted and frozen by the build.
   * A composed name's first dot-segment must be one of these — see `packId`.
   */
  readonly prefixes: readonly string[]
}

/** The property the build assigns on `globalThis`. */
export const INJECTION_GLOBAL = '__MC_PACK_RUNTIME__'

/** The injected value, or `undefined` in a pack built with namespacing off. */
export const injection = (): PackRuntimeInjection | undefined =>
  (globalThis as Record<string, unknown>)[INJECTION_GLOBAL] as PackRuntimeInjection | undefined
