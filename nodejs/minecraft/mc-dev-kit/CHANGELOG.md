# @twin-digital/mc-dev-kit

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
