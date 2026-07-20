import {
  readSourceValue,
  writeArrayTarget,
  writePointerTarget,
  type ArrayTarget,
  type PointerTarget,
  type StructuredSource,
} from './structured.js'
import { transforms, type TransformName } from '../transforms.js'
import type { SyncActionFn } from '../sync-rule-factory.js'

/**
 * Applies a curated, named transform (see `transforms`) to a single scalar value. The transform registry operates on
 * string arrays, so the value is wrapped as a one-element array and unwrapped after — meaning only 1:1 transforms
 * (e.g. `strip-scope`) are meaningful here. The value must be a string; the transform name is validated against the
 * registry the same way `sync-map-to-array` does.
 */
const applyScalarTransform = (value: unknown, transform: string): unknown => {
  if (!Object.hasOwn(transforms, transform)) {
    throw new Error(
      `sync-json-value: unknown transform '${transform}'; valid transforms: ${Object.keys(transforms).join(', ')}`,
    )
  }
  if (typeof value !== 'string') {
    throw new Error(`sync-json-value: transform '${transform}' requires a string value, but received a ${typeof value}`)
  }
  return transforms[transform as TransformName]([value])[0]
}

/**
 * Creates a `SyncRule` action that copies a value out of one structured file (JSON or YAML) into a JSON target. The
 * target is either an array element addressed by a value predicate (`ArrayTarget`) or a single field addressed by a
 * JSON Pointer (`PointerTarget`) — use the latter for a fixed object field like a manifest's `/header/description`.
 * An optional named `transform` (e.g. `strip-scope`) is applied to the value first; see {@link applyScalarTransform}.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const makeSyncJsonValueAction =
  ({
    source,
    target,
    transform,
  }: {
    source: StructuredSource
    target: ArrayTarget | PointerTarget
    // Validated against the `TransformName` registry in `applyScalarTransform`; typed as `string` here to match the
    // config schema, which cannot import the runtime registry.
    transform?: string
  }): SyncActionFn =>
  async (workspace) => {
    const raw = await readSourceValue(workspace.path, source)
    const value = transform === undefined ? raw : applyScalarTransform(raw, transform)
    return 'pointer' in target ?
        writePointerTarget(workspace.path, target, value)
      : writeArrayTarget(workspace.path, target, value)
  }
