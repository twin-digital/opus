// Runs a command (the test runner) with the pinned Playwright browser.
// Usage: node browser-server.js <command> [args...]
//
// Development computer: starts the browser image on the Docker host, copies the test build into
// it, and runs the command with WISHEM_BROWSER_WS_ENDPOINT set. Pull request checks (inside the
// image): runs the command directly.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BROWSER_PORT = 3300
const STATIC_PORT = 4173

const require = createRequire(import.meta.url)
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))

/** @type {{ version: string }} */
const { version } = JSON.parse(readFileSync(require.resolve('@playwright/test/package.json'), 'utf8'))
const image = `mcr.microsoft.com/playwright:v${version}-noble`
const container = `wishem-playwright-${createHash('sha1').update(packageDir).digest('hex').slice(0, 8)}`

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

const inImage = process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright' && existsSync('/ms-playwright')

// Stop early, before the build, when the browser container cannot run.
if (!inImage) {
  if (docker(['info', '--format', '{{.ServerVersion}}']) === undefined) {
    fail(
      'Docker is not available. The screenshot tests run only in the pinned\n' +
        'browser image. Start Docker, or let the pull request checks run the tests.',
    )
  }
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
 * @param {() => void} cleanup
 */
const run = (env, cleanup) => {
  const child = spawn(command, commandArgs, { cwd: packageDir, stdio: 'inherit', env: { ...process.env, ...env } })
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
    process.on(signal, () => child.kill(signal))
  }
  child.on('error', (error) => {
    cleanup()
    fail(`cannot run "${command}": ${error.message}`)
  })
  child.on('exit', (code) => {
    cleanup()
    process.exit(code ?? 1)
  })
}

// The official image sets PLAYWRIGHT_BROWSERS_PATH. The pull request checks run inside the image.
if (inImage) {
  log('running in the browser image')
  run({}, () => undefined)
} else {
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
  const publish = host === '127.0.0.1' ? `127.0.0.1::${BROWSER_PORT}` : `${BROWSER_PORT}`
  const secretPath = `/${randomBytes(16).toString('hex')}`

  const removeContainer = () => {
    docker(['rm', '-f', container])
  }
  removeContainer()

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
   * Polls until the check passes.
   * @param {string} what
   * @param {() => boolean} check
   */
  const waitFor = async (what, check) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (check()) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    removeContainer()
    fail(`${what} did not start. See: docker logs ${container}`)
  }

  await waitFor('the browser server', () => (docker(['logs', container]) ?? '').includes('Listening on'))

  const port = docker(['port', container, `${BROWSER_PORT}/tcp`])
    ?.split('\n')[0]
    ?.split(':')
    .pop()
  if (!port) {
    removeContainer()
    fail('Docker gave no published port for the browser server.')
  }

  const copied =
    docker(['exec', container, 'mkdir', '-p', '/srv/site']) !== undefined &&
    docker(['cp', `${packageDir}/dist-style-guide/.`, `${container}:/srv/site`]) !== undefined &&
    docker(['cp', join(packageDir, 'scripts', 'static-server.js'), `${container}:/srv/static-server.js`]) !== undefined
  if (!copied) {
    removeContainer()
    fail('cannot copy the test build into the browser container.')
  }

  docker(['exec', '-d', container, 'node', '/srv/static-server.js', '/srv/site', String(STATIC_PORT)])
  await waitFor('the static server', () => {
    const probe = `fetch('http://127.0.0.1:${STATIC_PORT}/style-guide.html').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))`
    return docker(['exec', container, 'node', '-e', probe]) !== undefined
  })

  log(`the browser server is at ${host}:${port}`)
  run({ WISHEM_BROWSER_WS_ENDPOINT: `ws://${host}:${port}${secretPath}` }, removeContainer)
}
