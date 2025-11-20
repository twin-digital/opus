#!/usr/bin/env node
import { spawn } from 'child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.join(__dirname, '..', 'dist')
const entry = path.join(distDir, 'cli.js')

let child = null
let restarting = false

function spawnChild() {
  if (!fs.existsSync(entry)) {
    console.error(`Entry not found: ${entry}. Build first.`)
    return
  }

  child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`Child exited with signal ${signal}`)
    } else {
      console.log(`Child exited with code ${code}`)
    }

    // If we exited because of a restart request, respawn will be handled by the watcher
    if (!restarting) {
      // normal exit — exit the watcher too
      process.exit(code ?? 0)
    }
  })
}

function killChild() {
  if (!child) return
  try {
    restarting = true
    child.kill('SIGTERM')
  } catch (e) {
    // ignore
  }
}

function startWatcher() {
  try {
    // Ensure dist exists; if not, advise user to build
    if (!fs.existsSync(distDir)) {
      console.log('`dist` directory not found yet. Build the project to create it.')
    }

    let timer = null
    const watcher = fs.watch(distDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      // debounce rapid changes
      clearTimeout(timer)
      timer = setTimeout(() => {
        console.log(`Detected change in dist/${filename}, restarting...`)
        restart()
      }, 150)
    })

    watcher.on('error', (err) => {
      console.error('Watcher error:', err.message || err)
    })
  } catch (err) {
    console.error('Failed to start watcher:', err.message || err)
  }
}

function restart() {
  if (child) {
    killChild()
    // give a small delay for the child to terminate then respawn
    setTimeout(() => {
      restarting = false
      spawnChild()
    }, 150)
  } else {
    spawnChild()
  }
}

// Handle termination signals
process.on('SIGINT', () => {
  killChild()
  process.exit(0)
})
process.on('SIGTERM', () => {
  killChild()
  process.exit(0)
})

// Start
spawnChild()
startWatcher()
