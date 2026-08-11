/**
 * `Effect.displayName`: the shipped table of verbatim vanilla base names, the amplifier→numeral
 * mapping computed over a base, and `registerEffectBaseName` for custom types and overrides.
 */

import { describe, expect, it } from 'vitest'

import { createEntity, createServer, registerEffectBaseName, UnsetValueError } from './index.js'

const SHEEP = 'minecraft:sheep'
const DURATION = 200

const setup = () => {
  const server = createServer()
  return { server, entity: createEntity(server, { typeId: SHEEP }) }
}

/** One amplifier cell, on its own entity so the replacement rule never enters a name walk. */
const addEffect = (server: ReturnType<typeof createServer>, typeId: string, amplifier: number) => {
  const entity = createEntity(server, { typeId: SHEEP })
  return entity.addEffect(typeId, DURATION, { amplifier })!
}

const catchError = (act: () => unknown): unknown => {
  try {
    act()
  } catch (error: unknown) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

/**
 * The 37 vanilla base names, transcribed byte for byte from the mctest5 effect-name probe log
 * (`artifacts/mctest-effect-name-probe-results.md`, the per-type SUMMARY lines). Deliberately not
 * imported from the shipped table: this fixture is the independent record the table is checked
 * against. The leading space on `breath_of_the_nautilus` is the engine's, not a typo.
 */
const VANILLA_BASE_NAMES: readonly (readonly [string, string])[] = [
  ['minecraft:absorption', 'Absorption'],
  ['minecraft:bad_omen', 'Bad Omen'],
  ['minecraft:blindness', 'Blindness'],
  ['minecraft:breath_of_the_nautilus', ' Breath of the Nautilus'],
  ['minecraft:conduit_power', 'Conduit Power'],
  ['minecraft:darkness', 'Darkness'],
  ['minecraft:fatal_poison', 'Poison'],
  ['minecraft:fire_resistance', 'Fire Resistance'],
  ['minecraft:haste', 'Haste'],
  ['minecraft:health_boost', 'Health Boost'],
  ['minecraft:hunger', 'Hunger'],
  ['minecraft:infested', 'Infested'],
  ['minecraft:instant_damage', 'Instant Damage'],
  ['minecraft:instant_health', 'Instant Health'],
  ['minecraft:invisibility', 'Invisibility'],
  ['minecraft:jump_boost', 'Jump Boost'],
  ['minecraft:levitation', 'Levitation'],
  ['minecraft:mining_fatigue', 'Mining Fatigue'],
  ['minecraft:nausea', 'Nausea'],
  ['minecraft:night_vision', 'Night Vision'],
  ['minecraft:oozing', 'Oozing'],
  ['minecraft:poison', 'Poison'],
  ['minecraft:raid_omen', 'Raid Omen'],
  ['minecraft:regeneration', 'Regeneration'],
  ['minecraft:resistance', 'Resistance'],
  ['minecraft:saturation', 'Saturation'],
  ['minecraft:slow_falling', 'Slow Falling'],
  ['minecraft:slowness', 'Slowness'],
  ['minecraft:speed', 'Speed'],
  ['minecraft:strength', 'Strength'],
  ['minecraft:trial_omen', 'Trial Omen'],
  ['minecraft:village_hero', 'Hero of the Village'],
  ['minecraft:water_breathing', 'Water Breathing'],
  ['minecraft:weakness', 'Weakness'],
  ['minecraft:weaving', 'Weaving'],
  ['minecraft:wind_charged', 'Wind Charged'],
  ['minecraft:wither', 'Wither'],
]

/**
 * The suffix the engine appends at each amplifier 0…6, as literals. Hard-coded rather than produced
 * by a numeral helper, so a bug in the implementation's numeral function cannot be mirrored here.
 */
const SUFFIX_BY_AMPLIFIER = ['', ' II', ' III', ' IV', ' V', ' VI', ''] as const

describe('Effect.displayName', () => {
  // 71
  it.each(VANILLA_BASE_NAMES)('resolves %s across amplifiers 0 through 6', (typeId, base) => {
    const server = createServer()

    for (const [amplifier, suffix] of SUFFIX_BY_AMPLIFIER.entries()) {
      expect(addEffect(server, typeId, amplifier).displayName).toBe(`${base}${suffix}`)
    }
  })

  // 72
  it.each([
    ['minecraft:speed', 'Speed'],
    ['minecraft:village_hero', 'Hero of the Village'],
    ['minecraft:breath_of_the_nautilus', ' Breath of the Nautilus'],
  ])('keeps %s at its bare base name for every amplifier above 6', (typeId, base) => {
    const server = createServer()

    for (const amplifier of [7, 8, 42, 128, 254, 255]) {
      expect(addEffect(server, typeId, amplifier).displayName).toBe(base)
    }
  })

  // 73
  it('gives a type exactly six distinct names across the accepted range', () => {
    const server = createServer()
    const names = new Set(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255].map(
        (amplifier) => addEffect(server, 'minecraft:speed', amplifier).displayName,
      ),
    )

    expect(names).toEqual(new Set(['Speed', 'Speed II', 'Speed III', 'Speed IV', 'Speed V', 'Speed VI']))
  })

  // 74
  it('is not base plus the roman numeral of amplifier + 1 outside amplifiers 1 through 5', () => {
    const server = createServer()

    expect(addEffect(server, 'minecraft:speed', 0).displayName).toBe('Speed')
    expect(addEffect(server, 'minecraft:speed', 6).displayName).toBe('Speed')
    expect(addEffect(server, 'minecraft:speed', 6).displayName).not.toBe('Speed VII')
  })

  // 75
  it('preserves the leading space on breath_of_the_nautilus', () => {
    const { entity } = setup()
    const name = entity.addEffect('minecraft:breath_of_the_nautilus', DURATION)!.displayName

    expect(name).toBe(' Breath of the Nautilus')
    expect(name.startsWith(' ')).toBe(true)
  })

  // 76
  it('preserves the leading space on breath_of_the_nautilus at every amplifier', () => {
    const server = createServer()

    expect(addEffect(server, 'minecraft:breath_of_the_nautilus', 1).displayName).toBe(' Breath of the Nautilus II')
    expect(addEffect(server, 'minecraft:breath_of_the_nautilus', 6).displayName).toBe(' Breath of the Nautilus')
  })

  // 77
  it('carries a base the identifier does not spell', () => {
    const server = createServer()

    expect(addEffect(server, 'minecraft:fatal_poison', 0).displayName).toBe('Poison')
    expect(addEffect(server, 'minecraft:village_hero', 0).displayName).toBe('Hero of the Village')
  })

  // 78
  it('ships a base for each of the 37 vanilla types and for no other id', () => {
    const server = createServer()

    expect(VANILLA_BASE_NAMES).toHaveLength(37)
    for (const [typeId] of VANILLA_BASE_NAMES) {
      expect(typeId).toMatch(/^minecraft:[a-z_]+$/)
      expect(() => addEffect(server, typeId, 0).displayName).not.toThrow()
    }

    expect(catchError(() => addEffect(server, 'minecraft:empty', 0).displayName)).toBeInstanceOf(UnsetValueError)
  })

  // 79
  it('resolves through an effect added with a bare id', () => {
    const { entity } = setup()

    expect(entity.addEffect('speed', DURATION, { amplifier: 1 })!.displayName).toBe('Speed II')
  })

  // 80
  it('throws UnsetValueError for minecraft:empty, the 38th registry type with no shipped base', () => {
    const { entity } = setup()
    const effect = entity.addEffect('minecraft:empty', DURATION, { amplifier: 1 })!

    expect(effect.typeId).toBe('minecraft:empty')
    expect(effect.duration).toBe(DURATION)
    expect(effect.amplifier).toBe(1)

    const error = catchError(() => effect.displayName)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('displayName')
  })

  // 81
  it('agrees between the addEffect return and the getEffect read-back', () => {
    const { entity } = setup()

    const speed = entity.addEffect('minecraft:speed', DURATION, { amplifier: 1 })!
    expect(entity.getEffect('minecraft:speed')!.displayName).toBe(speed.displayName)
    expect(speed.displayName).toBe('Speed II')

    const nautilus = entity.addEffect('minecraft:breath_of_the_nautilus', DURATION)!
    expect(entity.getEffect('minecraft:breath_of_the_nautilus')!.displayName).toBe(nautilus.displayName)
    expect(nautilus.displayName).toBe(' Breath of the Nautilus')
  })
})

