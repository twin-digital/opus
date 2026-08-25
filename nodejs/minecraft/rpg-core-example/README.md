# @twin-digital/rpg-core-example

The worked example for `mc-rpg-core`: a Minecraft Bedrock adventure built on
`@twin-digital/rpg-core`. When its world loads, it places every actor the product offers in a
gallery beside spawn, and a greeter of its own naming at the gallery's head.

It is also the demonstration that an adventure's author writes no actor content. Nothing in this
package's committed tree is an entity definition, a model, a texture, an animation, or a preset
default name — only its own story, triggers, and logic. Everything an actor _is_ arrives in the
built packs from the product; everything written here is about _where and when_ actors appear and
what the story calls them.

## How an adventure takes the product

One dependency, and no manifest entry naming the product at all:

```jsonc
// package.json
"dependencies": { "@twin-digital/rpg-core": "workspace:*" }
```

The dev kit's build does the rest. It bundles the library into the adventure's script, and merges
`@twin-digital/rpg-core`'s `vendored_pack/` tree into the adventure's own behavior and resource
packs — the entity definitions into the behavior half, the models, textures and animations into the
resource half — under the adventure's own namespace and header uuids. So the adventure declares
both pack kinds, including a resource half it authors nothing of its own for: the vendored
appearance has nowhere else to land.

The behavior manifest names its own resource half by uuid, so activating the one activates both and
the appearance cannot be left behind:

```jsonc
// behavior_pack/manifest.json
"dependencies": [
  { "module_name": "@minecraft/server", "version": "2.8.0" },
  { "uuid": "fbf03d8f-400d-46af-a265-00cd207a651b" }  // this pack's own resource half
]
```

### What the actors are called once built

The identifier is composed at build time from the adventure's namespace and the product's prefix,
so no two adventures share one. This package names no namespace and no prefix, so both are
defaults: the kit derives `twin-digital-rpg-core-example` from the package name, and
`@twin-digital/rpg-core` ships `rpg` as its `minecraft.defaultAlias`.

| what                         | as this adventure ships it                 |
| ---------------------------- | ------------------------------------------ |
| namespace                    | `twin-digital-rpg-core-example`            |
| wizard's entity id           | `twin-digital-rpg-core-example:rpg.wizard` |
| type family the build stamps | `mcdk_pack_twin-digital-rpg-core-example`  |

An adventure that wants a shorter prefix writes a `minecraft.vendor` entry; one that wants a
different namespace does what this package does, in `tsdown.config.d/namespace.ts`.

## The story

[`src/adventure.ts`](src/adventure.ts) is the whole of it:

- On `worldLoad` — never earlier; only subscribing is allowed during script startup — it starts
  placing the gallery: one actor per preset in `PRESET_NAMES` under its preset default name, plus
  a greeter the story names itself (`Eldrin the Greeter` — the `name` option overriding the
  wizard preset's default).
- Each actor is placed under a durable id of the adventure's own (`gallery.<preset>`, `greeter`).
  A durable id holds no `:`; the library keys its world record on the adventure's namespace and
  rejects one that carries a colon of its own. Placing an actor under a durable id already in the
  world returns the actor already standing, so a server restart re-runs the story without
  duplicating the gallery. Once every placement has settled, the adventure reports each actor found
  standing — `findActor` by durable id — in chat.
- For the same reason, moving the stage does not move an existing world's gallery: the actors
  already standing keep their positions, and only a fresh world places the gallery at a new
  `STAGE`.
- Placement retries once a second, up to fifteen attempts, because a freshly started server has
  not loaded the stage's chunks yet; the adventure also keeps the stage loaded with a ticking
  area so the gallery stands whether or not a player is near. Both are the adventure's own logic:
  the library places an actor where it is asked, when the world can.
- A placement whose identifier is answered by another pack's content raises `ForeignEntityError`,
  which no retry can clear. The adventure reports it in chat and places the rest of the gallery.

## Installing a release

One archive — `rpg-core-example-<version>.mcaddon`, from this package's `release-assets` hook. It
carries the adventure's own two packs with the product's definitions and appearance already merged
into them. Import it and activate the behavior pack on a world; the resource half comes with it
through the manifest dependency. There is no second archive, and no version of the product for a
world to hold.

## Running it against a live server

```bash
pnpm dev        # from this package; Ctrl+C detaches and leaves the server running
pnpm dev:stop
```

This brings up a Bedrock server in Docker with this pack built, deployed, and activated in the
world `.minecraft.yml` names, then watches for changes.

### Checking the product in the world

Join the server (add it in Bedrock by IP, port 19132) and verify, from spawn at `465 70 -64`:

> **The resource pack must be applied, or every actor is invisible.** An actor's appearance lives
> in this pack's resource half, and the dev server offers its resource packs as _optional_
> (`TEXTUREPACK_REQUIRED=false`), so a client that skips the download joins a world of standing,
> named, undamageable — and invisible — actors. Accept the pack when joining, or require it for
> the session: `docker compose -f "$(ls /tmp/mc-dev-server/*/compose.yaml)" up -d` after setting
> `TEXTUREPACK_REQUIRED: "true"` in that file (the next `pnpm dev` regenerates it).

1. **Every actor stands in the gallery** — the greeter at spawn, and one actor per preset in a
   line running north, each standing on the ground at its placement's x/z: actors are placed one
   block up and settle onto the surface. A placement the adventure gave up on is reported in chat
   instead.
2. **Names** — hover the cursor over each actor: the gallery shows preset default names (the
   wizard's is `Wizard`), the greeter shows `Eldrin the Greeter`.
3. **Facing** — walk toward an actor and around it: it turns to face you, and holds still
   otherwise. Note whether the turn tracks you continuously or in occasional glances.
4. **Creative immunity** — in creative mode: hit the actor (no damage, no death), try a name tag
   (no rename), push it and break the block under it (it cannot be shoved; with the ground gone
   it falls).
5. **Persistence** — `pnpm dev:stop`, then `pnpm dev` again and rejoin: the same actors stand at
   the same spots with the same names, and the gallery has not doubled.

Without a game client, the same checks run server-side from the host:

```bash
C=twin-digital-monorepo-bedrock-1
docker exec $C send-command 'testfor @e[type=twin-digital-rpg-core-example:rpg.wizard]'
docker exec $C send-command 'testfor @e[family=mcdk_pack_twin-digital-rpg-core-example]'
docker exec $C send-command 'testfor @e[name="Eldrin the Greeter"]'
docker exec $C send-command 'querytarget @e[type=twin-digital-rpg-core-example:rpg.wizard]'
docker exec $C send-command 'damage @e[type=twin-digital-rpg-core-example:rpg.wizard] 100 entity_attack'
```

Damage must report `Could not apply damage`, and every `testfor` must find its target after a
stop/start cycle, with the same entity count, so the story placed nothing twice. `querytarget` must
report each actor standing on the ground at its placement's x/z — the greeter at `465 -64`, the
gallery from `465 -67` north, each settled onto the surface at y `69` — with the same `uniqueId`
and position before and after the restart.

## What the test suite covers

- [`src/adventure.test.ts`](src/adventure.test.ts) drives the story through the library seam: what
  it asks the library for, and nothing about what the library does with it.
- [`src/entry.test.ts`](src/entry.test.ts) evaluates `src/main.ts` as the engine does, against a
  world it reached through its own `@minecraft/server` import.
- [`src/shipped-pack.test.ts`](src/shipped-pack.test.ts) builds the pack and reads `dist/`: the
  composed identifier, the stamped type family, and the appearance the adventure never wrote exist
  only in built output, so no unit test against the library can observe them.
