/**
 * Effects: `addEffect` with its return value, argument bounds and coercion, the amplifier-first
 * replacement rule, decaying durations and expiry, `getEffect` / `getEffects` / `removeEffect`, the
 * `effectAdd` before-event, and the effect members on an invalid owner.
 */

import type * as MC from '@minecraft/server'
import { describe, expect, it, vi } from 'vitest'

import {
  advanceTicks,
  ArgumentOutOfBoundsError,
  createEntity,
  createServer,
  getHandlerErrors,
  invalidate,
  InvalidEntityError,
  NotImplementedError,
  registerEffectBaseName,
  UnsetValueError,
} from './index.js'

const SPEED = 'minecraft:speed'
const HASTE = 'minecraft:haste'
const SHEEP = 'minecraft:sheep'

const setup = () => {
  const server = createServer()
  return { server, entity: createEntity(server, { typeId: SHEEP }) }
}

const catchError = (act: () => unknown): unknown => {
  try {
    act()
  } catch (error: unknown) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

/** The amplifier rejection names its parameter after a colon, as `setCurrentValue` does. */
const amplifierBoundsMessage = (value: number) =>
  `Unsupported or out of bounds value passed to function argument [2]: amplifier, Value: ${value}, Argument bounds: [0, 255]`

/** The duration rejection ends the argument index with a period and names no parameter. */
const durationBoundsMessage = (value: number) =>
  `Unsupported or out of bounds value passed to function argument [1]. Value: ${value}, Argument bounds: [1, 20000000]`

describe('addEffect', () => {
  // 1
  it('returns the effect it added', () => {
    const { entity } = setup()
    const effect = entity.addEffect(SPEED, 200, { amplifier: 1 })

    expect(effect).toBeDefined()
    expect(effect!.typeId).toBe(SPEED)
    expect(effect!.duration).toBe(200)
    expect(effect!.amplifier).toBe(1)
    expect(effect!.isValid).toBe(true)
  })

  // 2
  it('returns the effect when it replaces one already present', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 300, { amplifier: 1 })
    const updated = entity.addEffect(SPEED, 600, { amplifier: 2 })

    expect(updated).toBeDefined()
    expect(updated!.amplifier).toBe(2)
    expect(updated!.duration).toBe(600)
  })

  // 3
  it('defaults the amplifier to 0 when no options are given', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200)!.amplifier).toBe(0)
    expect(entity.getEffect(SPEED)!.amplifier).toBe(0)
  })

  // 4
  it('defaults the amplifier to 0 when the options carry no amplifier', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200, { showParticles: true })!.amplifier).toBe(0)
  })

  // 5
  it.each([
    [0, 1],
    [0, 20000000],
    [255, 1],
    [255, 20000000],
    [3, 200],
  ])('stores amplifier %i and duration %i exactly as passed', (amplifier, duration) => {
    const { entity } = setup()
    const effect = entity.addEffect(SPEED, duration, { amplifier })!

    expect(effect.amplifier).toBe(amplifier)
    expect(effect.duration).toBe(duration)
  })

  // 6
  it('accepts a bare effect id and reports the canonical prefixed one', () => {
    const { entity } = setup()

    expect(entity.addEffect('speed', 200)!.typeId).toBe(SPEED)
  })

  // 7
  it('accepts a prefixed effect id and reports it unchanged', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200)!.typeId).toBe(SPEED)
  })

  // 8
  it('makes the effect retrievable through getEffect and getEffects', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 200)

    expect(entity.getEffect(SPEED)).toBeDefined()
    expect(entity.getEffects()).toHaveLength(1)
    expect(entity.getEffects()[0].typeId).toBe(SPEED)
  })

  // 9
  it('throws a TypeError naming both arity bounds before anything else', () => {
    const { entity } = setup()
    const loose = entity.addEffect as unknown as (...args: unknown[]) => unknown

    const error = catchError(() => loose.call(entity, SPEED))
    expect(error).toBeInstanceOf(TypeError)
    expect((error as TypeError).message).toBe('Incorrect number of arguments to function. Expected 2-3, received 1')
  })

  // ruling 18
  it('throws NotImplementedError when passed an EffectType object rather than a string', () => {
    const { entity } = setup()
    const effectType: MC.EffectType = { getName: () => SPEED }

    const error = catchError(() => entity.addEffect(effectType, 200))
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toContain('addEffect')
  })
})

