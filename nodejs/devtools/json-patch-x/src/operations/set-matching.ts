import jsonPatch from 'fast-json-patch'
import { tryGetValueByPointer } from '../try-get-value-by-pointer.js'
import type { SetMatchingPredicate } from '../operations.js'

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Evaluates a {@link SetMatchingPredicate} against a single candidate element.
 */
const matches = (element: unknown, where: SetMatchingPredicate): boolean => {
  const hasContains = 'contains' in where
  const hasEquals = 'equals' in where
  if (hasContains === hasEquals) {
    throw new jsonPatch.JsonPatchError(
      `setMatching 'where' must specify exactly one of 'contains' or 'equals'`,
      'OPERATION_OP_INVALID',
      undefined,
      'setMatching',
    )
  }

  const field = tryGetValueByPointer(element, where.pointer)

  if (hasContains) {
    return Array.isArray(field) && field.some((item) => deepEqual(item, where.contains))
  }

  return deepEqual(field, where.equals)
}

/**
 * Sets `value` at the `set` pointer within every element of the array at `path` that satisfies the `where` predicate.
 *
 * This addresses array elements by a value match rather than by index — the gap left by RFC 6901 JSON Pointers, which
 * can only index arrays positionally. Selection is therefore stable across reordering of the array.
 *
 * Throws if `path` does not resolve to an array, if no element matches (a predicate that matches nothing is treated as
 * a misconfiguration, not a silent no-op), or if `where` does not specify exactly one of `contains`/`equals`.
 */
export const setMatching = <T>(
  document: T,
  path: string,
  where: SetMatchingPredicate,
  set: string,
  value: unknown,
): T => {
  const array = tryGetValueByPointer(document, path)

  if (!Array.isArray(array)) {
    throw new jsonPatch.JsonPatchError(
      `Value at path '${path}' is not an array`,
      'SEQUENCE_NOT_AN_ARRAY',
      undefined,
      'setMatching',
    )
  }

  const matchedIndices = array.flatMap((element, index) => (matches(element, where) ? [index] : []))

  if (matchedIndices.length === 0) {
    throw new jsonPatch.JsonPatchError(
      `setMatching predicate matched no element of the array at '${path}'`,
      'OPERATION_PATH_UNRESOLVABLE',
      undefined,
      'setMatching',
    )
  }

  // `set` points within each matched element; an empty pointer replaces the element itself. Using `add` overwrites an
  // existing object member (RFC 6902 semantics), which is what we want for an idempotent set.
  return matchedIndices.reduce(
    (result, index) =>
      jsonPatch.applyOperation(result, {
        op: 'add',
        path: `${path}/${index.toString()}${set}`,
        value,
      }).newDocument,
    document,
  )
}
