import { Results } from '@dice-roller/rpg-dice-roller'

export interface InvalidRollResult {
  output?: undefined
  rolls?: undefined
  total?: undefined
  valid: false
}

export interface ValidRollResult {
  output: string
  rolls: (string | number | Results.RollResults | Results.ResultGroup)[]
  total: number
  valid: true
}

export type RollResult = InvalidRollResult | ValidRollResult

/**
 * Extracts individual die values from a roll result.
 * Recursively traverses the result structure to find all numeric values.
 */
export const extractDieValues = (roll: RollResult): number[] => {
  const extractNumbers = (node: unknown): number[] => {
    if (node == null) {
      return []
    }
    if (typeof node === 'number') {
      return [node]
    }
    if (typeof node === 'string') {
      const parsed = Number(node)
      return !isNaN(parsed) ? [parsed] : []
    }
    if (Array.isArray(node)) {
      return node.flatMap((n) => extractNumbers(n))
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof node === 'object' && node !== null) {
      const obj = node as Record<string, unknown>

      // RollResults: { rolls: [...] }
      if (Array.isArray(obj.rolls)) {
        return (obj.rolls as unknown[]).flatMap((r) => extractNumbers(r))
      }

      // ResultGroup: { results: [...] }
      if (Array.isArray(obj.results)) {
        return (obj.results as unknown[]).flatMap((r) => extractNumbers(r))
      }

      // Some result objects expose a numeric value property
      if (typeof obj.value === 'number') {
        return [obj.value]
      }
    }

    return []
  }

  return roll.valid ? roll.rolls.flatMap((comp) => extractNumbers(comp)) : []
}
