#!/usr/bin/env node

import { makeWatcher } from '../lib/build-helpers/watch.js'

const watcher = await makeWatcher()

let shuttingDown = false

async function cleanup() {
  if (shuttingDown) return
  shuttingDown = true
  if (watcher && typeof watcher.close === 'function') {
    try {
      await watcher.close()
    } catch (e) {
      // ignore
    }
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

await watcher.watch()
