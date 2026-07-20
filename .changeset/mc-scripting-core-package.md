---
'@twin-digital/mc-scripting-core': minor
---

New package: shared helpers for Minecraft Bedrock behavior packs. `setInvulnerable(entity, { enabled, showParticles })` applies an invulnerability tag + hidden Resistance; `registerInvulnerabilityGuard(world)` subscribes a heal-on-hurt backstop keyed on the tag (idempotent per world). `@minecraft/server` is imported type-only, so the library unit-tests with plain duck-typed objects.
