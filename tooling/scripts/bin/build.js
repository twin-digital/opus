#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { $ } from '../lib/shell.js'

const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.json'))
const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

if (hasTypescriptEsm) {
  $`tsc`
}

if (hasTypescriptCjs) {
  // transpile
  $`tsc --project tsconfig.cjs.json`

  // create cjs-compatible package.json
  const cjsDir = path.resolve('dist/cjs')
  if (fs.existsSync(cjsDir)) {
    fsP.writeFileSync(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}')
  }
}