describe('addEffect argument bounds', () => {
  // 10
  it.each([0, 255])('accepts amplifier %i, at its bound', (amplifier) => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200, { amplifier })!.amplifier).toBe(amplifier)
  })

  // 11
  it('rejects an amplifier above 255 with the parameter-naming message', () => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, 200, { amplifier: 256 }))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(
      'Unsupported or out of bounds value passed to function argument [2]: amplifier, Value: 256, Argument bounds: [0, 255]',
    )
  })

  // 12
  it('rejects a negative amplifier with the parameter-naming message', () => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, 200, { amplifier: -1 }))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(amplifierBoundsMessage(-1))
  })

  // 13
  it.each([1, 20000000])('accepts duration %i, at its bound', (duration) => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, duration)!.duration).toBe(duration)
  })

  // 14
  it('rejects a zero duration with the period-terminated message', () => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, 0))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(
      'Unsupported or out of bounds value passed to function argument [1]. Value: 0, Argument bounds: [1, 20000000]',
    )
  })

  // 15
  it.each([-1, -1000])('rejects duration %i with the period-terminated message', (duration) => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, duration))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(durationBoundsMessage(duration))
  })

  // 16
  it('rejects a duration above 20000000', () => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, 20000001))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(durationBoundsMessage(20000001))
  })

  // 17
  it('throws an ArgumentOutOfBoundsError, not a plain Error', () => {
    const { entity } = setup()

    for (const error of [
      catchError(() => entity.addEffect(SPEED, 200, { amplifier: 256 })),
      catchError(() => entity.addEffect(SPEED, 0)),
    ]) {
      expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
      expect((error as Error).name).toBe('ArgumentOutOfBoundsError')
    }
  })

  // 18
  it('adds nothing when it rejects an argument', () => {
    const { entity } = setup()

    expect(() => entity.addEffect(SPEED, 200, { amplifier: 256 })).toThrow()
    expect(() => entity.addEffect(SPEED, 0)).toThrow()
    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(entity.getEffects()).toEqual([])
  })

  // 19
  it('leaves an existing effect untouched when it rejects an argument', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 300, { amplifier: 1 })

    expect(() => entity.addEffect(SPEED, 200, { amplifier: 256 })).toThrow()
    expect(entity.getEffect(SPEED)!.amplifier).toBe(1)
    expect(entity.getEffect(SPEED)!.duration).toBe(300)
  })
})

describe('addEffect non-integer arguments', () => {
  // 20
  it.each([
    [0.5, 0],
    [1.5, 1],
  ])('truncates amplifier %d toward zero, to %i', (given, expected) => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200, { amplifier: given })!.amplifier).toBe(expected)
  })

  it('reads the display name of a truncated amplifier', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200, { amplifier: 1.5 })!.displayName).toBe('Speed II')
  })

  // 21
  it('truncates a fractional duration toward zero', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 1.5)!.duration).toBe(1)
  })

  // 22
  it('bounds-checks the truncated duration, reporting the truncated value', () => {
    const { entity } = setup()

    const error = catchError(() => entity.addEffect(SPEED, 0.5))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect((error as Error).message).toBe(
      'Unsupported or out of bounds value passed to function argument [1]. Value: 0, Argument bounds: [1, 20000000]',
    )
  })

  // 23 — truncation toward zero, not a floor, which would refuse this
  it('truncates a negative fractional amplifier toward zero', () => {
    const { entity } = setup()

    expect(entity.addEffect(SPEED, 200, { amplifier: -0.5 })!.amplifier).toBe(0)
  })

  // 24 / 25 — divergence: the engine refuses these with a TypeError ahead of the bounds check, and
  // the fake does not reproduce that error's shape, so only the refusal itself is pinned.
  it.each([NaN, Infinity, -Infinity])('refuses amplifier %d and adds nothing', (amplifier) => {
    const { entity } = setup()

    expect(() => entity.addEffect(SPEED, 200, { amplifier })).toThrow()
    expect(entity.getEffect(SPEED)).toBeUndefined()
  })

  // 26 / 27
  it.each([NaN, Infinity, -Infinity])('refuses duration %d and adds nothing', (duration) => {
    const { entity } = setup()

    expect(() => entity.addEffect(SPEED, duration)).toThrow()
    expect(entity.getEffect(SPEED)).toBeUndefined()
  })

  // 28 — ruling 34: the fake's own shape, where the engine raises a TypeError ahead of the bounds
  it('refuses NaN and Infinity with an ArgumentOutOfBoundsError', () => {
    const { entity } = setup()

    expect(catchError(() => entity.addEffect(SPEED, 200, { amplifier: NaN }))).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect(catchError(() => entity.addEffect(SPEED, Infinity))).toBeInstanceOf(ArgumentOutOfBoundsError)
  })
})

