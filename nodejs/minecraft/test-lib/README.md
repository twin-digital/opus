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

ESM only, with type declarations. It has **no runtime dependencies** and one peer dependency on
`@minecraft/server` at `2.8.0` — the pinned version every behaviour here was read from. It depends
on no test framework: the fakes are plain objects, and a caller who wants call recording wraps one
with their own spy library.

## Getting started

```ts
import { createServer } from '@twin-digital/minecraft-test-lib'
import { installMyPack } from '../src/main.js' // the pack under test, not this library

const server = createServer()
installMyPack(server) // the pack takes { world, system, … }
```

The second line is the _pack's_ own entry point, whatever it is called; this library exports nothing
that installs anything.

**The library never replaces or intercepts the module import.** A fake reaches the code under test
only as an object the test passes in, so a pack that reaches the engine solely through a direct
`import { world } from '@minecraft/server'` is outside its reach. Everything is reachable from the
one entry point, `@twin-digital/minecraft-test-lib`; there are no subpath exports.

## The bundle

`createServer()` returns a bundle whose properties are named exactly as `@minecraft/server` exports
them — `world`, `system`, and the eight registry classes `BiomeTypes`, `BlockStates`, `BlockTypes`,
`DimensionTypes`, `EffectTypes`, `EnchantmentTypes`, `EntityTypes` and `ItemTypes` — so it is
assignable to a `Pick<>` of the module's namespace type and a pack written to receive its engine
handles as a parameter can be handed the whole thing. All eight registries are declared and every
member on them throws `NotImplementedError`.

All state a bundle holds belongs to that bundle. Two `createServer()` calls in one process share
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

| function                                                               | what it does                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `createServer()`                                                       | a new bundle: world, system, registries                                  |
| `createEntity(server, { typeId, id?, dimension?, location? })`         | a fake entity registered with that world                                 |
| `createPlayer(server, { typeId?, id?, name?, dimension?, location? })` | as above, a `Player`                                                     |
| `addComponent(entity, componentId, state?)`                            | attach a component to a live entity                                      |
| `removeComponent(entity, componentId)`                                 | detach one                                                               |
| `registerEffectBaseName(server, effectTypeId, baseName)`               | the base name for a custom effect type, or an override for a shipped one |
| `invalidate(entity)`                                                   | put the reference into the engine's invalid state                        |
| `emit(signal, payload)`                                                | deliver a payload to a signal's subscribers                              |
| `advanceTicks(server, count)`                                          | step the clock: decay effect durations, then run each tick's callbacks   |
| `getOutput(target)`                                                    | the messages and titles sent to a player or the world                    |
| `getTriggeredEvents(entity)`                                           | the `triggerEvent` calls made on an entity                               |
| `getHandlerErrors(server)`                                             | the errors thrown by subscribers and absorbed at dispatch                |

## Presets

Populated starting points are invoked explicitly, never as constructor behaviour, and compose
freely. Each supplies only values a source pins; neither invents per-type vanilla data.

- **`withVanillaDimensions(server)`** adds the three vanilla dimensions. `world.getDimension` then
  resolves `overworld`, `nether`, `the_end`, their `minecraft:`-prefixed forms and the spaced alias
  `"the end"`, each returning a dimension whose `id` is the prefixed form, with height ranges
  −64..320, 0..128 and 0..256 and localization keys `dimension.dimensionName0`/`1`/`2`.
- **`asSpawnedEntity(entity)`** supplies the spawn frame: `nameTag` the empty string, `getRotation()`
  `{x: 0, y: 0}` and `getVelocity()` `{x: 0, y: 0, z: 0}`. It supplies only what the caller left
  unset, so a `nameTag` you set survives it. It applies the same zeros to every type, including
  `minecraft:xp_orb`, which the engine spawns with a randomized rotation and velocity — a
  divergence, listed below.

## Construction populates nothing

A new bundle has no dimensions, no players, no objectives and no dynamic properties, and a new
entity carries no components and no field values beyond the ones you passed. That is deliberately
unlike the engine, where a freshly spawned entity always arrives carrying at least one component.

Two kinds of nothing, told apart by the declaration's own type:

- A value the engine **could not lack** — `nameTag`, `location`, `getRotation()` — throws
  `UnsetValueError` naming the member when you never supplied it. A fake that invented one would let
  a handler branch on fiction.
- An absence the engine **can exhibit** reads back as the engine reports it: `getComponent` for an
  unattached component, an unset dynamic property, and an unknown scoreboard objective or
  participant all return `undefined`. An empty collection is a real resting state.

## Errors

