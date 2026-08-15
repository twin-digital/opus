# @twin-digital/minecraft-test-lib

In-memory fakes of the `@minecraft/server` object model, for testing Minecraft Bedrock behavior
packs. The fakes hold state and mutate it as their members are called, so a test asserts that health
is now 20 rather than that `setCurrentValue` was called with 20.

`@minecraft/server` ships type declarations with no runtime JavaScript, so a pack author has no
double to test against and hand-rolls one per test. Those doubles cannot express the conditions that
break real packs — a component that is absent, a reference that went invalid in the middle of the
event that fired — and a double that returns a plausible-looking payload lets a handler take the
wrong branch while the test still passes.

## Install

```sh
npm install --save-dev @twin-digital/minecraft-test-lib
```

ESM only, with type declarations, and **no runtime dependencies**.

Every value and behaviour here was derived from `@minecraft/server` **2.8.0**, which the package
exports as `SERVER_VERSION`. The pin is stated and nothing more: no `@minecraft/server` peer range is
declared, and nothing at install, configuration or run time compares your engine pin against it. A
pack on a different 2.x pin installs and runs; where the two versions differ, this library answers
for 2.8.0.

It depends on no test framework at run time: the fakes are plain objects, and a caller who wants call
recording wraps one with their own spy library. The one exception is the `/vitest` subpath below,
which is runner tooling and reaches `vi`; nothing else in the package imports a runner, and `vitest`
is declared as an **optional** peer so a consumer who never imports that subpath resolves the package
without a warning.

There are two published entry points and no others: the root barrel, and
`@twin-digital/minecraft-test-lib/vitest`.

## Getting started

```ts
import { createServer } from '@twin-digital/minecraft-test-lib'
import { installMyPack } from '../src/main.js' // the pack under test, not this library

const server = createServer()
installMyPack(server) // the pack takes { world, system, … }
```

The second line is the _pack's_ own entry point, whatever it is called; this library exports nothing
that installs anything.

This is the **injection** path: a fake reaches the code under test as an object the test passes in,
and nothing is installed anywhere. A suite written this way keeps working exactly as written.

A pack that reaches the engine through a direct `import { world } from '@minecraft/server'` instead
is reached the other way — see the next section.

## Testing a pack that imports `@minecraft/server`

Most packs do not take their engine handles as a parameter. They import them:

```ts
import { world, system } from '@minecraft/server'
world.afterEvents.entityHurt.subscribe(/* … */)
```

`@minecraft/server` ships no runtime JavaScript, so that import cannot resolve under a test runner at
all — the module has no `main`, `module` or `exports` entry, and the suite fails to start before any
of your code runs. This package ships the module the runner points at instead.

### The install is one entry

```ts
// vitest.config.ts
import { minecraftTestLib } from '@twin-digital/minecraft-test-lib/vitest'

export default {
  plugins: [minecraftTestLib()],
}
```

That is the whole install. The plugin points the runner's resolver at the aliased surface this
package ships, points it at stubs for the `@minecraft/*` script modules the fakes do not cover, and
contributes a setup module that installs a fresh server before each test file evaluates. **You write
no setup file**, and no alias of your own.

### The default: static imports, one scenario per file

With the plugin in place, a test file holds static imports and nothing else:

```ts
import { addComponent, createEntity, currentServer, withVanillaDimensions } from '@twin-digital/minecraft-test-lib'
import { world } from '@minecraft/server'

import '../src/main.js' // the pack, imported for its side effects

it('reacts to a hurt entity', () => {
  const server = currentServer()
  withVanillaDimensions(server)
  const sheep = createEntity(server, { typeId: 'minecraft:sheep', dimension: world.getDimension('overworld') })
  addComponent(sheep, 'minecraft:health', 20)
  sheep.applyDamage(1)
  // assert on what the pack did
})
```

No install call, no reset prelude, no ordering you write. The setup module ran before this file
evaluated, so the pack's module-scope `subscribe` and `system.runInterval` calls landed on the server
`currentServer()` returns — the same object `world` and `system` are bound to.

Freshness is **per file**, which is the runner's own module-registry boundary. State carries between
the tests within a file: a test that spawns an entity and advances twenty ticks hands the next test
that entity and that clock. Write one scenario per file, or reach for `loadPack`.

### The escape hatch: `loadPack`

```ts
import { advanceTicks } from '@twin-digital/minecraft-test-lib'
import { loadPack } from '@twin-digital/minecraft-test-lib/vitest'

it('starts from a world of its own', async () => {
  const server = await loadPack(() => import('../src/main.js'))
  advanceTicks(server, 20)
})
```

`loadPack` resets the module registry, imports this library fresh, installs a new server, and only
then calls your importer — so the pack evaluates against a world no previous test touched — and hands
back that server. Assert through the value it returns.

This is not an equal alternative to the default; it is for the cases that need a fresh **evaluation**:
pack module-scope state a test mutates, load-time behaviour itself, scheduled-run accumulation, or a
server that must differ before the pack evaluates (`loadPack(importer, { server })`).

The package ships **no reset**, public or internal. A fresh start comes from a fresh module-registry
generation or from an explicit unset, never from swapping a live server out from under a pack that
already registered against it.

### Installing your own fakes

`__useServer(server)` points all three bindings at a server you built, and `__useServer()` returns
them to the unset state. Reading through an unset binding throws `ShimNotInstalledError` rather than reading
`undefined`.

Replacing a server a pack has already registered against throws `ShimServerInUseError`, naming the
subscriber and scheduled-run counts it would have stranded: those registrations stay on the server the
pack evaluated against, so the replacement would see none of the pack's behaviour. Unset first, or use
`loadPack`.

