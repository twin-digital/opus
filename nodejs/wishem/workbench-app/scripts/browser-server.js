// Runs a command (the test runner) with the pinned Playwright browser.
// Usage: node browser-server.js <command> [args...]
//
// Starts the browser image on the Docker host, copies the test build into it, and runs the command
// with WISHEM_BROWSER_WS_ENDPOINT set. A development computer and the pull request checks use this path.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BROWSER_PORT = 3300
const STATIC_PORT = 4173

const require = createRequire(import.meta.url)
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))

/** @type {{ version: string }} */
const { version } = JSON.parse(readFileSync(require.resolve('@playwright/test/package.json'), 'utf8'))
const image = `mcr.microsoft.com/playwright:v${version}-noble`
const container = `wishem-playwright-${createHash('sha1').update(`${hostname()}:${packageDir}`).digest('hex').slice(0, 8)}`

const log = (/** @type {string} */ message) => {
  console.log(`browser-server: ${message}`)
}

const fail = (/** @type {string} */ message) => {
  console.error(`browser-server: ${message}`)
  process.exit(1)
}

/**
 * Runs `docker`. Returns the output, or `undefined` when the command fails.
 * @param {string[]} args
 */
const docker = (args) => {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return undefined
  }
}

const [command, ...commandArgs] = process.argv.slice(2)
if (!command) {
  fail('usage: node browser-server.js <command> [args...]')
}

// Stop early, before the build, when the browser container cannot run.
if (docker(['info', '--format', '{{.ServerVersion}}']) === undefined) {
  fail(
    'Docker is not available. The screenshot tests run only in the pinned\n' +
      'browser image. Start Docker, or let the pull request checks run the tests.',
  )
}

/** @type {(() => void) | undefined} Removes the browser container. Runs on every exit path. */
let cleanup
/** @type {import('node:child_process').ChildProcess | undefined} */
let child
process.on('exit', () => {
  cleanup?.()
})
for (const [signal, code] of /** @type {const} */ ([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
])) {
  process.on(signal, () => {
    if (child) {
      child.kill(signal)
    } else {
      process.exit(code)
    }
  })
}

// The test build: the only input is style-guide.html.
const build = spawnSync('pnpm', ['exec', 'vite', 'build', '--mode', 'style-guide'], {
  cwd: packageDir,
  stdio: 'inherit',
})
if (build.status !== 0) {
  fail('the test build failed.')
}

/**
 * Runs the command and exits with its exit code.
 * @param {Record<string, string>} env
 */
const run = (env) => {
  child = spawn(command, commandArgs, { cwd: packageDir, stdio: 'inherit', env: { ...process.env, ...env } })
  child.on('error', (error) => {
    fail(`cannot run "${command}": ${error.message}`)
  })
  child.on('exit', (code) => {
    process.exit(code ?? 1)
  })
}

/** The host that publishes the port of the browser server. */
const browserHost = () => {
  if (process.env.WISHEM_BROWSER_HOST) {
    return process.env.WISHEM_BROWSER_HOST
  }
  const endpoint = process.env.DOCKER_HOST ?? docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
  if (endpoint && /^(ssh|tcp):\/\//.test(endpoint)) {
    return new URL(endpoint).hostname
  }
  return '127.0.0.1'
}
const host = browserHost()
const isIpv6Loopback = host === '::1' || host === '[::1]'
const isLoopback = isIpv6Loopback || host === 'localhost' || /^127(\.\d{1,3}){3}$/.test(host)
const loopbackAddress =
  isIpv6Loopback ? '[::1]'
  : host === 'localhost' ? '127.0.0.1'
  : host
const publish = isLoopback ? `${loopbackAddress}::${BROWSER_PORT}` : `${BROWSER_PORT}`
const urlHost = isIpv6Loopback ? '[::1]' : host
const secretPath = `/${randomBytes(16).toString('hex')}`

const removeContainer = () => {
  docker(['rm', '-f', container])
}
removeContainer()
cleanup = removeContainer

const started = docker([
  'run',
  '-d',
  '--init',
  '--ipc=host',
  '--name',
  container,
  '-p',
  publish,
  image,
  '/bin/sh',
  '-c',
  `npx -y playwright@${version} run-server --port ${BROWSER_PORT} --host 0.0.0.0 --path ${secretPath}`,
])
if (started === undefined) {
  fail(`the browser container did not start. Run: docker run ${image}`)
}
log(`started ${image} as ${container}`)

/**
 * Polls until the check passes. Stops early when the container, or the process named by `processName`, is not running.
 * @param {string} what
 * @param {() => boolean} check
 * @param {string} [processName] Text in the command line of a process that must stay in the container.
 */
const waitFor = async (what, check, processName) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (check()) {
      return
    }
    if (docker(['inspect', '-f', '{{.State.Running}}', container]) === 'false') {
      fail(`the browser container stopped before ${what} started. See: docker logs ${container}`)
    }
    const processes = processName === undefined ? undefined : docker(['top', container])
    if (processName !== undefined && processes !== undefined && !processes.includes(processName)) {
      fail(`${processName} stopped before ${what} started.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  fail(`${what} did not start. See: docker logs ${container}`)
}

await waitFor('the browser server', () => (docker(['logs', container]) ?? '').includes('Listening on'))

const port = docker(['port', container, `${BROWSER_PORT}/tcp`])
  ?.split('\n')[0]
  ?.split(':')
  .pop()
if (!port) {
  fail('Docker gave no published port for the browser server.')
}

const copied =
  docker(['exec', container, 'mkdir', '-p', '/srv/site']) !== undefined &&
  docker(['cp', `${packageDir}/dist-style-guide/.`, `${container}:/srv/site`]) !== undefined &&
  docker(['cp', join(packageDir, 'scripts', 'static-server.js'), `${container}:/srv/static-server.js`]) !== undefined
if (!copied) {
  fail('cannot copy the test build into the browser container.')
}

const serving = docker(['exec', '-d', container, 'node', '/srv/static-server.js', '/srv/site', String(STATIC_PORT)])
if (serving === undefined) {
  fail('cannot start the static server in the browser container.')
}
await waitFor(
  'the static server',
  () => {
    const probe = `fetch('http://127.0.0.1:${STATIC_PORT}/style-guide.html').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))`
    return docker(['exec', container, 'node', '-e', probe]) !== undefined
  },
  'static-server.js',
)

log(`the browser server is at ${host}:${port}`)
run({ WISHEM_BROWSER_WS_ENDPOINT: `ws://${urlHost}:${port}${secretPath}` })
