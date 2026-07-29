# How public Bedrock packs test their `@minecraft/server` code today

An empirical read of the same population the API survey measured, plus the two repositories called
out as unusual and a search of npm for prior art. Every number below is something that was looked at,
not recalled.

## Method and denominator

**Population**: the 103 repositories accepted by
`/workspace/plan-opus/design/minecraft/test-lib/artifacts/pack-api-survey/packs.json`
(`status: "accepted"`; 98 tagged `pack`, 5 tagged `library`; 57 JavaScript, 36 TypeScript, the rest
tagged by GitHub as Java/Python/JSON/mcfunction repos that nonetheless carry script packs).

**Checked**: **103 of 103**. For each, the full recursive git tree was fetched at the commit SHA
`packs.json` pins (`GET /repos/{repo}/git/trees/{sha}?recursive=1`), so the file inventory is
complete and pinned — no tree came back truncated, and no repository was unreachable or renamed.
Every `package.json` at depth ≤ 3 and every `.github/workflows/*.yml` was then fetched and parsed
(98 files across 57 repositories — **46 of the 103 contain no `package.json` anywhere**, and one,
`Imeaces/YoniMC`, has one only at
`games/com.mojang/development_behavior_packs/BP_YoniMC_SCRIPTS/scripts/package.json`).

Every repository showing any test signal — plus five that declare `@minecraft/server-gametest` in a
pack manifest — was then shallow-cloned at its pinned commit and read. 18 repositories were cloned.
`bencrob/marron-town-mod` was cloned separately; it is **not** in the population (no `marron` entry
exists anywhere in `packs.json`, accepted or rejected).

**Correction to `oss-validation-candidates.md`**: that document states of `marron-town-mod` and
`LushWay/Scripts` that "neither is in the survey sample". `LushWay/Scripts` **is** in the sample — it
is an accepted repository (7 stars, MIT, TypeScript, 32,122 source lines). Only `marron-town-mod` is
outside it.

The one thing not fully swept: whether a repository with **no** test file nevertheless tests by hand
in-game. Absence of that evidence is not evidence of absence — but four repositories in the
population carry explicit artefacts of exactly that practice, listed below.

## Headline counts (n = 103)

|                                                                              |  repos | share |
| ---------------------------------------------------------------------------- | -----: | ----: |
| Automated test suite of any kind (runner + non-trivial test files)           | **10** |  9.7% |
| ...whose tests exercise code that touches `@minecraft/server`                |  **6** |  5.8% |
| ...whose tests only cover pure logic / non-engine concerns                   |  **4** |  3.9% |
| No automated tests at all                                                    | **93** | 90.3% |
| No `package.json` anywhere (so no JS test framework is even possible)        | **46** | 44.7% |
| Test-shaped artefact that is _not_ an automated suite (manual/in-game/build) |      4 |  3.9% |

The four "test-shaped but not tests":

