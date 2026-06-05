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
 * Reduces a pnpm dependency selector to its bare package name by dropping a trailing `@<version>`. Scope-aware: the
 * leading `@` of a scoped name is preserved — only a version separator is removed.
 *
 *   ink                            -> ink
 *   lodash-es@4.17.21              -> lodash-es
 *   '@mishieck/ink-titled-box@0.3.0' -> @mishieck/ink-titled-box
 *   '@scope/name'                  -> @scope/name   (no version present)
 */
const stripPackageVersion = (selector: string): string => {
  const at = selector.lastIndexOf('@')
  return at > 0 ? selector.slice(0, at) : selector
}

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
      keys?: boolean
      stripVersion?: boolean
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
    const resolved = found ?? source.default
    if (resolved === undefined || resolved === null) {
      throw new Error(
        `sync-json-value: '${source.file}' has no value at '${source.pointer}', and no default was provided`,
      )
    }

    // Optional derivations, applied in order: take the object's keys, then reduce each to its bare package name.
    // Together these turn pnpm `patchedDependencies` ({ 'pkg@1.2.3': '…' }) into a `matchPackageNames` list.
    let value: unknown = resolved
    if (source.keys) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`sync-json-value: 'keys' requires an object at '${source.pointer}' in '${source.file}'`)
      }
      value = Object.keys(value as Record<string, unknown>)
    }
    if (source.stripVersion) {
      if (!Array.isArray(value)) {
        throw new Error(
          `sync-json-value: 'stripVersion' requires an array at '${source.pointer}' (combine with 'keys' for an object)`,
        )
      }
      value = value.map((entry) => {
        if (typeof entry !== 'string') {
          throw new Error(`sync-json-value: 'stripVersion' requires string entries at '${source.pointer}'`)
        }
        return stripPackageVersion(entry)
      })
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
