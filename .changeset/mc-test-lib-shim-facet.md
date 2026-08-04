---
'@twin-digital/minecraft-test-lib': minor
---

Ship the import-level shim, so an unmodified behavior pack's `@minecraft/server` imports resolve
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
