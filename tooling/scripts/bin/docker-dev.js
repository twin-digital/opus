#!/usr/bin/env node

import chalk from 'chalk'
import { execa } from 'execa'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

// Configuration
const INITIAL_BUILD_WAIT_MS = 3000
const CONTAINER_CHECK_INTERVAL_MS = 500
const CONTAINER_START_TIMEOUT_MS = 60000
const COMPOSE_SHUTDOWN_TIMEOUT_MS = 30000

const cwd = process.cwd()

// Derive project name from directory name (lowercase, alphanumeric only)
const projectName = basename(cwd)
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

// Parse command line arguments
const composeFileArg = process.argv[2] ?? 'docker-compose.yml'
const useStdin = composeFileArg === '-'

// State
let composeFilePath = null
let stdinContent = null
let watchProcess = null
let composeProcess = null
let shuttingDown = false

/**
 * Gracefully stop a process with timeout, returning true if it exited cleanly
 */
const stopProcess = async (proc, timeoutMs) => {
  if (!proc) {
    return true
  }

  proc.kill('SIGTERM')

  try {
    await Promise.race([
      proc,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('timeout'))
        }, timeoutMs)
      }),
    ])
    return true
  } catch (err) {
    // Exit code 130 means SIGINT/SIGTERM - expected during shutdown
    if (err?.exitCode === 130) {
      return true
    }
    if (err?.message === 'timeout') {
      return false
    }
    console.error('⚠️  Process error:', err.message)
    return false
  }
}

/**
 * Prefix each line of output from a stream
 */
const prefixOutput = (stream, prefix) => {
  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() // Keep incomplete line in buffer

    for (const line of lines) {
      if (line) {
        console.log(`${prefix} ${line}`)
      }
    }
  })

  stream.on('end', () => {
    if (buffer) {
      console.log(`${prefix} ${buffer}`)
    }
  })
}

const cleanup = async () => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  console.log('\n🛑 Shutting down development environment...')

  if (watchProcess) {
    console.log('Stopping build watch...')
    const exited = await stopProcess(watchProcess, COMPOSE_SHUTDOWN_TIMEOUT_MS)
    if (!exited) {
      console.warn(`⚠️  Build watch did not exit after ${COMPOSE_SHUTDOWN_TIMEOUT_MS / 1000}s, proceeding...`)
    }
  }

  if (composeProcess) {
    console.log('Stopping Docker Compose watch...')
    const exited = await stopProcess(composeProcess, COMPOSE_SHUTDOWN_TIMEOUT_MS)
    if (!exited) {
      console.warn(`⚠️  Docker Compose watch did not exit after ${COMPOSE_SHUTDOWN_TIMEOUT_MS / 1000}s, proceeding...`)
    }
  }

  // Clean up containers using project name (no compose file needed for 'down')
  try {
    await execa('docker', ['compose', '-p', projectName, 'down'], {
      cwd,
      stdio: 'inherit',
    })
  } catch (e) {
    console.error('⚠️  Error stopping Docker Compose:', e.message)
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
const areContainersRunning = async () => {
  try {
    const { stdout } = await execa(
      'docker',
      ['ps', '--filter', `label=com.docker.compose.project=${projectName}`, '--format', '{{.Status}}'],
      { cwd },
    )

    if (!stdout.trim()) {
      return false
    }

    const statuses = stdout.trim().split('\n')
    return statuses.length > 0 && statuses.every((status) => status.startsWith('Up'))
  } catch {
    return false
  }
}

/**
 * Wait for Docker Compose containers to be ready
 */
const waitForContainers = async () => {
  console.log('⏳ Waiting for containers to start...')
  const startTime = Date.now()

  while (Date.now() - startTime < CONTAINER_START_TIMEOUT_MS) {
    if (await areContainersRunning()) {
      return true
    }
    await new Promise((r) => {
      setTimeout(r, CONTAINER_CHECK_INTERVAL_MS)
    })
  }

  return false
}

const main = async () => {
  // Resolve compose file source
  if (useStdin) {
    const chunks = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk)
    }
    stdinContent = Buffer.concat(chunks)
    console.log(`📄 Read ${stdinContent.length} bytes from stdin`)
  } else {
    composeFilePath = resolve(cwd, composeFileArg)
    if (!existsSync(composeFilePath)) {
      console.error(`❌ ${composeFileArg} not found in current directory`)
      console.error('   This script must be run from a package with Docker Compose configured')
      process.exit(1)
    }
  }

  console.log('🚀 Starting Docker development environment...\n')

  // Start build watch
  console.log('📦 Starting build watch...')
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const watchScript = resolve(scriptDir, '../bin/watch.js')

  watchProcess = execa('node', [watchScript], {
    cwd,
    stdin: 'ignore',
  })

  prefixOutput(watchProcess.stdout, chalk.cyan('[BUILD] '))
  prefixOutput(watchProcess.stderr, chalk.cyan('[BUILD] '))

  watchProcess.catch((e) => {
    if (!shuttingDown) {
      console.error('❌ Build watch failed:', e.message)
      cleanup()
    }
  })

  // Wait for initial build
  console.log('⏳ Waiting for initial build...\n')
  await new Promise((r) => {
    setTimeout(r, INITIAL_BUILD_WAIT_MS)
  })

  // Build docker compose args
  const composeArgs = ['compose', '-p', projectName, '-f', useStdin ? '-' : composeFilePath, 'watch']

  // Start docker compose watch
  composeProcess = execa('docker', composeArgs, {
    cwd,
    ...(stdinContent?.length && { input: stdinContent }),
  })

  prefixOutput(composeProcess.stdout, chalk.blue('[DOCKER]'))
  prefixOutput(composeProcess.stderr, chalk.blue('[DOCKER]'))

  composeProcess.catch((e) => {
    if (!shuttingDown) {
      console.error('❌ Docker Compose failed:', e.message)
      cleanup()
    }
  })

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

  // Wait for processes to complete (both should run indefinitely)
  await Promise.all(
    [watchProcess, composeProcess].map((p) => {
      return p.catch(() => {})
    }),
  )
}

main().catch((e) => {
  if (!shuttingDown) {
    console.error('❌ Fatal error:', e)
    cleanup()
  }
})
