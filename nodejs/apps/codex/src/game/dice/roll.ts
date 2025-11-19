import { DiceRoll } from '@dice-roller/rpg-dice-roller'
import type { RollResult } from './results.js'

export const rollOne = (expression: string): RollResult => {
  try {
    const roll = new DiceRoll(expression)
    return {
      output: roll.output,
      rolls: roll.rolls,
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