### What the aliased surface carries

Everything the pinned declarations declare as a value, and nothing else:

- every enum, as a frozen object whose members are generated from the 2.8.0 declarations
- the module-level numeric constants — `TicksPerSecond`, `TicksPerDay`, and their siblings
- every declared class, and the three bindings `world`, `system` and `EntityTypes`

The classes the fakes implement **are** the fake classes, so `instanceof` answers by class identity:
an entity this library built is an `Entity` the pack imported, and a fake carries the declared
inheritance too — a player is an `Entity`, a health component is an `EntityComponent`. No brand, no
`Symbol.hasInstance`, and nothing for a consumer to name.

A name the pinned declarations do not declare is not exported — no Proxy over unknown names, no
auto-vivified stub, no fallback value. A pack importing a name 2.8.0 does not carry fails at the
import.

The surface supplies values, classes and the three bindings. It models no behaviour of its own:
every behaviour a test observes comes from the fakes.

## The server

`createServer()` returns a fake server whose properties are named exactly as `@minecraft/server`
exports them — `world`, `system`, and the eight type catalogs `BiomeTypes`, `BlockStates`,
`BlockTypes`, `DimensionTypes`, `EffectTypes`, `EnchantmentTypes`, `EntityTypes` and `ItemTypes` —
so it is assignable to a `Pick<>` of the module's namespace type and a pack written to receive its
engine handles as a parameter can be handed the whole thing.

`EntityTypes` reads that server's own type catalog. The other seven are declared and every member
on them throws `NotImplementedError`.

## Entity types

A server's type catalog starts empty, and `registerEntityType` fills it. Both branches a lookup can
take are arrangeable from the first line of a test — a type that resolves and a type that does not:

```ts
const server = createServer()
const guard = registerEntityType(server, 'mypack:guard')

server.EntityTypes.get('mypack:guard') === guard // the registered type
server.EntityTypes.get('mypack:absent') // undefined
```

`withVanillaEntityTypes(server)` registers the vanilla ids in one call. Lookup reproduces the
engine's: a bare identifier resolves as `minecraft:<id>` and nothing else — no other namespace is
searched, so a pack-defined type never answers to its bare name — the match is exact, so whitespace
and case differences miss, and a miss reads `undefined` rather than throwing.

`dimension.spawnEntity` resolves through the catalog and throws `InvalidArgumentError` naming the
identifier where nothing registers it, taking an `EntityType` wherever it takes an id.
`createEntity` and `createPlayer` do not consult it: the engine declares no function at all for
those, so they are the library's own and stay `typeId`-string-shaped.

The engine's catalog is read-only from script and carries whatever content the world installed;
this one is written by the test. Two more differences are listed under Divergences below: the
engine refuses every catalog read during early execution, which the fakes have no phase for, and
the wording of the guard on a wrong-typed argument.

All state a server holds belongs to that server. Two `createServer()` calls in one process share
nothing, so tests need no reset hook.

Every fake carries the full public shape of the type it stands in for and is assignable where the
real declared type is expected, with no cast — the classes are generated from the pinned
declarations, so `implements` checks completeness on every build. There is no `Proxy` and no runtime
interception, which is what makes the fakes behave like ordinary objects: `'teleport' in entity` is
`true`, `Object.keys` reads the engine's two own properties, `for-in` walks its 62, and a spy
library that wraps a method by assignment works.

## Free functions

Everything the real API cannot express is a free function over the fakes rather than a member the
engine does not have.

| function                                                                            | what it does                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `createServer()`                                                                    | a new server: world, system, type catalogs                                 |
| `createEntity(server, { typeId, id?, dimension?, location?, components? })`         | a fake entity registered with that world                                   |
| `createPlayer(server, { typeId?, id?, name?, dimension?, location?, components? })` | as above, a `Player`                                                       |
| `addComponent(entity, componentId, state?)`                                         | attach a component to a live entity, with the state that component carries |
| `removeComponent(entity, componentId)`                                              | detach one                                                                 |
| `registerEffectBaseName(server, effectTypeId, baseName)`                            | the base name for a custom effect type, or an override for a shipped one   |
| `registerEntityType(server, id, localizationKey?)`                                  | put an entity type in that server's catalog                                |
| `invalidate(entity)`                                                                | put the reference into the engine's invalid state                          |
| `emit(signal, payload)`                                                             | deliver a payload to a signal's subscribers                                |
| `advanceTicks(server, count)`                                                       | step the clock: decay effect durations, then run each tick's callbacks     |
| `getOutput(target)`                                                                 | the messages and titles sent to a player or the world                      |
| `getTriggeredEvents(entity)`                                                        | the `triggerEvent` calls made on an entity                                 |
| `getHandlerErrors(server)`                                                          | the errors thrown by subscribers and absorbed at dispatch                  |
| `__useServer(server?)`                                                              | point the three module-scope bindings at a server, or unset them           |
| `currentServer()`                                                                   | the server the module-scope bindings point at                              |

## Presets

Populated starting points are invoked explicitly, never as constructor behaviour, and compose
freely. Each supplies only values a source pins; neither invents per-type vanilla data.

- **`withVanillaDimensions(server)`** adds the three vanilla dimensions. `world.getDimension` then
  resolves `overworld`, `nether`, `the_end`, their `minecraft:`-prefixed forms and the spaced alias
  `"the end"`, each returning a dimension whose `id` is the prefixed form, with height ranges
  −64..320, 0..128 and 0..256 and localization keys `dimension.dimensionName0`/`1`/`2`.
