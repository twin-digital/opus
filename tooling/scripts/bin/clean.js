#!/usr/bin/env node

import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { globby } from 'globby'

const projectRoot = resolve(process.cwd())
const patterns = ['**/dist', '**/.turbo', '**/tsconfig.tsbuildinfo', '!**/node_modules/**', '.serverless']

try {
  const files = await globby(patterns, {
    cwd: projectRoot,
    absolute: true,
    onlyFiles: false,
    dot: true,
  })

  await Promise.all(
    files.map(async (file) => {
      try {
        await rm(file, { recursive: true, force: true })
        // console.log(`Removed: ${file}`)
      } catch (err) {
        console.error(`❌ Failed to remove ${file}:`, err.message)
      }
    }),
  )

  console.log('\nCleaned all dist/, .turbo/, and tsconfig.tsbuildinfo files.\n')
} catch (err) {
  console.error('❌ Clean failed:', err.message)
  process.exit(1)
}