describe('addEffect replacement rule', () => {
  /** Base is always amplifier 1 / duration 300, the shape the replacement matrix was probed on. */
  const withBase = () => {
    const { server, entity } = setup()
    const base = entity.addEffect(SPEED, 300, { amplifier: 1 })!
    return { server, entity, base }
  }

  // 29
  it.each([
    ['higher-amp/shorter', 2, 100, 2, 100],
    ['higher-amp/longer', 2, 600, 2, 600],
    ['higher-amp/equal', 2, 300, 2, 300],
    ['same-amp/shorter', 1, 100, 1, 300],
    ['same-amp/longer', 1, 600, 1, 600],
    ['same-amp/equal', 1, 300, 1, 300],
    ['lower-amp/shorter', 0, 100, 1, 300],
    ['lower-amp/longer', 0, 600, 1, 300],
    ['lower-amp/equal', 0, 300, 1, 300],
  ])('resolves a %s re-add over amplifier 1 duration 300', (_case, amplifier, duration, expectedAmp, expectedDur) => {
    const { entity } = withBase()
    entity.addEffect(SPEED, duration, { amplifier })

    expect(entity.getEffect(SPEED)!.amplifier).toBe(expectedAmp)
    expect(entity.getEffect(SPEED)!.duration).toBe(expectedDur)
  })

  // 30
  it('treats an equal duration as long enough to replace at an equal amplifier', () => {
    const { entity } = withBase()
    const updated = entity.addEffect(SPEED, 300, { amplifier: 1 })!

    expect(updated.duration).toBe(300)
    expect(entity.getEffect(SPEED)).toBe(updated)
  })

  // 31 — the comparison is against what remains, as the engine's is: 400 applied, 150 ticks gone,
  // so 320 beats the 250 left and replaces where it would have lost to the applied number.
  it('compares against the duration remaining, so a re-add can beat an aged effect', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 400, { amplifier: 1 })
    advanceTicks(server, 150)
    expect(entity.getEffect(SPEED)!.duration).toBe(250)

    entity.addEffect(SPEED, 320, { amplifier: 1 })

    expect(entity.getEffect(SPEED)!.duration).toBe(320)
  })

  // A losing re-add cannot tell the two comparison bases apart — anything under the remaining
  // number is under the applied one too — so this pins what a refusal leaves behind instead.
  it('leaves the survivor untouched and still decaying when a re-add is refused', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 400, { amplifier: 1 })
    advanceTicks(server, 50)

    entity.addEffect(SPEED, 200, { amplifier: 1 })

    // 200 loses to the 350 left, so the aged effect survives and keeps decaying.
    expect(entity.getEffect(SPEED)!.amplifier).toBe(1)
    expect(entity.getEffect(SPEED)!.duration).toBe(350)

    advanceTicks(server, 10)
    expect(entity.getEffect(SPEED)!.duration).toBe(340)
  })

  // 32
  it('returns the new effect when it replaces', () => {
    const { entity } = withBase()
    const updated = entity.addEffect(SPEED, 600, { amplifier: 2 })!

    expect(updated.amplifier).toBe(2)
    expect(updated.duration).toBe(600)
  })

  // 33 — ruling 21
  it('returns the surviving effect when it does not replace', () => {
    const { entity } = withBase()
    const returned = entity.addEffect(SPEED, 100, { amplifier: 0 })

    expect(returned).toBeDefined()
    expect(returned!.amplifier).toBe(1)
    expect(returned!.duration).toBe(300)
  })

  // 34 — ruling 33; the guard table it then throws by is covered under 'invalid owner' below
  it('invalidates the replaced effect', () => {
    const { entity, base } = withBase()
    entity.addEffect(SPEED, 600, { amplifier: 2 })

    expect(base.isValid).toBe(false)
  })

  // 35
  it('leaves the existing effect valid when it does not replace', () => {
    const { entity, base } = withBase()
    entity.addEffect(SPEED, 100, { amplifier: 0 })

    expect(base.isValid).toBe(true)
    expect(base.duration).toBe(300)
  })

  // 36
  it('does not touch a different effect type', () => {
    const { entity } = withBase()
    entity.addEffect(HASTE, 100, { amplifier: 0 })

    expect(entity.getEffect(SPEED)!.duration).toBe(300)
    expect(entity.getEffect(HASTE)!.duration).toBe(100)
    expect(entity.getEffects()).toHaveLength(2)
  })
})

