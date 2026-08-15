---
'@twin-digital/mc-dev-kit': minor
---

The build gains namespacing and per-consumer pack vendoring. `packBuild` takes a `namespace`
option — `true` derives one from the package name, a string names one, and setting it turns the
feature on. With namespacing on, authors write bare names and the build writes the namespace into
every entity identifier the pack declares (localization keys included), gives every other declared
asset name a namespace derived from the pack's own uuid, rewrites the references so the two halves
still join, and fails the build naming any name it cannot carry into its new spelling.

A dependency holding a `vendored_pack/` tree is merged into the consuming package's own packs at
build time, transitively across `dependencies`, workspace sibling and installed dependency alike —
each consumer ships the shared content under its own namespace and pack identity, and its
`.mcaddon` needs nothing installed beside it. Name collisions between own and vendored content
fail the build naming both declarations.

Namespaced packs also carry coordination content for `@twin-digital/mc-pack-runtime`: the
namespace is injected into the script bundle as a frozen global, every declared entity type is
stamped with the pack's own type family, and a claim entity type advertises the pack's namespace
so rivals are detectable at load.
