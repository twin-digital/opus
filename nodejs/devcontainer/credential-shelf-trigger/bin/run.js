#!/usr/bin/env node
import { run } from '../dist/main.js'

// Invocation lives in main.ts's `run` (typed catch) so importing main.ts for tests has no side effects.
run()
