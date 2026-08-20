# @twin-digital/rpg-core

Actor presets for Minecraft Bedrock adventures. An adventure spawns a named, durable NPC by naming
one preset. This package carries both halves of an actor: `src/` holds the presets, the spawn call,
and the handle it returns; `vendored_pack/` holds the entity definitions and the models, textures,
and animations they render from. The adventure's author writes none of it — only their own story,
triggers, and logic.

## Install

```sh
pnpm add @twin-digital/rpg-core
```

One `dependencies` entry, and nothing else. The adventure names this product in no pack manifest and
declares no uuid: `@twin-digital/mc-dev-kit`'s build merges `vendored_pack/` into the adventure's own
behavior and resource packs, under the adventure's namespace and header uuids. The adventure's
release archive then carries everything an operator installs — there is no second archive, and an
actor's two halves cannot arrive separately.

The adventure's behavior manifest should name its own resource half in `dependencies`, so activating
the one activates both and the appearance cannot be left behind.

## Spawning an actor

```ts
import { world } from '@minecraft/server'
import { spawnActor } from '@twin-digital/rpg-core'

world.afterEvents.worldLoad.subscribe(() => {
  const wizard = spawnActor(
    'wizard',
    { dimension: world.getDimension('overworld'), location: { x: 0.5, y: 64, z: 0.5 } },
    { name: 'Eldrin', id: 'tower-wizard' },
  )
})
```

- `name` overrides the preset's default display name (`Wizard`); omit it to keep the default.
- `id` is a durable name of the adventure's own, holding no `:`. Spawning again under a durable name
  already in the world returns the actor already there — nothing about it, a display-name override
  included, is changed — so a spawn call at world load is idempotent across restarts. The durable-name
  space is keyed on the adventure's namespace, so two adventures cannot collide.

The handle carries `preset`, `entityId`, the durable `id` where one was given, the underlying
`entity` for anything beyond this surface, and `remove()`, which also releases the durable name.

## Finding an actor later

```ts
import { findActor } from '@twin-digital/rpg-core'

const wizard = findActor('tower-wizard') // ActorHandle | undefined
```

Resolves in a later session too: the durable name is carried in world state, not in the script's
memory. A name no record holds returns `undefined` with no lookup made; a record whose actor is gone
returns `undefined` and is left in place until a spawn under the name overwrites it.

## Identifiers are the adventure's

There is no exported entity identifier, namespace, or pack name. An actor's identifier is
`<adventure-namespace>:<prefix>.<preset>`, composed at call time — this package declares no
namespace, mints no uuid, and puts no version in any name, so two adventures share no identifier
whatever versions they were built against, and both work in one world.

The prefix is the adventure's `minecraft.vendor` entry where it sets one, and otherwise `rpg`, this
package's `minecraft.defaultAlias`. An adventure vendoring another library that also wants `rpg`
resolves the collision by overriding it.

Every call goes through `@twin-digital/mc-pack-runtime`'s checked calls, so an entity answering one
of these identifiers without the adventure pack's own type family raises `ForeignEntityError` rather
than being acted on. `ForeignEntityError` is re-exported here, so a consumer catches it without a
second dependency.

## What a successful call is evidence of

Nothing beyond itself. This package makes no runtime check of an actor's definitions and none of its
appearance: no lookup before acting, no counting of the world's pack stack, no path that implies an
actor will render. What keeps the two halves in step is that they are content of packs the
adventure's own build emitted from one source tree.

## Presets

| preset   | default name |
| -------- | ------------ |
| `wizard` | `Wizard`     |

`PRESETS` and `PRESET_NAMES` are exported; a preset describes itself with its name and its default
name, and holds no identifier.

The wizard's appearance is vendored from the game's evoker at a pinned revision and re-identified
under bare names — geometry, texture, and animations — so a Minecraft version change does not alter
how it looks. The one vanilla name the resource half carries is the stock `evoker` material.
`vendored-assets.yml` records the repository, the exact revision, and the path every file was taken
from; re-vendoring is a change to that record.

Actors do not speak: this release spawns, places, names, and removes them. Conversation is a later
increment.
