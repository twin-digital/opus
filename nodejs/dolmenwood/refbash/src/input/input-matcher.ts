import type { Key } from 'ink'
import get from 'lodash-es/get.js'

type SpecialKeyName = Exclude<keyof Key, 'ctrl' | 'meta' | 'shift'>

/**
 * Name or value of a key to match input against. Must be a special key name (see {@link Key}), or a single character
 * representing a key pressed on a keyboard.
 */
export type KeyName = SpecialKeyName | (string & {})

export interface NormalizedInputMatcher {
  key: KeyName
  modifier?: 'ctrl' | 'shift'
}

/**
 * Specification of how to match single-shot input events, used to select actions to invoke in response to key presses.
 * May take the following forms:
 *
 *   - a single character for the key which was pressed (e.g. 'a' or '#')
 *   - the name of a special key (see {@link Key} in ink) (e.g. 'backspace' or 'escape')
 *   - an object with a "key" property and optional "modifier" prop, where:
 *     - key is the same values described above
 *     - modifier is one of 'ctrl', 'meta', or 'shift', specifying which a modifier which must be pressed
 *
 * Note that the shift modifier is NOT passed in cases where the keyboard uses it to resolve a different character. For
 * example:
 *
 *   - shift + l: sends 'L' with no shift modifier
 *   - shift + 3: sends '#' with no shift modifier
 *   - shift + leftArrow: sends "leftArrow" with shift modifier
 */
export type InputMatcher = KeyName | NormalizedInputMatcher

export const normalizeMatcher = (matcher: InputMatcher): NormalizedInputMatcher =>
  typeof matcher === 'string' ?
    {
      key: matcher,
    }
  : matcher

const isMatchingModifier = (expectedModifier: 'ctrl' | 'shift' | undefined, key: Key) => {
  const matches = (modifier: 'ctrl' | 'shift') => (modifier === expectedModifier ? key[modifier] : !key[modifier])
  return matches('ctrl') && matches('shift')
}

/**
 * Determines if an input event (input string and key values) are matched by the specified {@see InputMatcher}.
 */
export const inputMatches = (matcher: InputMatcher, input: string, key: Key): boolean => {
  const normalizedMatcher = normalizeMatcher(matcher)

  const specialKeyStatus = get(key, normalizedMatcher.key) as boolean | undefined
  if (specialKeyStatus === undefined) {
    // for 'shifted' characters we only check control
    return input === normalizedMatcher.key && (normalizedMatcher.modifier === 'ctrl' ? key.ctrl : !key.ctrl)
  } else {
    // for special characters, check state of all modifiers
    return specialKeyStatus && isMatchingModifier(normalizedMatcher.modifier, key)
  }
}

/**
 * Gets a human-readable string representing the key(s) which must be pressed to match the given InputMatcher.
 */
export const getKeyBindString = (input: InputMatcher): string => {
  if (typeof input === 'string') {
    return input
  }
  return input.modifier ? `${input.modifier}+${input.key}` : input.key
}
