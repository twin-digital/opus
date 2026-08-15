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

/** The hex digits kept from the sha256 digest in a vendored asset's token. */
export const VENDORED_HASH_LENGTH = 16

/**
 * The token a vendored asset's names carry: the vendored library's package token plus the
 * truncated content hash of the file declaring it, both visible in the name. Identical name means
 * identical bytes by construction, so two consumers vendoring one library version share names for
 * unchanged assets and diverge per asset where content differs.
 *
 * A pack's own asset names carry the pack namespace itself as their token, so they need no helper.
 */
export function vendoredAssetToken(libraryToken: string, contentHash: string): string {
  return `${libraryToken}-${contentHash}`
}
