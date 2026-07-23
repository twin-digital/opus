import { describe, expect, it } from 'vitest'

import { createWorld, invalidate, InvalidEntityError, livingMob, NotImplementedError, spawnFake } from './index.js'

const spawn = () => {
  const world = createWorld()
  return { world, entity: spawnFake(world, { typeId: 'minecraft:villager_v2' }) }
}

describe('addEffect and getEffect', () => {
  // EF1: canonical storage, both lookup forms, full read-back.
  it('stages an effect readable in canonical form', () => {
    const { entity } = spawn()
    entity.addEffect('resistance', 6000, { amplifier: 255 })

    const effect = entity.getEffect('resistance')
    expect(effect?.typeId).toBe('minecraft:resistance')
    expect(effect?.duration).toBe(6000)
    expect(effect?.amplifier).toBe(255)
    expect(effect?.isValid).toBe(true)
    expect(entity.getEffect('minecraft:resistance')).toBe(effect)
    expect(entity.getEffects()).toEqual([effect])
  })

  // EF2
  it('defaults the amplifier to 0', () => {
    const { entity } = spawn()
    entity.addEffect('speed', 100)
    expect(entity.getEffect('speed')?.amplifier).toBe(0)
  })

  // EF3: replacement is unconditional and observed through existing handles.
  it('replaces amplifier and duration unconditionally', () => {
    const { entity } = spawn()
    const before = entity.addEffect('resistance', 4000, { amplifier: 1 })
    entity.addEffect('resistance', 8000, { amplifier: 3 })

    expect(before?.duration).toBe(8000)
    expect(before?.amplifier).toBe(3)
    expect(entity.getEffects()).toHaveLength(1)
  })

  // EF4: no clock — duration reads as staged, however much else happens in between.
  it('never advances duration', () => {
    const { world } = spawn()
    const mob = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    mob.addEffect('speed', 100)
    expect(mob.applyDamage(5)).toBe(true)
    mob.addEffect('resistance', 50)
    expect(mob.getEffect('speed')?.duration).toBe(100)
  })

  // EF7: the signature-over-prose return choice.
  it('returns the live handle from addEffect', () => {
    const { entity } = spawn()
    const returned = entity.addEffect('resistance', 100)
    expect(returned).toBe(entity.getEffect('resistance'))
  })

  // EF9: EffectType-shaped arguments are accepted.
  it('accepts an EffectType-shaped argument', () => {
    const { entity } = spawn()
    entity.addEffect({ getName: () => 'resistance' }, 100)
    expect(entity.getEffect({ getName: () => 'minecraft:resistance' })?.duration).toBe(100)
  })
})

describe('removeEffect', () => {
  // EF5: removal semantics and the surviving handle.
  it('removes and reports presence; surviving handles turn invalid', () => {
    const { entity } = spawn()
    const effect = entity.addEffect('resistance', 100)

    expect(entity.removeEffect('resistance')).toBe(true)
    expect(entity.removeEffect('resistance')).toBe(false)
    expect(entity.getEffect('resistance')).toBeUndefined()
    expect(entity.getEffects()).toHaveLength(0)

    expect(effect?.isValid).toBe(false)
    expect(() => effect?.duration).toThrow(NotImplementedError)
    expect(() => effect?.amplifier).toThrow(NotImplementedError)
    expect(() => effect?.typeId).toThrow(NotImplementedError)
  })

  // EF10: re-adding creates fresh state; removal is final for the old handle.
  it('does not revive removed handles on re-add', () => {
    const { entity } = spawn()
    const old = entity.addEffect('resistance', 100)
    entity.removeEffect('resistance')
    entity.addEffect('resistance', 200)

    const fresh = entity.getEffect('resistance')
    expect(fresh?.isValid).toBe(true)
    expect(fresh?.duration).toBe(200)
    expect(old?.isValid).toBe(false)
    expect(() => old?.duration).toThrow(NotImplementedError)
  })
})

describe('fidelity limits', () => {
  // EF6: a localized string no fake can produce.
  it('keeps displayName a not-implemented stub on a live effect', () => {
    const { entity } = spawn()
    const effect = entity.addEffect('resistance', 100)
    expect(() => effect?.displayName).toThrow(NotImplementedError)
  })

  // EF8: effects follow their owner into invalidity.
  it('throws InvalidEntityError once the owner is invalid', () => {
    const { entity } = spawn()
    const effect = entity.addEffect('resistance', 100)

    invalidate(entity)
    expect(effect?.isValid).toBe(false)
    expect(() => effect?.duration).toThrow(InvalidEntityError)
    expect(() => effect?.amplifier).toThrow(InvalidEntityError)
    expect(() => effect?.typeId).toThrow(InvalidEntityError)
  })
})
