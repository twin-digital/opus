# @twin-digital/mc-dev-kit

## 0.4.0

### Minor Changes

- fa6362c: The build gains namespacing and per-consumer pack vendoring. `packBuild` takes a `namespace`
  option — `true` derives one from the package name, a string names one, and setting it turns the
  feature on. With namespacing on, authors write bare names and the build writes the namespace into
  every entity identifier the pack declares (localization keys included), gives the pack's own asset
  names the namespace as their token and every vendored asset a token built from its library's name
  and a hash of its content — so a shared name is a shared definition, and a library upgrade renames
  exactly the assets that changed — rewrites the references so the two halves still join, and fails
  the build naming any name it cannot carry into its new spelling.

  A dependency holding a `vendored_pack/` tree is merged into the consuming package's own packs at
  build time, transitively across `dependencies`, workspace sibling and installed dependency alike —
  each consumer ships the shared content under its own namespace and pack identity, and its
  `.mcaddon` needs nothing installed beside it. Name collisions between own and vendored content
  fail the build naming both declarations.

  Namespaced packs also carry coordination content for `@twin-digital/mc-pack-runtime`: the
  namespace is injected into the script bundle as a frozen global, every declared entity type is
  stamped with the pack's own type family, and a claim entity type advertises the pack's namespace
  so rivals are detectable at load.

- 98b88d4: A pack package's script sources sit under `src/`, with `src/main.ts` the bundle entry. The build
  reads its entry from there, and the bundle still lands at `dist/<kind>_pack/scripts/main.js` where
  the engine requires it — what moves is the source, not the output.

  A pack directory is now content only: nothing under it is a build input, so every file but the
  source manifest copies verbatim. A pack directory holding a `scripts/` directory fails the build,
  naming it and the layout to move to, because pack content copied there would land on top of the
  emitted bundle.

  Migrating a pack package means moving `behavior_pack/scripts/main.ts` to `src/main.ts` and
  adjusting the relative imports it makes into the package's other sources.

### Patch Changes

- Updated dependencies [fa6362c]
  - @twin-digital/mc-pack-runtime@0.2.0

## 0.3.1

### Patch Changes

- 289331b: Correct the `packBuild` doc example's package directory: from a file in `tsdown.config.d/`,
  `new URL('../..', import.meta.url)` resolves to the filesystem root, not the package. It is `'..'`.

## 0.3.0

### Minor Changes

- 9499794: Adds the build half. `@twin-digital/mc-dev-kit/build` exports `packBuild({ packageDir })`, a tsdown
  config fragment carrying one Rolldown plugin that builds a package's packs: it takes the pack set
  from the kit's own discovery, bundles a behavior pack's `behavior_pack/scripts/main.ts` to
  `dist/behavior_pack/scripts/main.js` with the manifest's `module_name` dependencies left external,
  writes the completed manifests, copies every other pack file verbatim, and prunes output the build
  did not write. Files are written only where their bytes changed, so a watching consumer sees a
  timestamp move only on a real change. A package with no script sources builds through a virtual
  entry; a resource-pack-only package builds.

  Adds the archive half as the `mc-pack-archive` command, which cuts a package's built output tree
  into one `<name>-<version>.mcaddon` in `.release-assets/`, holding one `.mcpack` per pack.

  Adds `resolveWorkspaceRoot({ from })` to the discovery entry point, reporting the nearest ancestor
  workspace root and the name of the package there.

  Pack entries now carry `scriptOutput`, the path a behavior pack's built script belongs at, `null`
  for a resource pack. Completed manifests carry each script module's `entry`, and a source manifest
  that specifies one is reported as the new `module-entry-specified` problem.

## 0.2.0

### Minor Changes

- d96d1d0: Add the Minecraft dev kit: `discoverPacks` returns every Bedrock pack in a workspace as one flat
  list of typed entries, each marked valid or invalid, carrying identity, version, kind, source and
  output locations, the owning package, and the manifest completed from what the package already
  knew.
