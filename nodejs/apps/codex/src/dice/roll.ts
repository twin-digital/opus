import { DiceRoll } from '@dice-roller/rpg-dice-roller'

export interface InvalidRollResult {
  output?: undefined
  total?: undefined
  valid: false
}

export interface ValidRollResult {
  output: string
  total: number
  valid: true
}

export type RollResult = InvalidRollResult | ValidRollResult

export const rollOne = (expression: string): RollResult => {
  try {
    const roll = new DiceRoll(expression)
    return {
      output: roll.output,
      total: roll.total,
      valid: true,
    }
  } catch {
    // return an InvalidRollResult for input errors
    return {
      valid: false,
    }
  }
}
