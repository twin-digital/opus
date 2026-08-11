---
'@twin-digital/minecraft-test-lib': minor
---

`EntityTypes` behaves: it reads a type catalog belonging to the fake server that handed it out, and
a test fills that catalog with the new `registerEntityType(server, id, localizationKey?)` free
function. Lookup reproduces the engine's — a bare identifier resolves as `minecraft:<id>` and
nothing else, the match is exact, and a miss reads `undefined` — and `dimension.spawnEntity`
resolves through it, taking an `EntityType` wherever it takes an id. `createEntity` and
`createPlayer` are the library's own and consult nothing.

Two presets join the two already shipping: `withVanillaEntityTypes` registers the entity-type ids
`@minecraft/vanilla-data` carries, and `withVanillaWorld` supplies that and the vanilla dimensions
in one call. The aliased `@minecraft/server` surface gains `EntityTypes` as a third module-scope
binding beside `world` and `system`, moving with them and throwing `ShimNotInstalledError` while
unset. The other seven type catalogs stay declared with every member throwing.