describe('effect duration', () => {
  // 37
  it('reads back the number applied', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.getEffect(SPEED)!.duration).toBe(400)
  })

  it('gives the before-event the requested duration, not what remains of the effect it replaces', () => {
    const { server, entity } = setup()
    const seen: number[] = []
    entity.addEffect(SPEED, 400, { amplifier: 1 })
    advanceTicks(server, 150)
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      seen.push(event.duration)
    })

    entity.addEffect(SPEED, 320, { amplifier: 1 })

    // 320 as asked for — not the 250 remaining, and not the 320 the resulting effect carries.
    expect(seen).toEqual([320])
  })

  // 38 — one per tick advanced, the rate the engine was measured at
  it('loses one per tick the test advances', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 400)

    advanceTicks(server, 100)

    expect(entity.getEffect(SPEED)!.duration).toBe(300)
  })

  it('takes one off every live effect, not just the first', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 5)
    entity.addEffect(HASTE, 2)

    advanceTicks(server, 2)

    expect(entity.getEffect(SPEED)!.duration).toBe(3)
    expect(entity.getEffect(HASTE)).toBeUndefined()
    expect(entity.getEffects()).toHaveLength(1)
  })

  it('reads the same decayed number through every route to it', () => {
    const { server, entity } = setup()
    const handle = entity.addEffect(SPEED, 400)!

    advanceTicks(server, 100)

    expect(handle.duration).toBe(300)
    expect(entity.getEffect(SPEED)!.duration).toBe(300)
    expect(entity.getEffects()[0].duration).toBe(300)
  })

  // A handler may write any number onto the before-event and it is honoured unchecked, so the decay
  // pass has to cope with one that is not a positive number rather than subtracting from it forever.
  it('refuses a handler-written duration that is not a number, leaving the requested one', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      ;(event as unknown as { duration: unknown }).duration = undefined
    })
    entity.addEffect(SPEED, 100)

    // The setter threw, handler isolation absorbed it, and the add ran on what the call asked for.
    expect(entity.getEffect(SPEED)!.duration).toBe(100)
    advanceTicks(server, 1)
    expect(entity.getEffect(SPEED)!.duration).toBe(99)
  })

  it('decays nothing on a server the test never advances', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.getEffect(SPEED)!.duration).toBe(400)
  })

  it('decays only its own server', () => {
    const { server, entity } = setup()
    const other = setup()
    entity.addEffect(SPEED, 100)
    other.entity.addEffect(SPEED, 100)

    advanceTicks(server, 10)

    expect(entity.getEffect(SPEED)!.duration).toBe(90)
    expect(other.entity.getEffect(SPEED)!.duration).toBe(100)
  })

  // The library's own expiry rule: removed on the tick it reaches 0, so 1 is the last readable value.
  it('is readable at one and gone on the next tick', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 3)

    advanceTicks(server, 2)
    expect(entity.getEffect(SPEED)!.duration).toBe(1)

    advanceTicks(server, 1)
    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(entity.getEffects()).toEqual([])
  })

  it('leaves a held handle in the state a removal leaves one', () => {
    const { server, entity } = setup()
    const effect = entity.addEffect(SPEED, 2)!

    advanceTicks(server, 2)

    expect(effect.isValid).toBe(false)
    expect(() => effect.duration).toThrow("Failed to get property 'duration'.")
  })

  it('is already gone for the callbacks of the tick it expired on', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 2)
    const seen: (number | undefined)[] = []
    server.system.runInterval(() => {
      seen.push(entity.getEffect(SPEED)?.duration)
    }, 1)

    advanceTicks(server, 3)

    // Tick 1 reads 1, tick 2 is the expiry, tick 3 confirms it stays gone.
    expect(seen).toEqual([1, undefined, undefined])
  })

  // 40 — 2.8.0 declares no effect-remove or effect-expire signal, so an expiry raises nothing at all
  it('raises no signal whatsoever as ticks pass over an effect, expiry included', () => {
    const { server, entity } = setup()
    entity.addEffect(SPEED, 20)

    // Every declared signal, not just the effectAdd pair: an expiry has nothing to dispatch.
    const delivered: string[] = []
    const containers: unknown[] = [server.world.afterEvents, server.world.beforeEvents]
    for (const container of containers) {
      const signals = container as Record<string, { subscribe: (fn: () => void) => unknown }>
      for (const name in signals) {
        signals[name].subscribe(() => {
          delivered.push(name)
        })
      }
    }

    advanceTicks(server, 1000)

    expect(delivered).toEqual([])
    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(getHandlerErrors(server)).toEqual([])
  })
})

