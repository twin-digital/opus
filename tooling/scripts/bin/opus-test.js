#!/usr/bin/env node

import { runVitest } from '../lib/run-vitest.js'

runVitest(['run', '--passWithNoTests', ...process.argv.slice(2)])
