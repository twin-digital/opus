import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import {
  createEntity,
  createServer,
  invalidate,
  InvalidEntityError,
  NotImplementedError,
  UnsetValueError,
  type FakeServer,
} from './index.js'

/** `DisplaySlotId` and its siblings are types-only, so a test names their values as strings. */
const SIDEBAR = 'Sidebar' as MC.DisplaySlotId
const BELOW_NAME = 'BelowName' as MC.DisplaySlotId
const LIST = 'List' as MC.DisplaySlotId
const DESCENDING = 1 as MC.ObjectiveSortOrder

/** The error a call threw, so a case can assert on its class and its fields. */
const thrownBy = (call: () => unknown): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

/** A holder of dynamic properties: the world and every entity carry the same four members. */
interface DynamicPropertyHolder {
  clearDynamicProperties: () => void
  getDynamicProperty: (identifier: string) => boolean | number | string | MC.Vector3 | undefined
  getDynamicPropertyIds: () => string[]
  getDynamicPropertyTotalByteCount: () => number
  setDynamicProperty: (identifier: string, value?: boolean | number | string | MC.Vector3) => void
}

/** An entity to hang properties and scores off. */
const anEntity = (server: FakeServer): MC.Entity => createEntity(server, { typeId: 'minecraft:sheep' })

describe.each<[string, (server: FakeServer) => DynamicPropertyHolder]>([
  ['world', (server) => server.world],
  ['entity', (server) => anEntity(server)],
])('dynamic properties on the %s', (_label, holderOf) => {
  it('holds none to start with', () => {
    expect(holderOf(createServer()).getDynamicPropertyIds()).toEqual([])
  })

  it('reads undefined for an id that was never set', () => {
    expect(holderOf(createServer()).getDynamicProperty('nope')).toBeUndefined()
  })

  it('round-trips a boolean, a number, a string and a Vector3', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('flag', true)
    holder.setDynamicProperty('count', -3.5)
    holder.setDynamicProperty('label', 'hello')
    holder.setDynamicProperty('spot', { x: 1, y: 2, z: 3 })
    expect(holder.getDynamicProperty('flag')).toBe(true)
    expect(holder.getDynamicProperty('count')).toBe(-3.5)
    expect(holder.getDynamicProperty('label')).toBe('hello')
    expect(holder.getDynamicProperty('spot')).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('overwrites an existing value, including with a different type', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('k', 1)
    holder.setDynamicProperty('k', 'one')
    expect(holder.getDynamicProperty('k')).toBe('one')
    expect(holder.getDynamicPropertyIds()).toEqual(['k'])
  })

  it('clears a property when the value is omitted', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('k', 'v')
    holder.setDynamicProperty('k')
    expect(holder.getDynamicProperty('k')).toBeUndefined()
    expect(holder.getDynamicPropertyIds()).toEqual([])
  })

  it('lists every set id', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('a', 1)
    holder.setDynamicProperty('b', 2)
    holder.setDynamicProperty('c', 3)
    expect([...holder.getDynamicPropertyIds()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('removes everything with clearDynamicProperties', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('a', 1)
    holder.setDynamicProperty('b', 2)
    holder.clearDynamicProperties()
    expect(holder.getDynamicPropertyIds()).toEqual([])
    expect(holder.getDynamicProperty('a')).toBeUndefined()
  })

  it('throws NotImplementedError from getDynamicPropertyTotalByteCount', () => {
    const holder = holderOf(createServer())
    holder.setDynamicProperty('a', 1)
    expect(thrownBy(() => holder.getDynamicPropertyTotalByteCount())).toBeInstanceOf(NotImplementedError)
  })

  it('throws NotImplementedError from setDynamicProperties', () => {
    const holder = holderOf(createServer()) as unknown as { setDynamicProperties: (values: object) => void }
    expect(
      thrownBy(() => {
        holder.setDynamicProperties({ a: 1 })
      }),
    ).toBeInstanceOf(NotImplementedError)
  })
})

describe('dynamic property scope', () => {
  it("keeps each entity's properties separate from the world's and from another entity's", () => {
    const server = createServer()
    const first = anEntity(server)
    const second = anEntity(server)
    server.world.setDynamicProperty('k', 'world')
    first.setDynamicProperty('k', 'first')
    second.setDynamicProperty('k', 'second')
    expect(server.world.getDynamicProperty('k')).toBe('world')
    expect(first.getDynamicProperty('k')).toBe('first')
    expect(second.getDynamicProperty('k')).toBe('second')
  })

  it('keeps two bundles apart', () => {
    const a = createServer()
    const b = createServer()
    a.world.setDynamicProperty('k', 'a')
    expect(b.world.getDynamicProperty('k')).toBeUndefined()
    expect(b.world.getDynamicPropertyIds()).toEqual([])
  })

  it('throws InvalidEntityError from every member on an invalidated entity', () => {
    const server = createServer()
    const entity = anEntity(server)
    entity.setDynamicProperty('k', 1)
    invalidate(entity)
    expect(thrownBy(() => entity.getDynamicProperty('k'))).toBeInstanceOf(InvalidEntityError)
    expect(
      thrownBy(() => {
        entity.setDynamicProperty('k', 2)
      }),
    ).toBeInstanceOf(InvalidEntityError)
    expect(thrownBy(() => entity.getDynamicPropertyIds())).toBeInstanceOf(InvalidEntityError)
    expect(
      thrownBy(() => {
        entity.clearDynamicProperties()
      }),
    ).toBeInstanceOf(InvalidEntityError)
  })

  it('reports arity ahead of the validity guard', () => {
    const server = createServer()
    const entity = anEntity(server)
    invalidate(entity)
    const bare = entity as unknown as Record<string, () => unknown>
    expect(() => bare.getDynamicProperty()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })
})

describe('scoreboard objectives', () => {
  it('holds none on a fresh world', () => {
    expect(createServer().world.scoreboard.getObjectives()).toEqual([])
  })

  it('reads undefined for an unknown objective', () => {
    expect(createServer().world.scoreboard.getObjective('nope')).toBeUndefined()
  })

  it('adds an objective with its id and display name', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills', 'Kills')
    expect(objective.id).toBe('kills')
    expect(objective.displayName).toBe('Kills')
    expect(objective.isValid).toBe(true)
  })

  it('returns the same objective object from getObjective', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills', 'Kills')
    expect(scoreboard.getObjective('kills')).toBe(objective)
  })

  it('lists every objective in creation order', () => {
    const { scoreboard } = createServer().world
    const first = scoreboard.addObjective('a', 'A')
    const second = scoreboard.addObjective('b', 'B')
    const third = scoreboard.addObjective('c', 'C')
    expect(scoreboard.getObjectives()).toEqual([first, second, third])
  })

  it('throws UnsetValueError reading displayName of an objective added without one', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills')
    expect(objective.id).toBe('kills')
    const error = thrownBy(() => objective.displayName)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toBe('ScoreboardObjective.displayName')
  })

  it('removes an objective by id and by object', () => {
    const { scoreboard } = createServer().world
    scoreboard.addObjective('a', 'A')
    const second = scoreboard.addObjective('b', 'B')
    expect(scoreboard.removeObjective('a')).toBe(true)
    expect(scoreboard.getObjective('a')).toBeUndefined()
    expect(scoreboard.removeObjective(second)).toBe(true)
    expect(scoreboard.getObjectives()).toEqual([])
  })

  it('returns false removing an objective that is not there', () => {
    const { scoreboard } = createServer().world
    expect(scoreboard.removeObjective('nope')).toBe(false)
  })

  it('turns a removed objective invalid', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills', 'Kills')
    scoreboard.removeObjective('kills')
    expect(objective.isValid).toBe(false)
  })
})

