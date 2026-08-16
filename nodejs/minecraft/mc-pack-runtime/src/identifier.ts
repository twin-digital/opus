import { packFamilyFor } from './formats.js'
import { injection } from './injection.js'

/**
 * Spells a name into the full identifier the build gave it: `packId('wizard')` in a pack
 * namespaced `arena` is `'arena:wizard'`, and `packId('pack1.fireball')` is
 * `'arena:pack1.fireball'` where `pack1` is one of the pack's vendored prefixes. A vendored
 * library calling this resolves through whichever package vendored it, with nothing passed per
 * call.
 *
 * Throws where the name already carries a `:` — the helper spells unnamespaced names only — and
 * where no namespace was injected, since the engine would read a bare name as `minecraft:<name>`
 * and a silent wrong-namespace lookup is the bug this helper exists to prevent. A pack built
 * with namespacing off spells its identifiers in full and has no bare names to spell.
 *
 * A bare entity name never contains a dot, so a dotted name is always a composed one and its
 * first segment claims a vendored prefix: a segment the injection's `prefixes` does not carry is
 * a typo or an un-merged dependency, and the call throws naming the segment and the known
 * prefixes rather than spelling a nonexistent entity.
 */
export const packId = (name: string): string => {
  if (name.includes(':')) {
    throw new Error(`packId spells unnamespaced names only, and '${name}' already carries a namespace`)
  }
  const injected = injection()
  if (injected === undefined) {
    throw new Error(
      `packId('${name}') called with no namespace injected: this pack was built with namespacing off, so spell the identifier in full`,
    )
  }
  const dot = name.indexOf('.')
  if (dot !== -1) {
    const prefix = name.slice(0, dot)
    if (!injected.prefixes.includes(prefix)) {
      throw new Error(
        `packId('${name}') names the prefix '${prefix}', which is not a vendored prefix of this pack (known prefixes: ${
          injected.prefixes.length === 0 ? 'none' : injected.prefixes.join(', ')
        })`,
      )
    }
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
