#!/usr/bin/env node
// Generate the dev server's per-pack config from every behavior pack in the
// monorepo (any package with a pack/manifest.json — no hand-maintained lists):
//
// - activation/world_behavior_packs.json — the world's activation list. A pack
//   synced into the server's development_behavior_packs pool isn't applied
//   until it's listed here; compose watch ships the list into the world and
//   restarts the server.
// - compose.watch.yaml — a compose override with one develop.watch rule per
//   pack (sync built dist/ → /reload) plus the activation rule (sync →
//   restart). Generated because compose watch can't discover packs itself:
//   glob paths and symlinked directories are silently ignored, so each pack
//   needs a literal rule. Pass it alongside compose.yaml:
//
//     docker compose -f compose.yaml -f compose.watch.yaml up --watch
//
// Re-run whenever you add a pack or a pack's version bumps (dev.mjs does both
// automatically). Versions come from package.json (the source of truth the
// build injects into the shipped manifest), uuids from the pack manifest.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

// Walk up to the monorepo root (the dir with pnpm-workspace.yaml).
let root = here
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
  root = dirname(root)
}

// Semver string → Bedrock's [major, minor, patch] triple, dropping any
// prerelease/build suffix. Strict: a malformed version would otherwise produce
// a syntactically-valid activation entry the server silently refuses to load.
// (The whole string is shape-checked first — parseInt alone would coerce
// '1.2.3rc' to [1,2,3].) @twin-digital/mc-pack-config's build-time injection
// validates the same shape with the semver library; this standalone script
// cannot import workspace packages.
const SEMVER_TRIPLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].*)?$/
const parseVersionTriple = (semver, context) => {
  const match = SEMVER_TRIPLE.exec(semver)
  if (match === null) {
    throw new Error(`${context}: version ${JSON.stringify(semver)} is not a major.minor.patch semver`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

// Discover nodejs/<group>/<package>/pack/manifest.json across the whole repo.
const packsDir = join(root, 'nodejs')
const packs = []
for (const group of readdirSync(packsDir, { withFileTypes: true })) {
  if (!group.isDirectory()) {
    continue
  }
  for (const pkg of readdirSync(join(packsDir, group.name), { withFileTypes: true })) {
    if (!pkg.isDirectory()) {
      continue
    }
    const packageDir = join(packsDir, group.name, pkg.name)
    const manifest = join(packageDir, 'pack', 'manifest.json')
    if (!existsSync(manifest)) {
      continue
    }
    const { header } = JSON.parse(readFileSync(manifest, 'utf8'))
    if (typeof header?.uuid !== 'string' || header.uuid.length === 0) {
      throw new Error(`${manifest}: pack manifest has no header.uuid`)
    }
    const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    packs.push({
      name: pkg.name,
      dir: packageDir,
      pack_id: header.uuid,
      version: parseVersionTriple(version, join(packageDir, 'package.json')),
    })
  }
}
packs.sort((a, b) => a.name.localeCompare(b.name))

// Pack directory names become container paths (development_behavior_packs/<name>)
// — same-named packs in different groups would collide on one target. And the
// activation list keys on header.uuid, so a uuid shared between packs (a
// copy-pasted manifest template) would fail arbitrarily at the server instead
// of loudly here.
const seenNames = new Map()
const seenUuids = new Map()
for (const pack of packs) {
  if (seenNames.has(pack.name)) {
    throw new Error(`duplicate pack directory name '${pack.name}': ${seenNames.get(pack.name)} and ${pack.dir}`)
  }
  seenNames.set(pack.name, pack.dir)
  if (seenUuids.has(pack.pack_id)) {
    throw new Error(
      `duplicate pack uuid '${pack.pack_id}': ${seenUuids.get(pack.pack_id)} and ${pack.dir} — regenerate the copied manifest's header.uuid`,
    )
  }
  seenUuids.set(pack.pack_id, pack.dir)
}

// --- activation/world_behavior_packs.json ---
const activation = packs.map(({ pack_id, version }) => ({ pack_id, version }))
writeFileSync(join(here, 'activation', 'world_behavior_packs.json'), `${JSON.stringify(activation, null, 2)}\n`)

// --- compose.watch.yaml ---
// Scalars are emitted JSON-encoded (valid YAML) so a name/path containing
// YAML-significant characters breaks loudly at compose parse, not silently.
// Literal dollars are doubled: compose interpolates ${VAR}/$VAR even inside
// quoted scalars, and an unset var substitutes silently.
const yamlScalar = (value) => JSON.stringify(value.replaceAll('$', '$$$$'))
const packRules = packs
  .map(({ name, dir }) => {
    const distPath = relative(here, join(dir, 'dist')).replaceAll('\\', '/')
    const path = distPath.startsWith('.') ? distPath : `./${distPath}`
    return `        - path: ${yamlScalar(path)}
          target: ${yamlScalar(`/data/development_behavior_packs/${name}`)}
          action: sync+exec
          exec:
            command: send-command reload
`
  })
  .join('')
const compose = `# Generated by generate-dev-config.mjs — do not edit. One watch rule per
# behavior pack in the repo; re-run the generator after adding a pack.
services:
  bedrock:
    develop:
      watch:
        # Ship each built pack, then hot-reload scripts. A shared-lib edit
        # rebuilds several packs and fires several reloads — harmless.
${packRules}        # Activation-list changes (new pack, version bump) need a restart — the
        # server only rereads world_behavior_packs.json on boot.
        - path: ./activation
          target: /data/worlds/\${MINECRAFT_LEVEL_NAME:-dev}
          action: sync+restart
          ignore:
            - .gitkeep
`
writeFileSync(join(here, 'compose.watch.yaml'), compose)

console.log(
  `activation/world_behavior_packs.json + compose.watch.yaml: ${packs.length} pack(s)` +
    (packs.length ? ` — ${packs.map((p) => p.name).join(', ')}` : ''),
)