- **`withVanillaEntityTypes(server)`** registers the entity-type ids `@minecraft/vanilla-data`
  carries, in that source's order, so `EntityTypes.get` and `dimension.spawnEntity` answer for the
  vanilla types. An id you registered yourself is skipped rather than colliding with the duplicate
  refusal. The list is the source's, not a world's catalog read back: a world also carries whatever
  its content packs define.
- **`withVanillaWorld(server)`** supplies those two and nothing else.
- **`asSpawnedEntity(entity)`** supplies the spawn frame: `nameTag` the empty string, `getRotation()`
  `{x: 0, y: 0}` and `getVelocity()` `{x: 0, y: 0, z: 0}`. It supplies only what the caller left
  unset, so a `nameTag` you set survives it. It applies the same zeros to every type, including
  `minecraft:xp_orb`, which the engine spawns with a randomized rotation and velocity — a
  divergence, listed below.

## Construction populates nothing

A new server has no dimensions, no players, no objectives and no dynamic properties, and a new
entity carries no components and no field values beyond the ones you passed. That is deliberately
unlike the engine, where a freshly spawned entity always arrives carrying at least one component.

Components are the test's to attach, at construction or afterwards: `createEntity` and
`createPlayer` take a `components` map, and each entry adds exactly what `addComponent` would. The
state an entry carries is shaped by the component it names — the four attribute numbers (or one of
their shorthands) on the seven attribute-shaped ids, the family tokens on `minecraft:type_family` —
and every other component takes none, refusing a state argument with `InvalidArgumentError`.

```ts
const sheep = createEntity(server, {
  typeId: 'minecraft:sheep',
  components: { 'minecraft:health': [0, 8], 'minecraft:type_family': ['mob', 'sheep'] },
})
```

Two kinds of nothing, told apart by the declaration's own type:

- A value the engine **could not lack** — `nameTag`, `location`, `getRotation()` — throws
  `UnsetValueError` naming the member when you never supplied it. A fake that invented one would let
  a handler branch on fiction.
- An absence the engine **can exhibit** reads back as the engine reports it: `getComponent` for an
  unattached component, an unset dynamic property, and an unknown scoreboard objective or
  participant all return `undefined`. An empty collection is a real resting state.

## Errors

None of the engine's error classes is importable at runtime, so the library declares its own.

Where the pinned declarations declare a class the library also hand-writes, **the aliased surface
exports the library's class** — one class object per name — so a pack's
`catch (e) { e instanceof InvalidEntityError }` catches what the fakes actually throw. Every other
`Error`-ancestry class the declarations export is a real `Error` subclass setting its own `name`, with
its declared readonly members left to whoever throws it. `ArgumentOutOfBoundsError` and
`InvalidArgumentError` are `@minecraft/common`'s and are not re-exported by `@minecraft/server`, so
they stay names only this library exports.

| class                      | thrown when                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `InvalidEntityError`       | a member of an entity whose reference has gone invalid; carries the readonly `id` and `type` of that entity               |
| `ArgumentOutOfBoundsError` | a numeric argument falls outside the bounds the engine enforces — `setCurrentValue`, `addEffect`'s amplifier and duration |
| `InvalidArgumentError`     | an argument's value is one the engine rejects outright — a bare id to `triggerEvent`                                      |
| `NotImplementedError`      | a declared member this cycle does not model; names the member                                                             |
| `UnsetValueError`          | a modelled member reads a value the test never supplied; names the member                                                 |
| `ShimNotInstalledError`    | the module-scope `world` or `system` is reached before a test installed a server                                          |
| `ShimServerInUseError`     | `__useServer` would replace a server a pack has already registered against; carries both counts                           |

Two guarded surfaces do not use `InvalidEntityError`, because the engine does not. On an invalid
owner an attribute component's value getters throw a plain `Error` reading
`Failed to get property '<internal name>'.` — the engine names its own field, `current`, `value`,
`effectiveMaxValue` and `effectiveMinValue` — its three resets throw
`Failed to call function '<name>'.`, and an effect's `amplifier`, `duration`, `typeId` and
`displayName` throw `Failed to get property '<member>'.`

## What a read that finds nothing does

Five rules, in this order. A member matching an earlier rule never reaches a later one.

1. **Too few arguments throw `TypeError` first of all**, ahead of the guard, on a valid and an
   invalidated reference alike: `Incorrect number of arguments to function. Expected 2-3, received
0`. Only the minimum is checked; extra arguments are ignored.
2. **The validity guard fires next.** On an invalidated reference every guarded member throws
   `InvalidEntityError` — or the plain `Error` its owner's table gives — whatever the member would
   otherwise have done.
3. **An out-of-scope member throws `NotImplementedError`**, however its declaration is typed.
4. **A modelled member reading an absence the engine can exhibit returns `undefined`.**
5. **A modelled member reading a value the test never supplied throws `UnsetValueError`.**

## Invalidation

`remove()` invalidates as part of removing: it raises the `entityRemove` before-event, then detaches
the entity and invalidates every reference to it as one act, then raises the after-event.
`invalidate(entity)` reaches the state `remove()` cannot — the reference that goes stale without
leaving the world — and may be called at any point, including
on a reference a handler is holding mid-event.

On an invalidated entity exactly four members stay readable: `id`, `isValid` (false), `typeId`, and
`scoreboardIdentity` (`undefined`). Every other member throws. The guard is on the **call**, not the
read: reading a method off an invalidated entity returns a function, and a reference captured while
the entity was still valid throws when it eventually runs.

## Coverage

Every engine behaviour this library has ruled on is listed below as **modelled** (the fake
reproduces the engine), **not modelled** (the members are declared and throw `NotImplementedError`,
or the behaviour has no fake counterpart), or a **divergence** (the fake behaves, and differs from
the engine on purpose). Each divergence row carries the difference itself, so this table is the one
place to learn where a passing test would not have passed against the engine.

