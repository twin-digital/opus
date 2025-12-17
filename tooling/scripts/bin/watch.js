#!/usr/bin/env node

import { makeWatcher } from '../lib/build-helpers/watch.js'

const watcher = await makeWatcher()
await watcher.watch()
