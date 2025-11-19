import fs from 'node:fs'
import path from 'node:path'
import { bg$, $ } from '../../util/shell.js'

const bundlerConfigFiles = [
  'tsdown.config.ts',
  'tsdown.config.mts',
  'tsdown.config.cts',
  'tsdown.config.js',
  'tsdown.config.mjs',
  'tsdown.config.cjs',
  'tsdown.config.json',
  'tsdown.config',
]

const hasBundlerConfig = bundlerConfigFiles.some((f) => fs.existsSync(path.resolve(f)))

export const supports = () => {
  return Promise.resolve(hasBundlerConfig)
}

export const build = () => {
  if (hasBundlerConfig) {
    $`tsdown`
  }

  return Promise.resolve()
}

export const watch = () => {
  return hasBundlerConfig ? bg$`tsdown --watch` : Promise.resolve()
}