The table states what the design ruled on and nothing more: a behaviour outside it has not been
considered, which is not the same as a promise about it.

Every row carries an **id** in its first column, and the id is the row's identity while its two
description columns are not: pin the id, and expect the behaviour and library columns to be
reworded without notice. An id names its row's subject rather than its verdict, so a row keeps its
id when its coverage changes. An id is issued once — a subject that splits retires its id and both
halves take new ones, and a removed subject's id is never reissued.

| id                                      | engine behaviour                                                                                                                                | coverage     | what the library does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dimension-registration-and-resolution` | dimension registration and `world.getDimension` resolution                                                                                      | modelled     | via `withVanillaDimensions`; ids, aliases, height ranges and localization keys as observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `get-dimension-unknown-id`              | `getDimension` with an unknown id                                                                                                               | modelled     | plain `Error`, `Dimension '<id>' is invalid.` — including on a world where no preset was applied                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `world-resting-state`                   | the world's resting state — empty collections, no players, no objectives                                                                        | modelled     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `fresh-entity-components`               | a freshly constructed entity's components                                                                                                       | divergence   | construction populates nothing; in the engine a fresh entity always arrives carrying at least one component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `xp-orb-spawn-frame`                    | the spawn frame of `minecraft:xp_orb`                                                                                                           | divergence   | `asSpawnedEntity` applies zero rotation and velocity to every type; the engine spawns an `xp_orb` with a randomized rotation and a nonzero randomized velocity, drawn afresh per spawn                                                                                                                                                                                                                                                                                                                                                                                                      |
| `per-type-vanilla-data`                 | per-type vanilla data — a sheep's fourteen components, its 8/8/0/8 health                                                                       | not modelled | no preset supplies it; a package built on this one may                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `entity-id-assignment`                  | entity id assignment                                                                                                                            | divergence   | ids are decimal strings issued from `1` per server; the engine's are negative integers. `Entity.id` is documented opaque, so nothing may read the spelling either way                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `entity-lookups`                        | `world.getEntity`, `getAllPlayers`, `getPlayers`, `dimension.getEntities`, `dimension.getPlayers`                                               | modelled     | unfiltered, in creation order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `entity-query-options-filtering`        | `EntityQueryOptions` filtering, on the lookups and on `entity.matches`                                                                          | divergence   | eight of the twenty-four fields filter — `type`, `tags`, `name`, `families` and their `exclude` counterparts; each of the other sixteen throws `NotImplementedError` naming itself, where the engine honours them all                                                                                                                                                                                                                                                                                                                                                                       |
| `entity-tags`                           | entity tags — `addTag`, `removeTag`, `hasTag`, `getTags`                                                                                        | modelled     | a per-entity set, which the `tags` and `excludeTags` filters read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `positional-entity-lookups`             | the other entity lookups — `getEntitiesAtBlockLocation`, `getEntitiesFromRay`, `getEntitiesFromViewDirection` and the rest                      | not modelled |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `spawn-entity-placement`                | `dimension.spawnEntity` placement                                                                                                               | divergence   | the entity lands exactly where asked; the engine adjusts some placements — a boat by 0.2 on x and z                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `post-spawn-motion`                     | post-spawn motion                                                                                                                               | divergence   | an entity never moves on its own; AI-driven mobs drift within a couple of dozen ticks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `entity-type-catalog`                   | `EntityTypes.get` and `EntityTypes.getAll`                                                                                                      | modelled     | a bare identifier resolves as `minecraft:<id>` and nothing else — no other namespace is searched — the match is exact so whitespace and case differences miss, a miss reads `undefined` rather than throwing, `getAll` reports in registration order, and an entry is one object the catalog keeps rather than a value rebuilt per call                                                                                                                                                                                                                                                     |
| `entity-type-registration`              | how an entity type gets into the catalog                                                                                                        | divergence   | the engine's catalog is read-only from script and carries whatever content the world installed; here a server's catalog starts empty and `registerEntityType(server, id, localizationKey?)` fills it, refusing an id already registered rather than replacing the entry a test holds                                                                                                                                                                                                                                                                                                        |
| `entity-type-catalog-early-execution`   | a catalog read during early execution                                                                                                           | divergence   | the engine refuses every read at a pack's module evaluation and inside a `system.beforeEvents.startup` handler, throwing `ReferenceError: Native function [EntityTypes::get] cannot be used in early execution.`; the fakes have no early phase, so a lookup answers whenever a test makes it                                                                                                                                                                                                                                                                                               |
| `entity-type-argument-guards`           | `EntityTypes.get` on a wrong-typed argument                                                                                                     | divergence   | the four wordings the engine splits into are reproduced for the six argument shapes measured, but every object outside those shapes takes the plain-object wording, which is this library's own extrapolation rather than an observation                                                                                                                                                                                                                                                                                                                                                    |
| `entity-type-shape`                     | an `EntityType`'s `id` and `localizationKey`                                                                                                    | modelled     | both are own value properties on the instance rather than getters, and the type carries no other member. An omitted key derives from the id as `entity.<id>.name`, with a leading `minecraft:` stripped and any other namespace kept                                                                                                                                                                                                                                                                                                                                                        |
| `spawn-entity-type-resolution`          | `dimension.spawnEntity` entity-type resolution                                                                                                  | modelled     | it resolves through the server's catalog, agreeing with `EntityTypes.get` on the same identifier, throws `InvalidArgumentError` naming the identifier where nothing registers it, and takes an `EntityType` wherever it takes an id                                                                                                                                                                                                                                                                                                                                                         |
| `create-entity-type-resolution`         | `createEntity` and `createPlayer` entity-type resolution                                                                                        | not modelled | the engine declares no function at all for these, so they are the library's own: each takes a `typeId` string, consults no catalog, and registers whatever type it is handed                                                                                                                                                                                                                                                                                                                                                                                                                |
| `entity-remove-cascade`                 | `entity.remove()`                                                                                                                               | modelled     | raises the `entityRemove` before-event, then detaches from the registry and invalidates the reference as one act, then raises the after-event — the engine's own cascade, which raises no death event either                                                                                                                                                                                                                                                                                                                                                                                |
| `trigger-event`                         | `entity.triggerEvent`                                                                                                                           | divergence   | validates the prefixed id and records the call, changing no state; in the engine the event reshapes the entity                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `entity-kill-cascade`                   | `entity.kill()`                                                                                                                                 | modelled     | the full cascade, on an entity with and without a health component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `corpse-invalidation-after-kill`        | invalidation of a mob's corpse after `kill()`                                                                                                   | modelled     | the corpse stays valid — inside the `entityDie` handler and after it — and turns invalid 21 ticks later, the constant the engine was measured at, so it goes stale when the test advances that far. Distinct from `remove()`, which invalidates at once                                                                                                                                                                                                                                                                                                                                     |
| `kill-invalidation-without-health`      | invalidation after `kill()` on an entity with no health component                                                                               | modelled     | the reference goes invalid before `entityDie` is raised, as the engine's does within the call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `attribute-shaped-components`           | the seven attribute-shaped components                                                                                                           | modelled     | all four values, the bounds check, and the health-write cascade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `type-family-component`                 | the `minecraft:type_family` component                                                                                                           | divergence   | `getTypeFamilies` and `hasTypeFamily` answer from the tokens the test seeded on that entity; in the engine a type's definition fixes them for every entity of that type, and nothing here derives a family from a typeId                                                                                                                                                                                                                                                                                                                                                                    |
| `non-attribute-components`              | the other 60 entity components                                                                                                                  | not modelled | attachable, carrying `typeId`, `isValid` and `entity`; every other member throws                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `runtime-component-mutation`            | runtime component attachment and detachment                                                                                                     | not modelled | the engine reaches it through data-driven paths; a test uses the `addComponent` / `removeComponent` free functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `namespace-prefix-tolerance`            | bare and prefixed id tolerance                                                                                                                  | modelled     | per-surface, as observed — `triggerEvent` rejects the bare form and the others accept it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `set-current-value-bounds`              | `setCurrentValue` bounds check                                                                                                                  | modelled     | including the message and both inclusive bounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apply-damage-cascade`                  | `applyDamage` cascade, order and payloads                                                                                                       | modelled     | including the unclamped negative health an overkill leaves, and unrounded fractional amounts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `apply-damage-boolean`                  | `applyDamage`'s boolean                                                                                                                         | modelled     | reports admission — damageable entity, positive amount — not whether damage landed, as observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apply-damage-cause-and-source`         | `applyDamage` cause defaults and the `damagingEntity` carry-through                                                                             | modelled     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `killing-hit-boundary`                  | the killing-hit boundary                                                                                                                        | modelled     | reaching `effectiveMin` exactly is fatal on both the damage and the component-write path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apply-damage-without-health`           | `applyDamage` on an entity with no health component                                                                                             | modelled     | returns `false`, fires nothing, leaves the entity valid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `damage-invulnerability-window`         | the damage-invulnerability window                                                                                                               | divergence   | the fake has no i-frames, so consecutive `applyDamage` calls each take their full amount where the engine absorbs the second — a test driving repeated damage sees more health lost against the fake than the engine would take                                                                                                                                                                                                                                                                                                                                                             |
| `projectile-damage-adjustment`          | the engine's velocity-dependent projectile damage adjustment                                                                                    | divergence   | the projectile options form applies the amount requested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `effect-add-and-replacement-rule`       | `addEffect` / `getEffect` / `getEffects` / `removeEffect` and the amplifier-first replacement rule                                              | modelled     | including the duration half of the rule, compared against the duration remaining as observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `add-effect-argument-bounds`            | `addEffect`'s argument bounds                                                                                                                   | modelled     | amplifier `0…255`, duration `1…20000000`, `ArgumentOutOfBoundsError` outside either, nothing clamped, both message shapes reproduced                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `add-effect-non-integer-arguments`      | `addEffect`'s non-integer arguments                                                                                                             | modelled     | truncated toward zero, then bounds-checked — so duration `0.5` is refused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `add-effect-nan-and-infinity`           | `addEffect` on `NaN` or `Infinity`                                                                                                              | divergence   | the engine refuses these with a `TypeError` ahead of the bounds check; the fake does not reproduce that error's shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `display-name-amplifier-mapping`        | the display name's amplifier mapping                                                                                                            | modelled     | bare base at amplifier 0, base plus the Roman numeral of amplifier + 1 at 1–5, bare base again from 6 to 255 — reproduced for all 37 vanilla types across the whole accepted amplifier range                                                                                                                                                                                                                                                                                                                                                                                                |
| `effect-duration-decay`                 | effect duration decay                                                                                                                           | modelled     | one per tick the test advances, the observed rate, applied ahead of that tick's callbacks; nothing decays unless the test advances                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `effect-duration-expiry-boundary`       | what the engine does when a duration reaches zero                                                                                               | modelled     | the effect is removed on the tick its decaying duration would reach 0, which is the boundary the engine was measured at: 0 is never readable, the last tick it reads is 1, `getEffect` and `getEffects` agree, and a handle captured beforehand answers as a removed effect's does. Nothing is dispatched on the way — 2.8.0 declares no effect-remove or effect-expire signal                                                                                                                                                                                                              |
| `vanilla-effect-display-names`          | `Effect.displayName` for the 37 vanilla types                                                                                                   | modelled     | resolves with no test setup, from verbatim shipped base names and the computed numeral                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `effect-display-name-locale`            | `Effect.displayName` in a locale other than the observed one                                                                                    | divergence   | the shipped bases are the strings one server returned, and the API documents only a "player-friendly name" with no locale contract; until a second locale is observed the table is that locale's, and a test needing another registers its own bases                                                                                                                                                                                                                                                                                                                                        |
| `custom-effect-display-name`            | `Effect.displayName` for a custom effect type                                                                                                   | divergence   | no base is shipped, so an unregistered custom type throws `UnsetValueError` where the engine would answer with whatever its own data holds                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `signal-subscription`                   | signal existence, `subscribe` / `unsubscribe`, reference dedupe and subscription order                                                          | modelled     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `filtered-subscription`                 | a filtered subscription — an options argument to `subscribe`                                                                                    | modelled     | on the five signals the fakes raise that declare an options type, every field that type carries filters as observed: `entities` by instance, `entityTypes` against the subject entity's prefixed `typeId`, `allowedDamageCauses`, and `entityFilter` through the entity-lookup matcher, intersecting where two are given. A bare `entityTypes` id matches nothing, as the engine matches nothing for one. A field a signal's options type does not carry, and any options argument on a signal the fakes never raise, throws `NotImplementedError` naming the field at the `subscribe` call |
| `after-event-dispatch-timing`           | after-event dispatch timing                                                                                                                     | divergence   | synchronous, inside the causing call; the engine defers past that call's return to later in the same tick                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `unraised-engine-signals`               | engine-raised signals outside the five after-events and three before-events the fakes raise                                                     | not modelled | no fake behaviour raises them; a test drives one with `emit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `before-event-cancellation`             | before-event cancellation                                                                                                                       | modelled     | on the two signals whose payload declares `cancel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cancelled-call-return-value`           | what a cancelled call returns                                                                                                                   | modelled     | `addEffect` `undefined`, `applyDamage` `true` — the engine's own per-surface values, quirk included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `before-event-payload-writes`           | before-event mutable payload fields                                                                                                             | divergence   | writes to `entityHurt.damage` and `effectAdd.duration` are honoured, the duration write down its own validation path as the engine takes it — truncated toward zero, dropping the add entirely at or below zero, clamped to 20000000 above the maximum, and refused by the setter itself on `NaN` and `Infinity`. The other four declared mutable fields are writable but **unread**, which is the library's own: the fake raises no action that would consume them, so a write to `weatherChange.duration` changes nothing                                                                 |
| `throwing-subscriber`                   | a subscriber that throws                                                                                                                        | divergence   | isolated as the engine isolates it, but the absorbed error is recorded for `getHandlerErrors` where the engine discards it                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tick-loop`                             | the tick loop                                                                                                                                   | divergence   | nothing runs on its own; `currentTick` starts at 0 and moves only under `advanceTicks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `system-scheduling`                     | `run` / `runTimeout` / `runInterval` / `clearRun` scheduling                                                                                    | modelled     | every intervening tick's callbacks run during an advance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `run-job`                               | `runJob` / `clearJob`                                                                                                                           | not modelled |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `dynamic-properties`                    | dynamic properties on the world and on entities                                                                                                 | modelled     | real storage over the declared value types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dynamic-property-byte-count`           | `getDynamicPropertyTotalByteCount`                                                                                                              | not modelled | no source pins the engine's accounting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `scoreboard`                            | the scoreboard — objectives, scores, participants, display slots                                                                                | modelled     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `message-and-title-output`              | `sendMessage` and `onScreenDisplay` output                                                                                                      | modelled     | captured to a per-target log rather than displayed, and read back with `getOutput`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `invalidation-guard`                    | the invalidation guard on entities, attribute components and effects                                                                            | modelled     | the observed guard data, error class by error class, compiled into each member's prologue ahead of its body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `guard-fires-at-call`                   | reading — not calling — a guarded method on an invalidated reference                                                                            | modelled     | the read returns a function and the throw lands on the call, and a reference captured while valid still throws when it runs, as observed                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `arity-before-guard`                    | argument count checked ahead of the validity guard                                                                                              | modelled     | each member's arity check runs before its guard prologue, so a call with the wrong number of arguments on an invalidated entity reports `TypeError` rather than `InvalidEntityError`, as the engine does                                                                                                                                                                                                                                                                                                                                                                                    |
| `extra-arguments`                       | extra arguments to a member                                                                                                                     | modelled     | each member checks both bounds — at least its declared required parameter count, at most its declared parameter count — throwing the engine's `TypeError` in its one message shape for either direction, with the expected part written `<min>-<max>` where the bounds differ. A zero-arity member throws on its first surplus argument                                                                                                                                                                                                                                                     |
| `in-operator-on-members`                | `in` on a declared but unmodelled member                                                                                                        | modelled     | the member is really on the prototype, so `'teleport' in entity` is `true` and an unknown name `false`, as the engine answers, valid or invalidated alike                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `own-enumerable-properties`             | `Object.keys`, spread and `JSON.stringify` over an entity                                                                                       | modelled     | `typeId` and `id` are own data properties and every other member sits on the prototype, so all three read the engine's two own enumerable properties                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `for-in-enumeration`                    | `for-in` over an entity                                                                                                                         | modelled     | the generator defines the prototype members `enumerable: true`, so `for-in` walks the engine's 62 while `Object.keys` still reads 2                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `out-of-scope-surfaces`                 | items, blocks, containers, the player client surface, custom commands, the startup registries, and the seven type catalogs beside `EntityTypes` | not modelled | declared in full and throwing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `module-import-resolution`              | a pack's `import` of `@minecraft/server`                                                                                                        | modelled     | with the runner configured, a pack's value imports resolve to the pinned 2.8.0 surface and its module-scope registrations land on the installed server. The engine has a real module here; a test runner has none until this package supplies one                                                                                                                                                                                                                                                                                                                                           |
| `module-singleton-bindings`             | the module-scope `world`, `system` and `EntityTypes`                                                                                            | divergence   | they are what a test installed, and reading through either **before** an install throws `ShimNotInstalledError` where the engine always has both. Replacing a server a pack already registered against throws rather than stranding its subscriptions                                                                                                                                                                                                                                                                                                                                       |
| `class-identity-and-instanceof`         | `instanceof` against a class the module exports                                                                                                 | modelled     | the exported class is the fake class, so the check answers by class identity — true for the corresponding fake, false for anything else — and the declared inheritance is on the prototype chain, so a player is an `Entity` and a health component an `EntityComponent`, as the engine answers                                                                                                                                                                                                                                                                                             |
| `enum-and-constant-values`              | enum members and module-level constants                                                                                                         | modelled     | every enum the pinned declarations declare is exported as a frozen object with its declared members and values, generated from those declarations, alongside the module-level numeric constants                                                                                                                                                                                                                                                                                                                                                                                             |
| `unimplemented-surface-classes`         | classes the module exports that the fakes do not implement                                                                                      | not modelled | each is exported as a real named class with no members whose constructor throws `NotImplementedError`; `instanceof` against one answers false for everything                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `sibling-script-modules`                | the other `@minecraft/*` script modules — `@minecraft/server-ui` first                                                                          | not modelled | a pack's imports of them resolve to stubs this package ships, under the same one config entry: declared enums carry their declared values and every class and module object throws `NotImplementedError` at the first call                                                                                                                                                                                                                                                                                                                                                                  |

