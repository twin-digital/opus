import jsonPatch from 'fast-json-patch'
import { tryGetValueByPointer } from '../try-get-value-by-pointer.js'

/**
 * Reorders the keys of a map at the specified path. Value should be an array of strings. The map will be updated so
 * that any keys specified in the 'value' array appear in the specified order in the output json. If the map does not
 * already contain a key, it will be ignored. Any other keys (not specified as part of the 'value') will be appended
 * after the specified keys and in their original order.
 *
 * If there is no value specified at 'path', then the document is unchanged. If there is a non-map value at 'path' an
 * error is thrown.
 */
export const reorderMapKeys = <T>(document: T, path: string, value: unknown): T => {
  if (!Array.isArray(value)) {
    throw new jsonPatch.JsonPatchError(
      `Path value is not an array. Got: ${typeof value}`,
      'OPERATION_VALUE_OUT_OF_BOUNDS',
      undefined,
      'reorderMapKeys',
    )
  }

  const map = tryGetValueByPointer(document, path)

  // no existing map, so do nothing
  if (map === undefined || map === null) {
    return document
  }

  // make sure we are dealing with a non-array object
  if (typeof map !== 'object' || Array.isArray(map)) {
    throw new jsonPatch.JsonPatchError(
      `Value at path '${path}' is not a map`,
      'OPERATION_PATH_INVALID',
      undefined,
      'reorderMapKeys',
    )
  }

  const existingKeys = Object.keys(map)
  const orderedKeys = (value as string[]).filter((key) => typeof key === 'string' && key in map)
  const remainingKeys = existingKeys.filter((key) => !value.includes(key))
  const allKeys = [...orderedKeys, ...remainingKeys]

  // Create new reordered object
  const reorderedMap: Record<string, unknown> = {}
  for (const key of allKeys) {
    reorderedMap[key] = (map as Record<string, unknown>)[key]
  }

  // Replace the map at the path with the reordered version
  return jsonPatch.applyOperation(document, {
    op: 'replace',
    path,
    value: reorderedMap,
  }).newDocument
}
