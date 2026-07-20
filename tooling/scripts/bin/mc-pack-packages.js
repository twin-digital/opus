#!/usr/bin/env node
import { $ } from 'execa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

/**
 * Detects Minecraft Bedrock behavior packs released at the current commit.
 *
 * This script:
 * 1. Gets all git tags on the current commit (HEAD)
 * 2. Parses package names and versions from tags (e.g., "@twin-digital/village-guard@0.1.0")
 * 3. Filters to packages that have a pack/manifest.json (the behavior-pack marker)
 * 4. Outputs JSON array of package metadata for matrix builds
 *
 * Output format: [{name, version, path, tag, artifact}, ...]
 * - name: npm package name (e.g., "@twin-digital/village-guard")
 * - version: semver version (e.g., "0.1.0")
 * - path: relative path from repo root (e.g., "nodejs/minecraft/village-guard")
 * - tag: the git tag / GitHub release the artifact attaches to
 * - artifact: the .mcpack filename to publish (e.g., "village-guard-0.1.0.mcpack")
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

      const packageDir = path.dirname(packageJsonPath)

      // Only include behavior packs (marked by a committed pack manifest)
      if (!fs.existsSync(path.join(packageDir, 'pack', 'manifest.json'))) {
        continue
      }

      const bareName = packageName.startsWith('@') ? packageName.split('/')[1] : packageName

      packages.push({
        name: packageName,
        version: version,
        path: path.relative(repoRoot, packageDir),
        tag: tag,
        artifact: `${bareName}-${version}.mcpack`,
      })
    }

    // Output JSON for GitHub Actions matrix
    console.log(JSON.stringify(packages))
  } catch (error) {
    console.error('Error detecting behavior-pack packages:', error.message)
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
