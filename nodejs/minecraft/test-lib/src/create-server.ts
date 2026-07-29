/**
 * `createServer` and the bundle it returns: the one call a test makes to obtain a world, `system`
 * and the registry classes, named exactly as `@minecraft/server` exports them.
 */

import type * as MC from '@minecraft/server'

import { createSignals } from './events.js'
import {
  FakeBiomeTypes,
  FakeBlockStates,
  FakeBlockTypes,
  FakeDimensionTypes,
  FakeEffectTypes,
  FakeEnchantmentTypes,
  FakeEntityTypes,
  FakeItemTypes,
} from './generated/index.js'
import './register.js'
import { construct } from './runtime/construct.js'
import type { ServerState } from './runtime/state.js'
import type { SystemData } from './scheduler.js'
import type { WorldData } from './world.js'

/**
 * What a test is handed: the module's own exported names, so a pack written to receive its engine
 * handles as a parameter can take the whole bundle. All eight registries are declared and every
 * member on them throws — no behaviour in this cycle reads one.
 */
export interface FakeServer {
  readonly world: MC.World
  readonly system: MC.System
  readonly BiomeTypes: typeof MC.BiomeTypes
  readonly BlockStates: typeof MC.BlockStates
  readonly BlockTypes: typeof MC.BlockTypes
  readonly DimensionTypes: typeof MC.DimensionTypes
  readonly EffectTypes: typeof MC.EffectTypes
  readonly EnchantmentTypes: typeof MC.EnchantmentTypes
  readonly EntityTypes: typeof MC.EntityTypes
  readonly ItemTypes: typeof MC.ItemTypes
}

/**
 * A new bundle. It populates nothing: no dimensions, no players, no objectives and no dynamic
 * properties, and every state it holds belongs to it alone — two bundles in one process share
 * nothing, so a test needs no reset hook.
 *
 * @example
 * ```ts
 * const server = createServer()
 * installMyPack(server)   // the pack's own entry point, taking { world, system, … }
 * ```
 */
export const createServer = (): FakeServer => {
  const server: ServerState = {
    world: undefined as unknown as MC.World,
    system: undefined as unknown as MC.System,
    entities: [],
    nextEntityId: 1,
    dimensions: new Map(),
    signals: new Map(),
    handlerErrors: [],
    currentTick: 0,
    nextRunHandle: 1,
    scheduled: [],
    pendingInvalidations: [],
    effectBaseNames: new Map(),
    dynamicProperties: new Map(),
    scoreboard: { objectives: new Map(), displaySlots: new Map() },
    output: [],
  }

  const signals = createSignals(server)
  const scoreboard = construct('Scoreboard', { data: { server } }) as MC.Scoreboard

  server.world = construct('World', {
    data: {
      server,
      afterEvents: signals.worldAfterEvents,
      beforeEvents: signals.worldBeforeEvents,
      scoreboard,
    } satisfies WorldData,
  }) as MC.World

  server.system = construct('System', {
    data: {
      server,
      afterEvents: signals.systemAfterEvents,
      beforeEvents: signals.systemBeforeEvents,
    } satisfies SystemData,
  }) as MC.System

  return {
    world: server.world,
    system: server.system,
    BiomeTypes: FakeBiomeTypes,
    BlockStates: FakeBlockStates,
    BlockTypes: FakeBlockTypes,
    DimensionTypes: FakeDimensionTypes,
    EffectTypes: FakeEffectTypes,
    EnchantmentTypes: FakeEnchantmentTypes,
    EntityTypes: FakeEntityTypes,
    ItemTypes: FakeItemTypes,
  }
}

/** The bundle a free function takes: anything carrying the world it belongs to. */
export type ServerLike = Pick<FakeServer, 'world'>
