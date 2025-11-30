import fs from 'node:fs'
import path from 'node:path'
import { bg$, $ } from '../../util/shell.js'

export const supports = () => {
  const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.build.json'))
  const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))
  return Promise.resolve(hasTypescriptCjs || hasTypescriptEsm)
}

export const build = () => {
  const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.json'))
  const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

  // transpile with tsc
  if (hasTypescriptEsm) {
    $`tsc --project tsconfig.build.json`
  }

  if (hasTypescriptCjs) {
    // transpile
    $`tsc --project tsconfig.cjs.json`

    // create cjs-compatible package.json
    const cjsDir = path.resolve('dist/cjs')
    if (fs.existsSync(cjsDir)) {
      fs.writeFileSync(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}')
    }
  }

  return Promise.resolve()
}

export const watch = () => {
  const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.build.json'))
  const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

  const watches = []

  if (hasTypescriptEsm) {
    watches.push(bg$`tsc --project tsconfig.build.json --watch --preserveWatchOutput`)
  }

  if (hasTypescriptCjs) {
    watches.push(bg$`tsc --watch --preserveWatchOutput --project tsconfig.cjs.json`)
  }

  return Promise.all(watches)
}
