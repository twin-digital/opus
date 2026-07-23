# Test plan

Planned coverage for `@twin-digital/minecraft-test-lib`, written against the interface before
any implementation exists. Case ids are stable references for review; each section notes the
design requirements (`r:`) and decisions (`d:`) from `minecraft/test-lib` it encodes. Cases
marked **[type]** are compile-time assertions (checked by `tsc --noEmit`, with
`@ts-expect-error` for negative cases); everything else is a vitest case asserting on
resulting state, never on recorded calls (`r:fakes-behave-not-record`). No test imports a
runtime value from `@minecraft/server` (`r:no-test-framework-dependency`,
`f:server-package-ships-types-only`).

## Typing and substitution (`src/typing.test.ts`) — d:fakes-implement-real-types, d:full-shape-with-stubs

- **TY1 [type]** `createWorld()` is a `World`; `spawnFake(...)` is an `Entity`;
  `getComponent('minecraft:health')` is `EntityHealthComponent | undefined` — all with no casts.
- **TY2 [type]** a spawn spec rejects a non-attribute component id (`'minecraft:variant'`) and
  a typo (`'helth'`) in `components` (`d:absence-is-answerable-for-any-id` — presence only for
  modeled types).
- **TY3 [type]** `emit(world.afterEvents.entityHurt, event)` requires an
  `EntityHurtAfterEvent`-shaped payload; a wrong payload shape is rejected (`d:emit-delivers-only`).
- **TY4 [type]** enum mirrors typecheck against the declared enums (`satisfies` in source) and
  `EntityComponentTypes.Health` has literal type `'minecraft:health'`
  (`d:runtime-enum-mirrors`, `d:enum-mirrors-named-as-declared`).
- **TY5 [type]** `AttributeComponentId` accepts `'health'` and `'minecraft:health'`, rejects
  `'minecraft:variant'` (`f:component-ids-are-derivable-from-types`, `d:ids-derived-not-transcribed`).
- **TY6 [type]** the fakes carry no members beyond the real surface: `Equals<keyof FakeX, keyof RealX>`
  holds for entity, world, dimension, after-events, component, and effect fakes — asserted in
  source next to each class (`r:no-shadowing-of-real-api`).
- **TY7 [type]** a spawn spec without `typeId` is rejected (`d:ids-auto-assigned-typeid-required`),
  and an attribute spec missing any of its four fields (e.g. `{ current: 20 }`) is rejected
  (`d:attribute-init-is-explicit`).

## Package manifest (`src/package.test.ts`) — d:zero-runtime-dependencies, r:target-server-version, r:no-test-framework-dependency

- **PK1** the manifest declares no `dependencies` at all; `@minecraft/server` appears only as
  the pinned peer (`'2.8.0'`) and a dev dependency; no test framework appears outside
  `devDependencies`.

## Errors (`src/errors.test.ts`) — d:library-defined-error-classes, f:invalid-entity-error-shape

- **ER1** `InvalidEntityError` extends `Error`, has `name === 'InvalidEntityError'`, and carries
  the invalid entity's `id` and `type`.
- **ER2** `NotImplementedError` extends `Error` and its message names the missing member.
- **ER3** a guard throw from a fake is caught by `instanceof InvalidEntityError`; a stub throw
  by `instanceof NotImplementedError`.

## Ids and enum mirrors (`src/ids.test.ts`) — d:canonical-prefixed-storage, f:namespace-prefix-is-optional

- **ID1** `canonicalizeId('health') === 'minecraft:health'`; an already-prefixed id and a
  custom-namespace id (`myns:thing`) pass through unchanged. (Internal helper — imported by
  the test directly; not part of the public index.)
- **ID2** mirrors carry the declared values: spot-check `EntityComponentTypes.Health`,
  `EntityDamageCause.none`, `EntityDamageCause.void`, and both mirrors' key counts (68 / 36).

## World and dimensions (`src/world.test.ts`) — d:instance-scoped-world, d:worlds-carry-vanilla-dimensions, d:first-surface-world-members

- **WD1** `createWorld()` returns a world whose three vanilla dimensions exist; bare and
  prefixed lookups return the same handle (`getDimension('overworld') ===
getDimension('minecraft:overworld')`).
- **WD2** `getDimension` with a non-vanilla id throws `NotImplementedError` — the real API
  documents a throw there but names no class, and the fake does not guess.
