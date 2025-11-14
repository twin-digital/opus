#!/usr/bin/env node

import fs from 'node:fs'
import { cp, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'
import { $ } from 'execa'

const hasAssets = fs.existsSync(path.resolve('assets'))
const hasTypescriptEsm = fs.existsSync(path.resolve('tsconfig.json'))
const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

const syncAssets = (srcDir, destDirs) => {
  const copyFile = async (filePath, srcDir, destDirs) => {
    const relativePath = path.relative(srcDir, filePath)

    for (const destDir of destDirs) {
      const destPath = path.join(destDir, relativePath)
      await mkdir(path.dirname(destPath), { recursive: true })
      await cp(filePath, destPath)
      console.log(`✅ Copied ${relativePath} to ${destDir}`)
    }
  }

  const removeFile = async (filePath, srcDir, destDirs) => {
    const relativePath = path.relative(srcDir, filePath)

    for (const destDir of destDirs) {
      const destPath = path.join(destDir, relativePath)
      await rm(destPath, { force: true })
      console.log(`🗑️  Deleted ${relativePath} from ${destDir}`)
    }
  }

  const watcher = chokidar.watch(srcDir, {
    ignoreInitial: true,
    persistent: true,
  })

  watcher
    .on('add', (filePath) => copyFile(filePath, srcDir, destDirs))
    .on('change', (filePath) => copyFile(filePath, srcDir, destDirs))
    .on('unlink', (filePath) => removeFile(filePath, srcDir, destDirs))

  return watcher
}

const watches = []
const destDirs = []

if (hasTypescriptEsm) {
  watches.push(
    $({
      stderr: 'inherit',
      stdout: 'inherit',
    })`tsc --watch --preserveWatchOutput`,
  )
  destDirs.push('dist/assets')
}

if (hasTypescriptCjs) {
  watches.push(
    $({
      stderr: 'inherit',
      stdout: 'inherit',
    })`tsc --watch --preserveWatchOutput --project tsconfig.cjs.json`,
  )
  destDirs.push('dist/cjs/assets')
}

if (hasAssets && destDirs.length > 0) {
  syncAssets('assets', destDirs)
}
await Promise.all(watches)
