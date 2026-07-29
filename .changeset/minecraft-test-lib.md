---
'@twin-digital/minecraft-test-lib': minor
---

Add `@twin-digital/minecraft-test-lib`: in-memory fakes of the `@minecraft/server` object model for
testing Minecraft Bedrock behavior packs. The fakes hold real state and mutate it as their members
are called, so a test asserts that health is now 20 rather than that `setCurrentValue` was called
with 20.

A build-time generator reads the pinned `@minecraft/server` 2.8.0 declarations and emits a class per
faked type declaring `implements`, so every fake carries the full public shape of the type it stands
in for and the compiler checks that on every build. What the library models — the world and its
dimensions, entity identity and lifecycle, the seven attribute-shaped components, effects, events,
`system` scheduling, dynamic properties, scoreboards, message output and invalidation — is the
engine's own behaviour, quirks included; where it diverges, the README says so row by row.
