# @twin-digital/minecraft-test-lib

## 0.3.0

### Minor Changes

- a18908f: Ship the import-level shim, so an unmodified behavior pack's `@minecraft/server` imports resolve
  under a test runner with one config entry and no hand-written stub.

  - an aliased `@minecraft/server` surface generated from the pinned 2.8.0 declarations — every
    declared enum as a frozen object, every module constant, and every declared class, with the fakes
    standing behind the ones they implement
  - module-scope `world` and `system` bindings a test installs with `__useServer` and reaches with
    `currentServer`, throwing `ShimNotInstalledError` until installed and `ShimServerInUseError` on
    replacing a live server
  - a vitest entry at `@twin-digital/minecraft-test-lib/vitest`: the `minecraftTestLib()` plugin,
    which contributes the aliases and a setup file that installs a fresh server per test file, and
    `loadPack` for a test that needs a fresh module-registry generation
  - stubs for the sibling `@minecraft/*` script modules a pack imports, `@minecraft/server-ui` first,
    generated from their own declarations and reached through the same one config entry
  - `instanceof` against a shim-exported class answers by class identity, and the fakes carry the
    declarations' own class hierarchy on their prototype chains

  Also in the fakes: a subscribe `options` argument now filters delivery on the five raised signals
  that declare one, rather than throwing; a before-event write to `effectAdd.duration` is validated as
  the engine validates that write, which is not how `addEffect` validates its own argument; generated
  members check both arity bounds ahead of the validity guard; and the `@minecraft/server` peer range
  is gone, so a consumer on a different engine pin never has an install fail over it.

## 0.2.0

### Minor Changes

- d6e512c: Decay effect durations on the advance clock. An effect's duration now falls by one for every tick a
  test advances — the rate the engine was measured at — and the effect is removed on the tick it
  reaches zero, so the last tick it is readable on is the one reading 1.

  Within each tick, `advanceTicks` increments the tick, applies decay, then runs that tick's
  callbacks: a callback reads the value for its own tick, and an effect that runs out partway through a
  multi-tick advance is already gone for the remaining ticks. The replacement rule is now plain
  modelled behaviour, comparing against the duration remaining exactly as the engine does.

  Expiry itself is the library's own rule and marked as such — nothing observed says what the engine
  does when a duration reaches zero. It dispatches nothing, since 2.8.0 declares no effect-remove or
  effect-expire signal to raise.

- fb9e839: Add `@twin-digital/minecraft-test-lib`: in-memory fakes of the `@minecraft/server` object model for
  testing Minecraft Bedrock behavior packs. The fakes hold real state and mutate it as their members
  are called, so a test asserts that health is now 20 rather than that `setCurrentValue` was called
  with 20.

  A build-time generator reads the pinned `@minecraft/server` 2.8.0 declarations and emits a class per
  faked type declaring `implements`, so every fake carries the full public shape of the type it stands
  in for and the compiler checks that on every build. What the library models — the world and its
  dimensions, entity identity and lifecycle, the seven attribute-shaped components, effects, events,
  `system` scheduling, dynamic properties, scoreboards, message output and invalidation — is the
  engine's own behaviour, quirks included; where it diverges, the README says so row by row.
