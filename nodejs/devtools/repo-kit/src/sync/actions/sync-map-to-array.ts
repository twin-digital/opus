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
    // Untrusted: `.repo-kit.yml` is parsed and cast at runtime, so an unknown name can arrive here despite the
    // `TransformName` type on the config schema — validated below.
    transform?: string
    target: ArrayTarget
  }): SyncActionFn =>
  async (workspace) => {
    const value = await readSourceValue(workspace.path, source)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`sync-map-to-array: expected an object at '${source.pointer}' in '${source.file}'`)
    }

    const record = value as Record<string, unknown>
    const raw: unknown[] = emit === 'keys' ? Object.keys(record) : Object.values(record)

    // Documented to produce a string array — enforce it on every path (not only when a transform runs), so
    // `emit: values` over non-string values fails loudly instead of writing non-strings into the target.
    const items = raw.map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`sync-map-to-array: expected only string items at '${source.pointer}' in '${source.file}'`)
      }
      return item
    })

    if (transform === undefined) {
      return writeArrayTarget(workspace.path, target, items)
    }

    if (!Object.hasOwn(transforms, transform)) {
      throw new Error(
        `sync-map-to-array: unknown transform '${transform}'; valid transforms: ${Object.keys(transforms).join(', ')}`,
      )
    }

    return writeArrayTarget(workspace.path, target, transforms[transform as TransformName](items))
  }
