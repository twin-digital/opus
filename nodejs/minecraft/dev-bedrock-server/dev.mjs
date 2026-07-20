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
//
// Ctrl+C stops both (compose stops the container; the world volume persists).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

// Walk up to the monorepo root (the dir with pnpm-workspace.yaml) — compose
// must run from there to pick up the repo-root .env.
let root = here
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
  root = dirname(root)
}

// Each pack runs a persistent turbo `watch` task, and turbo.json caps global
// concurrency low — size the limit to the pack count (plus headroom for the
// one-off dependency builds turbo schedules first).
const countPacks = () => {
  let count = 0
  const packsDir = join(root, 'nodejs')
  for (const group of readdirSync(packsDir, { withFileTypes: true })) {
    if (!group.isDirectory()) {
      continue
    }
    for (const pkg of readdirSync(join(packsDir, group.name), { withFileTypes: true })) {
      if (pkg.isDirectory() && existsSync(join(packsDir, group.name, pkg.name, 'pack', 'manifest.json'))) {
        count += 1
      }
    }
  }
  return count
}

const PACKS_FILTER = './nodejs/minecraft/*'
const composeFiles = ['-f', join(here, 'compose.yaml'), '-f', join(here, 'compose.watch.yaml')]

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('▸ building packs…')
run('pnpm', ['build', '--filter', PACKS_FILTER])
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

console.log('▸ starting server + watchers (Ctrl+C to stop)…')
spawnPrefixed('server', '36', 'docker', ['compose', ...composeFiles, 'up', '--watch'])
spawnPrefixed('build', '33', 'pnpm', [
  'exec',
  'turbo',
  'run',
  'watch',
  '--filter',
  PACKS_FILTER,
  `--concurrency=${countPacks() + 4}`,
])

// Compose watch only reacts to local changes made while it is running, and the
// activation list is generated before compose starts — so a stale list in the
// world (new pack, migrated world) would never sync on its own. Once the
// server is up, compare the world's activation with the generated one; if it
// differs, rewrite the local file, which fires the watch rule (sync + server
// restart).
const reconcileActivation = async () => {
  const activationPath = join(here, 'activation', 'world_behavior_packs.json')
  const desired = readFileSync(activationPath, 'utf8')
  for (let attempt = 0; attempt < 24 && !shuttingDown; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const result = spawnSync(
      'docker',
      [
        'compose',
        ...composeFiles,
        'exec',
        '-T',
        'bedrock',
        'sh',
        '-c',
        'cat "/data/worlds/${LEVEL_NAME:-dev}/world_behavior_packs.json" 2>/dev/null || echo __MISSING__',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    if (result.status !== 0) {
      continue // server still starting
    }
    let upToDate = false
    try {
      upToDate = JSON.stringify(JSON.parse(result.stdout)) === JSON.stringify(JSON.parse(desired))
    } catch {
      upToDate = false // missing or malformed in the world
    }
    if (upToDate) {
      console.log('▸ world pack activation up to date')
    } else {
      console.log('▸ updating world pack activation (server will restart)…')
      writeFileSync(activationPath, desired)
    }
    return
  }
}
void reconcileActivation()
