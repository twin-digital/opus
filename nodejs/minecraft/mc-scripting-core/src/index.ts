// Public surface of the shared behavior-pack helpers. Packs import from
// '@twin-digital/mc-scripting-core'; tsdown (rolldown) inlines this source into
// each pack's bundle via the `source` export condition, so the library is
// shared at authoring time and fully decoupled at runtime.
export * from './invulnerable.js'