## Divergences in detail

Each of these is a way a test can pass against the fake and fail against the engine. The heading is
the id and behaviour of the coverage row it belongs to.

### `fresh-entity-components` — a freshly constructed entity's components

`createEntity` attaches nothing. In the engine every freshly spawned entity arrives carrying at least
one component, and there is no common baseline set across types. A handler that assumes
`getComponent('minecraft:health')` answers on any live mob passes against the engine and throws
against the fake until the test calls `addComponent`. Populate what the code under test reads.

### `entity-type-registration` — how an entity type gets into the catalog

The engine's catalog is read-only from script: it carries the vanilla types plus whatever the
world's content packs define, and nothing in `@minecraft/server` writes to it. Here the catalog is
the test's to arrange. A server starts with none, `registerEntityType(server, id, localizationKey?)`
adds one, and `withVanillaEntityTypes(server)` adds the vanilla list in one call. A suite that
spawns without registering first meets `InvalidArgumentError` where the engine would have spawned.

Registration also refuses an id already present, rather than replacing an entry a test is holding.
The engine has no counterpart to compare that against, since nothing registers a type there at all.

### `entity-type-catalog-early-execution` — a catalog read during early execution

The engine answers no catalog read during early execution: both `get` and `getAll` throw
`ReferenceError: Native function [EntityTypes::get] cannot be used in early execution.` at a pack's
module evaluation and again inside a `system.beforeEvents.startup` handler, and only answer from
`world.afterEvents.worldLoad` onward. The fakes have no early phase to reproduce that in, so a
lookup answers whenever a test makes it. Pack code that resolves a type at module scope passes here
and throws in the engine.

