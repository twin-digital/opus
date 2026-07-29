# Open-source packs to validate the library against

A shortlist of real, public behavior packs whose logic could be tested with
`@twin-digital/minecraft-test-lib`, as a check that the fakes are usable outside their own test
suite. Every repository below was cloned and read at the commit named; nothing here is reported from
the survey's numbers alone.

Starting point: `/workspace/plan-opus/design/minecraft/test-lib/artifacts/pack-api-survey/`
(103 accepted repositories, `usage.json` per-repo API counts). Repositories were ranked by the share
of their API references that fall inside what the library models — entities, the seven attribute
components, effects, damage, events, `system` scheduling, dynamic properties, scoreboards, message
output — against the share that falls in items / blocks / containers / UI, which throw
`NotImplementedError` this cycle. The top of that ranking was then opened and read. Two candidates
(`marron-town-mod`, `LushWay/Scripts`) came from a separate GitHub code search for packs that
already run `vitest`. Of those two only `marron-town-mod` is outside the survey sample;
`LushWay/Scripts` is an accepted repo in `packs.json` (corrected against the full re-check recorded
in the planning repository's `pack-testing-survey`).

## A prerequisite that applies to every candidate

`@minecraft/server@2.8.0` ships `index.d.ts` and nothing else — its `package.json` declares no
`main`, no `exports`, no `types`. `import('@minecraft/server')` at runtime fails with
`ERR_MODULE_NOT_FOUND`. So any pack module that imports a **value** from it — `world`, `system`,
`Player`, `ItemStack`, `EntityDamageCause`, `EasingType`, `TicksPerSecond` — cannot be loaded in a
test process at all until `@minecraft/server` resolves to _something_.

This is separate from the library's "never intercepts the import" rule, and it is not optional.
A test suite for any pack below needs a vitest `alias` pointing `@minecraft/server` at a stub that
exports the enums and constants as plain values. The library's own tests sidestep it by casting
strings (`src/damage.test.ts`: "`EntityDamageCause` is types-only at runtime, so a cause is written
as its string value"), which works for the library but not for a pack whose source says
`EntityDamageCause.entityAttack`.

The honest framing for a validation exercise: the alias stub supplies the **enums**, the library
supplies the **objects**, and the pack must be refactored so the objects arrive as parameters rather
than through the aliased module. If the stub also exported a `world`, the refactor would be
unnecessary and the library would be bypassed — so the stub should export enums and throw on
`world`/`system`.

A finding worth carrying back: the library exports no runtime enum values. Every consumer will
hand-roll that stub. It is a small, purely mechanical, generated-from-declarations addition.

---

## 1. bencrob/marron-town-mod

- **Repo**: https://github.com/bencrob/marron-town-mod (`2c025b4`)
- **Licence**: MIT (`Copyright (c) 2026 bencrob`)
- **Size**: 2,514 non-blank lines under `src/`, 268 KB repo
- **What it does**: an RPG add-on — four skill trees bought with vanilla XP levels, a 12-hour
  rotating shop, passive effects and combat perks driven by skill levels. Written in hexagonal
  architecture: `domain/` (pure), `ports/` (interfaces), `application/` (use cases), and
  `infrastructure/` (the adapters that actually touch `@minecraft/server`).

**Surfaces used.** `world.scoreboard` objectives/scores as the persistence layer
(`infrastructure/scoreboard-util.ts`, `scoreboard-skill-repository.ts`, `scoreboard-world-store.ts`);
`Entity.addEffect` and `Entity.applyDamage` (`passive-applier.ts`, `combat-handler.ts`);
`world.getAllPlayers`, `player.onScreenDisplay.setActionBar`, `player.sendMessage`
(`minecraft-messenger.ts`, `player-finder.ts`); `system.currentTick` (`minecraft-clock.ts`);
`EntityHurtAfterEvent` payload fields (`hurtEntity`, `damage`, `damageSource.cause`,
`damageSource.damagingEntity`).

**Modelled vs. throwing.** Scoreboard, effects, damage, `getAllPlayers`, message and action-bar
output, `system.currentTick` — all modelled. What throws: `dimension.getBlock` and `spawnParticle`
inside `PassiveApplier.detectOres` (ore-detection perk only, gated behind a capability flag that a
test can leave off), and the whole of `menu-controller.ts` / `shop-controller.ts` /
`minecraft-item-service.ts`, which are `@minecraft/server-ui` and `ItemStack` — out of scope, and
already isolated behind the `ItemService` port.

**Entry point.** The best-shaped candidate found. `main.ts` is a composition root: it constructs
adapters and injects them. The handlers are classes whose methods take their input as a parameter —
`CombatHandler.handle(event)`, `HandleDeath.onRespawn(playerId)`, `PassiveApplier.tick(currentTick)`
— and take their collaborators through the constructor. `CombatHandler.handle` needs **no refactor
at all**: it reads everything from the event payload the caller hands it. The adapters that reach
module-scope `world` (`scoreboard-util.ts`, `player-finder.ts`, `passive-applier.ts`) need one
parameter each — `readScore(world, id, participant)`, or a `world` constructor argument defaulted to
the imported one. That is the smallest refactor on this list and it is the refactor the codebase's
own architecture already implies.

**Why it is the right kind of target**: the repo already runs `vitest` with 14 spec files — all of
them over `domain/` and `application/`, using its own hand-written `src/testing/fakes.ts` port
doubles. `vitest.config.ts` carries the comment _"Le domaine est pur : pas besoin de mock
@minecraft/server"_. The adapter layer — the half that touches the engine — is untested precisely
because there was no fake for it. That is the gap this library exists to fill, in a pack that
already believes in testing.

**First test.** `CombatHandler`, poison-every-N-hits rule, no source change:

```ts
const server = createServer()
const attacker = createPlayer(server, { name: 'Alice' })
const victim = createEntity(server, { typeId: 'minecraft:zombie' })
addComponent(victim, 'minecraft:health', { current: 20, value: 20 })

const repo = new InMemorySkillRepository() // the pack's own fake
repo.save(attacker.id, { ...emptyState(), levels: { ...zero, attack: 10 } })
const handler = new CombatHandler(repo)

for (let i = 0; i < 9; i++) {
  handler.handle({
    hurtEntity: victim,
    damage: 4,
    damageSource: {
      cause: 'entityAttack' as EntityDamageCause,
      damagingEntity: attacker,
    },
  })
  expect(victim.getEffect('poison')).toBeUndefined()
}
handler.handle({
  hurtEntity: victim,
  damage: 4,
  damageSource: {
    cause: 'entityAttack' as EntityDamageCause,
    damagingEntity: attacker,
  },
})
expect(victim.getEffect('poison')?.duration).toBe(60)
expect(victim.getEffect('poison')?.amplifier).toBe(0)
```

The assertion is on the victim's _state_ — the effect is now present with that duration — not on a
`addEffect` spy. The crit branch is `Math.random()`-gated and is a second test with `vi.spyOn(Math,
'random')`; `critSurplus` is already unit-tested pure, so the interesting assertion there is that the
victim's `minecraft:health` `currentValue` fell by the surplus.

---

## 2. xigma0512/GunFight-Arena

- **Repo**: https://github.com/xigma0512/GunFight-Arena (`0f16e88`)
- **Licence**: MIT (`Copyright (c) 2025 xigma0512`)
- **Size**: 1,440 non-blank lines of TypeScript under `src/`, 47 files, 491 KB repo
- **What it does**: a Counter-Strike-style demolition mode — two teams, a bomb, rounds, a six-state
  round state machine (`Idle → Preparation → Running → BombPlanted → Waiting → GameOver`), per-player
  kill/death/plant/defuse stats, a team score to a winning threshold.

**Surfaces used.** Entity and world dynamic properties as the whole persistence layer
(`src/property/**`, JSON blobs under `temp_stat`, `total_stat`, `team_score`, `positions`);
`world.afterEvents.entityDie` and `entityHealthChanged`; `system.runInterval` / `clearRun` wrapped in
a `Task` class; `player.addEffect` (saturation, slowness, health_boost, instant_health);
`world.getAllPlayers`; `player.sendMessage` and `onScreenDisplay.setActionBar` / `setTitle`.

**Modelled vs. throwing.** Dynamic properties, `entityDie`/`entityHealthChanged`, `addEffect`,
`removeEffect`, `getAllPlayers`, scheduling, message and title output — all modelled. Throwing:
`player.getComponent('inventory').container` and `equippable` (used in `PlayerUtils.clearInventory`,
`RealTimeTask.HandItemDetect`, and the bomb-carrier check in `playerDead`), `ItemStack`,
`server-ui` forms, `setSpawnPoint`, `playSound`, `spawnParticle`, `setHudVisibility`. The split is
clean: the round/state/stat logic is entirely on the modelled side, and the item work is in
`PlayerUtils` and the real-time HUD tasks.

**Entry point.** Mixed, and the mix is informative. The per-entity property classes take the entity
in their constructor (`new PTempStat(entity)`, `new PAlive(entity)`) — **testable with no refactor**.
`TeamUtils.getAlive(team, players)` and `getPlayers(team, players)` take the player array —
no refactor. The world-scoped property classes (`PTeamScore`, `PGameMode`, `PPosition`) read
module-scope `world`, as do `BroadcastUtils` and the event subscribers, which put the handler body
inside `world.afterEvents.X.subscribe(...)` in a static `subscribe()` method. The honest refactor is
to lift each handler body to an exported function — `export function onEntityDie(ev, { world })` —
leaving `subscribe()` as the one-line binding, and to give the three world property classes a `world`
parameter. Roughly six touched files.

**First test.** The kill/death bookkeeping in `entityDie`, after that lift:

```ts
const server = createServer()
const killer = createPlayer(server, { name: 'Alice' })
const victim = createPlayer(server, { name: 'Bob' })
victim.setDynamicProperty('team', Team.Red)
killer.setDynamicProperty('team', Team.Blue)

onEntityDie(
  { deadEntity: victim, damageSource: { cause: 'entityAttack', damagingEntity: killer } },
  { world: server.world },
)

expect(JSON.parse(killer.getDynamicProperty('temp_stat') as string).kills).toBe(1)
expect(JSON.parse(victim.getDynamicProperty('temp_stat') as string).deaths).toBe(1)
expect(getOutput(killer).messages).toContain('§l§b[BLUE]Alice §4KILLED §c[RED]Bob')
```

That last line is what the library buys that a hand-rolled double does not: the broadcast fans out
over `world.getAllPlayers()` and lands in a per-player output log that reads back verbatim, colour
codes and all. A second test drives `Running.update()` — set two players alive on Blue, none on Red,
call `update()`, assert the team score moved and the state advanced to `Waiting`.

**Caveat**: `package.json` pins `@minecraft/server@^1.17.0`. The pack predates 2.x renames
(`getComponent('inventory')` bare ids are still accepted; `EntityQueryOptions.type` vs `types` bites
elsewhere in the ecosystem). Test against 2.8.0 semantics and expect to correct a couple of call
sites — which is itself a real finding about what the library is for.

---

## 3. ypacks/scoreboards

- **Repo**: https://github.com/ypacks/scoreboards (`0c787f4`)
- **Licence**: MIT (`Copyright (c) 2023 Yet`)
- **Size**: 266 non-blank lines of TypeScript, 7 files, 177 KB repo — the smallest here
- **What it does**: chat commands (`?newscoreboard deaths <name> <slot> <order>`) that create and
  destroy scoreboard objectives tracking deaths, blocks placed, and blocks broken.

**Surfaces used.** `world.scoreboard` — `getObjective`, `addObjective`, `removeObjective`,
`getScore`, `setScore`, `getParticipants`, `removeParticipant`, `setObjectiveAtDisplaySlot` with
`DisplaySlotId` and `ObjectiveSortOrder`; `world.afterEvents.entityDie` subscribe/unsubscribe;
`world.getPlayers`; `player.scoreboardIdentity`; `system.run`; `player.sendMessage`.

**Modelled vs. throwing.** Essentially all of it is modelled — the scoreboard, display slots,
`entityDie`, `system.run`, `sendMessage`, `scoreboardIdentity`. Two exceptions on cold paths:
`player.runCommand` (a fallback taken only when `scoreboardIdentity` is `undefined`) and
`world.beforeEvents.chatSend`, which no longer exists in 2.8.0 — the command parser in `main.ts` is
therefore untestable as written, but it is thin argument-splitting and the commands it dispatches to
are the substance.

**Entry point.** `commands/death.ts` exports `add(name, display, sortOrder, playerCommand)` and
`remove(player)`; the player already arrives as a parameter, and only `world` and `system` come from
module scope. One added parameter — `add(server, name, display, sortOrder, playerCommand)` — makes
the whole file testable. `util.ts` (`removePlayerOffline`, `input.fixDisplay`, `msg`) takes its
objective as a parameter and needs nothing.

**First test.** The death counter, end to end through a real event:

```ts
const server = createServer()
const alice = createPlayer(server, { name: 'Alice' })
alice.nameTag = 'Alice'

add(server, 'Deaths', DisplaySlotId.Sidebar, ObjectiveSortOrder.Descending, alice)
advanceTicks(server, 1) // the subscribe is inside system.run

emit(server.world.afterEvents.entityDie, {
  deadEntity: alice,
  damageSource: { cause: 'fall' as EntityDamageCause },
})

const objective = server.world.scoreboard.getObjective('deaths')
expect(objective?.getScore(alice.scoreboardIdentity!)).toBe(1)
expect(getOutput(alice).messages[0]).toContain('Deaths scoreboard has been added')
```

This exercises four free functions at once (`emit`, `advanceTicks`, `getOutput`, `createPlayer`) and
asserts on scoreboard state the engine would hold. A second test is the `isValid` sweep in
`removePlayerOffline`: create two participants, `invalidate()` one, and assert only the valid one
survives — a case a hand-rolled double essentially cannot express, and one where the pack's `2023`
code calls `participant.isValid()` as a **method** where 2.8.0 declares a property. The library would
catch that as a `TypeError` rather than silently passing, which is a real bug-find and the most
convincing single result this exercise could produce.

---

## 4. JaylyDev/terminator

- **Repo**: https://github.com/JaylyDev/terminator (`5e5b4ee`)
- **Licence**: **GPL-3.0** — see caveat
- **Size**: 3,655 non-blank lines of TypeScript, 20 stars — the most-starred candidate
- **What it does**: adds a player-like hostile robot mob with scripted AI: it builds toward its
  target, escapes when hurt, uses nether portals, rides transport, drops inventory on death, and
  respawns through a three-stage death sequence.

**Surfaces used.** `EntityHealthComponent.currentValue`; `addEffect` (regeneration, absorption,
resistance, fire_resistance); entity dynamic properties (`terminator:escape_triggered`,
`terminator:name_tag`); `hasTag`; `entity.triggerEvent`; `system.runInterval`; `world.sendMessage`
with `RawMessage`; `dimension.spawnEntity`; a custom `EventSignal` layer wrapping `entityHurt` and
`entityDie`.

**Modelled vs. throwing.** Health component, effects, dynamic properties, tags, scheduling,
`spawnEntity`, message output and `triggerEvent`-call recording are modelled. Throwing: everything
navigation and block — `dimension.getBlock`, `BlockPermutation.resolve`,
`getEntitiesFromViewDirection`, inventory drops, and the `@minecraft/math` / `@minecraft/vanilla-data`
dependencies (harmless — they are real runtime packages). The AI-movement half of the pack is out of
reach; the health/effect/state half is squarely in.

**Entry point.** `TerminatorEntity` wraps an entity passed to its constructor, which is the right
shape. But the rules themselves sit at module scope inside `system.runInterval(...)` and
`someSignal.subscribe(...)` at import time — `escapeFromDanger.ts` is a bare `system.runInterval`
with the whole rule in its body. The refactor is a body-lift per rule file
(`export function checkEscape(entity)`), same shape as GunFight-Arena but across more files.

**First test** (`escapeFromDanger`, after the lift): give a terminator a health component at
`current: 19, value: 60`, no `terminatorNoRegeneration` tag, no `escape_triggered` property, run the
rule, then assert `entity.getEffect('regeneration')` has `amplifier` 4 and `duration` 120, that
`absorption`/`resistance`/`fire_resistance` are all present, and that
`getDynamicProperty('terminator:escape_triggered')` is now `true`. Then re-run and assert nothing
changed a second time — the latch. The boundary case is the sharp one: `currentValue` exactly 20
must apply **nothing**, because the rule reads `< 20`.

**Licence caveat.** GPL-3.0. Vendoring a snippet into a fixture inside this monorepo would put GPL
code in it. The clean route is a fork of _their_ repo carrying the tests, which GPL-3.0 permits
outright — a fine outcome for a validation exercise, and arguably a better one (it produces an
upstreamable PR). It is ranked fourth for that friction, not for its code.

---

## 5. ForestOfLight/Statistic-Display

- **Repo**: https://github.com/ForestOfLight/Statistic-Display (`cd4c89e`)
- **Licence**: MIT
- **Size**: 1,235 non-blank lines of JavaScript under `packs/BP/scripts/src`, 14 stars
- **What it does**: tracks 20+ per-player statistics (deaths, damage taken by cause, blocks mined,
  play time, kills) and shows them on a scoreboard-style display with a rotating carousel.

**Surfaces used.** World dynamic properties as bulk storage (`BulkDP` chunks JSON across several
properties); `world.afterEvents.entityHurt`, `entityDie`, `effectAdd`, `playerSpawn`, `worldLoad`;
`world.getPlayers({ name })`; the scoreboard; `system.runInterval`.

**Modelled vs. throwing.** Dynamic properties, the event set, the scoreboard, `getPlayers` with a
`name` filter (one of the six `EntityQueryOptions` fields modelled) — all in. Out: the block/item
event families that back roughly half the tracked statistics, and
`getDynamicPropertyTotalByteCount`, which `BulkDP` may use for its chunking. The pack also depends on
an external **Canopy** extension framework (`lib/canopy`) for its commands and rule settings, which
is a second, unmodelled surface to stand up.

**Entry point.** The weakest of the five. `eventManager` is a module-scope singleton constructed at
import time, and its `BulkDP` reads `world` directly; every `events/*.js` file registers itself as an
import side effect. Injecting `world` means threading it through the singleton's construction, which
is more surgery than "extract a function". The `StatList` class is genuinely pure and needs no fake
at all, which is a hint about where the seam should be.

**First test** (worth writing anyway, because `entityHurt` sub-event registration is real logic):
subscribe the `damageTaken` registration against a fake world, `emit` an `entityHurt` for a player
with `damage: 6` and `damageSource.cause: 'fall'`, and assert both that `damageTaken` reads 6 **and**
that the sub-event `damageTaken:fall` was auto-registered and also reads 6 — the auto-registration of
a previously unseen cause is the branch worth pinning, and it is pure dynamic-property state.

---

## Where to start: bencrob/marron-town-mod

It is the only candidate where a genuinely interesting handler — `CombatHandler.handle` — is testable
with **zero** changes to the pack, because the architecture already hands it its event and its
collaborators. That removes the single largest confound: if the first test is awkward, the awkwardness
is the library's, not a refactor artefact. It is MIT, 2.5k lines, TypeScript, and it already runs
vitest, so there is no harness to build beyond the enum alias stub every candidate needs.

It is also the sharpest test of the _value_ proposition rather than the mechanics. The author already
wrote in-memory fakes for their own ports and drew the line at the engine boundary, with a comment
saying so. If the library lets them cross that line — testing `ScoreboardSkillRepository` round-trips
and `PassiveApplier` effect application against real fakes instead of leaving the adapter layer
untested — that is the case the library makes, demonstrated on someone else's code. Concretely:
`repo.save(id, state)` then `repo.load(id)` should round-trip, and `load` on an unknown player should
return zeros _because the fake's `getScore` returns `undefined` for an unknown participant, as the
engine does_ — the exact behaviour the "absence the engine can exhibit" rule exists to reproduce, and
the exact thing a naive double gets wrong by returning `0`.

Second choice is **ypacks/scoreboards**, for the opposite reason: it is 266 lines, the refactor is one
parameter, and the `participant.isValid()`-as-a-method drift means there is a decent chance the first
test run finds a real defect.

---

## Rejected, instructively

**LushWay/Scripts** (https://github.com/LushWay/Scripts, `e9c4d25`, MIT, 444 source files, 46 test
files) is a full Bedrock server implemented as a script pack, and it is the most-tested pack found
anywhere in this search — so it looks like the obvious target. It is the wrong one, twice over.

It is too big: 444 files, well past "stand this up quickly". More importantly, it has already solved
the problem the other way. `vitest.config.ts` aliases `@minecraft/server` to
`src/test/__mocks__/minecraft_server.ts`, an 1,187-line hand-written mock, and the pack's code reaches
`world` and `system` through module scope everywhere on the strength of that. Adopting this library
would mean not just a seam refactor but abandoning the strategy the whole codebase is built on. Its
mock is nonetheless the single most useful artefact this search turned up: it is an itemised, real
list of what one serious pack actually needed doubled — and it is dominated by `ItemStack`, item
components, `BlockPermutation`, and `Container`, all of which throw here. Reading it is a better
input to next cycle's coverage decisions than any of these validation tests will be.

Two smaller rejections, each pinning a specific limit:

- **AresgettaGamer/Shift-and-Fade** (MIT, 1,227 lines, cinematic teleport animations) scored high on
  the survey's ratio and fails on two library rules at once. Its `scriptEventReceive` subscription
  passes `{ namespaces: ["shift_fade", "animated_tp"] }` — a **filtered subscription**, which throws
  `NotImplementedError` naming the signal class, so its public API entry point cannot be driven at
  all. And its animation core is `player.camera`, the player client surface, which throws. A ratio
  computed from call-name counts cannot see either. It is a good reminder that the ranking that
  produced this shortlist is a filter, not a verdict.
- **njsk45/Mounts-Utilities** (MIT) also scored well and is, on reading, almost entirely
  `container.getItem` / `setItem` / `setLore` loops over inventory slots, with the mount state itself
  a thin dynamic property on top. It is the shape of pack the coverage table already warns about:
  mostly items and containers, so mostly `NotImplementedError`.
