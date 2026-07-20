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
import { existsSync } from 'node:fs'
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
const children = []
let shuttingDown = false
const spawnPrefixed = (label, color, command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
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

const shutdown = (code) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    child.kill('SIGINT')
  }
  // Give compose time to stop the container gracefully before exiting.
  setTimeout(() => {
    process.exit(code)
  }, 10_000).unref()
  Promise.all(children.map((child) => new Promise((resolve) => child.on('exit', resolve)))).then(() => {
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
spawnPrefixed('build', '33', 'pnpm', ['exec', 'turbo', 'run', 'watch', '--filter', PACKS_FILTER])
