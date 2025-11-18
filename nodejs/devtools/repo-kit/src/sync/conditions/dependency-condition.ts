import type { SyncConditionFn } from '../sync-rule-factory.js'
import type { ProjectManifest } from '@pnpm/types'

export interface DependencyConditionOptions {
  /**
   * Whether the condition is satisfied if the dependency is list as a normal 'dependency'.
   * @defaultValue true
   */
  dependency?: boolean

  /**
   * Whether the condition is satisfied if the dependency is list as a 'devDependency'.
   * @defaultValue true
   */
  devDependency?: boolean

  /**
   * Whether the condition is satisfied if the dependency is list as an 'optionalDependency'.
   * @defaultValue false
   */
  optionalDependency?: boolean

  /**
   * Whether the condition is satisfied if the dependency is list as a 'peerDependency'.
   * @defaultValue true
   */
  peerDependency?: boolean
}

/**
 * A dependency condition is met if the workspace's package.json
 */
export const makeDependencyCondition =
  (
    dependencyName: string,
    {
      dependency = true,
      devDependency = true,
      optionalDependency = false,
      peerDependency = true,
    }: DependencyConditionOptions = {},
  ): SyncConditionFn =>
  (workspace) => {
    const manifest: ProjectManifest = workspace.manifest

    if (
      dependency &&
      manifest.dependencies &&
      dependencyName in manifest.dependencies
    ) {
      return true
    }

    if (
      devDependency &&
      manifest.devDependencies &&
      dependencyName in manifest.devDependencies
    ) {
      return true
    }

    if (
      optionalDependency &&
      manifest.optionalDependencies &&
      dependencyName in manifest.optionalDependencies
    ) {
      return true
    }

    if (
      peerDependency &&
      manifest.peerDependencies &&
      dependencyName in manifest.peerDependencies
    ) {
      return true
    }

    return false
  }
