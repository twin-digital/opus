# Validation run: a real pack's engine-facing code, tested against the fakes

A check that the library works for its purpose, run against a public pack rather than against its own
test suite. The candidate shortlist and how it was chosen is in `oss-validation-candidates.md`.

**Subject**: [`bencrob/marron-town-mod`](https://github.com/bencrob/marron-town-mod) at `2c025b4`,
MIT. An RPG add-on in hexagonal architecture. Its own suite is 14 vitest spec files over `domain/`
and `application/`; `infrastructure/` — the layer that touches `@minecraft/server` — had no double
and no tests. That layer is what this exercises.

**Subject under test**: `src/infrastructure/combat-handler.ts`, **unmodified**. `CombatHandler.handle`
takes an `EntityHurtAfterEvent` and reads everything from it, so no refactor was needed to reach it.

## Result

Six tests, all passing, asserting on entity state rather than on calls — the victim now carries
poison for 60 ticks, the victim's health is now 18. The pack's own 14 spec files still pass alongside.

**The tests discriminate.** Five mutations were applied to the pack's handler; four are behavioural
and all four failed the suite:

| mutation                                       | caught              |
| ---------------------------------------------- | ------------------- |
| poison every 9 hits instead of 10              | ✅ 2 failed         |
| drop the `instanceof Player` guard             | ✅ 1 failed         |
| crit multiplier 1.5 → 2.0                      | ✅ 1 failed         |
| per-attacker tally becomes global              | ✅ 2 failed         |
| stop ignoring self-inflicted `override` damage | — equivalent mutant |

The survivor is not a gap: the `override` short-circuit is redundant with the `entityAttack` check
below it, so removing it changes nothing observable. Worth reporting upstream as dead defensive code.

## What the library got right, unprompted

- `addComponent(victim, 'minecraft:health', 20)` — the single-number shorthand was what the test
  wanted to write.
- `victim.getEffect('poison')` — the bare id resolved against the stored prefixed form.
- `applyDamage` with `cause: 'override'` ran the full cascade and left `currentValue` at 18, so the
  crit branch could be asserted on health rather than on a spy.
- Nothing in the handler's path hit `NotImplementedError`.

## Two frictions a consumer meets before any of that works

Both are about **loading** the pack, not about the fakes. They are raised for the design's owner as
plan-opus issue #110.

### 1. `@minecraft/server` cannot be imported at runtime

The published package has no `main`, no `exports` and no `types` key — TypeScript finds `index.d.ts`
by convention, and node finds nothing:

```
node -e "import('@minecraft/server')"   # ERR_MODULE_NOT_FOUND
```

So a pack that imports a **value** — `EntityDamageCause.entityAttack`, `Player`, `TicksPerSecond` —
cannot be loaded by a test runner at all, before the fakes get a chance. `@minecraft/vanilla-data`
does not close this: it ships 12 exports, all _id_ constants (`MinecraftEffectTypes` and friends),
and no API enums.

The consumer must alias the module in `vitest.config.ts` and supply the values. For this run the
enum values were **generated from the pinned declarations** — 64 enums, mechanical, ~20 lines of
generator. That is the shape of the thing every consumer will otherwise hand-roll; one surveyed pack
carries 1,187 lines of it.

### 2. `instanceof Player` cannot answer for a fake

`CombatHandler` opens with `if (!(attacker instanceof Player) ...) return`, which is an ordinary
Bedrock idiom. A fake is not an instance of anything the pack imports, so under object substitution
this is `false` and the handler returns before its logic runs — the test would pass while exercising
nothing.

It is solvable from the consumer's side, but only by guessing:

```js
// stub/minecraft-server.js
const brand = (member) => ({
  [Symbol.hasInstance]: (value) => typeof value === 'object' && value !== null && member in value,
})
export const Player = brand('onScreenDisplay') // a member Entity does not have
```

That works — the `instanceof Player` mutation above was caught because of it — but it asks the
consumer to know which member distinguishes a player from an entity. Exporting brand predicates
(`isPlayer`, `isEntity`) would make the stub exact instead of inferred.

## Reproducing

The harness is four files beside a clone of the pack:

```
validation/
  package.json                  # vitest only
  vitest.config.ts              # resolve.alias: '@minecraft/server' -> ./stub/minecraft-server.js
  stub/minecraft-server.js      # re-exports the generated enums; Player/Entity as Symbol.hasInstance brands
  stub/enums.generated.js       # 64 enums, generated from the pinned index.d.ts
  combat-handler.test.ts        # the six tests
  marron-town-mod/              # git clone --depth 1, pinned at 2c025b4
```

The test imports the library from source and the pack from its own `src/`, so nothing is built.
