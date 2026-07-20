// Ship the built pack to the local dev Bedrock server and hot-reload it.
// tsdown (`pnpm build`) bundles src → dist/scripts/main.js and, via its
// onSuccess hook (build-pack.mjs), assembles dist/manifest.json — so dist/ is a
// complete pack. This copies that dist/ into the dev container over the Docker
// API (works with a remote daemon — no bind mount) and issues `/reload`.
//
//   node deploy.mjs            # build once, ship, reload
//   node deploy.mjs --watch    # tsdown --watch → ship + reload on every rebuild
import { execFileSync, spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
// Run compose from the repo root so it picks up the repo-root .env (MINECRAFT_*).
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const composeFile = fileURLToPath(new URL('../dev-bedrock-server/compose.yaml', import.meta.url))
const distDir = fileURLToPath(new URL('./dist', import.meta.url))
const distMain = fileURLToPath(new URL('./dist/scripts/main.js', import.meta.url))
const distManifest = fileURLToPath(new URL('./dist/manifest.json', import.meta.url))

const CONTAINER = 'bedrock'
const TARGET = '/data/development_behavior_packs/village-guard'
const watchMode = process.argv.includes('--watch')

const dc = (args) =>
  execFileSync('docker', ['compose', '-f', composeFile, ...args], { cwd: repoRoot, stdio: 'inherit' })
const tsdown = (args = []) => execFileSync('pnpm', ['exec', 'tsdown', ...args], { cwd: here, stdio: 'inherit' })

const deploy = () => {
  try {
    dc(['exec', '-T', CONTAINER, 'mkdir', '-p', `${TARGET}/scripts`])
    dc(['cp', distManifest, `${CONTAINER}:${TARGET}/manifest.json`])
    dc(['cp', distMain, `${CONTAINER}:${TARGET}/scripts/main.js`])
    dc(['exec', '-T', CONTAINER, 'send-command', 'reload'])
    console.log(`↻ deployed + reloaded ${new Date().toISOString()}`)
  } catch (err) {
    console.warn(`deploy skipped (is the dev server up?): ${err.message}`)
  }
}

// One initial build so dist/ exists (manifest + scripts/main.js) before we ship.
tsdown()
deploy()

if (watchMode) {
  const proc = spawn('pnpm', ['exec', 'tsdown', '--watch'], { cwd: here, stdio: 'inherit' })
  process.on('exit', () => proc.kill())
  let timer
  watch(distDir, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(deploy, 200) // debounce a rebuild's file writes
  })
  console.log('watching src → tsdown --watch → cp → /reload …')
}
