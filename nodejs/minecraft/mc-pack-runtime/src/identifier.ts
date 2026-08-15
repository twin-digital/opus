import { packFamilyFor } from './formats.js'
import { injection } from './injection.js'

/**
 * Spells a bare name into the full identifier the build gave it: `packId('wizard')` in a pack
 * namespaced `arena` is `'arena:wizard'`. A vendored library calling this resolves through
 * whichever package vendored it, with nothing passed per call.
 *
 * Throws where the name already carries a `:` — the helper spells bare names only — and where no
 * namespace was injected, since the engine would read a bare name as `minecraft:<name>` and a
 * silent wrong-namespace lookup is the bug this helper exists to prevent. A pack built with
 * namespacing off spells its identifiers in full and has no bare names to spell.
 */
export const packId = (name: string): string => {
  if (name.includes(':')) {
    throw new Error(`packId spells bare names only, and '${name}' already carries a namespace`)
  }
  const injected = injection()
  if (injected === undefined) {
    throw new Error(
      `packId('${name}') called with no namespace injected: this pack was built with namespacing off, so spell the identifier in full`,
    )
  }
  return `${injected.namespace}:${name}`
}

/** The namespace this pack was built under, or `undefined` when it was built with namespacing off. */
export const packNamespace = (): string | undefined => injection()?.namespace

/**
 * The type family the build stamped on every entity type this pack declares — the token the
 * checked calls test for, usable in an author's own `families` filters and `@e[family=]`
 * selectors. `undefined` when the pack was built with namespacing off, so nothing was stamped.
 */
export const packFamily = (): string | undefined => {
  const injected = injection()
  return injected === undefined ? undefined : packFamilyFor(injected.packToken)
}
