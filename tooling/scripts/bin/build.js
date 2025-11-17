#!/usr/bin/env node

import fs from 'node:fs'
import { cp } from 'node:fs/promises'
import path from 'node:path'
import { $ } from '../lib/shell.js'

const hasAssets = fs.existsSync(path.resolve('assets'))
const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.json'))
const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

export const copyFolder = async (src, dest) => {
  await cp(src, dest, { recursive: true })
}

if (hasTypescriptEsm) {
  $`tsc`

  if (hasAssets) {
    copyFolder('assets', 'dist/assets')
  }
}

if (hasTypescriptCjs) {
  // transpile
  $`tsc --project tsconfig.cjs.json`

  // create cjs-compatible package.json
  const cjsDir = path.resolve('dist/cjs')
  if (fs.existsSync(cjsDir)) {
    fsP.writeFileSync(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}')
  }

  if (hasAssets) {
    copyFolder('assets', 'dist/cjs/assets')
  }
}
