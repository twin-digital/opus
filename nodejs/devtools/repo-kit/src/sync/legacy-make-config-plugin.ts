import fs from 'fs'
import path from 'path'
import type { LegacySyncPlugin, SyncInput } from './legacy-sync-plugin.js'
import entries from 'lodash-es/entries.js'
import type { SyncRule } from './sync-rule.js'

/**
 * Function used to apply a configuration change to a single file. Will be passed the original content of the file, and
 * the config input which the `ConfigPlugin.apply` function received. Should return the new content of the file.
 *
 * @param content Original content of the file. If the file does not exist, this will be undefined.
 * @param parameters Additional parameters passed to the plugin's `apply` function
 */
export type FileTransformFn = (
  content: string | undefined,
  parameters: SyncInput,
) => string | Promise<string>

/**
 * Wraps an object-based file transform function into a FileTransformFn by handling the converstion between strings and
 * the parsed JSON object.
 * @param fn Function to wrap, which takes/returns an object instead of string for file contents.
 * @returns The FileTransformFn`s
 */
export const transformJson =
  (
    fn: (
      content: object | undefined,
      parameters: SyncInput,
    ) => object | Promise<object> | undefined | Promise<undefined>,
  ): FileTransformFn =>
  async (content, parameters) => {
    const originalObject =
      content === undefined ? undefined : (JSON.parse(content) as object)
    const newObject = await fn(originalObject, parameters)
    return `${JSON.stringify(newObject, null, 2)}\n`
  }

/**
 * Applies a single transformer to the configuration of a project. Will return true if the file was changed, or false
 * if it was not.
 */
const applyTransformer = async (
  file: string,
  transform: FileTransformFn,
  input: SyncInput,
): Promise<boolean> => {
  const filePath = path.join(input.packagePath, file)
  const originalContent =
    fs.existsSync(filePath) ?
      await fs.promises.readFile(filePath, 'utf-8')
    : undefined
  const newContent = await transform(originalContent, input)

  const changed = originalContent !== newContent
  if (changed) {
    await fs.promises.writeFile(filePath, newContent, 'utf-8')
  }

  return changed
}

/**
 * Converts a legacy 'sync plugin' to a sync rule.
 */
export const asSyncRule = (plugin: LegacySyncPlugin): SyncRule => ({
  apply: (workspace) => {
    return plugin.sync({
      manifest: workspace.manifest,
      name: workspace.name,
      packagePath: workspace.path,
    })
  },
  name: plugin.name,
})

/**
 * Creates a `ConfigPlugin` with a given name that applies a specific set of FileTransform functions to a package.
 * @param name
 * @param transformers
 * @returns
 */
export const makeConfigPlugin = (
  name: string,
  transformers: Record<string, FileTransformFn | FileTransformFn[]>,
): LegacySyncPlugin => {
  return {
    name,
    sync: async (input) => {
      const changedFiles: Set<string> = new Set<string>()

      const transformEntries = entries(transformers)
      try {
        for (const [file, transformFns] of transformEntries) {
          const transformList =
            Array.isArray(transformFns) ? transformFns : [transformFns]

          for (const transform of transformList) {
            if (await applyTransformer(file, transform, input)) {
              changedFiles.add(file)
            }
          }
        }
      } catch (throwable: unknown) {
        const error =
          throwable instanceof Error ? throwable : new Error(String(throwable))
        return {
          error,
          result: 'error',
        }
      }

      return changedFiles.size > 0 ?
          {
            changedFiles: [...changedFiles],
            result: 'ok',
          }
        : {
            result: 'skipped',
          }
    },
  }
}

/**
 * Creates a `ConfigPlugin` with a given name that applies a specific set of FileTransform functions to a package.
 * @param name
 * @param transformers
 * @returns
 */
export const makeConfigPluginRule = (
  name: string,
  transformers: Record<string, FileTransformFn | FileTransformFn[]>,
): SyncRule => {
  return asSyncRule(makeConfigPlugin(name, transformers))
}
