#!/usr/bin/env node
import { $ } from 'execa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

/**
 * Detects packages with Docker images that need to be published based on git tags.
 *
 * This script:
 * 1. Gets all git tags on the current commit (HEAD)
 * 2. Parses package names and versions from tags (e.g., "@twin-digital/codex@0.0.2")
 * 3. Filters to packages that have a Dockerfile
 * 4. Outputs JSON array of package metadata for matrix builds
 *
 * Output format: [{name, version, path, imageName}, ...]
 * - name: npm package name (e.g., "@twin-digital/codex")
 * - version: semver version (e.g., "0.0.2")
 * - path: relative path from repo root (e.g., "nodejs/apps/codex")
 * - imageName: GHCR image name (e.g., "ghcr.io/twin-digital/codex")
 */

async function main() {
  try {
    // Get all tags on the current commit
    const { stdout } = await $`git tag --points-at HEAD`
    const tags = stdout.trim().split('\n').filter(Boolean)

    if (tags.length === 0) {
      console.log('[]')
      return
    }

    const packages = []

    for (const tag of tags) {
      // Parse package name and version from tag
      // Supports formats like:
      // - @twin-digital/codex@0.0.2 (scoped)
      // - package-name@1.0.0 (unscoped)
      const match = tag.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/)
      if (!match) {
        continue
      }

      const [, packageName, version] = match

      // Find package directory by searching package.json files
      const packageJsonPath = await findPackageJson(packageName)
      if (!packageJsonPath) {
        console.error(`Warning: Could not find package.json for ${packageName}`, { stderr: true })
        continue
      }

      const packageDir = path.dirname(packageJsonPath)
      const dockerfilePath = path.join(packageDir, 'Dockerfile')

      // Only include packages with a Dockerfile
      if (!fs.existsSync(dockerfilePath)) {
        continue
      }

      // Derive GHCR image name from package name
      // @twin-digital/codex -> ghcr.io/twin-digital/codex
      // package-name -> ghcr.io/twin-digital/package-name
      const imageName = deriveImageName(packageName)

      packages.push({
        name: packageName,
        version: version,
        path: path.relative(repoRoot, packageDir),
        imageName: imageName,
      })
    }

    // Output JSON for GitHub Actions matrix
    console.log(JSON.stringify(packages))
  } catch (error) {
    console.error('Error detecting Docker packages:', error.message)
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

/**
 * Derive GHCR image name from npm package name
 * @twin-digital/codex -> ghcr.io/twin-digital/codex
 * package-name -> ghcr.io/twin-digital/package-name (assumes twin-digital org)
 */
function deriveImageName(packageName) {
  if (packageName.startsWith('@')) {
    // Scoped package: @org/name -> ghcr.io/org/name
    const withoutAt = packageName.slice(1)
    return `ghcr.io/${withoutAt}`
  } else {
    // Unscoped package: assume twin-digital org
    return `ghcr.io/twin-digital/${packageName}`
  }
}

main()
