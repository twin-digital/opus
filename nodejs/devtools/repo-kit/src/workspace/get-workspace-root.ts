import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'

export const getWorkspaceRoot = async (): Promise<string> => {
  const root = await findWorkspaceDir(process.cwd())
  if (!root) {
    throw new Error(`Could not determine workspace root. [cwd=${process.cwd()}]`)
  }

  return root
}