- **WD3** two `createWorld()` calls share nothing: an entity spawned in one is invisible to the
  other (`getEntity` undefined, dimension entity sets empty) — isolation is object lifetime.
- **WD4** `getEntity` returns the spawned handle by id, `undefined` for unknown ids, and
  `undefined` after `invalidate` (`r:invalidation-is-modeled`).
- **WD5** a spawned entity with a staged dimension appears in that dimension's `getEntities()`;
  one without a staged dimension appears in none; an invalidated one leaves the set.
- **WD6** `dimension.getEntities(options)` throws `NotImplementedError` for any options
  argument including `{}`; an explicit `undefined` argument counts as absent and behaves.
- **WD7** unbuilt world surface throws `NotImplementedError` naming the member:
  `world.beforeEvents`, `world.scoreboard`, `world.getAllPlayers`, and an unbuilt
  `afterEvents` signal (`world.afterEvents.entitySpawn`) (`d:first-signals-list`,
  `d:full-shape-with-stubs`).
- **WD8** `dimension.id` throws `NotImplementedError` (outside the behaving list; identity is
  by handle comparison).

## Construction (`src/spawn.test.ts`) — r:no-implicit-defaults, d:ids-auto-assigned-typeid-required, d:attribute-init-is-explicit, r:fakes-never-fabricate

- **SP1** a bare spawn (`{ typeId: 'zombie' }`) has no components: `getComponent` undefined,
  `hasComponent` false, `getComponents()` empty, `getEffects()` empty — absence reads exactly
  as the engine reports it.
- **SP2** `typeId` canonicalizes: spawning with `'zombie'` reads back `'minecraft:zombie'`;
  spawning with `'minecraft:zombie'` reads the same.
- **SP3** ids are unique and opaque across spawns; `spec.id` overrides; spawning a duplicate
  live id throws a `TypeError`.
- **SP4** `nameTag` defaults to `''`; a staged `nameTag` reads back; assignment via the real
  setter is observed by every read.
- **SP5** unstaged `location` and `dimension` reads throw `NotImplementedError` naming the
  missing field; staged ones read back exactly as staged (location by value, dimension by
  `getDimension` handle identity).
- **SP6** a staged health component reads back its full value set — current, default,
  effectiveMin, effectiveMax — exactly as written, none derived.
- **SP7** staging errors throw `TypeError`: the same component under both id forms (`health`
  and `minecraft:health`), and a `dimension` id that is not a vanilla dimension.
- **SP8** a staged non-health attribute id (e.g. `'minecraft:movement'`) is readable through
  `getComponent` with the same attribute surface.

## Bases (`src/bases.test.ts`) — d:bases-are-data, r:no-implicit-defaults

- **BA1** `livingMob` is inert data: spawning without it stages nothing; spreading it in stages
  20/20/0/20 health.
- **BA2** a test overrides a base by spread order:
  `{ ...livingMob, components: { ...livingMob.components, 'minecraft:health': {...} } }` wins.
- **BA3** spawning twice from the same base shares no state — mutating one entity's health
  leaves the other and the base object untouched.

## Entity behaviour (`src/entity.test.ts`) — r:fakes-behave-not-record, r:faithful-to-observable-api

- **EN1** tags: `addTag` true then false on repeat; `hasTag`; `removeTag` true only when
  present; `getTags` reflects state; two handles of the same entity observe one tag set
  (`d:entities-are-handles`).
- **EN2** components: `getComponent`/`hasComponent` accept bare and prefixed ids for the same
  staged component; unknown and unmodeled ids answer `undefined`/`false`
  (`d:absence-is-answerable-for-any-id`).
- **EN3** `getComponent('minecraft:health')` returns a handle with `typeId ===
'minecraft:health'`, `isValid === true`, and `entity` returning the owner handle.
- **EN4** `getComponents()` returns exactly the staged components' handles.
- **EN5** unbuilt guarded members on a _valid_ entity throw `NotImplementedError` naming the
  member (spot-check a property `isClimbing`, a method `teleport`, and `getDynamicProperty`).
- **EN6** unguarded unbuilt members (`isSneaking`, `scoreboardIdentity`) throw
  `NotImplementedError` on a valid _and_ an invalid entity — never `InvalidEntityError`
  (`f:invalidation-throws-are-mechanically-derivable`).

## Damage path (`src/damage.test.ts`) — d:behaving-methods-fire-their-events, d:damage-event-dispatch-order, d:health-writes-fire-health-changed, d:death-does-not-auto-invalidate, d:remove-and-kill-behave

