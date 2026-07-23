/**
 * The world-store: per-test records owning all fake state. Entity and component fakes are thin
 * handles over these records — methods mutate the record, every handle to the same entity
 * observes the result, and invalidation removes the record from the store while existing
 * handles survive to throw.
 */
import type { Vector3 } from '@minecraft/server'

import type { FakeEntityAttributeComponent } from '../components.js'
import type { FakeEffect } from '../effects.js'
import type { FakeEntity } from '../entity.js'
import type { FakeWorldAfterEvents } from '../events.js'
import type { FakeDimension } from '../world.js'

/** Full value set of one attribute-shaped component; no bound is derived from another. */
export interface AttributeState {
  current: number
  default: number
  min: number
  max: number
}

/** State of one applied effect. Replaced in place by `addEffect`; flagged when removed. */
export interface EffectState {
  /** Canonical (`minecraft:`-prefixed) effect type id. */
  typeId: string
  amplifier: number
  duration: number
  /** Set when the effect is removed; surviving handles read this to answer `isValid`. */
  removed: boolean
  /** The one `Effect` handle vended for this state. */
  handle: FakeEffect
}

/**
 * The record backing one entity. Handles keep a direct reference; the store's `entities` map
 * holds only live records, so unloading is `valid = false` plus removal from the map — the
 * record's identity fields stay readable through surviving handles.
 */
export interface EntityRecord {
  id: string
  /** Canonical (`minecraft:`-prefixed) entity type id. */
  typeId: string
  nameTag: string
  /** Unstaged when the spawn spec omitted `location`; reads then throw `NotImplementedError`. */
  location: Vector3 | undefined
  /** Canonical dimension id; unstaged when the spawn spec omitted `dimension`. */
  dimensionId: string | undefined
  tags: Set<string>
  /** Attribute state keyed by canonical component id. */
  components: Map<string, AttributeState>
  /** Effect state keyed by canonical effect type id. */
  effects: Map<string, EffectState>
  valid: boolean
  /** The one `Entity` handle vended for this record. */
  handle: FakeEntity
  /** Component handles vended so far, keyed by canonical component id. */
  componentHandles: Map<string, FakeEntityAttributeComponent>
}

/**
 * All state belonging to one created world. Nothing lives at module level: isolation between
 * tests is object lifetime — make a new world.
 */
export interface WorldStore {
  /** Live entity records by entity id. Invalidated records are removed. */
  entities: Map<string, EntityRecord>
  /** The three vanilla dimensions, keyed by canonical dimension id. */
  dimensions: Map<string, FakeDimension>
  afterEvents: FakeWorldAfterEvents
  /** Source of the synthetic, unique, opaque ids `spawnFake` assigns. */
  nextEntityOrdinal: number
}

/**
 * Unloads a record: `isValid` turns false, the store stops answering for it, and it leaves
 * its dimension's entity set. The record object itself survives for the handles that hold it.
 */
export const invalidateRecord = (store: WorldStore, record: EntityRecord): void => {
  record.valid = false
  store.entities.delete(record.id)
}
