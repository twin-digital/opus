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

A pack package holds its source packs in fixed, kind-named directories, and its built packs under
`dist/`:

```
packages/my-pack/
  package.json                          the name and version the manifests complete from
  behavior_pack/
    manifest.json                       partial: no name, no version, no entry
    scripts/main.ts                     the script bundle's entry — build input, never copied
    functions/…, entities/…             copied verbatim
  resource_pack/
    manifest.json
    textures/…                          copied verbatim
  dist/
    behavior_pack/manifest.json         the completed manifest
    behavior_pack/scripts/main.js       the bundle
    resource_pack/…
```

Both packs are optional; a package holding neither is not a pack package.

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
  and all — except the source manifest and anything under `scripts/`. With namespacing on, files
  carrying declared names are rewritten instead — see [Namespacing](#namespacing)

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
manifests, the package's `package.json`, the `package.json` of each workspace package a pack
depends on, and the `vendored_pack/` tree of every dependency the build vendors are all registered
as watch inputs, so changing a texture or bumping a version rebuilds even though no module graph
reaches those files.

A package whose behavior pack declares no script module, or which holds no behavior pack at all,
builds too: the fragment falls back to a virtual entry and the chunk nothing claims is pruned at the
end of the build.

### What fails the build

- the package holds no pack, or sits under no workspace root
- the kit reports one of the package's packs invalid — its problems are printed, and no sibling pack
  in the package is built
- the kit's enumeration rejects, which any malformed `package.json` in the workspace can cause
- a behavior pack declares a script module while `behavior_pack/scripts/main.ts` is not there
- an `@minecraft/`-scoped import the completed manifest does not declare resolves to nothing
- the package vendors anything while no namespace is set, or vendors a kind it holds no pack of
- with namespacing on: a source name already carrying a prefix, content whose names the build
  cannot rewrite, an entity identifier declared by more than one of the merged packs, a reference
  several other packs' declarations could satisfy, and a bare entity name landing in the reserved
  `mcdk_claim_` spelling

### Namespacing

`packBuild` takes an optional `namespace` setting beside `packageDir`. Setting it turns namespacing
on: `true` derives the namespace from the package's own name — the `@` dropped and the `/` a
hyphen, so `@twin-digital/wizards` becomes `twin-digital-wizards` — and a string names one
directly. A namespace holds only lowercase letters, digits, underscore, hyphen and dot; anything
else fails the build naming the character. Left unset, nothing is namespaced and names reach the
output exactly as the source spells them.

```ts
export default packBuild({ packageDir: new URL('../..', import.meta.url).pathname, namespace: true })
```

A namespace you choose by hand is conventionally claimed at the
[Bedrock-OSS add-on registry](https://github.com/Bedrock-OSS/add-on-registry), which refuses a
namespace another entry already holds. The build neither reads the registry nor requires an entry
in it — claiming is how you avoid colliding with other add-ons that register.

With namespacing on, **names are written bare in pack content** — `wizard`, `geometry.wizard` —
and the build writes them into their namespaced spellings; a source name that already carries a
prefix fails the build naming the file and the name. What each declared name becomes:

- **entity identifiers**, and the `entity.<id>.name` / `item.spawn_egg.entity.<id>.name`
  localization keys derived from them, carry the namespace: `wizard` builds as
  `<namespace>:wizard`
- **every other name the package itself declares** — geometry, textures, materials, render
  controllers, animations, animation controllers — carries the namespace as a token written into
  the name's own structure: `geometry.wizard` builds as `geometry.<namespace>.wizard`, a texture
  at `textures/entity/wizard.png` moves to `textures/<namespace>/entity/wizard.png`, a material
  `wizard` becomes `<namespace>_wizard`, and render controllers, animations and animation
  controllers gain the token as a name segment
- **a vendored asset's names** carry the vendored library's package token plus a 16-hex sha256
  content hash instead — `geometry.<library token>-<hash>.minion` — so an identical name always
  means identical bytes: two packages vendoring one library version share names for unchanged
  assets (whichever definition wins, they are the same), and where content differs each package
  addresses exactly the bytes it built against. Upgrading a library changes the names of the
  assets whose content changed and only those, so a vendored asset never changes appearance
  underneath you, and unchanged assets deduplicate across consumers

Only names the packs declare are rewritten, along with the references to them, so the two pack
halves still join. A reference resolves against the pack that wrote it first — a vendored pack's
internal references stay internal, and your own references prefer your own declarations — then
against the other merged packs where exactly one declares the name; a bare name that several other
packs declare is ambiguous and fails the build naming every candidate. A reference to a name no
merged pack declares — `geometry.evoker.v1.8`, a vanilla texture or material — is copied through
as written. Script sources are never rewritten:
code spells a namespaced identifier through `@twin-digital/mc-pack-runtime`'s `packId` helper,
which reads the namespace the build injects into the bundle ahead of all module code, so a bundled
library's own calls resolve through the vendoring package's namespace with nothing passed per
call.

The build also stamps a type family, `mcdk_pack_<package token>`, on every entity type the
namespaced pack declares, and adds one claim entity type,
`<namespace>:mcdk_claim_<package token>`, to every namespaced pack with a behavior half. The
runtime package's checked calls and `foreignNamespaceClaims()` read both; bare entity names
starting with `mcdk_claim_` are reserved and fail the build.

A namespaced pack may hold entity definitions (behavior and client), geometries, textures,
materials, render controllers, animations, animation controllers, `.lang` files, `scripts/`, and
its manifest. A `.json`, `.material`, `.lang` or `.mcfunction` file anywhere else may carry names
the build cannot rewrite, so it fails the build naming the file; any other file — dotfiles,
images outside `textures/`, unknown extensions — copies unchanged.

### Vendoring shared packs

A pack several packages depend on can be built into each of them as content of its own. The shared
package puts its content under `vendored_pack/`, holding a kind-named subdirectory per half and no
`manifest.json`, so the package bears no pack of its own:

```
my-lib/
  package.json
  vendored_pack/
    behavior_pack/
      entities/minion.json
    resource_pack/
      entity/minion.json
```

A package vendors the `vendored_pack/` of every package in its own `dependencies` — never
`devDependencies` — following those packages' dependencies transitively, workspace sibling and
installed dependency alike. Nothing is listed anywhere: declaring the dependency is what makes the
content arrive. For an installed dependency to work, the shared package must publish its
`vendored_pack/` tree — add it to the `files` field of its `package.json`:

```jsonc
{
  "name": "@scope/my-lib",
  "files": ["vendored_pack"],
}
```

Vendoring requires a namespace, and the vendoring package must hold its own source manifest of
every kind it vendors — the vendored content merges into that pack, under the vendoring package's
namespace and header uuid, so each vendoring package ships one behavior pack and one resource pack
whatever it vendors, and the same shared pack's entity identifiers get a different spelling and
identity in every package that takes it up. The build reads the vendored source tree directly; the
depended-on package never needs to have been built. Its `vendored_pack/` tree joins the watch
inputs, and the `mc-pack-archive` command archives the merged output tree as it stands, vendored
content included. A vendored definition file lands beside your own with its library's token
prefixed to its basename — `models/<library token>.minion.geo.json` — so two merged packs shipping
one relative path never contend for it.

A vendored pack may hold entity definitions, geometries, textures, materials, render controllers,
animations, animation controllers, and localization entries keyed by an entity identifier; content
of any other kind fails the build naming the file. An entity identifier declared by both the
vendoring package and something it vendors, or by two of its vendorings, fails the build naming
both declarations. Asset names never contend that way — each pack's build under its own token —
but one asset name declared by two files of one vendored pack fails naming both, since its two
content hashes would leave references nothing to pick. A file more than one merged pack
contributes entries to — `texts/en_US.lang`, say — is composed; one the build cannot compose
fails it, naming both contributors.

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
