import fs from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'

const copyFolder = async (src, dest) => {
  await cp(src, dest, { recursive: true })
}

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

export const supports = () => {
  return Promise.resolve(fs.existsSync(path.resolve('assets')))
}

export const build = async () => {
  // copy assets if needed
  const hasAssets = fs.existsSync(path.resolve('assets'))
  if (hasAssets) {
    await copyFolder('assets', 'dist/assets')

    const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))
    if (hasTypescriptCjs) {
      await copyFolder('assets', 'dist/cjs/assets')
    }
  }
}

export const watch = () => {
  const srcDir = 'assets'
  const hasAssets = fs.existsSync(path.resolve('assets'))
  const hasTypescriptCjs = fs.existsSync(path.resolve('tsconfig.cjs.json'))

  if (hasAssets) {
    const destDirs = ['dist/assets']
    if (hasTypescriptCjs) {
      destDirs.push('dist/cjs/assets')
    }

    const watcher = chokidar.watch(srcDir, {
      ignoreInitial: true,
      persistent: true,
    })

    watcher
      .on('add', (filePath) => copyFile(filePath, srcDir, destDirs))
      .on('change', (filePath) => copyFile(filePath, srcDir, destDirs))
      .on('unlink', (filePath) => removeFile(filePath, srcDir, destDirs))
  }

  return new Promise(() => {})
}
