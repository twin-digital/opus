export interface LookupTableEntry<T> {
  /**
   * Maximum value (inclusive) which matches this result.
   */
  maximumValue: number

  /**
   * Minimum value (inclusive) which matches this result.
   */
  minimumValue: number

  /**
   * The result data to use when the range matches
   */
  data: T
}

export interface LookupTable<T> {
  /**
   * Looks up the specified value in the table, and returns the corresponding entry. If multiple overlapping ranges
   * match (probably a misconfiguration), then the first one added to the table will be returned. If no entries match
   * this function returns null.
   */
  lookup(value: number): LookupTableEntry<T> | null
}

export const makeLookupTable = <T>(entries: LookupTableEntry<T>[]): LookupTable<T> => {
  const invalidEntries = entries.filter(({ maximumValue, minimumValue }) => minimumValue > maximumValue)
  if (invalidEntries.length > 0) {
    throw new Error(
      `Invalid lookup table. "minimumValue" must be <= "maximumValue". [${invalidEntries.length} invalid entries]`,
    )
  }

  return {
    lookup: (value) => {
      return entries.find((entry) => value >= entry.minimumValue && value <= entry.maximumValue) ?? null
    },
  }
}
