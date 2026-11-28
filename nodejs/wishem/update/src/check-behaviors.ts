import type { NativeBehavior } from './update.js'

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** Returns the list, or throws a `TypeError` that names the first problem. */
export const checkBehaviors = (value: unknown): readonly NativeBehavior[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('The behaviors must be an array.')
  }
  const ids = new Set<string>()
  value.forEach((item: unknown, position) => {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError(`The behavior at position ${position} is not an object.`)
    }
    const { id, componentType, update } = item as Record<string, unknown>
    if (!isText(id)) {
      throw new TypeError(`The behavior at position ${position} has no text id.`)
    }
    if (!isText(componentType)) {
      throw new TypeError(`The behavior at position ${position} has no text componentType.`)
    }
    if (typeof update !== 'function') {
      throw new TypeError(`The behavior at position ${position} has no function update.`)
    }
    if (ids.has(id)) {
      throw new TypeError(`Two behaviors have the id "${id}".`)
    }
    ids.add(id)
  })
  return value as NativeBehavior[]
}
