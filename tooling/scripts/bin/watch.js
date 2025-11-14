#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { $ } from 'execa'
import { stderr } from 'node:process'

const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.json'))
const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

const watches = []

if (hasTypescriptEsm) {
  watches.push(
    $({
      stderr: 'inherit',
      stdout: 'inherit',
    })`tsc --watch --preserveWatchOutput`,
  )
}

if (hasTypescriptCjs) {
  watches.push(
    $({
      stderr: 'inherit',
      stdout: 'inherit',
    })`tsc --watch --preserveWatchOutput --project tsconfig.cjs.json`,
  )
}

await Promise.all(watches)
