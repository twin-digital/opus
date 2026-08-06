import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { listFiles } from './build-outputs.js'
import { isRecord, parseJson } from './json.js'

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
export async function archivePackage(packageDir: string): Promise<string> {
  const root = path.resolve(packageDir)
  const outputTree = path.join(root, 'dist')
  const identity = await readIdentity(root)

  const addon = new AdmZip()
  let members = 0

  for (const [directory, member] of PACK_MEMBERS) {
    const packDir = path.join(outputTree, directory)
    const files = await listFiles(packDir)
    if (files.length === 0) {
      continue
    }

    const pack = new AdmZip()
    for (const file of files.sort()) {
      pack.addFile(path.relative(packDir, file).split(path.sep).join('/'), await readFile(file))
    }
    addon.addFile(member, pack.toBuffer())
    members += 1
  }

  if (members === 0) {
    throw new Error(`no built output tree at ${outputTree}: build the package before archiving it`)
  }

  const assets = path.join(root, RELEASE_ASSETS)
  await rm(assets, { force: true, recursive: true })
  await mkdir(assets, { recursive: true })

  const archive = path.join(assets, `${identity.name}-${identity.version}.mcaddon`)
  await writeFile(archive, addon.toBuffer())
  return archive
}

/** The archive's name and version, from the package's own `package.json`. */
async function readIdentity(packageDir: string): Promise<{ name: string; version: string }> {
  const manifestPath = path.join(packageDir, 'package.json')
  const parsed = parseJson(await readFile(manifestPath, 'utf8'))
  if (!isRecord(parsed) || typeof parsed.name !== 'string' || typeof parsed.version !== 'string') {
    throw new Error(`${manifestPath} declares no name and version to build an archive name from`)
  }
  return { name: parsed.name.replace(/^@[^/]+\//, ''), version: parsed.version }
}