None of the engine's error classes is importable at runtime, so the library declares its own.

| class                      | thrown when                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `InvalidEntityError`       | a member of an entity whose reference has gone invalid; carries the readonly `id` and `type` of that entity               |
| `ArgumentOutOfBoundsError` | a numeric argument falls outside the bounds the engine enforces — `setCurrentValue`, `addEffect`'s amplifier and duration |
| `InvalidArgumentError`     | an argument's value is one the engine rejects outright — a bare id to `triggerEvent`                                      |
| `NotImplementedError`      | a declared member this cycle does not model; names the member                                                             |
| `UnsetValueError`          | a modelled member reads a value the test never supplied; names the member                                                 |

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

| id                                      | engine behaviour                                                                                                              | coverage     | what the library does                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dimension-registration-and-resolution` | dimension registration and `world.getDimension` resolution                                                                    | modelled     | via `withVanillaDimensions`; ids, aliases, height ranges and localization keys as observed                                                                                                                                                                                                                                                                                            |
| `get-dimension-unknown-id`              | `getDimension` with an unknown id                                                                                             | modelled     | plain `Error`, `Dimension '<id>' is invalid.` — including on a world where no preset was applied                                                                                                                                                                                                                                                                                      |
| `world-resting-state`                   | the world's resting state — empty collections, no players, no objectives                                                      | modelled     |                                                                                                                                                                                                                                                                                                                                                                                       |
| `fresh-entity-components`               | a freshly constructed entity's components                                                                                     | divergence   | construction populates nothing; in the engine a fresh entity always arrives carrying at least one component                                                                                                                                                                                                                                                                           |
| `xp-orb-spawn-frame`                    | the spawn frame of `minecraft:xp_orb`                                                                                         | divergence   | `asSpawnedEntity` applies zero rotation and velocity to every type; the engine spawns an `xp_orb` with a randomized rotation and a nonzero randomized velocity, drawn afresh per spawn                                                                                                                                                                                                |
| `per-type-vanilla-data`                 | per-type vanilla data — a sheep's fourteen components, its 8/8/0/8 health                                                     | not modelled | no preset supplies it; a package built on this one may                                                                                                                                                                                                                                                                                                                                |
| `entity-id-assignment`                  | entity id assignment                                                                                                          | divergence   | ids are decimal strings issued from `1` per bundle; the engine's are negative integers. `Entity.id` is documented opaque, so nothing may read the spelling either way                                                                                                                                                                                                                 |
| `entity-lookups`                        | `world.getEntity`, `getAllPlayers`, `getPlayers`, `dimension.getEntities`, `dimension.getPlayers`                             | modelled     | unfiltered, in creation order                                                                                                                                                                                                                                                                                                                                                         |
| `entity-query-options-filtering`        | `EntityQueryOptions` filtering, on the lookups and on `entity.matches`                                                        | divergence   | six of the twenty-four fields filter — `type`, `tags`, `name` and their `exclude` counterparts; each of the other eighteen throws `NotImplementedError` naming itself, where the engine honours them all                                                                                                                                                                              |
| `entity-tags`                           | entity tags — `addTag`, `removeTag`, `hasTag`, `getTags`                                                                      | modelled     | a per-entity set, which the `tags` and `excludeTags` filters read                                                                                                                                                                                                                                                                                                                     |
| `positional-entity-lookups`             | the other entity lookups — `getEntitiesAtBlockLocation`, `getEntitiesFromRay`, `getEntitiesFromViewDirection` and the rest    | not modelled |                                                                                                                                                                                                                                                                                                                                                                                       |
| `spawn-entity-placement`                | `dimension.spawnEntity` placement                                                                                             | divergence   | the entity lands exactly where asked; the engine adjusts some placements — a boat by 0.2 on x and z                                                                                                                                                                                                                                                                                   |
| `post-spawn-motion`                     | post-spawn motion                                                                                                             | divergence   | an entity never moves on its own; AI-driven mobs drift within a couple of dozen ticks                                                                                                                                                                                                                                                                                                 |
| `entity-remove-cascade`                 | `entity.remove()`                                                                                                             | modelled     | raises the `entityRemove` before-event, then detaches from the registry and invalidates the reference as one act, then raises the after-event — the engine's own cascade, which raises no death event either                                                                                                                                                                          |
| `trigger-event`                         | `entity.triggerEvent`                                                                                                         | divergence   | validates the prefixed id and records the call, changing no state; in the engine the event reshapes the entity                                                                                                                                                                                                                                                                        |
| `entity-kill-cascade`                   | `entity.kill()`                                                                                                               | modelled     | the full cascade, on an entity with and without a health component                                                                                                                                                                                                                                                                                                                    |
| `corpse-invalidation-after-kill`        | invalidation of a mob's corpse after `kill()`                                                                                 | modelled     | the corpse stays valid — inside the `entityDie` handler and after it — and turns invalid 21 ticks later, the constant the engine was measured at, so it goes stale when the test advances that far. Distinct from `remove()`, which invalidates at once                                                                                                                               |
| `kill-invalidation-without-health`      | invalidation after `kill()` on an entity with no health component                                                             | modelled     | the reference goes invalid before `entityDie` is raised, as the engine's does within the call                                                                                                                                                                                                                                                                                         |
| `attribute-shaped-components`           | the seven attribute-shaped components                                                                                         | modelled     | all four values, the bounds check, and the health-write cascade                                                                                                                                                                                                                                                                                                                       |
| `non-attribute-components`              | the other 61 entity components                                                                                                | not modelled | attachable, carrying `typeId`, `isValid` and `entity`; every other member throws                                                                                                                                                                                                                                                                                                      |
| `runtime-component-mutation`            | runtime component attachment and detachment                                                                                   | not modelled | the engine reaches it through data-driven paths; a test uses the `addComponent` / `removeComponent` free functions                                                                                                                                                                                                                                                                    |
| `namespace-prefix-tolerance`            | bare and prefixed id tolerance                                                                                                | modelled     | per-surface, as observed — `triggerEvent` rejects the bare form and the others accept it                                                                                                                                                                                                                                                                                              |
| `set-current-value-bounds`              | `setCurrentValue` bounds check                                                                                                | modelled     | including the message and both inclusive bounds                                                                                                                                                                                                                                                                                                                                       |
| `apply-damage-cascade`                  | `applyDamage` cascade, order and payloads                                                                                     | modelled     | including the unclamped negative health an overkill leaves, and unrounded fractional amounts                                                                                                                                                                                                                                                                                          |
| `apply-damage-boolean`                  | `applyDamage`'s boolean                                                                                                       | modelled     | reports admission — damageable entity, positive amount — not whether damage landed, as observed                                                                                                                                                                                                                                                                                       |
| `apply-damage-cause-and-source`         | `applyDamage` cause defaults and the `damagingEntity` carry-through                                                           | modelled     |                                                                                                                                                                                                                                                                                                                                                                                       |
| `killing-hit-boundary`                  | the killing-hit boundary                                                                                                      | modelled     | reaching `effectiveMin` exactly is fatal on both the damage and the component-write path                                                                                                                                                                                                                                                                                              |
| `apply-damage-without-health`           | `applyDamage` on an entity with no health component                                                                           | modelled     | returns `false`, fires nothing, leaves the entity valid                                                                                                                                                                                                                                                                                                                               |
| `damage-invulnerability-window`         | the damage-invulnerability window                                                                                             | divergence   | the fake has no i-frames, so consecutive `applyDamage` calls each take their full amount where the engine absorbs the second — a test driving repeated damage sees more health lost against the fake than the engine would take                                                                                                                                                       |
| `projectile-damage-adjustment`          | the engine's velocity-dependent projectile damage adjustment                                                                  | divergence   | the projectile options form applies the amount requested                                                                                                                                                                                                                                                                                                                              |
| `effect-add-and-replacement-rule`       | `addEffect` / `getEffect` / `getEffects` / `removeEffect` and the amplifier-first replacement rule                            | modelled     | including the duration half of the rule, compared against the duration remaining as observed                                                                                                                                                                                                                                                                                          |
| `add-effect-argument-bounds`            | `addEffect`'s argument bounds                                                                                                 | modelled     | amplifier `0…255`, duration `1…20000000`, `ArgumentOutOfBoundsError` outside either, nothing clamped, both message shapes reproduced                                                                                                                                                                                                                                                  |
| `add-effect-non-integer-arguments`      | `addEffect`'s non-integer arguments                                                                                           | modelled     | truncated toward zero, then bounds-checked — so duration `0.5` is refused                                                                                                                                                                                                                                                                                                             |
| `add-effect-nan-and-infinity`           | `addEffect` on `NaN` or `Infinity`                                                                                            | divergence   | the engine refuses these with a `TypeError` ahead of the bounds check; the fake does not reproduce that error's shape                                                                                                                                                                                                                                                                 |
| `display-name-amplifier-mapping`        | the display name's amplifier mapping                                                                                          | modelled     | bare base at amplifier 0, base plus the Roman numeral of amplifier + 1 at 1–5, bare base again from 6 to 255 — reproduced for all 37 vanilla types across the whole accepted amplifier range                                                                                                                                                                                          |
| `effect-duration-decay`                 | effect duration decay                                                                                                         | modelled     | one per tick the test advances, the observed rate, applied ahead of that tick's callbacks; nothing decays unless the test advances                                                                                                                                                                                                                                                    |
| `effect-duration-expiry-boundary`       | what the engine does when a duration reaches zero                                                                             | not modelled | unobserved, so there is nothing to reproduce: the library removes the effect on the tick it reaches 0 — never readable at 0, `getEffect` `undefined`, absent from `getEffects()` — and dispatches nothing, 2.8.0 declaring no effect-remove or effect-expire signal. That rule is the library's own, and no difference from the engine is claimed here because none has been measured |
| `vanilla-effect-display-names`          | `Effect.displayName` for the 37 vanilla types                                                                                 | modelled     | resolves with no test setup, from verbatim shipped base names and the computed numeral                                                                                                                                                                                                                                                                                                |
| `effect-display-name-locale`            | `Effect.displayName` in a locale other than the observed one                                                                  | divergence   | the shipped bases are the strings one server returned, and the API documents only a "player-friendly name" with no locale contract; until a second locale is observed the table is that locale's, and a test needing another registers its own bases                                                                                                                                  |
| `custom-effect-display-name`            | `Effect.displayName` for a custom effect type                                                                                 | divergence   | no base is shipped, so an unregistered custom type throws `UnsetValueError` where the engine would answer with whatever its own data holds                                                                                                                                                                                                                                            |
| `signal-subscription`                   | signal existence, `subscribe` / `unsubscribe`, reference dedupe and subscription order                                        | modelled     |                                                                                                                                                                                                                                                                                                                                                                                       |
| `filtered-subscription`                 | a filtered subscription — any options argument to `subscribe`                                                                 | divergence   | throws `NotImplementedError` naming the signal class; the engine filters the delivery, and honouring the call while dropping the filter would deliver events it withholds. The design has no row for this yet — plan-opus#119                                                                                                                                                         |
| `after-event-dispatch-timing`           | after-event dispatch timing                                                                                                   | divergence   | synchronous, inside the causing call; the engine defers past that call's return to later in the same tick                                                                                                                                                                                                                                                                             |
| `unraised-engine-signals`               | engine-raised signals outside the five after-events and three before-events the fakes raise                                   | not modelled | no fake behaviour raises them; a test drives one with `emit`                                                                                                                                                                                                                                                                                                                          |
| `before-event-cancellation`             | before-event cancellation                                                                                                     | modelled     | on the two signals whose payload declares `cancel`                                                                                                                                                                                                                                                                                                                                    |
| `cancelled-call-return-value`           | what a cancelled call returns                                                                                                 | modelled     | `addEffect` `undefined`, `applyDamage` `true` — the engine's own per-surface values, quirk included                                                                                                                                                                                                                                                                                   |
| `before-event-payload-writes`           | before-event mutable payload fields                                                                                           | divergence   | writes to `entityHurt.damage` and `effectAdd.duration` are honoured; the other four declared mutable fields are writable but unread, since the fake raises no action that consumes them                                                                                                                                                                                               |
| `throwing-subscriber`                   | a subscriber that throws                                                                                                      | divergence   | isolated as the engine isolates it, but the absorbed error is recorded for `getHandlerErrors` where the engine discards it                                                                                                                                                                                                                                                            |
| `tick-loop`                             | the tick loop                                                                                                                 | divergence   | nothing runs on its own; `currentTick` starts at 0 and moves only under `advanceTicks`                                                                                                                                                                                                                                                                                                |
| `system-scheduling`                     | `run` / `runTimeout` / `runInterval` / `clearRun` scheduling                                                                  | modelled     | every intervening tick's callbacks run during an advance                                                                                                                                                                                                                                                                                                                              |
| `run-job`                               | `runJob` / `clearJob`                                                                                                         | not modelled |                                                                                                                                                                                                                                                                                                                                                                                       |
| `dynamic-properties`                    | dynamic properties on the world and on entities                                                                               | modelled     | real storage over the declared value types                                                                                                                                                                                                                                                                                                                                            |
| `dynamic-property-byte-count`           | `getDynamicPropertyTotalByteCount`                                                                                            | not modelled | no source pins the engine's accounting                                                                                                                                                                                                                                                                                                                                                |
| `scoreboard`                            | the scoreboard — objectives, scores, participants, display slots                                                              | modelled     |                                                                                                                                                                                                                                                                                                                                                                                       |
| `message-and-title-output`              | `sendMessage` and `onScreenDisplay` output                                                                                    | modelled     | captured to a per-target log rather than displayed, and read back with `getOutput`                                                                                                                                                                                                                                                                                                    |
| `invalidation-guard`                    | the invalidation guard on entities, attribute components and effects                                                          | modelled     | the observed guard data, error class by error class, compiled into each member's prologue ahead of its body                                                                                                                                                                                                                                                                           |
| `guard-fires-at-call`                   | reading — not calling — a guarded method on an invalidated reference                                                          | modelled     | the read returns a function and the throw lands on the call, and a reference captured while valid still throws when it runs, as observed                                                                                                                                                                                                                                              |
| `arity-before-guard`                    | too few arguments checked ahead of the validity guard                                                                         | modelled     | each member's arity check runs before its guard prologue, so a call with too few arguments on an invalidated entity reports `TypeError` rather than `InvalidEntityError`, as the engine does                                                                                                                                                                                          |
| `extra-arguments`                       | extra arguments to a member                                                                                                   | modelled     | _with a caveat._ The fake ignores them. The engine has never been observed receiving too many — every arity observation is of too few — so no difference is claimed; if the engine rejects them, the fake is the more permissive of the two                                                                                                                                           |
| `in-operator-on-members`                | `in` on a declared but unmodelled member                                                                                      | modelled     | the member is really on the prototype, so `'teleport' in entity` is `true` and an unknown name `false`, as the engine answers, valid or invalidated alike                                                                                                                                                                                                                             |
| `own-enumerable-properties`             | `Object.keys`, spread and `JSON.stringify` over an entity                                                                     | modelled     | `typeId` and `id` are own data properties and every other member sits on the prototype, so all three read the engine's two own enumerable properties                                                                                                                                                                                                                                  |
| `for-in-enumeration`                    | `for-in` over an entity                                                                                                       | modelled     | the generator defines the prototype members `enumerable: true`, so `for-in` walks the engine's 62 while `Object.keys` still reads 2                                                                                                                                                                                                                                                   |
| `out-of-scope-surfaces`                 | items, blocks, containers, the player client surface, custom commands, the startup registries, and the eight registry classes | not modelled | declared in full and throwing                                                                                                                                                                                                                                                                                                                                                         |

## Divergences in detail

Each of these is a way a test can pass against the fake and fail against the engine. The heading is
the id and behaviour of the coverage row it belongs to.

### `fresh-entity-components` — a freshly constructed entity's components

`createEntity` attaches nothing. In the engine every freshly spawned entity arrives carrying at least
one component, and there is no common baseline set across types. A handler that assumes
`getComponent('minecraft:health')` answers on any live mob passes against the engine and throws
against the fake until the test calls `addComponent`. Populate what the code under test reads.

### `xp-orb-spawn-frame` — the spawn frame of `minecraft:xp_orb`

`asSpawnedEntity` applies zero rotation and zero velocity to every type. Seven of the eight types
sampled do spawn that way; `minecraft:xp_orb` spawns with a randomized y-rotation and a nonzero
randomized velocity, drawn afresh per spawn. Code that branches on an orb's initial motion sees
stillness here and movement there. The preset simplifies past it rather than modelling a per-type
draw.

### `entity-id-assignment` — entity id assignment

Assigned ids are opaque decimal strings issued sequentially from `1` within a bundle, never reissued.
The engine's are negative integers. `Entity.id` is documented as opaque with no meaning to be
inferred from its structure, so nothing may read the spelling either way — but a test that asserts
on the shape of an id, or parses one, is asserting on this library rather than on the engine.

### `entity-query-options-filtering` — `EntityQueryOptions` filtering, on the lookups and on `entity.matches`

Six of the twenty-four fields filter: `type`, `tags`, `name`, and the exclusions `excludeTypes`,
`excludeTags` and `excludeNames`. Each of the other eighteen throws `NotImplementedError` naming the
field it could not honour, where the engine honours them all. The throw is per field, not per call,
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

### `filtered-subscription` — a filtered subscription — any options argument to `subscribe`

`subscribe(handler, options)` throws `NotImplementedError` naming the signal class. The engine uses
the options to filter what it delivers — by entity type, by event id — and this library models no
filtering, so honouring the call would deliver events the engine would have withheld and a test
would assert on handlers that should never have run. Subscribe without options and filter inside the
handler.

This is the one divergence the design's coverage table does not yet carry a row for; it is the
library's own ruling, and plan-opus#119 asks the design to rule on it.

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
