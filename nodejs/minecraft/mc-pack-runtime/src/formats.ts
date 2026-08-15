/**
 * The spellings this package and the kit's build share: the type family the build stamps on every
 * entity type a namespaced pack declares, and the identifier of the claim entity type it adds.
 * Both carry the pack token, not the namespace, so two packs contending for one namespace still
 * tell apart.
 */

/** The family the build stamps on every entity type a namespaced pack declares. */
export const packFamilyFor = (packToken: string): string => `mcdk_pack_${packToken}`

/** The identifier of the claim entity type the build adds to a namespaced pack's behavior half. */
export const claimTypeIdFor = (namespace: string, packToken: string): string => `${namespace}:mcdk_claim_${packToken}`

/** The pack token a claim identifier in `namespace` carries, or `undefined` for any other id. */
export const claimTokenOf = (namespace: string, entityTypeId: string): string | undefined => {
  const prefix = `${namespace}:mcdk_claim_`
  return entityTypeId.startsWith(prefix) ? entityTypeId.slice(prefix.length) : undefined
}
