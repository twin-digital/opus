/**
 * `@twin-digital/minecraft-test-lib` — in-memory fakes of the `@minecraft/server` object model.
 *
 * A test obtains everything from one call and hands the server to the pack under test:
 *
 * ```ts
 * import { createServer, createEntity, addComponent } from '@twin-digital/minecraft-test-lib'
 * import { installMyPack } from '../src/main.js'
 *
 * const server = createServer()
 * installMyPack(server)
 * ```
 *
 * A suite that injects fake objects into code under test stays supported exactly as written. Code
 * that reaches the engine through a direct `@minecraft/server` import is reached the other way,
 * by pointing the module-scope bindings at the same server — see
 * `@twin-digital/minecraft-test-lib/vitest` for the one configuration entry that arranges it.
 *
 * Everything the real API cannot express — construction, invalidation, event emission, and reads
 * the real surface has no member for — is a free function over the fakes rather than a member the
 * engine does not have.
 */

export { createServer, type FakeServer, type ServerLike } from './create-server.js'
export { addComponent, removeComponent, type ComponentSpec } from './components.js'
export { registerEffectBaseName } from './effects.js'
export {
  createEntity,
  createPlayer,
  getTriggeredEvents,
  invalidate,
  type EntityOptions,
  type PlayerOptions,
} from './entity.js'
export { registerEntityType } from './entity-types.js'
export { emit, getHandlerErrors, type EmittableSignal } from './events.js'
export { getOutput } from './output.js'
export { asSpawnedEntity, withVanillaDimensions, withVanillaEntityTypes, withVanillaWorld } from './presets.js'
export { advanceTicks } from './scheduler.js'

export { __useServer, currentServer } from './shim/bindings.js'
export { SERVER_VERSION } from './generated/shim/version.js'

export {
  ArgumentOutOfBoundsError,
  InvalidArgumentError,
  InvalidEntityError,
  NotImplementedError,
  ShimNotInstalledError,
  ShimServerInUseError,
  UnsetValueError,
} from './errors.js'

export {
  ATTRIBUTE_COMPONENT_IDS,
  type AttributeComponentId,
  type CanonicalAttributeComponentId,
  type CanonicalEntityComponentId,
  type EntityComponentId,
} from './ids.js'

export type { AttributeValues, HandlerError, OutputRecord } from './runtime/state.js'
