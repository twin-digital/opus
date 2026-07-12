import fs from 'node:fs'
import path from 'node:path'
import { bg$, $ } from '../../shell.js'

const viteConfigFiles = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
]

const hasViteConfig = viteConfigFiles.some((f) => fs.existsSync(path.resolve(f)))

export const supports = () => {
  return Promise.resolve(hasViteConfig)
}

export const build = () => {
  if (hasViteConfig) {
    $`vite build`
  }

  return Promise.resolve()
}

export const watch = () => {
  return hasViteConfig ? bg$`vite build --watch` : Promise.resolve()
}
