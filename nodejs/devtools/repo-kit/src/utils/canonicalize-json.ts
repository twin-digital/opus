import get from 'lodash-es/get.js'

/**
 * Recursively sort object keys for stable hashing/diffing/etc.
 */
export const canonicalizeJson = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson)
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalizeJson(get(obj, key))
        return acc
      }, {})
  }
  return obj
}
