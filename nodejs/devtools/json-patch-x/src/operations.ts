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

export type ExtendedOperation = AppendIfMissingExtendedOperation | RemoveValueExtendedOperation | ReorderMapKeys
export type AnyOperation = ExtendedOperation | Operation
