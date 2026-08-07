import { $ } from 'execa'
import path from 'node:path'

/**
 * The packages released at the current commit: every git tag on HEAD of the
 * form <package-name>@<version> whose name matches a workspace package.
 *
 * Returns [{ name, version, tag, dir }] — dir absolute. Tags that don't parse
 * are skipped; a tag naming an unknown package warns and is skipped; a git or
 * pnpm failure throws (treating it as "nothing released" would silently skip
 * downstream publishing).
 */
export async function getReleasedPackages(repoRoot) {
  const $$ = $({ cwd: repoRoot })

  const { stdout } = await $$`git tag --points-at HEAD`
  const tags = stdout.trim().split('\n').filter(Boolean)
  if (tags.length === 0) {
    return []
  }

  const { stdout: listJson } = await $$`pnpm list --json --recursive --depth=-1`
  const dirs = new Map()
  for (const workspace of JSON.parse(listJson)) {
    if (workspace.name && workspace.path) {
      dirs.set(workspace.name, workspace.path)
    }
  }

  const released = []
  for (const tag of tags) {
    // Tag formats: @twin-digital/village-guard@0.1.0 (scoped), name@1.0.0 (unscoped)
    const match = tag.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/)
    if (!match) {
      continue
    }
    const [, name, version] = match
    const dir = dirs.get(name)
    if (!dir) {
      console.error(`Warning: Could not find package for tag ${tag}`)
      continue
    }
    released.push({ name, version, tag, dir })
  }
  return released
}

/** Repo root resolved from a bin script's import.meta.url. */
export function repoRootFrom(binDir) {
  return path.resolve(binDir, '../../..')
}
