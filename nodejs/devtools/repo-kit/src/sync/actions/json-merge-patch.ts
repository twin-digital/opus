import fsP from 'node:fs/promises'
import path from 'node:path'
import jsonMergePatch from 'json-merge-patch'
import yaml from 'yaml'
import { removeEmptyValues } from '../../utils/remove-empty-values.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isEqual from 'lodash-es/isEqual.js'
import type { SyncActionFn } from '../sync-rule-factory.js'

/**
 * Applies a JSON Merge Patch to the content of a JSON file. After the patch is applied, the file will be normalized
 * by having any empty array or empty object properties removed (recursively). (See the `removeEmptyValues` function
 * for specifics on this removal.)
 *
 * If the patch resulted in any changes, an `ok` result is returned. Otherwise, the result will be `skipped`.
 *
 * @param file Path to the file to patch, relative to the package root.
 * @param options Options used to perform the patch.
 * @returns An `ok` result if there were changes, or `skipped` if no changes were needed.
 */
export const makeJsonMergePatchAction =
  ({
    file,
    patch,
  }: {
    file: string

    /**
     * A string containing the JSON Merge Patch content in Yaml format.
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
  }): SyncActionFn =>
  async (workspace) => {
    const filePath = path.join(workspace.path, file)
    const content = await fsP.readFile(filePath, 'utf-8')
    const original = JSON.parse(content) as object
    const parsedPatch = yaml.parse(patch) as object
    const patched = removeEmptyValues(jsonMergePatch.apply(cloneDeep(original), parsedPatch))

    if (!isEqual(patched, original)) {
      await fsP.writeFile(filePath, `${JSON.stringify(patched, null, 2)}\n`, 'utf-8')
      return {
        changedFiles: [file],
        result: 'ok',
      }
    }

    return {
      result: 'skipped',
    }
  }
