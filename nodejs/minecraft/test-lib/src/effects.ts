/**
 * Effects: `addEffect`, `getEffect`, `getEffects` and `removeEffect`, the amplifier-first
 * replacement rule, the display-name table with its computed numeral, and the
 * `registerEffectBaseName` free function behind custom types and overrides.
 *
 * An effect's duration is the number applied and stays that number until the effect is removed:
 * advancing ticks does not decay it and never expires an effect.
 */

import type { ServerLike } from './create-server.js'

/**
 * The base display name for an effect type — a name for a custom type, or an override of a shipped
 * one, which is how a test targeting another locale supplies its own strings. The numeral mapping
 * is computed over it, so a registered `"Gravity Well"` reads `"Gravity Well III"` at amplifier 2.
 *
 * It is a free function because `addEffect` takes the engine's own `EntityEffectOptions`, which has
 * no display-name field, and `Effect` has no member to set one through.
 */
export const registerEffectBaseName = (_server: ServerLike, _effectTypeId: string, _baseName: string): void => {
  throw new Error('effect base names are not built yet')
}
