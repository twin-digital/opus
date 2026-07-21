// Shared pack discovery for the dev harness: dev.mjs and
// generate-dev-config.mjs both resolve packs from here, so the set of packs
// built always matches the set deployed and activated. A pack is ANY workspace
// package with a committed pack/manifest.json, wherever it lives — membership
// comes from pnpm itself (the same source of truth repo-kit's bedrock-pack
// feature and the release pipeline's detection use), not a hard-coded layout.
//
// Kept dependency-free by design — the harness is deliberately not a workspace
// package (see pnpm-workspace.yaml), so version parsing re-implements the
// shape check @twin-digital/mc-pack-config performs with the semver library
// at build time.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
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
// prerelease/build suffix. The pattern mirrors the semver library's grammar
// (optional leading v, dotted alphanumeric prerelease/build) so this and the
// build-time injection accept the same strings.
const SEMVER_TRIPLE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
export const parseVersionTriple = (semver, context) => {
  const match = SEMVER_TRIPLE.exec(semver)
  if (match === null) {
    throw new Error(`${context}: version ${JSON.stringify(semver)} is not a major.minor.patch semver`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Every workspace package, via pnpm (a failure here is a hard error). */
const listWorkspacePackages = (root) => {
  const result = spawnSync('pnpm', ['list', '--json', '--recursive', '--depth=-1'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) {
    throw new Error(`pnpm list failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`pnpm list failed:\n${result.stderr}`)
  }
  return JSON.parse(result.stdout)
}

/**
 * Every behavior pack in the workspace, sorted by name and validated:
 * - header.uuid present (the activation list keys on it)
 * - pack directory names unique (they become container paths)
 * - uuids unique (a copy-pasted manifest template would otherwise produce a
 *   colliding activation list the server resolves arbitrarily)
 *
 * Returns [{ name, dir, relDir, packId, version }] — dir absolute, relDir
 * relative to the repo root (./…, usable as a turbo filter), version as a
 * Bedrock triple.
 */
export const discoverPacks = (root) => {
  const packs = []
  for (const workspace of listWorkspacePackages(root)) {
    if (!workspace.path) {
      continue
    }
    const manifestPath = join(workspace.path, 'pack', 'manifest.json')
    if (!existsSync(manifestPath)) {
      continue
    }
    const { header } = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof header?.uuid !== 'string' || header.uuid.length === 0) {
      throw new Error(`${manifestPath}: pack manifest has no header.uuid`)
    }
    const { version } = JSON.parse(readFileSync(join(workspace.path, 'package.json'), 'utf8'))
    packs.push({
      name: basename(workspace.path),
      dir: workspace.path,
      relDir: `./${relative(root, workspace.path).replaceAll('\\', '/')}`,
      packId: header.uuid,
      version: parseVersionTriple(version, join(workspace.path, 'package.json')),
    })
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