describe('scores', () => {
  it('round-trips a score for an entity participant', () => {
    const server = createServer()
    const entity = anEntity(server)
    const objective = server.world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore(entity, 7)
    expect(objective.getScore(entity)).toBe(7)
  })

  it('round-trips a score for a fake-player string participant', () => {
    const objective = createServer().world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore('global', 3)
    expect(objective.getScore('global')).toBe(3)
  })

  it('round-trips a score for a ScoreboardIdentity participant', () => {
    const server = createServer()
    const entity = anEntity(server)
    const identity = entity.scoreboardIdentity
    expect(identity).toBeDefined()
    const objective = server.world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore(identity as MC.ScoreboardIdentity, 5)
    expect(objective.getScore(entity)).toBe(5)
  })

  it('reads undefined for a participant with no score', () => {
    const server = createServer()
    const entity = anEntity(server)
    const objective = server.world.scoreboard.addObjective('kills', 'Kills')
    expect(objective.getScore(entity)).toBeUndefined()
    expect(objective.getScore('nobody')).toBeUndefined()
  })

  it('overwrites a score', () => {
    const objective = createServer().world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore('global', 1)
    objective.setScore('global', 2)
    expect(objective.getScore('global')).toBe(2)
    expect(objective.getParticipants()).toHaveLength(1)
  })

  it('lists participants once each, in first-set order', () => {
    const server = createServer()
    const entity = anEntity(server)
    const objective = server.world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore(entity, 1)
    objective.setScore('global', 3)
    objective.setScore(entity, 2)
    const participants = objective.getParticipants()
    expect(participants).toHaveLength(2)
    expect(participants[0]).toBe(entity.scoreboardIdentity)
    expect(objective.getScore(participants[1])).toBe(3)
  })

  it('returns a participant-and-score pair per participant from getScores', () => {
    const server = createServer()
    const entity = anEntity(server)
    const objective = server.world.scoreboard.addObjective('kills', 'Kills')
    objective.setScore(entity, 4)
    objective.setScore('global', 9)
    expect(objective.getScores()).toEqual([
      { participant: entity.scoreboardIdentity, score: 4 },
      { participant: objective.getParticipants()[1], score: 9 },
    ])
  })

  it('keeps scores per objective', () => {
    const { scoreboard } = createServer().world
    const first = scoreboard.addObjective('a', 'A')
    const second = scoreboard.addObjective('b', 'B')
    first.setScore('global', 1)
    second.setScore('global', 2)
    expect(first.getScore('global')).toBe(1)
    expect(second.getScore('global')).toBe(2)
  })

  it('throws NotImplementedError from addScore, hasParticipant and removeParticipant', () => {
    const objective = createServer().world.scoreboard.addObjective('kills', 'Kills')
    expect(thrownBy(() => objective.addScore('global', 1))).toBeInstanceOf(NotImplementedError)
    expect(thrownBy(() => objective.hasParticipant('global'))).toBeInstanceOf(NotImplementedError)
    expect(thrownBy(() => objective.removeParticipant('global'))).toBeInstanceOf(NotImplementedError)
  })
})

