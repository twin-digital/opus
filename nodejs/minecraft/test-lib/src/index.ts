/**
 * `@twin-digital/minecraft-test-lib` — in-memory fakes of the `@minecraft/server` object model.
 *
 * A test obtains everything from one call and hands the bundle to the pack under test:
 *
 * ```ts
 * import { createServer, createEntity, addComponent } from '@twin-digital/minecraft-test-lib'
 * import { installMyPack } from '../src/main.js'
 *
 * const server = createServer()
 * installMyPack(server)
 * ```
 *
 * The library never replaces or intercepts the `@minecraft/server` module import: a fake reaches
 * the code under test only as an object the test passes in. Everything the real API cannot express
 * — construction, invalidation, event emission, and reads the real surface has no member for — is
 * a free function over the fakes rather than a member the engine does not have.
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
export { emit, getHandlerErrors, type EmittableSignal } from './events.js'
export { getOutput } from './output.js'
export { asSpawnedEntity, withVanillaDimensions } from './presets.js'
export { advanceTicks } from './scheduler.js'

export {
  ArgumentOutOfBoundsError,
  InvalidArgumentError,
  InvalidEntityError,
  NotImplementedError,
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
