import fs from 'node:fs'
import path from 'node:path'
import { bg$, $ } from '../../shell.js'

const bundlerConfigFiles = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
]

const hasBundlerConfig = bundlerConfigFiles.some((f) => fs.existsSync(path.resolve(f)))

export const supports = () => {
  return Promise.resolve(hasBundlerConfig)
}

export const build = () => {
  if (hasBundlerConfig) {
    $`vite build`
  }

  return Promise.resolve()
}

export const watch = () => {
  return hasBundlerConfig ? bg$`vite build --watch` : Promise.resolve()
}
