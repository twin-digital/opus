import fsP from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'

/**
 * Configuration for a sync condition which matches if a specific file pattern exists in the package
 */
export interface ExistsConditionConfig {
  /**
   * File glob used to look for files within a package. This glob is interpreted relative to the base directory of the
   * package. If any files match the glob, the condition is satisfied and `applyActions` will be applied.
   */
  exists: string
}

/**
 * Configuration for a sync condition which matches if a specific file pattern does NOT exist in the package
 */
export interface NotExistsConditionConfig {
  /**
   * File glob used to look for files within a package. This glob is interpreted relative to the base directory of the
   * package. If no files match the glob, the condition is satisfied and `applyActions` will be applied.
   */
  notExists: string
}

/**
 * A condition used to determine if a sync feature (or a specific action within a feature) will be applied to a package
 * or not.
 */
export type SyncConditionConfig =
  | ExistsConditionConfig
  | NotExistsConditionConfig

/**
 * Configuration for a hook that runs after files are changed during sync.
 */
export interface HookConfig {
  /**
   * Optional human-readable description of what the hook does. If provided, this will be displayed when the hook runs.
   * If not provided, the `run` command will be displayed instead.
   */
  description?: string

  /**
   * Glob pattern to match against changed files (relative to package root). If any changed files match this pattern,
   * the hook will be executed.
   *
   * @example "package.json" - matches package.json in the package root
   * @example "**\/*.ts" - matches any TypeScript file in any directory
   */
  path: string

  /**
   * Shell command to execute in the package directory when the pattern matches.
   *
   * SECURITY NOTE: This command is executed via shell in the package directory. Only use trusted configuration sources.
   * The command runs with the package directory as the working directory.
   *
   * @example "pnpm install"
   * @example "prettier --write package.json"
   */
  run: string
}

/**
 * A single action taken to sync a feature's configuration in a package.
 */
export type SyncActionConfig = {
  /**
   * Conditions used to determine if an action applies to a package. If there are no conditions, the action is always
   * applied. If there is at least one condition, the action will apply if _any_ of the conditions is satisfied.
   * Otherwise, it will be be skipped.
   */
  conditions?: SyncConditionConfig[]

  /**
   * Human-readable name of the action. If not specified, the `action` key will be used instead.
   */
  name?: string
} & (
  | {
      action: 'json-patch'
      options: {
        /**
         * The file to which the patch is applied.
         */
        file: string

        /**
         * A string containing the JSON Patch content in Yaml format.
         *
         * @example
         * ```
         * patch: |
         *   title: Hello!
         *   phoneNumber: '+01-123-456-7890'
         *   author:
         *     familyName: null
         *   tags: ["example"]
         * ```
         */
        patch: string
      }
    }
  | {
      action: 'json-merge-patch'
      options: {
        /**
         * The file to which the patch is applied.
         */
        file: string

        /**
         * A string containing the JSON Merge Patch content in Yaml format.
         *
         * @example
         * ```
         * patch: |
         *   - op: add
         *     path: /files/-
         *     value: dist
         *   - opx: add
         *     path: /files/-
         *     value: public
         * ```
         */
        patch: string
      }
    }
  | {
      action: 'write-file'
      options: {
        /**
         * Package-relative path of the file to write.
         */
        file: string

        /**
         * Content to write to the specified file.
         */
        content: string
      }
    }
)

/**
 * A single item in the sync-rules.yaml config.
 */
export interface FeatureConfigItem {
  /**
   * Set of actions take to sync a package if this feature applies.
   */
  actions: SyncActionConfig[]

  /**
   * Conditions used to determine if a feature applies to a package. If there are no conditions, the feature is always
   * applied. If there is at least one condition, the feature will apply if _any_ of the conditions is satisfied.
   * Otherwise, it will be be skipped.
   */
  conditions?: SyncConditionConfig[]

  /**
   * Name of this feature
   */
  name: string
}

export interface FeatureConfiguration {
  /**
   * List of PackageFeature which have been configured.
   */
  features: FeatureConfigItem[]
}

export interface PackageConfiguration {
  /**
   * Sync rule configuration. Each key is the name of a sync rule, and the boolean is whether that rule is enabled
   * or not. By default, all rules are enabled.
   */
  rules?: Partial<Record<string, boolean>>
}

export interface Configuration {
  /**
   * List of PackageFeature which have been configured in this repo.
   */
  features: FeatureConfigItem[]

  /**
   * Hooks to run after files are changed during sync operations. Hooks are executed in the order they are defined.
   * Each hook specifies a glob pattern to match changed files and a shell command to run when matches occur.
   */
  hooks?: HookConfig[]

  /**
   * Package-levle configuration for members of this repo. Key is the package name (i.e. @my-scope/my-name).
   */
  packages: Partial<Record<string, PackageConfiguration>>
}

/**
 * Loads the repo-kit configuration, with any defaults applied.
 */
export const loadConfig = async (
  configPath: string,
): Promise<Configuration> => {
  const content = await fsP.readFile(path.resolve(configPath), 'utf-8')
  return {
    hooks: [],
    packages: {},
    ...yaml.parse(content),
  } as Configuration
}
