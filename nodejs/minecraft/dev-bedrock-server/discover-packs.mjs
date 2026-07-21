// Shared pack discovery for the dev harness. A pack is ANY workspace package
// with a committed pack/manifest.json, wherever it lives — membership comes
// from pnpm itself (the same source of truth repo-kit's bedrock-pack feature
// and the release pipeline's detection use), not a hard-coded layout.
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { execaSync } from 'execa'

const here = fileURLToPath(new URL('.', import.meta.url))

/** The monorepo root (the dir with pnpm-workspace.yaml). */
export const findRepoRoot = () => {
  let root = here
  while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
    root = dirname(root)
  }
  return root
}

/**
 * Every behavior pack in the workspace, sorted by name and validated:
 * - header.uuid present (the activation list keys on it)
 * - pack directory names unique (they become container paths)
 * - uuids unique (a copy-pasted manifest template would otherwise produce a
 *   colliding activation list the server resolves arbitrarily)
 *
 * Returns [{ name, dir, relDir, distDir, packId }] — dir/distDir absolute,
 * relDir relative to the repo root (./…, usable as a turbo filter). Versions
 * are not read here: the built dist/manifest.json (assembled and validated by
 * @twin-digital/mc-pack-config) is the source of truth for what gets deployed.
 */
export const discoverPacks = (root) => {
  const { stdout } = execaSync('pnpm', ['list', '--json', '--recursive', '--depth=-1'], { cwd: root })
  const packs = []
  for (const workspace of JSON.parse(stdout)) {
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
    packs.push({
      name: basename(workspace.path),
      dir: workspace.path,
      relDir: `./${relative(root, workspace.path).replaceAll('\\', '/')}`,
      distDir: join(workspace.path, 'dist'),
      packId: header.uuid,
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
