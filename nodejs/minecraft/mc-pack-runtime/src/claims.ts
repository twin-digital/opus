/**
 * The namespace-claim report. The kit's build adds to every namespaced pack an entity type whose
 * identifier carries the pack's own token. At world load this module enumerates the declared
 * entity types, and a claim in this pack's namespace carrying another pack's token is a
 * contention: it appears in the value {@link foreignNamespaceClaims} answers, and is written to
 * the content log. With no rival — or with no namespace injected — the value is empty and nothing
 * is logged.
 */
import { EntityTypes, world } from '@minecraft/server'

import { claimTokenOf } from './formats.js'
import { injection } from './injection.js'

/** One rival's claim on this pack's namespace, read from the claim entity type it declared. */
export interface NamespaceClaim {
  /** The contended namespace — this pack's own. */
  readonly namespace: string
  /** The rival pack's token: its package name, the `@` dropped and the `/` a hyphen. */
  readonly token: string
  /** The claim entity type identifier the rival's build added, as enumerated. */
  readonly entityTypeId: string
}

/** The report the last enumeration built; `undefined` until the first world load. */
let claims: readonly NamespaceClaim[] | undefined

/** Enumerates the catalog and replaces the report; the catalog only answers after world load. */
const enumerate = (): void => {
  const injected = injection()
  if (injected === undefined) {
    claims = []
    return
  }
  const found: NamespaceClaim[] = []
  for (const type of EntityTypes.getAll()) {
    const token = claimTokenOf(injected.namespace, type.id)
    if (token !== undefined && token !== injected.packToken) {
      found.push({ namespace: injected.namespace, token, entityTypeId: type.id })
      // console.warn is the script engine's write to the content log.
      console.warn(
        `[mc-pack-runtime] namespace '${injected.namespace}' is also claimed by pack '${token}' (${type.id})`,
      )
    }
  }
  claims = found
}

// The catalog refuses every read before world load, so the enumeration waits for it; subscribing
// here, at module evaluation, is allowed in early execution.
world.afterEvents.worldLoad.subscribe(enumerate)

/**
 * The rival claims on this pack's namespace, one entry per contending pack. Empty where the
 * namespace is uncontended, and where the pack was built with namespacing off.
 *
 * Throws before the world has loaded: the report is built at world load — the type catalog
 * answers no read earlier — and does not exist yet, and an empty answer would read as "no
 * rivals found", a claim the runtime cannot make yet.
 */
export function foreignNamespaceClaims(): readonly NamespaceClaim[] {
  if (claims === undefined) {
    throw new Error(
      'foreignNamespaceClaims() called before the world has loaded: the report is built at world load and does not exist yet',
    )
  }
  return claims
}