### `entity-type-argument-guards` — `EntityTypes.get` on a wrong-typed argument

The engine splits a present-but-wrong-typed argument four ways, and the split does not follow
`typeof`. All four are reproduced for the shapes measured: `undefined` and `null` throw
`InvalidArgumentError`, a number, boolean, symbol, array or function throws
`TypeError: Native type conversion failed.`, a plain object throws
`TypeError: Object did not have a native handle.`, and a boxed `String` throws
`TypeError: Object has an invalid native handle.`

Every other object — a `Date`, a boxed `Number`, a class instance — takes the plain-object wording
here. Which of the three the engine picks for those was not measured, so that is this library's own
extrapolation rather than the engine's behaviour.

### `xp-orb-spawn-frame` — the spawn frame of `minecraft:xp_orb`

`asSpawnedEntity` applies zero rotation and zero velocity to every type. Seven of the eight types
sampled do spawn that way; `minecraft:xp_orb` spawns with a randomized y-rotation and a nonzero
randomized velocity, drawn afresh per spawn. Code that branches on an orb's initial motion sees
stillness here and movement there. The preset simplifies past it rather than modelling a per-type
draw.

### `entity-id-assignment` — entity id assignment

Assigned ids are opaque decimal strings issued sequentially from `1` within a server, never reissued.
The engine's are negative integers. `Entity.id` is documented as opaque with no meaning to be
inferred from its structure, so nothing may read the spelling either way — but a test that asserts
on the shape of an id, or parses one, is asserting on this library rather than on the engine.

