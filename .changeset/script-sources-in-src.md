---
'@twin-digital/mc-dev-kit': minor
---

A pack package's script sources sit under `src/`, with `src/main.ts` the bundle entry. The build
reads its entry from there, and the bundle still lands at `dist/<kind>_pack/scripts/main.js` where
the engine requires it — what moves is the source, not the output.

A pack directory is now content only: nothing under it is a build input, so every file but the
source manifest copies verbatim. A pack directory holding a `scripts/` directory fails the build,
naming it and the layout to move to, because pack content copied there would land on top of the
emitted bundle.

Migrating a pack package means moving `behavior_pack/scripts/main.ts` to `src/main.ts` and
adjusting the relative imports it makes into the package's other sources.
