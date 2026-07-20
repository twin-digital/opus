import fsP from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'
import type { SetMatchingPredicate } from '@twin-digital/json-patch-x'
import type { TransformName } from '../sync/transforms.js'

/**
 * Configuration for a dependency condition which matches if the package declares a dependency
 * with the specified package name. This can either be a simple string (shorthand) or an
 * object containing the `dependency` key with optional `match` flags.
 *
 * If a string is provided, it is treated as the dependency `name` and default matching
 * options are assumed.
 */
export interface DependencyConditionConfig {
  dependency:
    | string
    | {
        /**
         * Name of the dependency to look for in the package manifest (package.json).
         */
        name: string

        /**
         * Optional matching flags. If omitted, defaults are used by the condition.
         */
        match?: {
          dependency?: boolean
          devDependency?: boolean
          optionalDependency?: boolean
          peerDependency?: boolean
        }
      }
}

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
export type SyncConditionConfig = DependencyConditionConfig | ExistsConditionConfig | NotExistsConditionConfig

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
   * applied. If there is at least one condition, the action will apply only if _all_ of the conditions are satisfied
   * (logical AND). Otherwise, it will be skipped.
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
  | {
      action: 'sync-json-value'
      options: {
        /**
         * Where to read the value from.
         */
        source: {
          /**
           * Project-relative path of the JSON or YAML file to read.
           */
          file: string

          /**
           * JSON Pointer to the value within `source.file`.
           */
          pointer: string

          /**
           * Value to use when `source.pointer` resolves to nothing. If omitted, a missing source value is an error.
           */
          default?: unknown
        }

        /**
         * Optional named transform applied to the (scalar) value before it is written. One of a fixed, curated set
         * (see `transforms`); e.g. `strip-scope` reduces a scoped `package.json` name to its bare name. The value must
         * be a string, and only 1:1 transforms are meaningful for a single value.
         */
        transform?: TransformName

        /**
         * Where to write the value — either an element of an array selected by a predicate (addressing array elements
         * by value rather than index, see `setMatching`), or a single object field addressed by a JSON Pointer. Use
         * the pointer form for a fixed field such as a manifest's `/header/description`.
         */
        target:
          | {
              /**
               * Project-relative path of the JSON file to update.
               */
              file: string

              /**
               * JSON Pointer to the array within `target.file` whose elements are candidates.
               */
              array: string

              /**
               * Predicate selecting which element(s) of `target.array` to update.
               */
              where: SetMatchingPredicate

              /**
               * JSON Pointer, relative to each matched element, at which to write the value.
               */
              set: string
            }
          | {
              /**
               * Project-relative path of the JSON file to update.
               */
              file: string

              /**
               * JSON Pointer within `target.file` at which to write the value. Parent objects must already exist.
               */
              pointer: string
            }
      }
    }
  | {
      action: 'sync-map-to-array'
      options: {
        /**
         * Where to read the map from.
         */
        source: {
          /**
           * Project-relative path of the JSON or YAML file to read.
           */
          file: string

          /**
           * JSON Pointer to the (object) value within `source.file`.
           */
          pointer: string

          /**
           * Value to use when `source.pointer` resolves to nothing. If omitted, a missing source value is an error.
           */
          default?: unknown
        }

        /**
         * Whether to emit the source object's keys or its values as the array.
         */
        emit: 'keys' | 'values'

        /**
         * Optional named transform applied to the derived (string) array. One of a fixed, curated set (see
         * `transforms`); e.g. `strip-package-version` reduces each pnpm dependency selector (`pkg@1.2.3`) to its bare,
         * scope-aware package name. A bare name today; may grow to `{ name, options }` if a transform needs parameters.
         */
        transform?: TransformName

        /**
         * Where to write the derived array. The array is written into the element(s) of a target array selected by a
         * predicate, addressing array elements by value rather than index (see `setMatching`).
         */
        target: {
          /**
           * Project-relative path of the JSON file to update.
           */
          file: string

          /**
           * JSON Pointer to the array within `target.file` whose elements are candidates.
           */
          array: string

          /**
           * Predicate selecting which element(s) of `target.array` to update.
           */
          where: SetMatchingPredicate

          /**
           * JSON Pointer, relative to each matched element, at which to write the value.
           */
          set: string
        }
      }
    }
)

/**
 * Names the set of projects a feature applies to. This is the name of a _selector_ — a predicate over projects.
 * Today the selectors are built in; the value space is intended to widen (user-defined named selectors, composition)
 * without changing the meaning of existing values.
 *
 * - `packages` (default): every workspace member package, excluding the repo root — the historical behavior.
 * - `root`: only the repo root (the workspace meta-package).
 * - `all`: every project, including the root.
 */
export type FeatureScope = 'packages' | 'root' | 'all'

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
   * applied. If there is at least one condition, the feature will apply only if _all_ of the conditions are satisfied
   * (logical AND). Otherwise, it will be skipped.
   */
  conditions?: SyncConditionConfig[]

  /**
   * Name of this feature
   */
  name: string

  /**
   * The set of projects this feature applies to. Defaults to `packages` (all member packages except the root).
   */
  scope?: FeatureScope
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
export const loadConfig = async (configPath: string): Promise<Configuration> => {
  const content = await fsP.readFile(path.resolve(configPath), 'utf-8')
  return {
    hooks: [],
    packages: {},
    ...yaml.parse(content),
  } as Configuration
}
