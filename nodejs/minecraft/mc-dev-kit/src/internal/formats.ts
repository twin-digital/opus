/**
 * The spellings the build shares with `@twin-digital/mc-pack-runtime`: the injected global, the
 * type family stamped on every entity type a namespaced pack declares, and the claim entity type
 * inserted into a namespaced behavior pack. Each spelling sits behind one constant so a separator
 * change is cheap.
 */

/** The property the build assigns on `globalThis`, read lazily by the runtime package. */
export const INJECTION_GLOBAL = '__MC_PACK_RUNTIME__'

/** An npm package name as a token: the `@` dropped and the `/` a hyphen. */
export function packageToken(packageName: string): string {
  return packageName.replace(/^@/, '').replace('/', '-')
}

/** The prefix of the family the build stamps; the whole family is the prefix plus the pack token. */
export const PACK_FAMILY_PREFIX = 'mcdk_pack_'

/** The family stamped on every entity type a namespaced pack declares. */
export function packFamily(packToken: string): string {
  return `${PACK_FAMILY_PREFIX}${packToken}`
}

/** The reserved prefix of claim entity names; an author's bare name landing in it is refused. */
export const CLAIM_NAME_PREFIX = 'mcdk_claim_'

/** The bare name of the claim entity type the build adds to a namespaced behavior pack. */
export function claimName(packToken: string): string {
  return `${CLAIM_NAME_PREFIX}${packToken}`
}

/**
 * The asset namespace of a built pack, derived from its header uuid: `mcdk_` plus the uuid's hex
 * with the hyphens dropped. Internal asset names — geometry, textures, materials, render
 * controllers, animations, animation controllers — carry it instead of the pack's namespace.
 */
export function assetNamespace(uuid: string): string {
  return `mcdk_${uuid.toLowerCase().replaceAll('-', '')}`
}
