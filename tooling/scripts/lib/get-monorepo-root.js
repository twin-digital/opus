import fsP from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// const findMonorepoRoot = (startDir) => {
//   let dir = startDir
//   // Walk up until we find a workspace marker or git root
//   while (true) {
//     if (
//       fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
//       fs.existsSync(path.join(dir, 'pnpm-workspace.yml')) ||
//       fs.existsSync(path.join(dir, '.git'))
//     ) {
//       return dir
//     }
//     const parent = path.dirname(dir)
//     if (parent === dir) return startDir
//     dir = parent
//   }
// }

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
