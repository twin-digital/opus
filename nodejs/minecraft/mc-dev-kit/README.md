# @twin-digital/mc-dev-kit

The development kit for Minecraft Bedrock pack packages in a workspace. It has three halves:

- **discovery** — `discoverPacks()` reports every pack in the workspace, its manifest completed and
  validated, without building anything
- **build** — `packBuild()` returns a bundler config fragment that builds a package's packs into its
  output tree
- **archive** — `mc-pack-archive` cuts a built output tree into the single `.mcaddon` a release
  uploads

A pack's source `manifest.json` is partial by design: it names no `header.name`, no
`header.version`, no version for a dependency on a pack in the same workspace, and no
`modules[].entry`. The kit completes each from the owning package's `package.json`, so raising a
package's version and building is what produces a new version of its pack.

## Install

```sh
npm install --save-dev @twin-digital/mc-dev-kit
```

ESM only, with type declarations. The package embeds no bundler at run time — `tsdown` is a
development dependency of the kit and of the packages that build with it, never a runtime one.

## The pack package layout

A pack package holds its script sources under `src/`, its source packs in fixed, kind-named
directories, and its built packs under `dist/`:

```
packages/my-pack/
  package.json                          the name and version the manifests complete from
  src/main.ts                           the script bundle's entry
  behavior_pack/
    manifest.json                       partial: no name, no version, no entry
    functions/…, entities/…             copied verbatim
  resource_pack/
    manifest.json
    textures/…                          copied verbatim
  dist/
    behavior_pack/manifest.json         the completed manifest
    behavior_pack/scripts/main.js       the bundle
    resource_pack/…
```

Both packs are optional; a package holding neither is not a pack package. Nothing under a pack
directory is a build input — a pack directory holds only content, and a `scripts/` directory there
fails the build.

## Discovery

```ts
import { discoverPacks, resolveWorkspaceRoot } from '@twin-digital/mc-dev-kit'

const packs = await discoverPacks()
const broken = await discoverPacks({ filter: { status: 'invalid' } })

const root = await resolveWorkspaceRoot({ from: packageDir })
```

Every pack found comes back in one flat list, each entry `valid` or `invalid`. A valid entry carries
its completed `manifest`, its `uuid` and `version`, and the locations of its source directory,
output directory, and built script; an invalid one carries the `problems` that invalidated it. A
fault after enumeration becomes a problem on an entry rather than a thrown error, so a single broken
pack does not hide the rest.

Discovery reads the source tree only. It reports where a pack's output belongs and never creates,
reads, or modifies anything there.

## Build

The build half is an export a consuming package's bundler configuration takes up, not a command the
package runs. In the opus monorepo it reaches the configuration through a `tsdown.config.d/`
fragment merged over the generated base:

```ts
// packages/my-pack/tsdown.config.d/packs.ts
import { packBuild } from '@twin-digital/mc-dev-kit/build'

export default packBuild({ packageDir: new URL('../..', import.meta.url).pathname })
```

`packBuild` takes one required option, `packageDir` — the filesystem path of the package the build
is for — and returns a fragment carrying a single plugin that performs the whole build. Building the
package then produces, for each of its packs:

- the **completed manifest** at `dist/<kind>_pack/manifest.json`, as two-space JSON with a trailing
  newline — never a copy of the source manifest
- the **script bundle** at `dist/behavior_pack/scripts/main.js`, one unminified ESM chunk, with the
  `module_name` dependencies the completed manifest declares left external and everything else
  inlined
- **every other pack file** copied verbatim — dotfiles, `.lang` files, textures, unknown extensions
  and all — except the source manifest

A finished build loads as it stands, with nothing further to do to it.

**The package's `dist/` becomes the build's to own.** Output the build did not write is deleted at
the end of it, so a file deleted or renamed in source is gone from the output after the next build
with no clean step first. A package taking up the fragment therefore devotes its bundler
configuration and its output tree to its packs.

**Nothing is rewritten that did not change.** Every file, the script bundle included, is compared
with what already sits at its path and written only on a difference, so a consumer watching the
output tree and keying on modification times sees only real changes. The build writes no report of
what it changed — the output tree is the report.

**A rebuild is triggered by any input the build reads.** The pack source directories, the source
manifests, the package's `package.json`, and the `package.json` of each workspace package a pack
depends on are all registered as watch inputs, so changing a texture or bumping a version rebuilds
even though no module graph reaches those files.

A package whose behavior pack declares no script module, or which holds no behavior pack at all,
builds too: the fragment falls back to a virtual entry and the chunk nothing claims is pruned at the
end of the build.

### What fails the build

- the package holds no pack, or sits under no workspace root
- the kit reports one of the package's packs invalid — its problems are printed, and no sibling pack
  in the package is built
- the kit's enumeration rejects, which any malformed `package.json` in the workspace can cause
- a behavior pack declares a script module while `src/main.ts` is not there
- a pack directory holds a `scripts/` directory
- an `@minecraft/`-scoped import the completed manifest does not declare resolves to nothing

### The settings the fragment states

The fragment sets `clean`, `format`, `target`, `platform`, `shims`, `dts`, `sourcemap`, `minify`,
`noExternal`, `entry`, `outDir`, `outputOptions.entryFileNames`, and
`inputOptions.resolve.conditionNames` itself rather than inheriting them, so it behaves the same
merged over a shared base as it does alone. Those are the keys a consuming package's own bundler
configuration must not quietly supply instead.

`target` is `es2022`, `platform` is `neutral`, `shims` is false, and `format` is `esm` because that
is what the Bedrock script engine accepts. `clean` is false because emptying the output directory
first would take the end-of-build prune's inputs with it.

## Archive

```sh
mc-pack-archive
```

The command takes no arguments and works on the package directory it is run in. It cuts that
package's built output tree into one `.mcaddon` holding one `.mcpack` per pack, each member holding
the contents of its pack's output directory at the member's root. The archive is named
`<package name with its npm scope stripped>-<version>.mcaddon` and written into `.release-assets/`,
which is created and cleared first so a previous version's archive is not published beside the
current one.

It reads the output tree and consults nothing else — it never calls the kit and never runs a build,
so a tree stale with respect to source is archived as it stands. A package with no output tree fails
the command, naming the directory that was not there.
