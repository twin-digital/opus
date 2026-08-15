---
'@twin-digital/mc-pack-runtime': minor
---

New package: the engine-side half of the Minecraft dev kit, bundled into a pack's own script
bundle by `@twin-digital/mc-dev-kit`'s build. It exposes `packId` for spelling bare names into
the pack's build-chosen namespace, `packNamespace`/`packFamily` for reading the injected values,
checked `spawnEntity`/`getEntity`/`getEntities` that verify the pack's own type family on every
entity they hand back, and `foreignNamespaceClaims` for reading rival namespace claims after
world load.
