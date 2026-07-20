// Ship the built pack to the local dev Bedrock server and hot-reload it.
// Bundling is done by tsdown (`pnpm build`); this only assembles the pack
// (manifest.json + the bundled main.js as scripts/main.js), copies it into the
// dev container over the Docker API (works with a remote daemon — no bind
// mount), and issues `/reload`.
//
//   node deploy.mjs            # build once, ship, reload
//   node deploy.mjs --watch    # tsdown --watch → ship + reload on every rebuild
import { execFileSync, spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const composeDir = fileURLToPath(new URL('../dev-bedrock-server/', import.meta.url))
const distDir = fileURLToPath(new URL('./dist', import.meta.url))
const distMain = fileURLToPath(new URL('./dist/main.js', import.meta.url))
const manifest = fileURLToPath(new URL('./pack/manifest.json', import.meta.url))

const CONTAINER = 'bedrock'
const TARGET = '/data/development_behavior_packs/village-guard'
const watchMode = process.argv.includes('--watch')

const dc = (args) => execFileSync('docker', ['compose', ...args], { cwd: composeDir, stdio: 'inherit' })
const tsdown = (args = []) => execFileSync('pnpm', ['exec', 'tsdown', ...args], { cwd: here, stdio: 'inherit' })

const deploy = () => {
  try {
    dc(['exec', '-T', CONTAINER, 'mkdir', '-p', `${TARGET}/scripts`])
    dc(['cp', manifest, `${CONTAINER}:${TARGET}/manifest.json`])
    dc(['cp', distMain, `${CONTAINER}:${TARGET}/scripts/main.js`])
    dc(['exec', '-T', CONTAINER, 'send-command', 'reload'])
    console.log(`↻ deployed + reloaded ${new Date().toISOString()}`)
  } catch (err) {
    console.warn(`deploy skipped (is the dev server up?): ${err.message}`)
  }
}

// One initial build so dist/ exists before we ship or watch it.
tsdown()
deploy()

if (watchMode) {
  const proc = spawn('pnpm', ['exec', 'tsdown', '--watch'], { cwd: here, stdio: 'inherit' })
  process.on('exit', () => proc.kill())
  let timer
  watch(distDir, () => {
    clearTimeout(timer)
    timer = setTimeout(deploy, 200) // debounce a rebuild's file writes
  })
  console.log('watching src → tsdown --watch → cp → /reload …')
}
