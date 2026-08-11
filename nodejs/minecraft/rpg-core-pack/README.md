---
summary: The assets pack of mc-rpg-core — the actor entity definitions and the appearances they render from, activated by one manifest dependency.
---

# @twin-digital/rpg-core-pack

The assets pack of the `mc-rpg-core` product: a Bedrock behavior pack carrying the actor entity
definitions, and a resource pack carrying the models, textures, and animations they render from.
An adventure never carries actor content of its own — it declares a dependency on this pack and
spawns actors through [`@twin-digital/rpg-core`](../rpg-core).

The pack ships no script module. Its entities are inert set-dressing with one behavior: they watch
a nearby player. Everything an actor _does_ is driven by the adventure's own script through the
library.

## Depending on the pack

An adventure's behavior pack manifest names the behavior half's uuid:

```json
"dependencies": [
  {
    "uuid": "ea49800d-95dd-4808-87da-fb8b86b96361",
    "version": "1.0.0"
  }
]
```

The behavior half declares its own resource half in `dependencies`, so this one entry activates
both. Inside this workspace the version is left out — the dev kit completes it at build time.

| pack          | uuid                                   |
| ------------- | -------------------------------------- |
| behavior half | `ea49800d-95dd-4808-87da-fb8b86b96361` |
| resource half | `52661a40-7180-48a1-8328-bfaa68ac9641` |

## The actors

One entity identifier per preset, over one shared set of behavior components. An actor refuses all
damage, is summonable by identifier only (no spawn egg, so it never appears in the creative menu),
cannot be pushed or knocked back, persists across restarts and chunk unloads, cannot be renamed by
a player, and turns its head to face a player who comes near.

| preset   | entity identifier |
| -------- | ----------------- |
| `wizard` | `rpg:wizard`      |

The identifiers come from the library's preset registry (`@twin-digital/rpg-core`), taken as a
build-time dependency only: `src/registry-consistency.test.ts` fails the build when a committed
definition and the registry disagree. At run time neither package reads the other.

## Names and versions

Every name the pack declares carries the namespace — entity identifiers, geometry, texture paths,
animations, animation controllers, render controllers. At the first major the namespace is the bare
token `rpg` (`rpg:wizard`, `geometry.rpg.wizard`); later majors carry the major in the token
(`rpg2:wizard`). Each major mints a fresh uuid pair, recorded in the source manifests. The pack
never publishes below 1.0.0, and within a major a release only adds names, never removes or
repurposes one.

## Vendored appearance

The wizard's geometry, texture, and animations are vendored from the game's published samples
([Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples), all rights reserved under the
Minecraft EULA) and re-identified into the `rpg` namespace, so a game update cannot move the ground
under them. [`vendored-assets.yml`](./vendored-assets.yml) records the repository, the exact
revision, and the source path of every file taken; re-vendoring is a change to that record.

The one exception is the material: the game publishes no material definitions, so the wizard is
drawn with the stock `evoker` material — the only vanilla name in the shipped resource half.

## Development

```sh
pnpm --filter @twin-digital/rpg-core-pack build           # dist/ holds both completed packs
pnpm --filter @twin-digital/rpg-core-pack test            # registry-consistency checks
pnpm --filter @twin-digital/rpg-core-pack dev             # local Bedrock server with the pack active
pnpm --filter @twin-digital/rpg-core-pack release-assets  # cuts rpg-core-pack-<version>.mcaddon
```

Build, dev server, and archive all delegate to `@twin-digital/mc-dev-kit` and
`@twin-digital/mc-dev-server`; the pack carries no build or delivery logic of its own.
