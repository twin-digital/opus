# @twin-digital/mc-pack-runtime

The engine-side half of [`@twin-digital/mc-dev-kit`](../mc-dev-kit): code the kit's build bundles
into a pack's own script bundle, running on the Bedrock script engine. It carries the
pack-identifier helper, checked entity calls, and the namespace-claim report.

A pack takes it as an **ordinary dependency** — `@twin-digital/mc-dev-kit` stays a development
one:

```sh
npm install @twin-digital/mc-pack-runtime
```

ESM only, with type declarations, one entry point, and built for the script engine rather than
Node: no Node imports, `@minecraft/*` left external for the engine to provide.

## The injection

In a namespaced pack the kit's build injects the pack's namespace and its pack token into the
bundle ahead of every module. Everything here reads that injection, so nothing is passed or
configured per call — a vendored library's own calls resolve through whichever package vendored
it, spelling the same identifiers as the vendoring package's own code.

A pack built with namespacing off gets no injection: the identifier helpers answer `undefined`,
the checked calls answer unchecked, and `packId` throws — such a pack spells its identifiers in
full and has no bare names to spell.

## Identifiers

```ts
import { packFamily, packId, packNamespace } from '@twin-digital/mc-pack-runtime'

packId('wizard') // 'arena:wizard' in a pack namespaced `arena`
packNamespace() // 'arena', or undefined with namespacing off
packFamily() // the type family the build stamped on the pack's own entity types
```

- **`packId(name)`** spells a bare name into the full identifier the build gave it. It throws on
  a name already carrying a `:`, and where no namespace was injected — the engine would read a
  bare name as `minecraft:<name>`, and a silent wrong-namespace lookup is the bug this helper
  exists to prevent.
- **`packNamespace()`** is the namespace the pack was built under.
- **`packFamily()`** is the type family the build stamped on every entity type the pack declares —
  usable in your own `families` filters and `@e[family=]` selectors.

## Checked entity calls

The engine keeps one whole definition per identifier, so a rival pack's content can replace a
definition this pack declared. Each checked call hands back only entities carrying this pack's own
type family, so a replaced definition is caught at use instead of acting under this pack's name.
They are for the pack's own types — reach a vanilla or foreign entity through `@minecraft/server`
directly.

```ts
import { ForeignEntityError, getEntities, getEntity, spawnEntity } from '@twin-digital/mc-pack-runtime'
import { world } from '@minecraft/server'

const overworld = world.getDimension('overworld')

// Spawns and checks: a foreign entity is removed and the call raises.
const wizard = spawnEntity(overworld, packId('wizard'), { x: 0, y: 64, z: 0 })

// Looks up and checks: a foreign entity raises, left where it was found.
const found = getEntity(wizard.id)

// Queries and filters: foreign entities are left out of the result.
const own = getEntities(overworld, { maxDistance: 16, location: { x: 0, y: 64, z: 0 } })
```

A call that answers with one entity raises `ForeignEntityError` where that entity lacks the
pack's own family — a spawn removes what it spawned first, a lookup leaves it — and the error
names the entity type, the expected family, and whether it removed. A call that answers with many
omits the foreign entities. A lookup nothing answers is `undefined`, exactly as the engine
reports it.

## The namespace-claim report

Two packs can be built to one namespace, and the loser of a definition collision is silent. The
kit's build adds to every namespaced pack an entity type claiming its namespace, carrying the
pack's own token. At world load this package enumerates the declared entity types and reports the
rival claims it finds in its namespace:

```ts
import { foreignNamespaceClaims } from '@twin-digital/mc-pack-runtime'

for (const claim of foreignNamespaceClaims()) {
  // { namespace: 'arena', token: 'bob-arena', entityTypeId: 'arena:mcdk_claim_bob-arena' }
}
```

Each contention is also written to the content log as a warning. With no rival — or with
namespacing off — the value is empty and nothing is logged. The value is empty before the world
has loaded too: the engine's type catalog answers no read earlier.
