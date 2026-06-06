import { readSourceValue, writeArrayTarget, type ArrayTarget, type StructuredSource } from './structured.js'
import { transforms, type TransformName } from '../transforms.js'
import type { SyncActionFn } from '../sync-rule-factory.js'

/**
 * Creates a `SyncRule` action that derives an array from a map-shaped value and writes it into the predicate-selected
 * element(s) of an array in the JSON file at `target.file`. The map at `source.pointer` is reduced to its `keys` or
 * `values`, then the (string) array is optionally run through a curated, named transform (see `transforms`).
 *
 * This is the map → array companion to `sync-json-value` (which copies a value verbatim). It exists so map-shaped
 * config like pnpm `patchedDependencies` (`{ 'pkg@1.2.3': '…' }`) can become a `matchPackageNames` list — `emit: keys`
 * plus the `strip-package-version` transform yields the bare, scope-aware names.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const makeSyncMapToArrayAction =
  ({
    source,
    emit,
    transform,
    target,
  }: {
    source: StructuredSource
    emit: 'keys' | 'values'
    transform?: TransformName
    target: ArrayTarget
  }): SyncActionFn =>
  async (workspace) => {
    const value = await readSourceValue(workspace.path, source)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`sync-map-to-array: expected an object at '${source.pointer}' in '${source.file}'`)
    }

    const record = value as Record<string, unknown>
    let items: unknown[] = emit === 'keys' ? Object.keys(record) : Object.values(record)

    if (transform !== undefined) {
      const strings = items.map((item) => {
        if (typeof item !== 'string') {
          throw new Error(`sync-map-to-array: transform '${transform}' requires string items at '${source.pointer}'`)
        }
        return item
      })
      items = transforms[transform](strings)
    }

    return writeArrayTarget(workspace.path, target, items)
  }
