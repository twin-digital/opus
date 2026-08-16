# @twin-digital/rpg-core

Actor presets for Minecraft Bedrock adventures. An adventure spawns a named, durable NPC by naming
one preset — the library carries the preset's identity and default name, and the companion assets
pack (`RPG Core Actors`, from `@twin-digital/rpg-core-pack`) carries the entity definitions, models,
textures and animations. The adventure carries neither: only its own story, triggers, and logic.

## Install

```sh
npm install --save-dev @twin-digital/rpg-core
```

ESM only, TypeScript declarations included. The library is a development dependency, bundled into the
adventure's own script at build time. Two more things make an actor appear:

- the adventure's behavior-pack manifest declares the assets pack's uuid and version in
  `dependencies`
- the adventure's release archive bundles the assets pack alongside its own, so an operator installs
  one archive

Several installed adventures each carrying a copy of the assets pack is the expected state: a server
deduplicates identical packs, and packs from different majors share no uuid and no name, so they
coexist.

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

Call after `worldLoad`: the definitions check reads the entity-type catalog, which the engine
refuses during early execution.

- `name` overrides the preset's default display name (`Wizard`); omit it to keep the default.
- `id` is a durable name of the adventure's own. Spawning again under a durable name already in the
  world returns the actor already there — nothing about it, its name included, is changed — so a
  spawn call at world load is idempotent across restarts. Pick names unlikely to collide with
  another adventure's; the durable-name space is per world, not per adventure.

The returned handle carries `preset`, `entityId`, the durable `id` if one was given, the underlying
`entity` for anything beyond this surface, and `remove()`, which also releases the durable name.

## Finding an actor later

```ts
import { findActor } from '@twin-digital/rpg-core'

const wizard = findActor('tower-wizard') // ActorHandle | undefined
```

Resolves in a later session too: the durable name is carried in world state, not in the script's
memory.

## The definitions check

Every call acting on an actor first checks that the entity type its preset names is registered in
the world. When it is not — the assets pack missing or inactive — the call throws
`ActorDefinitionsMissingError` before doing anything, naming the preset, the identifier, and the
pack that supplies it. No call half-succeeds.

The check covers the definitions only. A call that passes it says nothing about the resource half:
the library performs no runtime check of the resource pack and no path implies an actor will render.
An archive shipping both halves together is what keeps the two in step.

## Presets

| preset   | identifier   | default name |
| -------- | ------------ | ------------ |
| `wizard` | `rpg:wizard` | `Wizard`     |

The registry (`PRESETS`, `PRESET_NAMES`, `NAMESPACE`, `PACK_NAME`) is exported: the assets pack
builds its entity definitions from it at build time, so the identifiers the library names and the
definitions the pack holds cannot come to disagree. At the first major the namespace is the bare
token `rpg`; later majors carry the major in the token, and library and assets pack advance majors
together.

Actors do not speak: this release spawns, places, names, and removes them. Conversation is a later
increment.
