#!/usr/bin/env node
import { $ } from 'execa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

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
    const { stdout } = await $`git tag --points-at HEAD`
    const tags = stdout.trim().split('\n').filter(Boolean)

    if (tags.length === 0) {
      console.log('[]')
      return
    }

    const packages = []

    for (const tag of tags) {
      // Tag formats: @twin-digital/village-guard@0.1.0 (scoped), name@1.0.0 (unscoped)
      const match = tag.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/)
      if (!match) {
        continue
      }

      const [, packageName, version] = match

      const packageJsonPath = await findPackageJson(packageName)
      if (!packageJsonPath) {
        console.error(`Warning: Could not find package.json for ${packageName}`, { stderr: true })
        continue
      }

      // Only include packages that implement the release-assets hook
      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (!manifest.scripts?.['release-assets']) {
        continue
      }

      packages.push({
        name: packageName,
        version: version,
        path: path.relative(repoRoot, path.dirname(packageJsonPath)),
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
 * Find package.json file for a given package name by searching the workspace
 */
async function findPackageJson(packageName) {
  try {
    const { stdout } = await $`pnpm list --json --recursive --depth=-1`
    const workspaces = JSON.parse(stdout)

    for (const workspace of workspaces) {
      if (workspace.name === packageName) {
        return workspace.path ? path.join(workspace.path, 'package.json') : null
      }
    }

    return null
  } catch (error) {
    console.error(`Error finding package ${packageName}:`, error.message)
    return null
  }
}

main()