- `Wladyslaw18/AethelLib` — `"test": "powershell -File .\\tools\\test.ps1"`; the script's own header
  is _"BDS Deployment & Test Script"_: it kills `bedrock_server.exe`, syncs the BP into
  `BDS\development_behavior_packs\`, and boots a server console. `npm test` means _play the game_.
- `Visual1mpact/Paradox_AntiCheat` — `"test": "node bin/build.js --server"`, a build, not a test.
- `Imeaces/YoniMC` — five files under `scripts/src/test/` (`main_load_test.js`,
  `test_get_block.js`, `SummonWhenTeleport.ts`, …). They are in-game probe scripts:
  `main_load_test.js` is three lines that call `Minecraft.world.say("ok")` on load.
- `jasonjgardner/minecraft-rtx-rainbow` — `v2/src/components/sounds.test.ts` exists and is **0 bytes**.

Two further repositories have a file literally named `test.ts`/`test.js` that is production code, not
a test: `xigma0512/XBlockFire`'s `scripts/test.ts` is a chat-triggered debug command
(`if (ev.message === 'test')` → give yourself an AWP and a P90), and
`IndeedItzGab/Spawn-Randomizer`'s `BP/scripts/commands/list/test.js` is a registered `?test` command.
These are the visible residue of the dominant practice: **type it in chat and look**.

## Breakdown by approach, for the 10 repositories that test

| repo                                            | runner                                  | test files |    LOC | what it does about `@minecraft/server`                                                                                                  |
| ----------------------------------------------- | --------------------------------------- | ---------: | -----: | --------------------------------------------------------------------------------------------------------------------------------------- |
| `LushWay/Scripts`                               | vitest                                  |         46 |  4,156 | vitest `alias` → **1,187-line** hand-written module mock                                                                                |
| `SjnExe/AddonExe`                               | `bun test`                              |         37 |  4,379 | `bunfig.toml` preload → `mock.module('@minecraft/server')` → **266-line** hand-written mock                                             |
| `ForestOfLight/Understudy`                      | vitest                                  |         25 |  2,973 | vitest `alias` → **published npm package** `@forestoflight/minecraft-vitest-mocks`                                                      |
| `chapmanjw/minecraft-bedrock-mcp-behavior-pack` | vitest                                  |         12 |    911 | vitest `alias` → **98-line** value stub, _plus_ a **160-line** in-memory `FakeWorld` injected as a parameter                            |
| `rice-awa/mcbe-ws-sdk`                          | vitest                                  |          8 |  1,236 | vitest `alias` + `tsconfig.test.json` `paths` → **132-line** mock                                                                       |
| `rice-awa/MCBE-AI-Agent`                        | vitest                                  |          6 |    510 | vitest `alias` → **40-line** mock                                                                                                       |
| `royashbrook/mc-wizard`                         | `node --test`                           |         43 | 15,428 | tests the Node/WebSocket half; the pack is tested **in-game** (below)                                                                   |
| `kapuic/city-living-ext`                        | jest                                    |          3 |    193 | `jest.mock('@minecraft/server', () => { return }, { virtual: true })` — an empty virtual module, purely to stop the import from failing |
| `BohdanQQ/mc-bedrock-mini-teleport`             | hand-rolled (`tsx ./test/test-main.ts`) |   3 suites |   ~250 | never imports the engine; tests the command parser                                                                                      |
| `hakonikomoru/return-of-boxworld`               | `node --test`                           |          2 |    146 | never imports the engine; asserts over `main.js` source text and manifest JSON                                                          |

Rolled up by technique:

- **Module alias / module mock pointing `@minecraft/server` at a stub file — 6 of 103** (5 via
  vitest `resolve.alias`/`test.alias`, 1 via bun's `mock.module` in a preload). This is
  overwhelmingly the technique of choice for anyone who tests engine-facing code at all: **every
  single repository in the population whose tests exercise `@minecraft/server` code does it this
  way.** Nobody threads the engine in as a parameter as their primary strategy.
- **`vi.mock`/`jest.mock` factories — 2**, and both are degenerate: `kapuic/city-living-ext` mocks the
  module to `undefined` just to make the import resolve, and `rice-awa/MCBE-AI-Agent` uses `vi.mock`
  in two files on top of its alias.
- **Hand-rolled object fakes passed in — 1 in the population** (`chapmanjw`'s
  `tests/support/fake-world.ts`, 160 lines, plus `tests/support/fakes.ts`, 73 lines), and it is used
  _alongside_ an alias stub, not instead of one. Used by 3 of its 12 test files.
- **Pure-logic-only testing — 3** (`kapuic`, `BohdanQQ`, `hakonikomoru`), plus `marron-town-mod`
  outside the population.
- **In-game / manual — at least 4 visible instances**, one of them automated (see below).
- **CI actually running tests — 4 of 103**: `ForestOfLight/Understudy` (`ci.yml`),
  `SjnExe/AddonExe` (`build.yml`), `chapmanjw` (`ci.yml`), `rice-awa/mcbe-ws-sdk` and
  `rice-awa/MCBE-AI-Agent` (`ci.yml`/`ci-build.yml`).

### GameTest is not how they test

Nine of the 103 declare `@minecraft/server-gametest` in a pack manifest, but **no repository in the
population registers a GameTest**. Grepping all cloned sources for `gametest.register` /
`GameTest.register` returns nothing. Of the nine, five never import the module in source at all
(a stale manifest entry); the four that do import it use it for exactly one thing —
`spawnSimulatedPlayer` — as a **product feature** (`ForestOfLight/Understudy` is a fake-player addon;
`rice-awa/*` drive a bot). The GameTest framework, Mojang's own answer to this problem, is absent
from this sample as a testing tool.

The one genuine in-game automated harness is `royashbrook/mc-wizard`:
`bedrock/behavior_packs/mc_wizard/scripts/e2e.js` spawns simulated players, polls world state on a
tick loop, and prints `MC_WIZARD_E2E {json}` lines that a Docker-hosted BDS run
(`scripts/run-e2e-container.sh`, ~12 `test:e2e:*` npm scripts) scrapes. It is a real, working
integration test — and it costs a container, a server boot, and a 1,200-tick timeout budget per case.

## The notable individual cases

### `LushWay/Scripts` — the 1,187-line module mock, verified

Confirmed at commit `e9c4d25`. `vitest.config.ts` lines 11–14:

```ts
alias: {
  '@minecraft/server':          'src/test/__mocks__/minecraft_server.ts',
  '@minecraft/server-net':      'src/test/__mocks__/minecraft_server-net.ts',
  '@minecraft/server-ui':       'src/test/__mocks__/minecraft_server-ui.ts',
  '@minecraft/server-gametest': 'src/test/__mocks__/minecraft_server-gametest.ts',
}
```

`src/test/__mocks__/minecraft_server.ts` is **1,187 lines**. Siblings:
`minecraft_server-ui.ts` 409, `minecraft_server-net.ts` 59, `minecraft_server-gametest.ts` 1.
Support code around it: `src/test/utils.ts` (102), `timers.ts` (45), `vitest.d.ts` (127),
`setup.ts` (19), `global.ts` (8), `constants.ts` (4). Roughly **1,960 lines of test infrastructure**
for 4,156 lines of tests in 46 `*.test.ts` files, over 144,559 lines of source. 10 of the 46 test
files import `@minecraft/server`; 11 construct a player via `TEST_createPlayer`.

**Is it faithful?** It is a genuine mixture, and the mixture is the finding.

_Really modelled (state in, state out):_

- `Container` (line 966) — a `Map<number, ItemStack>` with working `addItem` stacking-then-first-empty
  search, `moveItem`, `swapItems`, `transferItem`, and `getItem(slot, clone = true)` that **clones by
  default**, mirroring the engine.
- `ItemStack` (825) — `amount` is a real setter that `throw`s `RangeError` outside `[0, 64]`; `lore`
  round-trips through a defensive copy; `localizationKey` is computed by looking the type id up in a
  checked-in `mojang-items.json` and cross-referencing a full `en_US` lang table.
- `ScoreboardObjective` (727) — a real participant `Map`; `getScore` returns `undefined` for an
  unknown participant, which is the engine's behaviour and the thing naive doubles get wrong.
- Dynamic properties (`DynamicPropertiesProvider`, 793) — a real store where `set(key, undefined)`
  deletes.
- Events — `WorldAfterEvents`/`WorldBeforeEvents` are empty classes wrapped in a `Proxy` (line 661)
  that mints a real `EventSignal` on first property access, so _any_ event name works and tests can
  fire it via `TEST_emitEvent`. Constructing a `Player` emits `playerJoin` and `playerSpawn`.
- `Player` — `getGameMode`/`setGameMode`, `addLevels`, `setProperty`/`getProperty`/`hasProperty` are
  all backed by real fields.

_Canned or dead:_

- `Scoreboard.getObjectives()` → `[]`, `getParticipants()` → `[]`, `removeObjective()` → `false`,
  every display-slot method → `undefined` — even though `addObjective`/`getObjective` are real. The
  object is half-alive.
- `World.getPlayers()` and `getAllPlayers()` → `[]` **always**. `World.getDynamicProperty()` →
  `undefined` always. `Dimension.getEntities()` → `[]`.
- `System.runInterval()` / `runTimeout()` → `return 0` and **never invoke the callback**;
  `system.run` is `setImmediate`, so there is no tick model at all. `runJob` drains the generator
  synchronously in a `for` loop. A separate opt-in helper, `src/test/timers.ts`, exists precisely to
  patch this: `mockMinecraftTimers()` `vi.spyOn`s `runTimeout`/`runInterval` onto real
  `setTimeout`/`setInterval` with a ms conversion — i.e. the pack pays for tick control twice and
  still doesn't get deterministic ticks.
- `BlockPermutation.resolve()` → `undefined`. `Block` is `class Block {}`. `Entity.teleport`,
  `Player.sendMessage`, `Player.playSound`, `World.sendMessage` are bare `vi.fn()` — assertions
  against them are call-spying, not state.
- `ScoreboardIdentity.isValid()` is a **method returning `false`**; in 2.8.0 `isValid` is a property.
  `Entity.id` is the constant string `'test entity id'` for every entity.
- No effects, no health, no damage, no attributes anywhere in the file.

_Composition of the 1,187 lines_: **495 lines are enum bodies** (`EntityComponentTypes` alone spans
lines 115–455) and 14 more are one-line `class X extends Error {}` declarations. So roughly 500 lines
are mechanically transcribed constants and ~680 lines are the doubles themselves. That ratio is
itself a finding: a large slice of what every pack hand-rolls is not behaviour at all, it is the
enum values `@minecraft/server` declines to ship at runtime.

**Honest read**: it is the most serious hand-rolled double in this sample, and it is _good_ on the
axes LushWay's own code needed — items, containers, item stacks, scoreboard round-trips, arbitrary
event dispatch. It is unfinished-to-hostile everywhere else: no world population, no tick model, no
entity identity, no effects/health/damage. It is not a general-purpose fake; it is a shim grown to
fit one codebase, and the parts nobody needed were left returning `[]`.

### `bencrob/marron-town-mod` — fakes that double **ports**, not the engine

Confirmed at `2c025b4`. 14 `*.spec.ts` files (529 lines), all under `src/domain/` (9) and
`src/application/` (5) — **zero** under `src/infrastructure/`, which is 17 of its 46 source files.
`vitest.config.ts` carries the comment _"Le domaine est pur : pas besoin de jsdom ni de mock
@minecraft/server."_

`src/testing/fakes.ts` is **171 lines** and doubles **the pack's own hexagonal ports**, one class per
interface in `src/ports/`:

- `InMemorySkillRepository implements SkillRepository` — `Map`s for skill state, choices, themes,
  shop-buy masks, claimed loot, rotation counters.
- `FakeItemService implements ItemService` — a `Map<playerId, Map<itemId, count>>` inventory with
  working `giveItem`/`removeItem`/`countItem`/`swapHeldVariant`.
- `SpyMessenger implements Messenger` — three arrays recording `actionBars`, `chats`, `broadcasts`.
- `StubPlayerQuery implements PlayerQuery` — a plain array of `{ id, name }`.
- `InMemoryWorldStore implements WorldStore` — a `Map<string, number>`.
- `FakeClock implements Clock` — `{ tick, ms }`, settable.

Not one of them doubles an `Entity`, a `Player`, a `Dimension`, a component, or an event payload.
The file never mentions `@minecraft/server`. Five of the 14 specs import it.

This is the cleanest possible demonstration of the shape of the problem. The author believes in
testing, wrote his own doubles, drew them at the port boundary — and then stopped, leaving the entire
adapter layer (`scoreboard-skill-repository.ts`, `passive-applier.ts`, `combat-handler.ts`,
`minecraft-messenger.ts`, `minecraft-clock.ts`, `player-finder.ts`) untested, with a config comment
explaining that the untested half is the half that would need a `@minecraft/server` mock he didn't
have.

## Published prior art on npm

Two packages exist. Both are real, both are recent, both are small, and neither was known to the
survey.

### `@forestoflight/minecraft-vitest-mocks`

- v1.0.8; first published **2026-04-25**, latest **2026-07-08**; 9 versions; **270 downloads in the
  last month**; single maintainer (`forestoflight`).
- Its own self-description: _"A template library for mocking the Minecraft Bedrock Script API modules
  with Vitest. This is not designed to be exhaustive, but rather will be updated with whatever mocks
  I need for my own testing."_
- **558 lines** total: `server.js` 366, `Scheduler.js` 65, `server-gametest.js` 45,
  `DynamicPropertyStore.js` 42, `server-ui.js` 14, `debug-utilities.js` 12, `setup.js` 11.
- Delivery is the same alias pattern: `alias: { '@minecraft/server': '.../server' }` plus a
  `setupFiles` entry that re-wires the dynamic-property spies and resets the scheduler in a global
  `beforeEach`.
- **What it actually is**: `vi.fn()` spies with canned returns, wrapped around three genuinely
  stateful helpers. `Entity` (line 40) declares ~45 methods, of which all but `teleport` and
  `setRotation` are `vi.fn(() => <constant>)` — `getComponent` → `undefined`, `hasTag` → `false`,
  `getEffects` → `[]`, `applyDamage` → `false`. `world.getPlayers()`/`getAllPlayers()` → `[]`.
  The three real parts: a singleton `DynamicPropertyStore`; a singleton `Scheduler` with
  `advanceTicks(n)` that walks a `Map` of scheduled callbacks and keeps `system.currentTick` in sync
  (`system.run`/`runTimeout`/`runInterval`/`clearRun` are all wired into it) — a genuinely good tick
  model; and `BlockPermutation`-ish structural bits.
- **The hole**: every event signal is `{ subscribe: vi.fn(), unsubscribe: vi.fn() }` — listeners are
  never stored, so **you cannot emit an event**. `world.afterEvents.worldLoad.subscribe` is
  `vi.fn(cb => cb())`, a special case to make startup code run. Its only in-population consumer,
  `ForestOfLight/Understudy`, works around this by reaching into `.mock.calls[0][1]` to inspect what
  its code passed to `teleport`.
- Assertions in consumer tests are therefore mostly _"was this spy called with that"_, not _"is the
  world in this state"_.

### `@lpsmods/minecraft-server-mock`

- v0.1.0, first published **2026-03-24**, MIT, `github.com/lpsmods/minecraft-mock`, **97 downloads in
  the last month**. Not used by any repository in the population.
- `src/server.ts` is **1,834 lines** with **100 `vi.fn()` call sites**. Its README pitches exactly the
  alias workflow.
- Coverage is _broad and shallow_: it transcribes essentially the whole enum surface — ~60 `export
enum` declarations including `EntityDamageCause`, `EasingType`, `EquipmentSlot`, `DisplaySlotId`,
  `GameRule` — then hangs spies off ~50 classes. `Entity` has real state for dynamic properties and
  tags (`addTag` correctly returns whether the tag was new) and everything else is `vi.fn()`:
  `addEffect`, `applyDamage`, `getComponent = vi.fn((componentId) => {})`, `getEffect`, `hasComponent`
  — all no-ops. `BlockPermutation` is literally `vi.fn(class {})`. `Entity.id` is the string
  `"12345"` and `typeId` is `"minecraft:creeper"` for every entity. Event signals are a single shared
  `{ subscribe: vi.fn() }` — again, no emission.
- Depends on `vitest` at runtime (it imports `vi`), so it is vitest-only by construction.

**Summary of the prior art**: two solo-maintained packages, ~370 combined weekly-ish downloads,
both shipping the _enum table plus a spy surface_, neither modelling entity state, effects, health,
damage, or event dispatch, and neither able to fire an event at all. Both are consumed by module
aliasing. There is no published package that a pack can inject as objects.

## What this implies for positioning

**The gap is real, but it is not "packs don't test".** The stronger and more uncomfortable finding is
that the ceiling on testing here is very low: **90% of these repositories have no automated tests at
all, and 45% have no `package.json`** — no bundler, no npm, checked-in `scripts/*.js` copied into
`com.mojang`. For that 45%, a test-double library is not the missing piece; a build toolchain is. The
addressable population is the ~57 repos with npm tooling, of which 10 test and 6 test engine-facing
code.

**Within the addressable population, the technique is monolithic and the pain is visible.** Every
single repository that tests engine-facing code does it by aliasing `@minecraft/server` to a stub file
it wrote itself (or, in one case, to a stub package someone else wrote). Six independent
re-implementations of the same idea, at 40 / 98 / 132 / 266 / 558 / 1,187 lines. The cost curve is
brutal and self-inflicted: the cheap stubs (40, 98, 132 lines) buy so little that their owners only
test the parts that never touch the engine, and the expensive one (1,187 lines) still has no tick
model, no world population, no entity identity, no health and no effects — LushWay needed a _second_
mechanism (`src/test/timers.ts`, `vi.spyOn` over `system.runInterval`) just to get timers to fire.

**Where the friction actually bites**, ranked by what the evidence shows rather than what sounds good:

1. **Enums at runtime.** ~500 of LushWay's 1,187 lines, and the single largest chunk of both npm
   packages, are transcribed enum values — because `@minecraft/server` ships `index.d.ts` and nothing
   else. This is the tax every consumer pays first, it is purely mechanical, and it is generatable.
   `oss-validation-candidates.md` already flagged that the library exports no runtime enums; this
   survey says that is the _most_ commonly hand-rolled artefact in the whole ecosystem.
2. **Event dispatch.** Neither npm package can fire an event; `kapuic` and `rice-awa/MCBE-AI-Agent`
   ship subscribe-only stubs. LushWay solved it (an `EventSignal` behind a `Proxy`) and it is the
   single most-used capability of its mock. A fake that emits real event payloads into real
   subscribers is a differentiator on the evidence, not on speculation.
3. **Ticks.** `@forestoflight`'s `Scheduler.advanceTicks(n)` is the one thing the published prior art
   does well, and LushWay's absence of it forced a second hack. This is table stakes, and being merely
   as good as `advanceTicks` is not enough to matter.
4. **State-shaped assertions.** Everything else in the prior art is `vi.fn()`, so consumer tests
   assert on call records (`teleport.mock.calls[0][1]`). Asserting _"the victim now has poison for
   60 ticks"_ instead of _"addEffect was called with…"_ is the qualitative difference, and no existing
   option offers it.
5. **The absence the engine can exhibit.** LushWay gets `ScoreboardObjective.getScore` →
   `undefined`-for-unknown right; both npm packages return canned `undefined`/`[]` from _everything_,
   which is accidentally right for the wrong reason and wrong the moment state matters. Its
   `ScoreboardIdentity.isValid()`-as-a-method (2.8.0 declares a property) is a live example of a mock
   that has silently drifted from the declarations it doubles.

**The honest competitive read**: the competition is not another library — it is _not testing_, and
below that, a 100-line stub the author wrote in an afternoon that lets them unit-test their parser.
Against "not testing", the argument has to be about the toolchain floor, not the fake. Against the
100-line stub, the argument is that the stub's ceiling is exactly where `marron-town-mod` stopped —
the adapter layer, with a comment in `vitest.config.ts` explaining why. The two published packages
prove the demand is real enough to publish for and small enough that nobody has yet built past the
spy layer; they also set an expectation the library will be measured against — alias-and-go
ergonomics — which is precisely the delivery model the library declines. That tension is the
positioning problem worth solving, and the enum stub is the cheapest way to defuse it.

---

_Sources: `packs.json` (103 accepted repos, pinned SHAs); GitHub trees API at those SHAs; shallow
clones of 18 population repos plus `bencrob/marron-town-mod@2c025b4`; npm registry search and
`npm pack` of both published mock packages; npm downloads API, last-month window ending 2026-07-24._
