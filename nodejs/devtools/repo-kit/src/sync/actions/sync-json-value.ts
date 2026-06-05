import fsP from 'node:fs/promises'
import path from 'node:path'
import { applyPatch, tryGetValueByPointer, type SetMatchingPredicate } from '@twin-digital/json-patch-x'
import yaml from 'yaml'
import type { SyncActionFn } from '../sync-rule-factory.js'

/**
 * Parses a structured-config file by extension. YAML is a superset of JSON, but parsing each with its own parser keeps
 * error messages accurate and avoids surprises with edge-case JSON.
 */
const parseStructured = (file: string, content: string): unknown =>
  file.endsWith('.json') ? (JSON.parse(content) as unknown) : (yaml.parse(content) as unknown)

/**
 * Creates a `SyncRule` action that copies a value out of one structured file (JSON or YAML) into the JSON file at
 * `target.file`. The value is written into the element(s) of `target.array` selected by the `target.where` predicate
 * (via `setMatching`), so the destination element is addressed by value rather than by a brittle array index.
 *
 * The action is idempotent: it writes only when the resulting document differs from what is already on disk.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const makeSyncJsonValueAction =
  ({
    source,
    target,
  }: {
    source: {
      file: string
      pointer: string
      default?: unknown
    }
    target: {
      file: string
      array: string
      where: SetMatchingPredicate
      set: string
    }
  }): SyncActionFn =>
  async (workspace) => {
    const sourcePath = path.join(workspace.path, source.file)
    const sourceDocument = parseStructured(source.file, await fsP.readFile(sourcePath, 'utf-8'))

    const found = tryGetValueByPointer(sourceDocument, source.pointer)
    const value = found ?? source.default
    if (value === undefined || value === null) {
      throw new Error(
        `sync-json-value: '${source.file}' has no value at '${source.pointer}', and no default was provided`,
      )
    }

    const targetPath = path.join(workspace.path, target.file)
    const original = JSON.parse(await fsP.readFile(targetPath, 'utf-8')) as object
    const patched = applyPatch(original, [
      { opx: 'setMatching', path: target.array, where: target.where, set: target.set, value },
    ])

    // Compare the parsed documents, not the file text — formatting (owned by Prettier via a hook) must not trigger a
    // write, otherwise sync would fight the formatter.
    if (JSON.stringify(patched) === JSON.stringify(original)) {
      return { result: 'skipped' }
    }

    await fsP.writeFile(targetPath, `${JSON.stringify(patched, null, 2)}\n`, 'utf-8')
    return {
      changedFiles: [target.file],
      result: 'ok',
    }
  }