describe('display slots', () => {
  it('reads undefined for an unassigned slot', () => {
    expect(createServer().world.scoreboard.getObjectiveAtDisplaySlot(SIDEBAR)).toBeUndefined()
  })

  it('reads back the objective and sort order assigned to a slot', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills', 'Kills')
    scoreboard.setObjectiveAtDisplaySlot(SIDEBAR, { objective, sortOrder: DESCENDING })
    const shown = scoreboard.getObjectiveAtDisplaySlot(SIDEBAR)
    expect(shown?.objective).toBe(objective)
    expect(shown?.sortOrder).toBe(DESCENDING)
  })

  it('omits sortOrder when none was given', () => {
    const { scoreboard } = createServer().world
    const objective = scoreboard.addObjective('kills', 'Kills')
    scoreboard.setObjectiveAtDisplaySlot(SIDEBAR, { objective })
    expect(scoreboard.getObjectiveAtDisplaySlot(SIDEBAR)?.sortOrder).toBeUndefined()
  })

  it('returns the previous objective when a slot is reassigned, and undefined the first time', () => {
    const { scoreboard } = createServer().world
    const first = scoreboard.addObjective('a', 'A')
    const second = scoreboard.addObjective('b', 'B')
    expect(scoreboard.setObjectiveAtDisplaySlot(SIDEBAR, { objective: first })).toBeUndefined()
    expect(scoreboard.setObjectiveAtDisplaySlot(SIDEBAR, { objective: second })).toBe(first)
    expect(scoreboard.getObjectiveAtDisplaySlot(SIDEBAR)?.objective).toBe(second)
  })

  it('keeps the three slots independent', () => {
    const { scoreboard } = createServer().world
    const first = scoreboard.addObjective('a', 'A')
    const second = scoreboard.addObjective('b', 'B')
    scoreboard.setObjectiveAtDisplaySlot(SIDEBAR, { objective: first })
    scoreboard.setObjectiveAtDisplaySlot(BELOW_NAME, { objective: second })
    expect(scoreboard.getObjectiveAtDisplaySlot(SIDEBAR)?.objective).toBe(first)
    expect(scoreboard.getObjectiveAtDisplaySlot(BELOW_NAME)?.objective).toBe(second)
    expect(scoreboard.getObjectiveAtDisplaySlot(LIST)).toBeUndefined()
  })

  it('throws NotImplementedError from clearObjectiveAtDisplaySlot and Scoreboard.getParticipants', () => {
    const { scoreboard } = createServer().world
    expect(thrownBy(() => scoreboard.clearObjectiveAtDisplaySlot(SIDEBAR))).toBeInstanceOf(NotImplementedError)
    expect(thrownBy(() => scoreboard.getParticipants())).toBeInstanceOf(NotImplementedError)
  })
})

describe('entity.scoreboardIdentity', () => {
  it('gives an entity a participant identity', () => {
    const identity = anEntity(createServer()).scoreboardIdentity
    expect(identity).toBeDefined()
    expect(typeof identity?.id).toBe('number')
    expect(identity?.isValid).toBe(true)
  })

  it('returns the same identity on every read', () => {
    const entity = anEntity(createServer())
    expect(entity.scoreboardIdentity).toBe(entity.scoreboardIdentity)
  })

  it('gives distinct entities distinct identities', () => {
    const server = createServer()
    const first = anEntity(server)
    const second = anEntity(server)
    expect(first.scoreboardIdentity).not.toBe(second.scoreboardIdentity)
    expect(first.scoreboardIdentity?.id).not.toBe(second.scoreboardIdentity?.id)
  })

  it('resolves back to its entity through getEntity', () => {
    const entity = anEntity(createServer())
    expect(entity.scoreboardIdentity?.getEntity()).toBe(entity)
  })

  it('reads undefined on an invalidated entity', () => {
    const entity = anEntity(createServer())
    invalidate(entity)
    expect(entity.scoreboardIdentity).toBeUndefined()
  })

  it("keeps two bundles' scoreboards apart", () => {
    const a = createServer()
    const b = createServer()
    a.world.scoreboard.addObjective('kills', 'Kills').setScore('global', 5)
    expect(b.world.scoreboard.getObjectives()).toEqual([])
    expect(b.world.scoreboard.getObjective('kills')).toBeUndefined()
  })
})
