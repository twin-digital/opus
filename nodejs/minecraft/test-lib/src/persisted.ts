/**
 * The state a pack persists: dynamic properties on the world and on every entity, and the
 * scoreboard with its objectives, scores, participants and display slots. Both are real storage —
 * what the code under test wrote is what a test reads back — and neither is a stub.
 */

import type * as MC from '@minecraft/server'

import { InvalidArgumentError, UnsetValueError } from './errors.js'
import { construct } from './runtime/construct.js'
import { isValidFake, registerBehaviour, stateOf, type ClassBehaviour } from './runtime/member.js'
import {
  dataOf,
  entityDataOf,
  serverOf,
  type DynamicPropertyValue,
  type EntityData,
  type ObjectiveState,
  type ScoreboardState,
  type ServerState,
} from './runtime/state.js'

// ---------------------------------------------------------------------------
// Dynamic properties
// ---------------------------------------------------------------------------

/**
 * A stored value, detached from the caller's. The engine marshals a dynamic property across the
 * native boundary, so neither a write nor a read shares an object with what a pack is holding.
 */
const detached = (value: DynamicPropertyValue): DynamicPropertyValue =>
  typeof value === 'object' ? { x: value.x, y: value.y, z: value.z } : value

/** The four members, over whichever per-object map the class they sit on keeps. */
const dynamicProperties = (mapOf: (fake: object) => Map<string, DynamicPropertyValue>): ClassBehaviour => ({
  getDynamicProperty: (fake: object, identifier: string) => {
    const value = mapOf(fake).get(identifier)
    return value === undefined ? undefined : detached(value)
  },
  getDynamicPropertyIds: (fake: object) => [...mapOf(fake).keys()],
  clearDynamicProperties: (fake: object) => {
    mapOf(fake).clear()
  },
  // An omitted value removes the property, which is the only reading its optional parameter has.
  setDynamicProperty: (fake: object, identifier: string, value?: DynamicPropertyValue) => {
    const map = mapOf(fake)
    if (value === undefined) {
      map.delete(identifier)
    } else {
      map.set(identifier, detached(value))
    }
  },
})

registerBehaviour(
  'World',
  dynamicProperties((fake) => serverOf(fake).dynamicProperties),
)

const entityDynamicProperties = dynamicProperties((fake) => dataOf<EntityData>(fake).dynamicProperties)
registerBehaviour('Entity', entityDynamicProperties)
registerBehaviour('Player', entityDynamicProperties)

// ---------------------------------------------------------------------------
// Scoreboard participants
// ---------------------------------------------------------------------------

/** The state behind a `ScoreboardIdentity`: which participant it stands for. */
interface IdentityData {
  readonly server: ServerState
  readonly key: string
  readonly id: number
  readonly entity?: EntityData
}

/** How a score is keyed: an entity by its id, a fake player by its name. */
const entityKey = (data: EntityData): string => `entity:${data.id}`
const fakePlayerKey = (name: string): string => `fake-player:${name}`

/** The identity registry a bundle issues from, built on first use. */
const registryOf = (scoreboard: ScoreboardState): Map<string, MC.ScoreboardIdentity> =>
  (scoreboard.identities ??= new Map<string, MC.ScoreboardIdentity>())

/** The identity for one participant key, issued once and handed out unchanged after that. */
const identityFor = (server: ServerState, key: string, entity?: EntityData): MC.ScoreboardIdentity => {
  const registry = registryOf(server.scoreboard)
  const existing = registry.get(key)
  if (existing) {
    return existing
  }
  const id = server.scoreboard.nextIdentityId ?? 1
  server.scoreboard.nextIdentityId = id + 1
  const identity = construct('ScoreboardIdentity', {
    data: { server, key, id, entity } satisfies IdentityData,
    owner: entity ? stateOf(entity.entity) : undefined,
  }) as MC.ScoreboardIdentity
  registry.set(key, identity)
  return identity
}

/** The identity of an entity, which `entity.scoreboardIdentity` hands out. */
const identityOfEntity = (data: EntityData): MC.ScoreboardIdentity =>
  (data.scoreboardIdentity ??= identityFor(data.server, entityKey(data), data))

/** All state is instance-scoped, so a participant from another bundle names nothing here. */
const ownedBy = (server: ServerState, owner: ServerState, participant: object): void => {
  if (owner !== server) {
    throw new InvalidArgumentError(
      `Invalid value passed to argument [0]. ${stateOf(participant).className} belongs to another server`,
    )
  }
}

/** The key and identity behind any of the three participant forms the declarations accept. */
const resolveParticipant = (
  server: ServerState,
  participant: MC.Entity | MC.ScoreboardIdentity | string,
): { key: string; identity: MC.ScoreboardIdentity } => {
  if (typeof participant === 'string') {
    const key = fakePlayerKey(participant)
    return { key, identity: identityFor(server, key) }
  }
  if (stateOf(participant).className === 'ScoreboardIdentity') {
    const data = dataOf<IdentityData>(participant)
    ownedBy(server, data.server, participant)
    return { key: data.key, identity: participant as MC.ScoreboardIdentity }
  }
  const data = entityDataOf(participant as MC.Entity)
  ownedBy(server, data.server, participant)
  return { key: entityKey(data), identity: identityOfEntity(data) }
}

