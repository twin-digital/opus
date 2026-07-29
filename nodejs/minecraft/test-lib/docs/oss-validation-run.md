# Validation run: a real pack's engine-facing code, tested against the fakes

A check that the library works for its purpose, run against a public pack rather than against its own
test suite. The candidate shortlist and how it was chosen is in `oss-validation-candidates.md`.

**Subject**: [`bencrob/marron-town-mod`](https://github.com/bencrob/marron-town-mod) at `2c025b4`,
MIT. An RPG add-on in hexagonal architecture. Its own suite is 14 vitest spec files over `domain/`
and `application/`; `infrastructure/` — the layer that touches `@minecraft/server` — had no double
and no tests. That layer is what this exercises.

**Subjects under test**, all **unmodified**: `combat-handler.ts`, `scoreboard-skill-repository.ts`
(over `scoreboard-util.ts`), `minecraft-messenger.ts` and `passive-applier.ts`.

## Result

**14 tests across two files, all passing**, asserting on state rather than on calls — the victim now
carries poison for 60 ticks, its health is now 10, the scoreboard now holds attack 20 for that
player, that player's output log now reads action bar then message. The pack's own 14 spec files
still pass alongside.

The two files split by how the pack reaches the engine. `combat-handler.test.ts` drives a handler
that takes its event as a parameter — object substitution with no aliasing of `world` at all.
`adapters.test.ts` drives the adapters that read the module-scope `world` singleton, which is how
most packs are written, and which needs the alias to hold the fakes (see friction 1).

### Paths exercised

| library surface                                                                             | reached by                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| effects, `applyDamage`, health component, entity identity                                   | `CombatHandler`                              |
| **event dispatch end to end** — `applyDamage` raises `entityHurt`, a subscriber consumes it | the bus test, mirroring `main.ts:126`        |
| **scoreboard** — objectives created on demand, scores per participant                       | `ScoreboardSkillRepository`                  |
| **output capture** — `sendMessage`, `onScreenDisplay.setActionBar`, world broadcast         | `MinecraftMessenger`                         |
| **`world.getAllPlayers`**, effects on players                                               | `PassiveApplier.tick`                        |
| **`UnsetValueError`** on a value the test never supplied                                    | `PassiveApplier` reading `player.location.y` |

The end-to-end case is the one worth calling out: no payload was hand-built. The fake raised
`entityHurt` from `applyDamage` carrying `hurtEntity`, `damage` and a `damageSource` with `cause` and
`damagingEntity`, and the pack's handler read all four without noticing anything.

The `UnsetValueError` case is the design's "never fabricate" rule meeting real code: with mining 80
the perk reads `player.location.y`, and a player created without a location refuses rather than
answering `0`. The pack's own `try/catch` is around `addEffect`, not around the read, so it surfaces.

**The tests discriminate.** Nine mutations were applied across the pack's handler, scoreboard helper
and passive loop; eight are behavioural and all eight failed the suite:

| mutation                                        | caught              |
| ----------------------------------------------- | ------------------- |
| poison every 9 hits instead of 10               | ✅ 2 failed         |
| drop the `instanceof Player` guard              | ✅ 1 failed         |
| crit multiplier 1.5 → 2.0                       | ✅ 1 failed         |
| per-attacker tally becomes global               | ✅ 2 failed         |
| stop ignoring self-inflicted `override` damage  | — equivalent mutant |
| `writeScore` drops the value                    | ✅ 5 failed         |
| scores keyed by objective only, not participant | ✅ 5 failed         |
| passive effect duration 80 → 40                 | ✅ 1 failed         |
| suppression window ignored                      | ✅ 1 failed         |

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

### 3. Most packs reach `world` by module import, not by parameter

`CombatHandler` takes its event as a parameter, so object substitution reaches it directly. The other
three adapters do `import { world } from '@minecraft/server'` and call `world.getAllPlayers()` or
`world.scoreboard` at use time — the shape the survey found in most packs, and the shape
`r:object-substitution-not-module-mocking` says is outside the library's reach.

In practice the consumer's alias closes it: the stub exports `world` and `system` as live bindings
plus a `__useServer(server)` setter, the test calls it in `beforeEach`, and the adapter reads the
fake at call time. That is the consumer's own test configuration rather than anything the library
does, and it is what made eight of these fourteen tests possible. Worth stating in the README so a
consumer does not conclude the library cannot reach their pack.

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
  combat-handler.test.ts        # six tests, injected event, no world aliasing
  adapters.test.ts              # eight tests over the module-scope world singleton
  marron-town-mod/              # git clone --depth 1, pinned at 2c025b4
```

The test imports the library from source and the pack from its own `src/`, so nothing is built.
