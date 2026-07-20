// Shared pack discovery for the dev harness: dev.mjs and
// generate-dev-config.mjs both walk from here, so the set of packs built
// always matches the set deployed and activated. Kept dependency-free by
// design — the harness is deliberately not a workspace package (see
// pnpm-workspace.yaml), so version parsing re-implements the shape check
// @twin-digital/mc-pack-config performs with the semver library at build time.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

/** The monorepo root (the dir with pnpm-workspace.yaml). */
export const findRepoRoot = () => {
  let root = here
  while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
    root = dirname(root)
  }
  return root
}

// Semver string → Bedrock's [major, minor, patch] triple, dropping any
// prerelease/build suffix. Strict: the whole string is shape-checked first —
// parseInt alone would coerce '1.2.3rc' to [1,2,3], producing a
// syntactically-valid activation entry the server silently refuses to load.
const SEMVER_TRIPLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].*)?$/
export const parseVersionTriple = (semver, context) => {
  const match = SEMVER_TRIPLE.exec(semver)
  if (match === null) {
    throw new Error(`${context}: version ${JSON.stringify(semver)} is not a major.minor.patch semver`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Every behavior pack in the monorepo — any package with a pack/manifest.json
 * — sorted by name and validated:
 * - header.uuid present (the activation list keys on it)
 * - pack directory names unique (they become container paths)
 * - uuids unique (a copy-pasted manifest template would otherwise produce a
 *   colliding activation list the server resolves arbitrarily)
 *
 * Returns [{ name, dir, relDir, packId, version }] — dir absolute, relDir
 * relative to the repo root (./nodejs/<group>/<name>, usable as a turbo
 * filter), version as a Bedrock triple.
 */
export const discoverPacks = (root) => {
  const packs = []
  const packsDir = join(root, 'nodejs')
  for (const group of readdirSync(packsDir, { withFileTypes: true })) {
    if (!group.isDirectory()) {
      continue
    }
    for (const pkg of readdirSync(join(packsDir, group.name), { withFileTypes: true })) {
      if (!pkg.isDirectory()) {
        continue
      }
      const dir = join(packsDir, group.name, pkg.name)
      const manifestPath = join(dir, 'pack', 'manifest.json')
      if (!existsSync(manifestPath)) {
        continue
      }
      const { header } = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof header?.uuid !== 'string' || header.uuid.length === 0) {
        throw new Error(`${manifestPath}: pack manifest has no header.uuid`)
      }
      const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      packs.push({
        name: pkg.name,
        dir,
        relDir: `./nodejs/${group.name}/${pkg.name}`,
        packId: header.uuid,
        version: parseVersionTriple(version, join(dir, 'package.json')),
      })
    }
  }
  packs.sort((a, b) => a.name.localeCompare(b.name))

  const seenNames = new Map()
  const seenUuids = new Map()
  for (const pack of packs) {
    if (seenNames.has(pack.name)) {
      throw new Error(`duplicate pack directory name '${pack.name}': ${seenNames.get(pack.name)} and ${pack.dir}`)
    }
    seenNames.set(pack.name, pack.dir)
    if (seenUuids.has(pack.packId)) {
      throw new Error(
        `duplicate pack uuid '${pack.packId}': ${seenUuids.get(pack.packId)} and ${pack.dir} — regenerate the copied manifest's header.uuid`,
      )
    }
    seenUuids.set(pack.packId, pack.dir)
  }

  return packs
}
