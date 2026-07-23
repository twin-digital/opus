// Public surface: the control plane, the exported error classes, the runtime enum mirrors,
// and the type-derived id unions. The fake classes themselves stay internal — a test receives
// them typed as the real @minecraft/server classes and reads them through the genuine API.
export {
  addComponent,
  createWorld,
  emit,
  invalidate,
  removeComponent,
  spawnFake,
  type AttributeComponentSpec,
  type EmittableSignal,
  type EntitySpawnBase,
  type EntitySpawnSpec,
} from './control.js'
export { livingMob } from './bases.js'
export { InvalidEntityError, NotImplementedError } from './errors.js'
export { EntityComponentTypes, EntityDamageCause } from './enums.js'
export {
  canonicalizeId,
  type AttributeComponentId,
  type CanonicalAttributeComponentId,
  type CanonicalEntityComponentId,
  type EntityComponentId,
} from './ids.js'
