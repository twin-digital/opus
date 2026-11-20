import path from 'node:path'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'

/**
 * Returns the absolute, normalized path of the pnpm workspace root that contains the current working directory.
 */
export const getWorkspaceRoot = async (): Promise<string> => {
  const root = await findWorkspaceDir(process.cwd())
  if (!root) {
    throw new Error(`Could not determine workspace root. [cwd=${process.cwd()}]`)
  }

  return path.resolve(root)
}
