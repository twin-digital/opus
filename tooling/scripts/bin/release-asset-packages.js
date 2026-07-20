#!/usr/bin/env node
import { $ } from 'execa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

// Pin all commands to the repo root: the script's answers (tags, workspace
// layout) must come from the repo it lives in, not whatever cwd it was
// invoked from.
const $$ = $({ cwd: repoRoot })

/**
 * Detects packages released at the current commit that produce GitHub release
 * assets.
 *
 * This script:
 * 1. Gets all git tags on the current commit (HEAD)
 * 2. Parses package names and versions from tags (e.g., "@twin-digital/village-guard@0.1.0")
 * 3. Filters to packages that expose a `release-assets` script (the well-known
 *    hook: it writes the artifacts to attach into the package's .release-assets/)
 * 4. Outputs JSON array of package metadata for matrix builds
 *
 * Output format: [{name, version, path, tag}, ...]
 * - name: npm package name (e.g., "@twin-digital/village-guard")
 * - version: semver version (e.g., "0.1.0")
 * - path: relative path from repo root (e.g., "nodejs/minecraft/village-guard")
 * - tag: the git tag / GitHub release the artifacts attach to
 */

async function main() {
  try {
    const { stdout } = await $$`git tag --points-at HEAD`
    const tags = stdout.trim().split('\n').filter(Boolean)

    if (tags.length === 0) {
      console.log('[]')
      return
    }

    // One workspace listing for all tags; a failure here is a hard error —
    // treating it as "package not found" would silently skip asset uploads.
    const packageDirs = await listWorkspacePackages()

    const packages = []

    for (const tag of tags) {
      // Tag formats: @twin-digital/village-guard@0.1.0 (scoped), name@1.0.0 (unscoped)
      const match = tag.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/)
      if (!match) {
        continue
      }

      const [, packageName, version] = match

      const packageDir = packageDirs.get(packageName)
      if (!packageDir) {
        console.error(`Warning: Could not find package for tag ${tag}`)
        continue
      }

      // Only include packages that implement the release-assets hook
      const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
      if (!manifest.scripts?.['release-assets']) {
        continue
      }

      packages.push({
        name: packageName,
        version: version,
        path: path.relative(repoRoot, packageDir),
        tag: tag,
      })
    }

    // Output JSON for GitHub Actions matrix
    console.log(JSON.stringify(packages))
  } catch (error) {
    console.error('Error detecting release-asset packages:', error.message)
    process.exit(1)
  }
}

/**
 * Map every workspace package name to its directory.
 */
async function listWorkspacePackages() {
  const { stdout } = await $$`pnpm list --json --recursive --depth=-1`
  const workspaces = JSON.parse(stdout)

  const dirs = new Map()
  for (const workspace of workspaces) {
    if (workspace.name && workspace.path) {
      dirs.set(workspace.name, workspace.path)
    }
  }
  return dirs
}

main()
