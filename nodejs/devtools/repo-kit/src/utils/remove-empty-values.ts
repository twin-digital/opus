import { isPlainObject, keys } from 'lodash-es'

/**
 * Recursively removes undefined values, empty arrays, and empty plain objects
 * from within plain-object properties.
 *
 * - **Arrays** are only mapped; entries are **not** filtered out (even if they
 *   become `undefined` or empty after cleaning).
 * - Only **plain** objects (i.e. `{}` or created via `new Object`) are recursed
 *   and pruned; other objects (Date, Map, custom classes…) are returned intact.
 * - Circular references are detected via a `WeakSet` and left in place to avoid
 *   infinite recursion.
 *
 * @param obj  anything you want to clean
 * @returns    a new structure with empty/undefined values removed from object
 *             properties, or the original value if it’s a non-plain object
 */
export const removeEmptyValues = (obj: unknown): unknown => {
  const seen = new WeakSet<object>()

  const recurse = (value: unknown): unknown => {
    // only objects & arrays need pruning
    if (value && typeof value === 'object') {
      // guard circular refs
      if (seen.has(value)) {
        return value
      }
      seen.add(value)

      if (Array.isArray(value)) {
        // map but do NOT filter out “empties”
        return (value as unknown[]).map(recurse)
      }

      // only plain objects get examined key-by-key
      if (isPlainObject(value)) {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          const cleaned = recurse(v)

          const isEmptyArr = Array.isArray(cleaned) && cleaned.length === 0
          const isEmptyObj =
            isPlainObject(cleaned) && keys(cleaned).length === 0

          if (cleaned !== undefined && !isEmptyArr && !isEmptyObj) {
            out[k] = cleaned
          }
        }
        return out
      }

      return value
    }

    return value
  }

  return recurse(obj)
}
