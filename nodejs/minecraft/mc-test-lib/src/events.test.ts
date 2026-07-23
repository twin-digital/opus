import type { EntityHurtAfterEvent } from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import {
  createWorld,
  emit,
  EntityDamageCause,
  invalidate,
  InvalidEntityError,
  livingMob,
  NotImplementedError,
  spawnFake,
} from './index.js'

describe('subscribe and unsubscribe', () => {
  // EV1
  it('returns the closure, stops on unsubscribe, and delivers again on re-subscribe', () => {
    const world = createWorld()
    const seen: number[] = []
    const handler = (event: EntityHurtAfterEvent) => {
      seen.push(event.damage)
    }
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    const returned = world.afterEvents.entityHurt.subscribe(handler)
    expect(returned).toBe(handler)

    entity.applyDamage(1)
    expect(seen).toEqual([1])

    world.afterEvents.entityHurt.unsubscribe(handler)
    entity.applyDamage(2)
    expect(seen).toEqual([1])

    world.afterEvents.entityHurt.subscribe(handler)
    entity.applyDamage(3)
    expect(seen).toEqual([1, 3])
  })

  // EV2: filtering options are unmodeled.
  it('throws NotImplementedError when options are passed', () => {
    const world = createWorld()
    const noop = () => undefined

    expect(() => world.afterEvents.entityHurt.subscribe(noop, {})).toThrow(NotImplementedError)
    expect(() => world.afterEvents.entityHurt.subscribe(noop, { entityTypes: ['minecraft:zombie'] })).toThrow(
      NotImplementedError,
    )
    expect(() => world.afterEvents.entityHealthChanged.subscribe(noop, {})).toThrow(NotImplementedError)
    expect(() => world.afterEvents.entityDie.subscribe(noop, {})).toThrow(NotImplementedError)
    expect(() => world.afterEvents.entityHurt.subscribe(noop, undefined)).not.toThrow()
  })

  // EV7
  it('ignores unsubscribing a never-subscribed closure', () => {
    const world = createWorld()
    expect(() => {
      world.afterEvents.entityHurt.unsubscribe(() => undefined)
    }).not.toThrow()
  })

  // EV6: synchronous, in subscription order.
  it('delivers synchronously in subscription order', () => {
    const world = createWorld()
    const seen: string[] = []
    world.afterEvents.entityHurt.subscribe(() => seen.push('first'))
    world.afterEvents.entityHurt.subscribe(() => seen.push('second'))

    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    entity.applyDamage(1)
    seen.push('after')
    expect(seen).toEqual(['first', 'second', 'after'])

    seen.length = 0
    emit(world.afterEvents.entityHurt, {
      damage: 1,
      damageSource: { cause: EntityDamageCause.none },
      hurtEntity: entity,
    })
    seen.push('after')
    expect(seen).toEqual(['first', 'second', 'after'])
  })
})

describe('emit', () => {
  // EV3: emit delivers and mutates nothing.
  it('delivers the exact payload to that signal only, mutating nothing', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    const hurtSeen: EntityHurtAfterEvent[] = []
    const otherSeen: string[] = []
    world.afterEvents.entityHurt.subscribe((event) => hurtSeen.push(event))
    world.afterEvents.entityHealthChanged.subscribe(() => otherSeen.push('health'))
    world.afterEvents.entityDie.subscribe(() => otherSeen.push('die'))

    const payload: EntityHurtAfterEvent = {
      damage: 4,
      damageSource: { cause: EntityDamageCause.entityAttack },
      hurtEntity: entity,
    }
    emit(world.afterEvents.entityHurt, payload)

    expect(hurtSeen).toHaveLength(1)
    expect(hurtSeen[0]).toBe(payload)
    expect(otherSeen).toEqual([])
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(20)
  })

  // EV4: the motivating case — delivery to an already-invalidated entity.
  it('delivers events referencing an invalidated entity', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    const caught: unknown[] = []
    world.afterEvents.entityHurt.subscribe((event) => {
      try {
        event.hurtEntity.hasTag('guarded')
      } catch (error) {
        caught.push(error)
      }
    })

    invalidate(entity)
    emit(world.afterEvents.entityHurt, {
      damage: 19,
      damageSource: { cause: EntityDamageCause.entityAttack },
      hurtEntity: entity,
    })

    expect(caught).toHaveLength(1)
    expect(caught[0]).toBeInstanceOf(InvalidEntityError)
  })

  // EV5
  it('throws a TypeError for a foreign signal object', () => {
    const foreign = {
      subscribe: (callback: (event: { value: number }) => void) => callback,
    }
    expect(() => {
      emit(foreign, { value: 1 })
    }).toThrow(TypeError)
  })
})
