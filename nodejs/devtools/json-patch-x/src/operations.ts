import { type BaseOperation, type Operation } from 'fast-json-patch'

export interface BaseExtendedOperation extends BaseOperation {
  /**
   * Name of this operation.
   */
  opx: string
}

/**
 * Appends the specified value to an array, if and only if it does not already exist in the array.
 */
export interface AppendIfMissingExtendedOperation<T = unknown> extends BaseExtendedOperation {
  opx: 'appendIfMissing'

  /**
   * The value to remove
   */
  value: T
}

/**
 * Removes all occurrences of a value from an array, leaving any others intact.
 */
export interface RemoveValueExtendedOperation<T = unknown> extends BaseExtendedOperation {
  opx: 'removeValue'

  /**
   * The value to remove
   */
  value: T
}

/**
 * Modifies an object value so that the specified keys have the specified order.
 */
export interface ReorderMapKeys extends BaseExtendedOperation {
  opx: 'reorderMapKeys'

  /**
   * New map key order to apply.
   */
  value: string[]
}

/**
 * Predicate used by {@link SetMatchingExtendedOperation} to select array elements by a value match. Exactly one of
 * `contains` or `equals` must be specified.
 */
export interface SetMatchingPredicate {
  /**
   * JSON Pointer, relative to each candidate array element, to the field under test.
   */
  pointer: string

  /**
   * Matches when the field is an array that includes this value (deep equality).
   */
  contains?: unknown

  /**
   * Matches when the field deep-equals this value.
   */
  equals?: unknown
}

/**
 * Sets a value at a child pointer within every element of an array that satisfies a predicate. Selects array elements
 * by value rather than by index — the addressing gap left by RFC 6901 JSON Pointers — so it is stable across reordering.
 */
export interface SetMatchingExtendedOperation<T = unknown> extends BaseExtendedOperation {
  opx: 'setMatching'

  /**
   * JSON Pointer to the array whose elements are candidates.
   */
  path: string

  /**
   * Predicate selecting which array elements to update.
   */
  where: SetMatchingPredicate

  /**
   * JSON Pointer, relative to each matched element, at which to set `value`. An empty string replaces the element.
   */
  set: string

  /**
   * Value to set at `set` within each matched element.
   */
  value: T
}

export type ExtendedOperation =
  | AppendIfMissingExtendedOperation
  | RemoveValueExtendedOperation
  | ReorderMapKeys
  | SetMatchingExtendedOperation
export type AnyOperation = ExtendedOperation | Operation
