import jsonPatch from 'fast-json-patch'
import { tryGetValueByPointer } from '../try-get-value-by-pointer.js'

export const appendIfMissing = <T>(document: T, path: string, value: unknown): T => {
  const array = tryGetValueByPointer(document, path)

  // no existing array, so add one
  if (array === undefined || array === null) {
    return jsonPatch.applyOperation(document, {
      op: 'add',
      path,
      value: [value],
    }).newDocument
  }

  if (!Array.isArray(array)) {
    throw new jsonPatch.JsonPatchError(
      `Value at path '${path}' is not an array`,
      'SEQUENCE_NOT_AN_ARRAY',
      undefined,
      'appendIfMissing',
    )
  }

  if (!array.includes(value)) {
    array.push(value)
  }

  return document
}