### `type-family-component` — the `minecraft:type_family` component

The component behaves: `getTypeFamilies()` returns the tokens the test seeded, in the order it
supplied them, and `hasTypeFamily(token)` answers membership. A family is not an identifier and takes
no `minecraft:` prefix, so a token is stored and compared verbatim.

The families are the entity's own. In the engine a type's definition fixes them, so every
`minecraft:sheep` carries the same set; here two entities sharing a typeId can carry different
families, and an entity the test never seeded carries none. Nothing derives a family from a typeId or
from a registered entity type, and no table of vanilla families ships. Pack code that reads one
entity's families and caches the answer against its typeId is right in the engine and wrong here.

Seed them at construction or afterwards, whichever the test prefers:

```ts
const sheep = createEntity(server, {
  typeId: 'minecraft:sheep',
  components: { 'minecraft:type_family': ['mob', 'sheep'] },
})
addComponent(other, 'minecraft:type_family', ['monster'])
```

### `entity-query-options-filtering` — `EntityQueryOptions` filtering, on the lookups and on `entity.matches`

Eight of the twenty-four fields filter: `type`, `tags`, `name` and `families`, and the exclusions
`excludeTypes`, `excludeTags`, `excludeNames` and `excludeFamilies`. Each of the other sixteen throws
`NotImplementedError` naming the field it could not honour, where the engine honours them all. The throw is per field, not per call,
so a test learns which filter was dropped instead of reading a result that quietly ignored it. Code
that queries by `location` and `maxDistance` cannot be exercised here at all.

