#!/usr/bin/env node
// One-shot behavior-pack dev loop:
//
//   node nodejs/minecraft/dev-bedrock-server/dev.mjs
//
// 1. builds every pack (compose watch only tracks paths that exist when it
//    starts, so dist/ must exist first)
// 2. regenerates the per-pack dev config (compose.watch.yaml + activation list)
// 3. runs the server (docker compose up --watch: server logs + deploy-on-change)
//    and the pack builders (turbo run watch) together, output interleaved with
//    [server] / [build] prefixes
// 4. once the world exists, reconciles its pack-activation list against the
//    generated one (a stale list would otherwise never sync — compose watch
//    only reacts to changes made while it is running)
//
// Ctrl+C stops both (compose stops the container; the world volume persists).
import { execFile as execFileCb, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)
const sleep = promisify(setTimeout)

const here = fileURLToPath(new URL('.', import.meta.url))

// Walk up to the monorepo root (the dir with pnpm-workspace.yaml) — compose
// must run from there so the -f/--env-file paths below resolve.
let root = here
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
  root = dirname(root)
}

// Discover every behavior pack (any package with a pack/manifest.json) — the
// same walk generate-dev-config.mjs uses. One list drives the build/watch
// filters, the turbo concurrency limit, and the activation reconciler, so the
// set of packs built always matches the set deployed.
const discoverPacks = () => {
  const packs = []
  const packsDir = join(root, 'nodejs')
  for (const group of readdirSync(packsDir, { withFileTypes: true })) {
    if (!group.isDirectory()) {
      continue
    }
    for (const pkg of readdirSync(join(packsDir, group.name), { withFileTypes: true })) {
      if (pkg.isDirectory() && existsSync(join(packsDir, group.name, pkg.name, 'pack', 'manifest.json'))) {
        packs.push(`./nodejs/${group.name}/${pkg.name}`)
      }
    }
  }
  return packs
}
const packDirs = discoverPacks()
const packFilters = packDirs.flatMap((dir) => ['--filter', dir])

// Compose resolves its default .env from the first compose file's directory,
// not the cwd — pass the repo-root .env explicitly (when present) so the
// documented MINECRAFT_* overrides actually apply.
const composeArgs = [
  'compose',
  ...(existsSync(join(root, '.env')) ? ['--env-file', '.env'] : []),
  '-f',
  join(here, 'compose.yaml'),
  '-f',
  join(here, 'compose.watch.yaml'),
]

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) {
    console.error(`failed to run ${command}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('▸ building packs…')
run('pnpm', ['build', ...packFilters])
console.log('▸ generating dev config…')
run('node', [join(here, 'generate-dev-config.mjs')])

// Spawn a child and interleave its output, each line tagged and colored.
//
// Children run detached, in their own process groups: a terminal Ctrl+C sends
// SIGINT to the whole foreground group, and if compose received it directly it
// would then treat the one shutdown() forwards as "press Ctrl+C again to
// force" — aborting the graceful stop and leaving the container running. This
// way only dev.mjs sees the terminal's SIGINT, and each child group gets
// exactly one.
const children = []
let shuttingDown = false
const spawnPrefixed = (label, color, command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      process.stdout.write(`${prefix}${line}\n`)
    })
  }
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`${prefix}exited (${code ?? 'signal'}) — stopping dev loop`)
      shutdown(code ?? 1)
    }
  })
  children.push(child)
}

const exited = (child) => child.exitCode !== null || child.signalCode !== null

const shutdown = (code) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    if (exited(child)) {
      continue
    }
    try {
      process.kill(-child.pid, 'SIGINT') // the child's whole process group
    } catch {
      child.kill('SIGINT')
    }
  }
  // Wait for the children — compose needs time to stop the container
  // gracefully (world save) — with a force-exit backstop.
  setTimeout(() => {
    process.exit(code)
  }, 30_000).unref()
  Promise.all(
    children.map((child) => (exited(child) ? Promise.resolve() : new Promise((resolve) => child.on('exit', resolve)))),
  ).then(() => {
    process.exit(code)
  })
}

process.on('SIGINT', () => {
  console.log('\n▸ stopping…')
  shutdown(0)
})
process.on('SIGTERM', () => {
  shutdown(0)
})
// Detached children outlive the terminal session on their own, so a hangup
// (closed terminal / dropped SSH) must trigger the same shutdown.
process.on('SIGHUP', () => {
  shutdown(0)
})

console.log('▸ starting server + watchers (Ctrl+C to stop)…')
spawnPrefixed('server', '36', 'docker', [...composeArgs, 'up', '--watch'])
spawnPrefixed('build', '33', 'pnpm', [
  'exec',
  'turbo',
  'run',
  'watch',
  ...packFilters,
  `--concurrency=${packDirs.length + 4}`,
])

// Compose watch only reacts to local changes made while it is running, and the
// activation list is generated before compose starts — so a stale list in the
// world (new pack, migrated world) would never sync on its own. Poll the
// world's activation and, when it differs from the generated one, rewrite the
// local file so the watch rule syncs it in and restarts the server; keep
// polling until the world actually converges.
const reconcileActivation = async () => {
  const activationPath = join(here, 'activation', 'world_behavior_packs.json')
  const desired = readFileSync(activationPath, 'utf8')
  const desiredJson = JSON.stringify(JSON.parse(desired))

  // Report what the world has: __NO_WORLD__ while the server is still
  // downloading/generating (don't restart it mid-boot), __MISSING__ when the
  // world exists but has no activation file (fresh world — needs the sync).
  const probe = async () => {
    try {
      const { stdout } = await execFile(
        'docker',
        [
          ...composeArgs,
          'exec',
          '-T',
          'bedrock',
          'sh',
          '-c',
          'w="/data/worlds/${LEVEL_NAME:-dev}"; if [ ! -d "$w" ]; then echo __NO_WORLD__; elif [ ! -f "$w/world_behavior_packs.json" ]; then echo __MISSING__; else cat "$w/world_behavior_packs.json"; fi',
        ],
        { cwd: root },
      )
      return stdout
    } catch {
      return null // container not up yet
    }
  }

  const POLL_SECONDS = 5
  const MAX_POLLS = 120 // 10 min — first boot downloads the server binary
  let wrote = false
  for (let attempt = 0; attempt < MAX_POLLS && !shuttingDown; attempt += 1) {
    await sleep(POLL_SECONDS * 1000)
    if (shuttingDown) {
      return
    }
    const current = await probe()
    if (current === null || current.includes('__NO_WORLD__')) {
      continue // not up / still generating
    }
    let converged = false
    try {
      converged = JSON.stringify(JSON.parse(current)) === desiredJson
    } catch {
      converged = false // __MISSING__ or malformed
    }
    if (converged) {
      console.log(wrote ? '▸ world pack activation updated' : '▸ world pack activation up to date')
      return
    }
    // Rewrite (re-touch every few polls in case the first write raced compose
    // watch's startup) and keep polling until the world reflects it.
    if (!wrote || attempt % 6 === 0) {
      console.log('▸ updating world pack activation (server will restart)…')
      writeFileSync(activationPath, desired)
      wrote = true
    }
  }
  if (!shuttingDown) {
    console.warn(
      '⚠ could not confirm the world pack activation converged — check `docker compose ps` and re-run generate-dev-config.mjs with the loop running',
    )
  }
}
void reconcileActivation()
