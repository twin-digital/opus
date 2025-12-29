import jsonPatch from 'fast-json-patch'

/**
 * Uses fast-json-patch to retrieve the document value with the given json path. If this operation fails, null is
 * returned.
 */
export const tryGetValueByPointer = (document: unknown, path: string): unknown => {
  try {
    return jsonPatch.getValueByPointer(document, path) as unknown
  } catch {
    return null
  }
}