### `spawn-entity-placement` — `dimension.spawnEntity` placement

An entity lands exactly where it was asked for. The engine adjusts some placements — a boat lands 0.2
off on x and z. A test asserting an exact spawn location passes here and fails there.

### `post-spawn-motion` — post-spawn motion

Nothing moves on its own. In the engine AI-driven mobs drift within a couple of dozen ticks, so a
test that advances ticks and then asserts a mob is still where it was put passes here and fails
there.

### `trigger-event` — `entity.triggerEvent`

The fake validates that the id carries a namespace and records the call for `getTriggeredEvents`,
changing no state. In the engine the event reshapes the entity — components come and go. A pack
whose logic depends on what an event did to the entity sees nothing happen here.

### `damage-invulnerability-window` — the damage-invulnerability window

The fake has no i-frames, so consecutive `applyDamage` calls each take their full amount where the
engine absorbs the second. A test driving repeated damage sees more health lost against the fake than
the engine would take.

### `projectile-damage-adjustment` — the engine's velocity-dependent projectile damage adjustment

The projectile options form applies the amount requested. The engine scales projectile damage by the
projectile's velocity, so the health lost differs.

### `add-effect-nan-and-infinity` — `addEffect` on `NaN` or `Infinity`

The engine refuses these with a `TypeError` ahead of the bounds check. The fake refuses them too, but
with its own `ArgumentOutOfBoundsError`: the error's _shape_ differs, so a test catching `TypeError`
specifically will not catch this one.

### `effect-display-name-locale` — `Effect.displayName` in a locale other than the observed one

The shipped base names are the strings one server returned, and the API documents only a
"player-friendly name" with no locale contract. Until a second locale is observed the table is that
locale's; a test needing another registers its own bases with `registerEffectBaseName`.

### `custom-effect-display-name` — `Effect.displayName` for a custom effect type

No base name is shipped for a type outside the 37 vanilla ones, so an unregistered custom type — and
`minecraft:empty`, which the name sweep never reached — throws `UnsetValueError` where the engine
would answer with whatever its own data holds. Register a base name to make it read.

### `after-event-dispatch-timing` — after-event dispatch timing

After-events are dispatched synchronously, inside the call that caused them, before that call
returns. The engine defers them past the mutating call's return and delivers them later in the same
game tick. The cost is worth knowing while writing a test: code placed after a mutating call runs
_after_ its handlers here, not before. Handlers observe post-write state either way.

### `before-event-payload-writes` — before-event mutable payload fields

Writes to `entityHurt.damage` and `effectAdd.duration` are honoured and reach downstream. The other
four declared mutable fields — `entityHeal.healing`, `playerBreakBlock.itemStack`,
`playerGameModeChange.toGameMode` and `weatherChange`'s `duration` and `newWeather` — are writable
and nothing reads them back, because the fake raises no healing, block-breaking, game-mode or weather
action for a write to reach.

### `module-singleton-bindings` — the module-scope `world`, `system` and `EntityTypes`

In the engine both singletons always exist. Here they are whatever a test installed, so there is a
state the engine has no counterpart for: **unset**. Any access through an unset binding — a property
read, a method call, `in`, a spread — throws `ShimNotInstalledError` rather than reading `undefined`,
which is what turns a missing install into one loud failure instead of a cascade of confusing ones.

The second difference is a refusal the engine has no reason for. `__useServer` throws
`ShimServerInUseError` when the server it would replace already carries subscribers or scheduled
runs. A pack registers while it evaluates, and those registrations stay on the server it evaluated
against; repointing the bindings would leave the pack talking to a world no test can see. The message
names both counts. An explicit `__useServer()` unset never throws, and a server this package did not
build is not inspected.

### `throwing-subscriber` — a subscriber that throws

Isolation matches the engine: the throw reaches neither the call that caused the event nor the other
subscribers, and the rest of the cascade still fires. The record is the library's own — the engine
discards the error, and `getHandlerErrors(server)` returns it. A test that asserts no handler failed
reads that log; against the engine there is nothing to read.

### `tick-loop` — the tick loop

Nothing runs on its own. `system.currentTick` starts at 0 and moves only under `advanceTicks`, which
runs every intervening tick's callbacks rather than only those due on the tick it lands on. Each tick
an advance takes, every live effect's duration loses one before that tick's callbacks run. The
library starts no timer and awaits nothing.

## Keeping this in step

The coverage table is what ships to users, and nothing mechanical ties a row to the behaviour it
summarises. A change to any modelled behaviour is not complete until its row says the same thing —
the row is part of the change, not a follow-up. Every row carrying `divergence` names the evidence
for the difference, so a row that no longer has any is a row to delete rather than to reword.
