/** JSON text with sorted record keys. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) ?
      Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item,
  )

export const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

/** True when the canonical JSON text of the two values is the same. */
export const isEqual = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)
