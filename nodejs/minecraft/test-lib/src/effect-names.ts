/**
 * The base display names the library ships for the vanilla effect types, and the amplifier→numeral
 * mapping computed over a base.
 *
 * Nothing pins a display name at build time — `@minecraft/vanilla-data` ships ids and no names, and
 * every type `EffectTypes.getAll()` returns answers `getName()` with its own identifier — so the
 * strings below are the ones a real server returned, transcribed byte for byte from the effect-name
 * probe's per-type SUMMARY lines. They are **not** derived from the identifiers and must not be
 * regenerated from them: `minecraft:breath_of_the_nautilus` carries a leading space that comes
 * straight from the engine's localisation data, `minecraft:fatal_poison` reads `Poison`, and
 * `minecraft:village_hero` reads `Hero of the Village`. Normalising any of them breaks the fake's
 * agreement with the engine.
 *
 * They are one locale's strings; `registerEffectBaseName` overrides a base for a test that needs
 * another. `minecraft:empty` — the 38th type the registry carries and `@minecraft/vanilla-data`
 * does not — has no observed name and so ships none.
 */

/** The 37 observed vanilla base names, keyed by canonical id. Transcribed, never derived. */
export const EFFECT_BASE_NAMES: Readonly<Record<string, string>> = {
  'minecraft:absorption': 'Absorption',
  'minecraft:bad_omen': 'Bad Omen',
  'minecraft:blindness': 'Blindness',
  'minecraft:breath_of_the_nautilus': ' Breath of the Nautilus',
  'minecraft:conduit_power': 'Conduit Power',
  'minecraft:darkness': 'Darkness',
  'minecraft:fatal_poison': 'Poison',
  'minecraft:fire_resistance': 'Fire Resistance',
  'minecraft:haste': 'Haste',
  'minecraft:health_boost': 'Health Boost',
  'minecraft:hunger': 'Hunger',
  'minecraft:infested': 'Infested',
  'minecraft:instant_damage': 'Instant Damage',
  'minecraft:instant_health': 'Instant Health',
  'minecraft:invisibility': 'Invisibility',
  'minecraft:jump_boost': 'Jump Boost',
  'minecraft:levitation': 'Levitation',
  'minecraft:mining_fatigue': 'Mining Fatigue',
  'minecraft:nausea': 'Nausea',
  'minecraft:night_vision': 'Night Vision',
  'minecraft:oozing': 'Oozing',
  'minecraft:poison': 'Poison',
  'minecraft:raid_omen': 'Raid Omen',
  'minecraft:regeneration': 'Regeneration',
  'minecraft:resistance': 'Resistance',
  'minecraft:saturation': 'Saturation',
  'minecraft:slow_falling': 'Slow Falling',
  'minecraft:slowness': 'Slowness',
  'minecraft:speed': 'Speed',
  'minecraft:strength': 'Strength',
  'minecraft:trial_omen': 'Trial Omen',
  'minecraft:village_hero': 'Hero of the Village',
  'minecraft:water_breathing': 'Water Breathing',
  'minecraft:weakness': 'Weakness',
  'minecraft:weaving': 'Weaving',
  'minecraft:wind_charged': 'Wind Charged',
  'minecraft:wither': 'Wither',
}

/**
 * What the engine appends at each amplifier. The numeral is that of *amplifier + 1*, and only from
 * amplifier 1 through 5: amplifier 0 is the bare base, and from 6 to 255 the engine reverts to the
 * bare base again. So a type has six distinct names across the whole accepted range, and a computed
 * `base + roman(amplifier + 1)` would be right for five of the 256 amplifiers and wrong for 251.
 */
const SUFFIX_BY_AMPLIFIER: readonly string[] = ['', ' II', ' III', ' IV', ' V', ' VI']

/** The display name a base reads as at an amplifier. */
export const displayNameOf = (base: string, amplifier: number): string =>
  `${base}${SUFFIX_BY_AMPLIFIER[amplifier] ?? ''}`
