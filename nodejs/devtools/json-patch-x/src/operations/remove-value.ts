import jsonPatch from 'fast-json-patch'
import { tryGetValueByPointer } from '../try-get-value-by-pointer.js'

export const removeValue = <T>(document: T, path: string, value: unknown): T => {
  const array = tryGetValueByPointer(document, path)

  // nothing to remove
  if (array === undefined || array === null) {
    return document
  }

  if (!Array.isArray(array)) {
    throw new jsonPatch.JsonPatchError(
      `Value at path '${path}' is not an array`,
      'SEQUENCE_NOT_AN_ARRAY',
      undefined,
      'removeValue',
    )
  }

  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] === value) {
      array.splice(i, 1)
    }
  }

  return document
}
