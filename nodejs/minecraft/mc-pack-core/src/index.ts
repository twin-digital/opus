// Public surface of the shared behavior-pack helpers. Packs import from
// '@twin-digital/mc-pack-core'; tsdown (rolldown) inlines this source into each pack's
// bundle (it's never published as JS), so it's shared at authoring time and
// fully decoupled at runtime.
export * from './invulnerable.js'
