import { DiceRoll } from '@dice-roller/rpg-dice-roller'

export type D6Result = 1 | 2 | 3 | 4 | 5 | 6

export interface CheckResult {
  /**
   * Whether the roll result meets or beats the target.
   */
  meetsTarget: boolean

  /**
   * The value rolled on the die, plus any modifiers.
   */
  roll: number
}

/**
 * Determines if a d6-based check result meets a target threshold using a specific result value (instead of rolling one).
 * This is useful in situations where the outcome of a roll made outside the app (such as by a player) needs to be
 * determined in a way consistent with {@link rollCheck}.
 *
 * @param target Target X-in-6 value for the check
 * @param roll The d6 die result to use as the result
 * @returns The {@link CheckResult}
 */
export const resolveCheckResult = (target: D6Result, roll: number): CheckResult => {
  return {
    meetsTarget: roll <= target,
    roll,
  }
}

/**
 * Rolls a d6-based check, such as a skill check or ability check. Returns the raw die value, and a boolean indicating
 * if the target number was met.
 *
 * @param target Target X-in-6 value for the check
 * @param modifier Additional modifier to add to the die roll
 * @returns The {@link CheckResult}
 */
export const rollCheck = (target: D6Result, modifier = 0): CheckResult => {
  const roll = new DiceRoll('d6').total + modifier
  return resolveCheckResult(target, roll)
}
