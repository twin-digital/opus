import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseSemver } from 'semver'
import type { UserConfig } from 'tsdown'

interface BedrockManifest {
  header: { version?: number[] }
  modules?: { version?: number[] }[]
}

/**
 * Semver string → Bedrock's `[major, minor, patch]` triple, dropping any
 * prerelease/build suffix. Strict (real semver parsing): a malformed version
 * would otherwise produce a syntactically-valid manifest the server silently
 * refuses to load. dev-bedrock-server/generate-dev-config.mjs (a standalone
 * script that cannot import this package) validates the same shape.
 */
const parseVersionTriple = (version: string, context: string): number[] => {
  const parsed = parseSemver(version)
  if (parsed === null) {
    throw new Error(`${context}: version ${JSON.stringify(version)} is not valid semver`)
  }
  return [parsed.major, parsed.minor, parsed.patch]
}

/**
 * Copy the committed `pack/` template into `dist/` and inject the package.json
 * version (the changesets-owned bump) into the manifest's header and modules.
 * The result is a complete, installable behavior pack rooted at `dist/`.
 *
 * The manifest is read, validated, and versioned in memory before anything is
 * written, and the template copy excludes manifest.json — dist/ never holds
 * the versionless template, even transiently or after a validation failure
 * (the dev loop syncs dist/ into a running server on every change).
 */
const assemblePack = (packageDir: string): void => {
  const { version: semver } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    version: string
  }
  const version = parseVersionTriple(semver, join(packageDir, 'package.json'))

  const manifest = JSON.parse(readFileSync(join(packageDir, 'pack', 'manifest.json'), 'utf8')) as BedrockManifest
  manifest.header.version = version
  for (const module of manifest.modules ?? []) {
    module.version = version
  }

  const distDir = join(packageDir, 'dist')
  cpSync(join(packageDir, 'pack'), distDir, {
    recursive: true,
    filter: (source) => basename(source) !== 'manifest.json',
  })
  writeFileSync(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`pack manifest → dist/manifest.json (v${version.join('.')})`)
}

/**
 * The tsdown config fragment for a Bedrock behavior pack, dropped into a pack's
 * `tsdown.config.d/` by repo-kit's `bedrock-pack` feature (shallow-merged over
 * the shared bundle base):
 *
 * - bundles `src/main.ts` to `dist/scripts/main.js` (the manifest's module
 *   entry), no `.d.ts` — a pack is not an importable library
 * - keeps `@minecraft/*` external: the game runtime provides those modules, and
 *   they ship no runtime JS to bundle anyway
 * - after every (re)build, assembles the shippable pack into `dist/` (see
 *   {@link assemblePack}), so `dist/` is always a complete, installable pack
 *
 * @param configUrl the fragment's `import.meta.url` (locates the package dir)
 */
export const defineBedrockPackConfig = (configUrl: string): UserConfig => {
  const packageDir = fileURLToPath(new URL('../', configUrl))
  return {
    entry: { 'scripts/main': 'src/main.ts' },
    dts: false,
    external: [/^@minecraft\//],
    noExternal: (id) => !id.startsWith('@minecraft/'),
    onSuccess: () => {
      assemblePack(packageDir)
    },
  }
}