describe('registerEffectBaseName', () => {
  const CUSTOM = 'mctest:gravity_well'

  // 82
  it('throws UnsetValueError for a custom type with no registered base', () => {
    const { entity } = setup()
    const effect = entity.addEffect(CUSTOM, DURATION, { amplifier: 2 })!

    expect(effect.typeId).toBe(CUSTOM)
    expect(effect.duration).toBe(DURATION)
    expect(effect.amplifier).toBe(2)
    expect(effect.isValid).toBe(true)

    const error = catchError(() => effect.displayName)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).name).toBe('UnsetValueError')
    expect((error as UnsetValueError).member).toContain('displayName')
  })

  // 83
  it.each(SUFFIX_BY_AMPLIFIER.map((suffix, amplifier) => [amplifier, `Gravity Well${suffix}`] as const))(
    'computes the numeral over a registered custom base at amplifier %i',
    (amplifier, expected) => {
      const { server, entity } = setup()
      registerEffectBaseName(server, CUSTOM, 'Gravity Well')

      expect(entity.addEffect(CUSTOM, DURATION, { amplifier })!.displayName).toBe(expected)
    },
  )

  // 84
  it('overrides a shipped vanilla base, which is how another locale is supplied', () => {
    const { server, entity } = setup()
    registerEffectBaseName(server, 'minecraft:speed', 'Schnelligkeit')

    expect(entity.addEffect('minecraft:speed', DURATION)!.displayName).toBe('Schnelligkeit')
    expect(entity.addEffect('minecraft:speed', DURATION, { amplifier: 1 })!.displayName).toBe('Schnelligkeit II')
  })

  // 85
  it('supplies a base for minecraft:empty', () => {
    const { server, entity } = setup()
    registerEffectBaseName(server, 'minecraft:empty', 'Empty')

    expect(entity.addEffect('minecraft:empty', DURATION)!.displayName).toBe('Empty')
    expect(entity.addEffect('minecraft:empty', DURATION, { amplifier: 1 })!.displayName).toBe('Empty II')
  })

  // 86a
  it('is scoped to the server it was registered on', () => {
    const { server, entity } = setup()
    registerEffectBaseName(server, CUSTOM, 'Gravity Well')
    expect(entity.addEffect(CUSTOM, DURATION)!.displayName).toBe('Gravity Well')

    const other = setup()
    expect(catchError(() => other.entity.addEffect(CUSTOM, DURATION)!.displayName)).toBeInstanceOf(UnsetValueError)
  })

  // 86b
  it('is keyed by the canonical id, whichever form either side is written in', () => {
    const bare = setup()
    registerEffectBaseName(bare.server, 'speed', 'Bare')
    expect(bare.entity.addEffect('minecraft:speed', DURATION)!.displayName).toBe('Bare')

    const prefixed = setup()
    registerEffectBaseName(prefixed.server, 'minecraft:speed', 'Prefixed')
    expect(prefixed.entity.addEffect('speed', DURATION)!.displayName).toBe('Prefixed')
  })

  // 86c
  it('replaces a base already registered for the type', () => {
    const { server, entity } = setup()
    registerEffectBaseName(server, CUSTOM, 'First')
    registerEffectBaseName(server, CUSTOM, 'Second')

    expect(entity.addEffect(CUSTOM, DURATION, { amplifier: 1 })!.displayName).toBe('Second II')
  })

  // 86d
  it('is read at read time, so a registration after the add is picked up', () => {
    const { server, entity } = setup()
    const effect = entity.addEffect(CUSTOM, DURATION, { amplifier: 2 })!

    expect(catchError(() => effect.displayName)).toBeInstanceOf(UnsetValueError)

    registerEffectBaseName(server, CUSTOM, 'Gravity Well')
    expect(effect.displayName).toBe('Gravity Well III')
  })
})