describe('getEffect', () => {
  // 41
  it('returns the effect present for a type', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400, { amplifier: 1 })
    const effect = entity.getEffect(SPEED)!

    expect(effect.typeId).toBe(SPEED)
    expect(effect.amplifier).toBe(1)
    expect(effect.duration).toBe(400)
  })

  // 42
  it('accepts a bare id', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.getEffect('speed')!.typeId).toBe(SPEED)
  })

  // 43
  it('accepts a prefixed id for an effect added bare', () => {
    const { entity } = setup()
    entity.addEffect('speed', 400)

    expect(entity.getEffect(SPEED)).toBe(entity.getEffect('speed'))
  })

  // 44
  it('returns undefined for a type not present', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.getEffect(HASTE)).toBeUndefined()
  })

  // 45
  it('returns undefined for an unknown effect id', () => {
    const { entity } = setup()

    expect(entity.getEffect('mctest:nope')).toBeUndefined()
  })

  // 46
  it('returns the same object across reads', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.getEffect(SPEED)).toBe(entity.getEffect(SPEED))
  })
})

describe('getEffects', () => {
  // 47 — order was never observed, so the ids are compared as a set
  it('returns every effect present', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 100)
    entity.addEffect(HASTE, 100)
    entity.addEffect('minecraft:wither', 100)

    const effects = entity.getEffects()
    expect(effects).toHaveLength(3)
    expect(new Set(effects.map((effect) => effect.typeId))).toEqual(new Set([SPEED, HASTE, 'minecraft:wither']))
  })

  // 48
  it('returns an empty array on an entity with none', () => {
    const { entity } = setup()

    expect(entity.getEffects()).toEqual([])
  })

  // 49
  it('omits a removed effect', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 100)
    entity.addEffect(HASTE, 100)
    entity.removeEffect(SPEED)

    const effects = entity.getEffects()
    expect(effects).toHaveLength(1)
    expect(effects[0].typeId).toBe(HASTE)
  })

  // 50
  it('carries one entry per type after a replacement', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 300, { amplifier: 1 })
    entity.addEffect(SPEED, 600, { amplifier: 2 })

    const effects = entity.getEffects()
    expect(effects).toHaveLength(1)
    expect(effects[0].duration).toBe(600)
  })
})

