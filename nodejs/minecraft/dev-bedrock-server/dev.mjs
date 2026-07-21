#!/usr/bin/env node
// Daemon-managed behavior-pack dev loop:
//
//   node nodejs/minecraft/dev-bedrock-server/dev.mjs        # start server + attach watchers
//   node nodejs/minecraft/dev-bedrock-server/dev.mjs stop   # stop the server (compose down; world volume persists)
//
// Start: builds every pack, brings the server up as a daemon (compose up -d
// --wait), reconciles the server's pack state against the built packs (see
// deploy.mjs), then watches:
//
//   [server] docker compose logs -f      — server output
//   [deploy] in-process chokidar watcher — ship changed dist/ → /reload
//   [build]  turbo run watch             — rebuild packs on save
//
// Ctrl+C detaches everything; the SERVER KEEPS RUNNING (re-run dev.mjs to
// reattach, `dev.mjs stop` to stop it).
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { watch } from 'chokidar'
import concurrently from 'concurrently'
import { execaSync } from 'execa'

import { createDeployer } from './deploy.mjs'
import { discoverPacks, findRepoRoot } from './discover-packs.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = findRepoRoot()

// Compose resolves its default .env from the compose file's directory, not the
// cwd — pass the repo-root .env explicitly (when present) so the documented
// MINECRAFT_* overrides actually apply.
const composeArgs = [
  'compose',
  ...(existsSync(join(root, '.env')) ? ['--env-file', '.env'] : []),
  '-f',
  join(here, 'compose.yaml'),
]

const run = (command, args) => {
  execaSync(command, args, { cwd: root, stdio: 'inherit' })
}

const mode = process.argv[2] ?? 'start'
if (mode === 'stop') {
  console.log('▸ stopping dev server (world volume persists)…')
  run('docker', [...composeArgs, 'down'])
  process.exit(0)
}
if (mode !== 'start') {
  console.error(`unknown argument '${mode}' — usage: dev.mjs [stop]`)
  process.exit(1)
}

const packs = discoverPacks(root)
const packFilters = packs.flatMap((pack) => ['--filter', pack.relDir])

console.log('▸ building packs…')
run('pnpm', ['build', ...packFilters])

console.log('▸ starting server…')
run('docker', [...composeArgs, 'up', '-d', '--wait'])

const deployer = createDeployer({ composeArgs, root })
try {
  await deployer.reconcile(packs)
} catch (error) {
  // A transient docker/compose failure here shouldn't kill the loop with a
  // raw stack — warn and attach the watchers anyway.
  console.warn(`⚠ pack reconcile failed (${error.stderr?.trim() || error.message}) — continuing; check the server logs`)
}

// Ship-on-change: watch every pack's dist/ (rewritten by turbo/tsdown on each
// save) and deploy the changed packs after a short settle.
const byDist = new Map(packs.map((pack) => [pack.distDir + sep, pack]))
const changed = new Set()
let timer
const watcher = watch(
  packs.map((pack) => pack.distDir),
  { ignoreInitial: true },
)
watcher.on('all', (_event, path) => {
  for (const [prefix, pack] of byDist) {
    if (path.startsWith(prefix)) {
      changed.add(pack)
    }
  }
  clearTimeout(timer)
  timer = setTimeout(() => {
    const batch = [...changed]
    changed.clear()
    if (batch.length > 0) {
      void deployer.deployPacks(batch)
    }
  }, 400)
})

console.log('▸ attaching watchers — Ctrl+C detaches, the server keeps running (`dev.mjs stop` stops it)…')
const { result } = concurrently(
  [
    {
      command: `docker ${composeArgs.join(' ')} logs -f --no-log-prefix --tail 5`,
      name: 'server',
      prefixColor: 'cyan',
    },
    {
      command: `pnpm exec turbo run watch ${packFilters.join(' ')} --concurrency=${packs.length + 4}`,
      name: 'build',
      prefixColor: 'yellow',
    },
  ],
  { cwd: root, killOthers: ['failure', 'success'], prefix: '[{name}]' },
)
try {
  await result
  process.exitCode = 0
} catch (closeEvents) {
  // Signal-killed children (Ctrl+C detach) are normal; anything else is a
  // watcher failure worth a non-zero exit.
  const abnormal =
    Array.isArray(closeEvents) &&
    closeEvents.some((event) => typeof event.exitCode === 'number' && event.exitCode !== 0)
  process.exitCode = abnormal ? 1 : 0
} finally {
  await watcher.close()
}
