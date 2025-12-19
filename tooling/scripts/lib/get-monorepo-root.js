import fsP from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Find monorepo root by looking for .git directory
export const getMonorepoRoot = async () => {
  let currentDir = __dirname
  while (currentDir !== path.parse(currentDir).root) {
    try {
      const gitPath = path.join(currentDir, '.git')
      await fsP.access(gitPath)
      break
    } catch {
      currentDir = path.dirname(currentDir)
    }
  }

  return currentDir
}
