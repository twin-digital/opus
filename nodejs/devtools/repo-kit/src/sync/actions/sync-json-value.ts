import { readSourceValue, writeArrayTarget, type ArrayTarget, type StructuredSource } from './structured.js'
import type { SyncActionFn } from '../sync-rule-factory.js'

/**
 * Creates a `SyncRule` action that copies a value verbatim out of one structured file (JSON or YAML) into the
 * predicate-selected element(s) of an array in the JSON file at `target.file`. Use when the source value is already in
 * the shape the target needs (e.g. an array of package names). For deriving an array from a map, see `sync-map-to-array`.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const makeSyncJsonValueAction =
  ({ source, target }: { source: StructuredSource; target: ArrayTarget }): SyncActionFn =>
  async (workspace) => {
    const value = await readSourceValue(workspace.path, source)
    return writeArrayTarget(workspace.path, target, value)
  }
