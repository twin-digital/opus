# @twin-digital/rpg-core-example

The worked example for `mc-rpg-core`: a Minecraft Bedrock adventure built on
`@twin-digital/rpg-core` (the library) and `@twin-digital/rpg-core-pack` (the actor assets).
When its world loads, it places every actor the product offers in a gallery beside spawn, and a
greeter of its own naming at the gallery's head.

It is also the demonstration that an adventure carries no actor content. This package holds no
entity definition, no model, no texture, no animation, and no preset default name — only its own
story, triggers, and logic. Everything an actor _is_ comes from the product; everything here is
about _where and when_ actors appear and what the story calls them.

## How an adventure takes the product

An adventure declares the product twice — code and assets travel separately:

1. **The library, as an npm devDependency.** `@twin-digital/rpg-core` is bundled into the
   adventure's own script at build time (script modules do not resolve across packs, so there is
   nothing to import at run time):

   ```jsonc
   // package.json
   "devDependencies": { "@twin-digital/rpg-core": "workspace:*" }
   ```

2. **The assets pack, as a manifest dependency.** The behavior manifest names the assets pack's
   behavior-half uuid; activating the adventure then activates both halves of the assets pack:

   ```jsonc
   // behavior_pack/manifest.json
   "dependencies": [
     { "module_name": "@minecraft/server", "version": "2.8.0" },
     { "uuid": "ea49800d-95dd-4808-87da-fb8b86b96361" }
   ]
   ```

   Inside this workspace the version is completed at build time from the assets pack itself. An
   adventure built elsewhere names the version too: `"version": "1.0.0"`.

## The story

[`src/adventure.ts`](src/adventure.ts) is the whole of it:

- On `worldLoad` — never earlier; only subscribing is allowed during script startup — it starts
  placing the gallery: one actor per preset in `PRESET_NAMES` under its preset default name, plus
  a greeter the story names itself (`Eldrin the Greeter` — the `name` option overriding the
  wizard preset's default).
- Each actor is placed under a durable id of the adventure's own (`example:<preset>`,
  `example:greeter`). Placing an actor under a durable id already in the world returns the actor
  already standing, so a server restart re-runs the story without duplicating the gallery. Once
  every placement has settled, the adventure reports each actor found standing — `findActor` by
  durable id — in chat.
- Placement retries once a second, up to fifteen attempts, because a freshly started server has
  not loaded the stage's chunks yet; the adventure also keeps the stage loaded with a ticking
  area so the gallery stands whether or not a player is near. Both are the adventure's own logic:
  the library places an actor where it is asked, when the world can.
- A preset whose entity definitions are missing raises `ActorDefinitionsMissingError`, which
  names the preset, the identifier, and the pack to install. The adventure reports it in chat
  and places the rest of the gallery.

## Installing a release

An install is two archives, each produced by its package's `release-assets` hook:

- this adventure's `rpg-core-example-<version>.mcaddon`
- the assets pack's `rpg-core-pack-<version>.mcaddon`

Import both, then activate the adventure's behavior pack on a world; the assets pack is pulled
into the world's pack stack through the manifest dependency.

## Running it against a live server

```bash
pnpm dev        # from this package; Ctrl+C detaches and leaves the server running
pnpm dev:stop
```

This brings up a Bedrock server in Docker with this pack and the assets pack built, deployed, and
activated in the world `.minecraft.yml` names, then watches for changes.

### Checking the product in the world

Join the server (add it in Bedrock by IP, port 19132) and verify, from spawn at `60 95 63`:

1. **Every actor stands in the gallery** — the greeter at spawn, and one actor per preset in a
   line running south, each at exactly the coordinates the story placed it — an actor holds where
   the spawn call put it, mid-air included. A placement that could not settle is reported in chat
   instead, naming the pack to install.
2. **Names** — hover the cursor over each actor: the gallery shows preset default names (the
   wizard's is `Wizard`), the greeter shows `Eldrin the Greeter`.
3. **Facing** — walk toward an actor and around it: it turns to face you, and holds still
   otherwise. Note whether the turn tracks you continuously or in occasional glances.
4. **Creative immunity** — in creative mode: hit the actor (no damage, no death), try a name tag
   (no rename), push it and break the block under it (it stays exactly where it was placed).
5. **Persistence** — `pnpm dev:stop`, then `pnpm dev` again and rejoin: the same actors stand at
   the same spots with the same names, and the gallery has not doubled.

Without a game client, the same checks run server-side from the host:

```bash
docker exec twin-digital-monorepo-bedrock-1 send-command 'testfor @e[type=rpg:wizard]'
docker exec twin-digital-monorepo-bedrock-1 send-command 'testfor @e[name="Eldrin the Greeter"]'
docker exec twin-digital-monorepo-bedrock-1 send-command 'damage @e[type=rpg:wizard] 100 entity_attack'
```

Damage must report `Could not apply damage`, and both `testfor` lines must find their target
after a stop/start cycle — with the same entity count, so the story placed nothing twice.
`querytarget @e[type=rpg:wizard]` must report each actor at its placement coordinates
(the greeter at `60 95 63`, the gallery from `60 95 66` south), before and after the restart.
