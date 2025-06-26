import {
  applyPatch as fjpApplyPatch,
  getValueByPointer,
  type Operation,
  type PatchResult,
  type Validator,
} from 'fast-json-patch'
import type {
  ExtendedOperation,
  RemoveValueExtendedOperation,
} from './operations.js'

/**
 * Given an array and a value, return all array indices containing the value.
 */
const findAllIndices = <T = unknown>(arr: T[], value: T): number[] =>
  arr.reduce<number[]>((acc: number[], el, i) => {
    if (el === value) acc.push(i)
    return acc
  }, [])

const getRemoveValueOperations = (
  document: unknown,
  operation: RemoveValueExtendedOperation,
): Operation[] => {
  const array = getValueByPointer(document, operation.path) as unknown

  // nothing to remove
  if (array === undefined || array === null) {
    return []
  }

  if (!Array.isArray(array)) {
    throw new Error(`${operation.path} is not an array`)
  }

  const indicesToRemove = findAllIndices(array, operation.value)
    // reverse order so we remove right-to-left and don't disturb indices
    .reverse()

  return indicesToRemove.map((i) => ({
    op: 'remove',
    path: `${operation.path}/${i}`,
  }))
}

const toBaseOperations = (
  document: unknown,
  operation: Operation | ExtendedOperation,
): Operation[] => {
  if ('opx' in operation) {
    switch (operation.opx) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- forward compatible switch
      case 'removeValue':
        return getRemoveValueOperations(document, operation)
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- forward compatible switch
        throw new Error(`Unknown extended operation: ${operation.opx}`)
    }
  } else {
    return [operation]
  }
}

export const applyPatch = <T>(
  document: T,
  patch: (Operation | ExtendedOperation)[],
  validateOperation?: boolean | Validator<T>,
  mutateDocument = true,
  banPrototypeModifications = true,
): PatchResult<T> => {
  return fjpApplyPatch(
    document,
    patch.flatMap((op) => toBaseOperations(document, op)),
    validateOperation,
    mutateDocument,
    banPrototypeModifications,
  )
}
