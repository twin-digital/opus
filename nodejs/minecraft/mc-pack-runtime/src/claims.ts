/**
 * The namespace-claim report. The kit's build adds to every namespaced pack an entity type whose
 * identifier carries the pack's own token. At load this module enumerates the declared entity
 * types, and a claim in this pack's namespace carrying another pack's token is a contention:
 * it appears in the value {@link foreignNamespaceClaims} answers, and is written to the content
 * log. With no rival — or with no namespace injected — the value is empty and nothing is logged.
 */

/** One rival's claim on this pack's namespace, read from the claim entity type it declared. */
export interface NamespaceClaim {
  /** The contended namespace — this pack's own. */
  readonly namespace: string
  /** The rival pack's token: its package name, the `@` dropped and the `/` a hyphen. */
  readonly token: string
  /** The claim entity type identifier the rival's build added, as enumerated. */
  readonly entityTypeId: string
}

/**
 * The rival claims on this pack's namespace, one entry per contending pack. Empty where the
 * namespace is uncontended, and where the pack was built with namespacing off.
 */
export function foreignNamespaceClaims(): readonly NamespaceClaim[] {
  throw new Error('not implemented')
}
