import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { UserConfig } from 'tsdown'

interface BedrockManifest {
  header: { version?: number[] }
  modules?: { version?: number[] }[]
}

/**
 * Semver string → Bedrock's `[major, minor, patch]` triple, dropping any
 * prerelease/build suffix. Strict: a malformed version would otherwise
 * produce a syntactically-valid manifest the server silently refuses to load.
 * Must stay in sync with the copy in dev-bedrock-server/generate-dev-config.mjs
 * (a standalone script that cannot import this package).
 */
const parseVersionTriple = (semver: string, context: string): number[] => {
  const parts = semver
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`${context}: version ${JSON.stringify(semver)} is not a major.minor.patch semver`)
  }
  return parts
}

/**
 * Copy the committed `pack/` template into `dist/` and inject the package.json
 * version (the changesets-owned bump) into the manifest's header and modules.
 * The result is a complete, installable behavior pack rooted at `dist/`.
 */
const assemblePack = (packageDir: string): void => {
  const distDir = join(packageDir, 'dist')
  cpSync(join(packageDir, 'pack'), distDir, { recursive: true })

  const { version: semver } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    version: string
  }
  const version = parseVersionTriple(semver, join(packageDir, 'package.json'))

  const manifestPath = join(distDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BedrockManifest
  manifest.header.version = version
  for (const module of manifest.modules ?? []) {
    module.version = version
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
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