describe('removeEffect', () => {
  // 51
  it('returns true and removes an effect that was there', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.removeEffect(SPEED)).toBe(true)
    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(entity.getEffects()).toEqual([])
  })

  // 52
  it('returns false when the type is not present', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.removeEffect(HASTE)).toBe(false)
    expect(entity.getEffects()).toHaveLength(1)
  })

  // 53
  it('returns false for an unknown effect id', () => {
    const { entity } = setup()

    expect(entity.removeEffect('mctest:nope')).toBe(false)
  })

  // 54 — ruling 20
  it('accepts a bare id', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)

    expect(entity.removeEffect('speed')).toBe(true)
    expect(entity.getEffect(SPEED)).toBeUndefined()
  })

  // 55
  it('invalidates the removed effect', () => {
    const { entity } = setup()
    const effect = entity.addEffect(SPEED, 400)!
    entity.removeEffect(SPEED)

    expect(effect.isValid).toBe(false)
  })

  // 56
  it('leaves other effects alone', () => {
    const { entity } = setup()
    entity.addEffect(SPEED, 400)
    const haste = entity.addEffect(HASTE, 100)!
    entity.removeEffect(SPEED)

    expect(haste.isValid).toBe(true)
    expect(haste.duration).toBe(100)
  })
})

describe('addEffect and the effectAdd before-event', () => {
  // 57
  it('dispatches effectAdd before the effect exists', () => {
    const { server, entity } = setup()
    const seen: (MC.Effect | undefined)[] = []
    server.world.beforeEvents.effectAdd.subscribe(() => {
      seen.push(entity.getEffect(SPEED))
    })

    entity.addEffect(SPEED, 200)

    expect(seen).toEqual([undefined])
  })

  // 58
  it('delivers the entity and the requested duration on the payload', () => {
    const { server, entity } = setup()
    const payloads: MC.EffectAddBeforeEvent[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      payloads.push(event)
    })

    entity.addEffect(SPEED, 200)

    expect(payloads).toHaveLength(1)
    expect(payloads[0].entity).toBe(entity)
    expect(payloads[0].duration).toBe(200)
  })

  // 59
  it('delivers the display name at the requested amplifier as effectType', () => {
    const { server, entity } = setup()
    const seen: string[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      seen.push(event.effectType)
    })

    entity.addEffect(SPEED, 200, { amplifier: 1 })

    expect(seen).toEqual(['Speed II'])
  })

  // 60
  it('resolves effectType from a base registered before the add', () => {
    const { server, entity } = setup()
    registerEffectBaseName(server, 'mctest:gravity_well', 'Gravity Well')
    const seen: string[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      seen.push(event.effectType)
    })

    entity.addEffect('mctest:gravity_well', 200, { amplifier: 2 })

    expect(seen).toEqual(['Gravity Well III'])
  })

  // 61 — ruling 19: the payload resolves its name lazily
  it('does not throw when a handler never reads effectType for an unregistered custom type', () => {
    const { server, entity } = setup()
    const handler = vi.fn()
    server.world.beforeEvents.effectAdd.subscribe(handler)

    expect(() => entity.addEffect('mctest:unnamed', 200)).not.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(entity.getEffect('mctest:unnamed')).toBeDefined()
  })

  // 62
  it('throws UnsetValueError when a handler reads effectType for an unregistered custom type', () => {
    const { server, entity } = setup()
    const seen: string[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      seen.push(event.effectType)
    })

    entity.addEffect('mctest:unnamed', 200)

    expect(seen).toEqual([])
    const errors = getHandlerErrors(server)
    expect(errors).toHaveLength(1)
    expect(errors[0].error).toBeInstanceOf(UnsetValueError)
  })

  // 63
  it('honours a handler write to duration, upward', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.duration = 600
    })

    const effect = entity.addEffect(SPEED, 100, { amplifier: 1 })!

    expect(effect.duration).toBe(600)
    expect(entity.getEffect(SPEED)!.duration).toBe(600)
  })

  // 64
  it('honours a handler write to duration, downward', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.duration = 100
    })

    expect(entity.addEffect(SPEED, 400, { amplifier: 1 })!.duration).toBe(100)
  })

  // 65 — ruling 22: the bounds check is on the call's own arguments, not on the written value
  it('drops the add on a handler write of zero, where the argument would have thrown', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.duration = 0
    })

    // The field write and the call argument take different validation paths, and disagree here.
    expect(entity.addEffect(SPEED, 200)).toBeUndefined()
    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(() => entity.addEffect(SPEED, 0)).toThrow(ArgumentOutOfBoundsError)
  })

  // 66
  it('returns undefined when a handler cancels', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.cancel = true
    })

    expect(entity.addEffect(SPEED, 200)).toBeUndefined()
  })

  // 67
  it('adds nothing when a handler cancels', () => {
    const { server, entity } = setup()
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.cancel = true
    })

    entity.addEffect(SPEED, 200)

    expect(entity.getEffect(SPEED)).toBeUndefined()
    expect(entity.getEffects()).toEqual([])
  })

  // 68
  it('leaves an existing effect untouched when a handler cancels a replacement', () => {
    const { server, entity } = setup()
    const base = entity.addEffect(SPEED, 300, { amplifier: 1 })!
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.cancel = true
    })

    entity.addEffect(SPEED, 600, { amplifier: 2 })

    expect(base.isValid).toBe(true)
    expect(entity.getEffect(SPEED)!.amplifier).toBe(1)
    expect(entity.getEffect(SPEED)!.duration).toBe(300)
  })

  // 69
  it('raises no effectAdd after-event', () => {
    const { server, entity } = setup()
    const after = vi.fn()
    server.world.afterEvents.effectAdd.subscribe(after)

    entity.addEffect(SPEED, 300, { amplifier: 1 })
    entity.addEffect(SPEED, 600, { amplifier: 2 })

    expect(after).not.toHaveBeenCalled()
  })

  // 70
  it('dispatches once per accepted call and not at all for a rejected argument', () => {
    const { server, entity } = setup()
    const handler = vi.fn()
    server.world.beforeEvents.effectAdd.subscribe(handler)

    expect(() => entity.addEffect(SPEED, 0)).toThrow()
    expect(handler).not.toHaveBeenCalled()

    entity.addEffect(SPEED, 200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('Effect members on an invalid owner', () => {
  /** The four routes an effect reference goes stale by. */
  const routes: readonly [string, (server: ReturnType<typeof createServer>, entity: MC.Entity) => void][] = [
    ['removeEffect', (_server, entity) => entity.removeEffect(SPEED)],
    [
      'replacement',
      (_server, entity) => {
        entity.addEffect(SPEED, 600, { amplifier: 2 })
      },
    ],
    [
      'entity.remove()',
      (_server, entity) => {
        entity.remove()
      },
    ],
    [
      'invalidate(entity)',
      (_server, entity) => {
        invalidate(entity)
      },
    ],
  ]

  const staleEffect = (route: (server: ReturnType<typeof createServer>, entity: MC.Entity) => void) => {
    const { server, entity } = setup()
    const effect = entity.addEffect(SPEED, 400, { amplifier: 1 })!
    route(server, entity)
    return effect
  }

  // 87
  it.each(
    routes.flatMap(([name, route]) =>
      (['amplifier', 'duration', 'typeId', 'displayName'] as const).map(
        (member) =>
          [name, member, route] as [string, 'amplifier' | 'duration' | 'typeId' | 'displayName', typeof route],
      ),
    ),
  )('throws a plain Error from %s.%s', (_route, member, route) => {
    const effect = staleEffect(route)

    const error = catchError(() => effect[member])
    expect((error as object).constructor).toBe(Error)
    expect((error as Error).name).toBe('Error')
    expect(error).not.toBeInstanceOf(InvalidEntityError)
    expect((error as Error).message).toBe(`Failed to get property '${member}'.`)
  })

  // 88
  it.each(routes)('keeps isValid readable and false after %s', (_name, route) => {
    expect(staleEffect(route).isValid).toBe(false)
  })

  // 89
  it('reads every member on a live effect', () => {
    const { entity } = setup()
    const effect = entity.addEffect(SPEED, 400, { amplifier: 1 })!

    expect(effect.isValid).toBe(true)
    expect(effect.typeId).toBe(SPEED)
    expect(effect.duration).toBe(400)
    expect(effect.amplifier).toBe(1)
    expect(effect.displayName).toBe('Speed II')
  })
})
