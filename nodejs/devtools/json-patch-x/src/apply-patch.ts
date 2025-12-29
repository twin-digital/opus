import jsonPatch from 'fast-json-patch'
import type { AnyOperation, ExtendedOperation } from './operations.js'
import { removeValue } from './operations/remove-value.js'
import { appendIfMissing } from './operations/append-if-missing.js'
import { reorderMapKeys } from './operations/reorder-map-keys.js'

const applyExtendedOperation = <T>(document: T, patch: ExtendedOperation): T => {
  switch (patch.opx) {
    case 'appendIfMissing':
      return appendIfMissing(document, patch.path, patch.value)
    case 'removeValue':
      return removeValue(document, patch.path, patch.value)
    case 'reorderMapKeys':
      return reorderMapKeys(document, patch.path, patch.value)
  }
}

const applyOperation = <T>(document: T, patch: AnyOperation, index: number): T => {
  if ('opx' in patch) {
    return applyExtendedOperation(document, patch)
  } else {
    return jsonPatch.applyOperation(document, patch, true, true, true, index).newDocument
  }
}

/**
 * Apply a full JSON Patch array on a JSON document. Extended operations will be handled directly, and standard
 * JSON Patch operations will be delegated to the `fast-json-patch` library. Returns the new document. The original
 * document and patch objects will not be modified. (They are cloned before performing any changes.)
 *
 * @param document The document to patch
 * @param patch The patch to apply
 * @return New document with the patch applied.
 */
export function applyPatch<T>(document: T, patch: AnyOperation[]): T {
  if (!Array.isArray(patch)) {
    throw new jsonPatch.JsonPatchError('Patch sequence must be an array', 'SEQUENCE_NOT_AN_ARRAY')
  }

  let result = jsonPatch.deepClone(document) as T
  for (let i = 0, length = patch.length; i < length; i++) {
    result = applyOperation(result, jsonPatch.deepClone(patch[i]) as AnyOperation, i)
  }

  return result
}
