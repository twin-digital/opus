import path from 'node:path'

/** Where the release hook looks for what a package publishes. */
export const RELEASE_ASSETS = '.release-assets'

/** The pack kinds an output tree may hold, and the mcpack member each is cut into. */
export const PACK_MEMBERS = [
  ['behavior_pack', 'behavior_pack.mcpack'],
  ['resource_pack', 'resource_pack.mcpack'],
] as const

/**
 * Cuts a package's built output tree into the single `.mcaddon` its release hook uploads.
 *
 * The tree is the whole of the input: the packs are the kind-named directories `dist/` holds, and
 * the kit is never called, so a tree stale with respect to source is archived as it stands. Each
 * pack becomes one `.mcpack` member holding the contents of its output directory at the archive
 * root, and the `.mcaddon` holds one member per pack whatever the number of packs.
 *
 * The archive is named `<package name with its npm scope stripped>-<version>.mcaddon`, from the
 * package's `package.json`, and is written into `.release-assets/`, which is created and cleared
 * first so a previous version's archive is not published beside the current one.
 *
 * @param packageDir - the package directory to archive, which is the one the command was run in
 * @returns the absolute path of the archive written
 * @throws naming the missing directory when the package's output tree is absent — the command
 *   never runs a build itself
 */
export function archivePackage(packageDir: string): Promise<string> {
  return Promise.reject(new Error(`pack archiving is not implemented yet (${path.resolve(packageDir)})`))
}