registerBehaviour('ScoreboardIdentity', {
  id: (fake: object) => dataOf<IdentityData>(fake).id,
  isValid: (fake: object) => isValidFake(stateOf(fake)),
  getEntity: (fake: object) => dataOf<IdentityData>(fake).entity?.entity,
})

/**
 * Registered here rather than beside the entity's own fields: the identity is scoreboard state,
 * issued on the first read and stable after it. It reads `undefined` on an invalidated reference,
 * which is one of the four members that stay readable there.
 */
const scoreboardIdentity = (fake: object): MC.ScoreboardIdentity | undefined =>
  isValidFake(stateOf(fake)) ? identityOfEntity(dataOf<EntityData>(fake)) : undefined

registerBehaviour('Entity', { scoreboardIdentity })
registerBehaviour('Player', { scoreboardIdentity })

// ---------------------------------------------------------------------------
// Objectives and scores
// ---------------------------------------------------------------------------

/** The state behind a `ScoreboardObjective`. */
interface ObjectiveData {
  readonly server: ServerState
  readonly state: ObjectiveState
}

const objectiveStateOf = (fake: object): ObjectiveState => dataOf<ObjectiveData>(fake).state

registerBehaviour('ScoreboardObjective', {
  id: (fake: object) => objectiveStateOf(fake).id,
  isValid: (fake: object) => isValidFake(stateOf(fake)),
  displayName: (fake: object) => {
    const { displayName } = objectiveStateOf(fake)
    if (displayName === undefined) {
      throw new UnsetValueError('ScoreboardObjective.displayName')
    }
    return displayName
  },

  setScore: (fake: object, participant: MC.Entity | MC.ScoreboardIdentity | string, score: number) => {
    const { server, state } = dataOf<ObjectiveData>(fake)
    const { key, identity } = resolveParticipant(server, participant)
    state.scores.set(key, score)
    state.participants.set(key, identity)
  },
  getScore: (fake: object, participant: MC.Entity | MC.ScoreboardIdentity | string) => {
    const { server, state } = dataOf<ObjectiveData>(fake)
    return state.scores.get(resolveParticipant(server, participant).key)
  },
  getScores: (fake: object) => {
    const state = objectiveStateOf(fake)
    return [...state.participants].map(([key, participant]) => ({ participant, score: state.scores.get(key) ?? 0 }))
  },
  getParticipants: (fake: object) => [...objectiveStateOf(fake).participants.values()],
})

registerBehaviour('Scoreboard', {
  addObjective: (fake: object, objectiveId: string, displayName?: string) => {
    const server = serverOf(fake)
    if (server.scoreboard.objectives.has(objectiveId)) {
      throw new InvalidArgumentError(`Invalid value passed to argument [0]. Objective ${objectiveId} already exists`)
    }
    const state: ObjectiveState = {
      id: objectiveId,
      displayName,
      // Filled the moment the fake exists: the state and the fake each need the other.
      objective: undefined as unknown as MC.ScoreboardObjective,
      scores: new Map(),
      participants: new Map(),
    }
    const objective = construct('ScoreboardObjective', {
      data: { server, state } satisfies ObjectiveData,
    }) as MC.ScoreboardObjective
    ;(state as { objective: MC.ScoreboardObjective }).objective = objective
    server.scoreboard.objectives.set(objectiveId, state)
    return objective
  },

  getObjective: (fake: object, objectiveId: string) => serverOf(fake).scoreboard.objectives.get(objectiveId)?.objective,
  getObjectives: (fake: object) => [...serverOf(fake).scoreboard.objectives.values()].map((state) => state.objective),

  removeObjective: (fake: object, objective: MC.ScoreboardObjective | string) => {
    const server = serverOf(fake)
    const objectiveId = typeof objective === 'string' ? objective : objectiveStateOf(objective).id
    const state = server.scoreboard.objectives.get(objectiveId)
    if (!state) {
      return false
    }
    server.scoreboard.objectives.delete(objectiveId)
    // A slot showing it is cleared with it: a display slot never holds a dead objective.
    for (const [slot, shown] of server.scoreboard.displaySlots) {
      if (shown.objective === state.objective) {
        server.scoreboard.displaySlots.delete(slot)
      }
    }
    stateOf(state.objective).valid = false
    return true
  },

  getObjectiveAtDisplaySlot: (fake: object, displaySlotId: MC.DisplaySlotId) =>
    serverOf(fake).scoreboard.displaySlots.get(displaySlotId),
  setObjectiveAtDisplaySlot: (
    fake: object,
    displaySlotId: MC.DisplaySlotId,
    setting: MC.ScoreboardObjectiveDisplayOptions,
  ) => {
    const { displaySlots } = serverOf(fake).scoreboard
    const previous = displaySlots.get(displaySlotId)?.objective
    displaySlots.set(displaySlotId, {
      objective: setting.objective,
      ...(setting.sortOrder !== undefined && { sortOrder: setting.sortOrder }),
    })
    return previous
  },
})