- **DM1** `applyDamage(5)` on 20 health: returns true, `currentValue` 15 — state, not calls.
- **DM2** damage clamps at `effectiveMin`: `applyDamage(50)` on 20/min-0 health leaves 0.
- **DM3** `applyDamage` returns false and fires nothing for: amount `0`, negative amount, a
  missing health component, and health already at minimum (documented "takes any damage"
  contract).
- **DM4** event order for a lethal hit is exactly `entityHurt`, `entityHealthChanged`,
  `entityDie`; a non-lethal hit fires no `entityDie`; handlers see post-write health.
- **DM5** for an _unclamped_ hit, `entityHurt` carries `damage` = requested amount and
  `hurtEntity` = the entity handle; `entityHealthChanged` carries `oldValue`/`newValue`;
  `entityDie` carries `deadEntity`. (The `damage` value of a clamped hit has no fidelity
  source and is deliberately left unasserted.)
- **DM6** `damageSource`: cause `'none'` with no options; caller's `cause`/`damagingEntity`
  with `EntityApplyDamageOptions`; cause `'none'` plus `damagingProjectile` with the
  projectile options form (no cause field exists there).
- **DM7** `entityHealthChanged` fires on `setCurrentValue`, `resetToDefaultValue`,
  `resetToMaxValue`, `resetToMinValue` when the value changes, and not when it does not (e.g.
  `resetToMaxValue` at max) — keyed to the change, not the path.
- **DM8** a write that drives health to minimum through the component (`setCurrentValue(0)`,
  `resetToMinValue`) fires `entityHealthChanged` then `entityDie` (cause `'none'`).
- **DM9** a behaving death leaves the reference valid: after a lethal `applyDamage`, `isValid`
  is true and `id`/`typeId`/health reads still answer; the record is unchanged until
  `invalidate`.
- **DM10** `kill()`: drives health to minimum, fires `entityHealthChanged` then `entityDie`
  with `damageSource.cause === 'none'` (no `entityHurt`), returns true, reference stays
  valid; on an already-dead entity returns true and fires nothing; on an entity with no
  health component returns true and fires nothing.
- **DM11** `remove()`: invalidates (`isValid` false, `getEntity` undefined) and fires no death
  event.
- **DM12** non-health attribute writes (`minecraft:movement` `setCurrentValue`) fire no
  health events.
- **DM13** reentrancy: the cascade of a write is determined at write time. A handler
  subscribed to `entityHurt` that heals the entity (`resetToMaxValue`) observes the heal's
  own `entityHealthChanged` synchronously during the hurt dispatch; the damaging write's
  `entityHealthChanged` still fires afterwards with the values captured when the damage was
  written (pre-heal `oldValue`/`newValue`), and a lethal hit's `entityDie` still fires even
  when a hurt handler healed the entity mid-dispatch — in the engine, too, the death precedes
  the after-event handlers. Final state reflects both writes — the motivating heal-on-hurt
  shape.

## Components (`src/components.test.ts`) — d:per-member-guards, d:generic-throws-members-follow-owner, d:validity-guard-runs-first, d:control-plane-component-mutation

- **CP1** `setCurrentValue` sets and returns true; reads reflect it across handles.
- **CP2** `setCurrentValue` outside the staged bounds throws `NotImplementedError` (documented
  throw, unimportable class — the fake does not guess); bounds are inclusive — values _at_
  min or max are set normally.
- **CP3** resets go to the staged default/max/min values exactly.
- **CP4** on an invalidated owner: `currentValue`, `defaultValue`, `effectiveMax`,
  `effectiveMin`, the resets, `setCurrentValue`, and `entity` all throw `InvalidEntityError`;
  `isValid` reads false and `typeId` still answers (`f:invalidation-throws-non-uniformly`).
- **CP5** guard order: invalid owner + out-of-bounds value → `InvalidEntityError`, not
  `NotImplementedError`.
- **CP6** `addComponent` stages a component on a live entity (readable through
  `getComponent`), and replaces the state of one already present.
- **CP7** `removeComponent` makes absence answerable again (`getComponent` undefined,
  `hasComponent` false); removing an absent component is a no-op; a surviving handle reads
  `isValid` false and its value members throw `NotImplementedError`.

## Effects (`src/effects.test.ts`) — d:effect-add-replaces, d:no-tick-clock, r:fakes-never-fabricate

