/**
 * A subscribe options argument filters delivery on the five signals the fakes raise, honouring
 * every field those signals declare, and throws NotImplementedError naming the field anywhere
 * else — at the subscribe call rather than at dispatch, so a test that cannot be filtered says so
 * before it runs.
 *
 * The readings the fields follow are the observed ones: fields intersect; `entityTypes` matches the
 * subject entity's prefixed typeId and nothing else; `entities` is an instance filter.
 */

import type * as MC from '@minecraft/server'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  addComponent,
  createEntity,
  createServer,
  NotImplementedError,
  withVanillaDimensions,
  type FakeServer,
} from './index.js'

let server: FakeServer
let sheep: MC.Entity
let pig: MC.Entity

/** An entity that can be hurt: applyDamage on one carrying no health component is a no-op. */
const living = (typeId: string, tags: string[] = []): MC.Entity => {
  const entity = createEntity(server, { typeId, dimension: server.world.getDimension('overworld') })
  addComponent(entity, 'minecraft:health', 20)
  for (const tag of tags) {
    entity.addTag(tag)
  }
  return entity
}

beforeEach(() => {
  server = createServer()
  withVanillaDimensions(server)
  sheep = living('minecraft:sheep')
  pig = living('minecraft:pig')
})

describe('entityTypes', () => {
  it('delivers only events whose subject entity matches', () => {
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      (event) => {
        seen.push(event.hurtEntity.typeId)
      },
      { entityTypes: ['minecraft:sheep'] },
    )
    sheep.applyDamage(1)
    pig.applyDamage(1)
    expect(seen).toEqual(['minecraft:sheep'])
  })

  it('matches the prefixed id only, with no normalisation and no error', () => {
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      () => {
        seen.push('bare')
      },
      { entityTypes: ['sheep'] },
    )
    sheep.applyDamage(1)
    expect(seen).toEqual([])
  })
})

describe('entities', () => {
  it('is an instance filter, not a type filter', () => {
    const other = living('minecraft:sheep')
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      (event) => {
        seen.push(event.hurtEntity.id)
      },
      { entities: [sheep] },
    )
    sheep.applyDamage(1)
    other.applyDamage(1)
    expect(seen).toEqual([sheep.id])
  })
})

describe('allowedDamageCauses', () => {
  it('filters on the cause the action reports', () => {
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      (event) => {
        seen.push(event.damageSource.cause)
      },
      { allowedDamageCauses: ['entityAttack' as MC.EntityDamageCause] },
    )
    sheep.applyDamage(1, { cause: 'entityAttack' as MC.EntityDamageCause })
    sheep.applyDamage(1, { cause: 'fall' as MC.EntityDamageCause })
    expect(seen).toEqual(['entityAttack'])
  })
})

describe('entityFilter', () => {
  it('runs the same six-field matcher an entity lookup runs', () => {
    const tagged = living('minecraft:sheep', ['keeper'])
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      (event) => {
        seen.push(event.hurtEntity.id)
      },
      { entityFilter: { tags: ['keeper'] } },
    )
    tagged.applyDamage(1)
    sheep.applyDamage(1)
    expect(seen).toEqual([tagged.id])
  })
})

describe('two fields', () => {
  it('intersect — a handler carrying both receives only what matches both', () => {
    const taggedSheep = living('minecraft:sheep', ['keeper'])
    const taggedPig = living('minecraft:pig', ['keeper'])
    const seen: string[] = []
    server.world.afterEvents.entityHurt.subscribe(
      (event) => {
        seen.push(event.hurtEntity.id)
      },
      { entityTypes: ['minecraft:sheep'], entityFilter: { tags: ['keeper'] } },
    )
    taggedSheep.applyDamage(1)
    taggedPig.applyDamage(1)
    sheep.applyDamage(1)
    expect(seen).toEqual([taggedSheep.id])
  })
})

describe('an unhonoured filter', () => {
  it('throws at the subscribe call, naming the field', () => {
    const error = (() => {
      try {
        server.world.afterEvents.entityHurt.subscribe(() => undefined, {
          blockTypes: ['minecraft:stone'],
        } as unknown as MC.EntityHurtAfterEventOptions)
      } catch (caught) {
        return caught
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toMatch(/blockTypes/)
  })

  it('throws for any options argument on a signal the fakes do not raise', () => {
    const error = (() => {
      try {
        server.world.afterEvents.playerBreakBlock.subscribe(() => undefined, {
          entityTypes: ['minecraft:sheep'],
        } as never)
      } catch (caught) {
        return caught
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toMatch(/entityTypes/)
  })

  it('leaves nothing subscribed when it throws', () => {
    let calls = 0
    try {
      server.world.afterEvents.entityHurt.subscribe(
        () => {
          calls += 1
        },
        { blockTypes: ['minecraft:stone'] } as unknown as MC.EntityHurtAfterEventOptions,
      )
    } catch {
      // the subscription is what is being asserted on
    }
    sheep.applyDamage(1)
    expect(calls).toBe(0)
  })
})

describe('an unfiltered subscription beside a filtered one', () => {
  it('still receives every event', () => {
    let all = 0
    let filtered = 0
    server.world.afterEvents.entityHurt.subscribe(() => {
      all += 1
    })
    server.world.afterEvents.entityHurt.subscribe(
      () => {
        filtered += 1
      },
      { entityTypes: ['minecraft:sheep'] },
    )
    sheep.applyDamage(1)
    pig.applyDamage(1)
    expect(all).toBe(2)
    expect(filtered).toBe(1)
  })
})
