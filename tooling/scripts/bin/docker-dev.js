#!/usr/bin/env node

import chalk from 'chalk'
import { execa } from 'execa'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { resolve } from 'path'

// Timeout constants
const INITIAL_BUILD_WAIT_MS = 3000
const CONTAINER_CHECK_INTERVAL_MS = 500
const CONTAINER_START_TIMEOUT_MS = 60000
const COMPOSE_SHUTDOWN_TIMEOUT_MS = 30000

const cwd = process.cwd()

let watchProcess = null
let composeProcess = null
let shuttingDown = false

/**
 * Stop a process and wait for it to exit with a timeout
 */
async function stopProcessWithTimeout(process, timeoutMs) {
  process.kill('SIGTERM')

  let exited = false
  await Promise.race([
    process
      .then(() => {
        exited = true
      })
      .catch((err) => {
        // Exit code 130 means SIGINT/SIGTERM - this is expected
        if (err?.exitCode === 130) {
          exited = true
        } else {
          console.error('⚠️  Process error:', err)
        }
      }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])

  return exited
}

/**
 * Prefix each line of output from a stream
 */
function prefixOutput(stream, prefix) {
  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() // Keep incomplete line in buffer

    lines.forEach((line) => {
      if (line) {
        console.log(`${prefix} ${line}`)
      }
    })
  })

  // Flush remaining buffer on end
  stream.on('end', () => {
    if (buffer) {
      console.log(`${prefix} ${buffer}`)
    }
  })
}

async function cleanup() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  console.log('\n🛑 Shutting down development environment...')

  // Stop watch process
  if (watchProcess) {
    console.log('Stopping build watch...')
    watchProcess.kill('SIGTERM')
  }

  // Stop docker compose watch process
  if (composeProcess) {
    console.log('Stopping Docker Compose watch...')
    const exited = await stopProcessWithTimeout(composeProcess, COMPOSE_SHUTDOWN_TIMEOUT_MS)

    if (!exited) {
      console.warn(
        `⚠️  Docker Compose watch did not exit after ${COMPOSE_SHUTDOWN_TIMEOUT_MS / 1000}s, proceeding with shutdown...`,
      )
    }

    // Clean up containers
    try {
      await execa('docker', ['compose', 'down'], {
        cwd,
        stdio: 'inherit',
      })
    } catch (e) {
      console.error('⚠️  Error stopping Docker Compose:', e.message)
    }
  }

  console.log('✅ Shutdown complete')

  process.exit(0)
}

// Handle graceful shutdown
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

/**
 * Check if all Docker Compose containers are running
 */
async function areContainersRunning() {
  try {
    const { stdout } = await execa('docker', ['compose', 'ps', '--format', 'json'], {
      cwd,
    })

    if (!stdout.trim()) {
      return false
    }

    // Parse JSON output (one JSON object per line)
    const containers = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    // Check if we have containers and all are in running state
    return containers.length > 0 && containers.every((c) => c.State === 'running')
  } catch (e) {
    // Containers might not exist yet
    return false
  }
}

/**
 * Wait for Docker Compose containers to be ready
 */
async function waitForContainers() {
  console.log('⏳ Waiting for containers to start...')

  const startTime = Date.now()

  while (Date.now() - startTime < CONTAINER_START_TIMEOUT_MS) {
    if (await areContainersRunning()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, CONTAINER_CHECK_INTERVAL_MS))
  }

  return false
}

/**
 * Start a process and handle errors unless shutting down
 */
function startProcess(processPromise, errorMessage) {
  processPromise.catch((e) => {
    if (!shuttingDown) {
      console.error(`❌ ${errorMessage}:`, e.message)
      cleanup()
    }
  })
  return processPromise
}

async function main() {
  // Check for docker-compose.yml
  const composeFile = resolve(cwd, 'docker-compose.yml')
  if (!existsSync(composeFile)) {
    console.error('❌ docker-compose.yml not found in current directory')
    console.error('   This script must be run from a package with Docker Compose configured')
    process.exit(1)
  }

  console.log('🚀 Starting Docker development environment...\n')

  // Start build watch
  console.log('📦 Starting build watch...')
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const watchScript = resolve(scriptDir, '../bin/watch.js')

  const watchProc = execa('node', [watchScript], {
    cwd,
    cleanup: true,
  })

  prefixOutput(watchProc.stdout, chalk.cyan('[BUILD] '))
  prefixOutput(watchProc.stderr, chalk.cyan('[BUILD] '))

  watchProcess = startProcess(watchProc, 'Build watch failed')

  // Wait for initial build
  console.log('⏳ Waiting for initial build...\n')
  await new Promise((resolve) => setTimeout(resolve, INITIAL_BUILD_WAIT_MS))

  // Start docker compose watch
  const composeProc = execa('docker', ['compose', 'watch'], {
    cwd,
    cleanup: true,
  })

  prefixOutput(composeProc.stdout, chalk.blue('[DOCKER]'))
  prefixOutput(composeProc.stderr, chalk.blue('[DOCKER]'))

  composeProcess = startProcess(composeProc, 'Docker Compose failed')

  // Wait for containers to be ready
  console.log('')
  const containersReady = await waitForContainers()

  console.log('')
  if (containersReady) {
    console.log('✅ Development environment running')
  } else {
    console.log('⚠️  Containers started but may still be initializing')
  }
  console.log('   Press Ctrl+C to stop gracefully\n')

  // Wait for either process to complete (both should run indefinitely)
  await Promise.all([watchProcess, composeProcess].map((p) => p.catch(() => {})))
}

main().catch((e) => {
  if (!shuttingDown) {
    console.error('❌ Fatal error:', e)
    cleanup()
  }
})