- **EF1** `addEffect('resistance', 6000, { amplifier: 255 })`: `getEffect` (bare or prefixed)
  returns a handle with `typeId 'minecraft:resistance'`, `duration` 6000, `amplifier` 255;
  `getEffects` lists it.
- **EF2** amplifier defaults to 0 when options omit it.
- **EF3** re-adding replaces amplifier and duration unconditionally, observed through the
  handle obtained before the replace (`d:entities-are-handles`).
- **EF4** duration never advances — no clock; it reads exactly as staged or set.
- **EF5** `removeEffect` true when present / false when absent; after removal `getEffect` is
  undefined and a surviving handle reads `isValid` false, its value members throwing
  `NotImplementedError`.
- **EF6** `displayName` throws `NotImplementedError` even on a live effect.
- **EF7** `addEffect` returns the same live handle `getEffect` returns (signature-over-prose
  choice documented in the source).
- **EF8** effect members on an invalidated owner throw `InvalidEntityError`; `isValid` false.
- **EF9** an `EffectType`-shaped argument (`{ getName: () => 'resistance' }`) is accepted
  wherever an effect id is.
- **EF10** removal is final for a handle: `removeEffect` then `addEffect` of the same type
  creates fresh state — `getEffect` returns a live handle while the pre-removal handle stays
  invalid.

## Invalidation (`src/invalidation.test.ts`) — r:invalidation-is-modeled, f:invalidation-throws-non-uniformly

- **IV1** after `invalidate(entity)` on a handle the test already holds: `isValid` false;
  `id`, `typeId`, `nameTag` still answer; every built guarded member (`applyDamage`,
  `getComponent`, `hasTag`, `addEffect`, `kill`, `remove`, `location`, `dimension`, ...)
  throws `InvalidEntityError` carrying the entity's id and type.
- **IV2** unbuilt guarded members on an invalid entity throw `InvalidEntityError` (not
  `NotImplementedError`) — guard first (`d:validity-guard-runs-first`).
- **IV3** invalidating twice is a no-op; `remove()` then `invalidate` likewise.
- **IV4** invalidation is mid-test on live references: handles obtained before `invalidate`
  exhibit the stale-reference shape without re-fetching.
- **IV5** `invalidate` fires no events — no subscriber on any of the three signals is called.

## Events and emit (`src/events.test.ts`) — d:control-plane-is-free-functions, d:emit-delivers-only, d:first-signals-list

- **EV1** `subscribe` returns the passed closure; `unsubscribe` stops delivery;
  re-subscription after unsubscribe delivers again. (Subscribing the same closure twice has
  no fidelity source; the plan deliberately does not assert either way.)
- **EV2** `subscribe` with filtering options throws `NotImplementedError` on all three
  signals, including an empty `{}`; an explicit `undefined` counts as absent.
- **EV3** `emit` delivers the exact payload object to all subscribers of that signal and no
  other; it mutates nothing (health unchanged after emitting an `entityHurt`).
- **EV4** `emit` delivers to a handler an event whose `hurtEntity` the test has already
  invalidated — the handler's guarded access throws `InvalidEntityError` inside the handler,
  the library's motivating scenario (`r:invalidation-is-modeled`).
- **EV5** `emit` on a foreign object (not a library signal) throws a `TypeError`.
- **EV6** delivery is synchronous and ordered: subscribers are called in subscription order
  during the `emit`/behaving call itself.
- **EV7** unsubscribing a never-subscribed closure is a no-op.

## Consumer shape (`src/consumer.test.ts`) — the motivating slice, end to end

- **CO1** the `mc-scripting-core` invulnerability pattern runs unmodified against the fakes:
  subscribe a heal-on-hurt handler keyed on a tag, damage a tagged mob, assert it healed to
  max; damage an untagged mob, assert it did not — with the handler's try/catch surviving an
  entity invalidated mid-event (staged via `emit`).

## Explicitly out of scope

- `Effect`/duration bound validation on `addEffect` inputs (engine rejects out-of-range
  values; the fake stores as given — documented gap, loud only through the absence of
  validation, accepted for the first surface).
- Effect-type existence validation (`getEffect` on a nonexistent type throws
  `InvalidArgumentError` in the engine; the fake reads absent — no runtime registry exists,
  `d:zero-runtime-dependencies`).
- Event delivery filtering via subscription options (throws `NotImplementedError` instead).
