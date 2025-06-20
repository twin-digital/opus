import type { ProjectManifest } from '@pnpm/types'

/**
 * Metadata about a single workspace package in a monorepo.
 */
export interface PackageMeta {
  /**
   * Manifest for the package (i.e. contents of its package.json)
   */
  manifest: ProjectManifest

  /**
   * Name of the package
   */
  name: string

  /**
   * Absolute path of the package
   */
  path: string
}
