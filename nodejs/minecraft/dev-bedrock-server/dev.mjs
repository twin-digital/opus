#!/usr/bin/env node
// Daemon-managed behavior-pack dev loop:
//
//   node nodejs/minecraft/dev-bedrock-server/dev.mjs        # start server + attach watchers
//   node nodejs/minecraft/dev-bedrock-server/dev.mjs stop   # stop the server (compose down; world volume persists)
//
// Start: builds every pack (compose watch only tracks paths that exist when it
// starts), regenerates the per-pack dev config, brings the server up as a
// daemon (compose up -d --wait), installs the world's pack-activation list if
// it is stale, then attaches the watchers with interleaved, prefixed output:
//
//   [server] docker compose logs -f      — server output
//   [deploy] docker compose watch        — sync built packs → /reload
//   [build]  turbo run watch             — rebuild packs on save
//
// Ctrl+C detaches the watchers; the SERVER KEEPS RUNNING (re-run dev.mjs to
// reattach, `dev.mjs stop` to stop it). The watchers are stateless, so no
// signal choreography is needed — they die with the terminal's foreground
// group.
import { execFile as execFileCb, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { discoverPacks, findRepoRoot } from './discover-packs.mjs'

const execFile = promisify(execFileCb)
const sleep = promisify(setTimeout)

const here = fileURLToPath(new URL('.', import.meta.url))
const root = findRepoRoot()

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
console.log('▸ generating dev config…')
run('node', [join(here, 'generate-dev-config.mjs')])

console.log('▸ starting server…')
run('docker', [...composeArgs, 'up', '-d', '--wait'])

// The world's activation list is only read at server boot, and compose watch
// only ships changes made while it is running — so a stale list (new pack,
// fresh world) is installed directly here, before the watchers attach.
const compose = (...args) => execFile('docker', [...composeArgs, ...args], { cwd: root })
const reconcileActivation = async () => {
  const activationPath = join(here, 'activation', 'world_behavior_packs.json')
  const desired = readFileSync(activationPath, 'utf8')
  const matches = (content) => {
    try {
      return JSON.stringify(JSON.parse(content)) === JSON.stringify(JSON.parse(desired))
    } catch {
      return false // missing or malformed
    }
  }
  const probe = () =>
    compose(
      'exec',
      '-T',
      'bedrock',
      'sh',
      '-c',
      'w="/data/worlds/${LEVEL_NAME:-dev}"; if [ ! -d "$w" ]; then echo __NO_WORLD__; else cat "$w/world_behavior_packs.json" 2>/dev/null || echo __MISSING__; fi',
    ).then(({ stdout }) => stdout)

  // The container is up (--wait), but on a very first boot the world may still
  // be generating — wait for it briefly.
  let current = await probe()
  for (let attempt = 0; attempt < 24 && current.includes('__NO_WORLD__'); attempt += 1) {
    await sleep(5000)
    current = await probe()
  }
  if (current.includes('__NO_WORLD__')) {
    console.warn('⚠ world never appeared — pack activation not installed (check the server logs)')
    return
  }
  if (matches(current)) {
    console.log('▸ world pack activation up to date')
    return
  }

  console.log('▸ installing world pack activation (server will restart)…')
  const { stdout: level } = await compose('exec', '-T', 'bedrock', 'sh', '-c', 'echo "${LEVEL_NAME:-dev}"')
  await compose('cp', activationPath, `bedrock:/data/worlds/${level.trim()}/world_behavior_packs.json`)
  await compose('restart', 'bedrock')
  if (matches(await probe())) {
    console.log('▸ world pack activation installed')
  } else {
    console.warn('⚠ pack activation still differs after install — check the server logs')
  }
}
await reconcileActivation()

// Attach the watchers: ordinary foreground children, interleaved output. If
// any one exits (or fails to spawn), stop the rest and exit — and on Ctrl+C
// everything dies with the foreground process group, server excluded.
const children = []
let stopping = false
const stopAll = (code) => {
  if (stopping) {
    return
  }
  stopping = true
  for (const child of children) {
    child.kill('SIGTERM')
  }
  process.exitCode = code
}
const spawnPrefixed = (label, color, command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      process.stdout.write(`${prefix}${line}\n`)
    })
  }
  child.on('close', (code) => {
    if (!stopping) {
      console.log(`${prefix}exited (${code ?? 'signal'}) — detaching`)
    }
    stopAll(code ?? 0)
  })
  child.on('error', (error) => {
    console.error(`${prefix}failed to start ${command}: ${error.message}`)
    stopAll(1)
  })
  children.push(child)
}

console.log('▸ attaching watchers — Ctrl+C detaches, the server keeps running (`dev.mjs stop` stops it)…')
spawnPrefixed('server', '36', 'docker', [...composeArgs, 'logs', '-f', '--no-log-prefix', '--tail', '5'])
spawnPrefixed('deploy', '35', 'docker', [...composeArgs, 'watch', '--no-up'])
spawnPrefixed('build', '33', 'pnpm', [
  'exec',
  'turbo',
  'run',
  'watch',
  ...packFilters,
  `--concurrency=${packs.length + 4}`,
])
