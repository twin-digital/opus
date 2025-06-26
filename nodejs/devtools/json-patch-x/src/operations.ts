import { type BaseOperation } from 'fast-json-patch'

export interface BaseExtendedOperation extends BaseOperation {
  /**
   * Name of this operation.
   */
  opx: string
}

/**
 * Removes all occurrences of a value from an array, leaving any others intact.
 */
export interface RemoveValueExtendedOperation<T = unknown>
  extends BaseExtendedOperation {
  opx: 'removeValue'

  /**
   * The value to remove
   */
  value: T
}

export type ExtendedOperation = RemoveValueExtendedOperation
