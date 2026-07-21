# Behavior-pack dev server

Local, disposable Bedrock server for iterating on behavior packs. Compose
defines and runs the server container (as a daemon); the harness ships packs
over the Docker API — `deploy.mjs` is the single transport that makes the
server's pack state match the built packs (pool sync + prune, world
activation install, `/reload`), used both for the startup reconcile and for
ship-on-change.

For the day-to-day loop, `dev.mjs` runs everything as one command (and
`dev.mjs stop` stops the server) — see the
[minecraft group README](../README.md). The pieces it orchestrates:

```bash
# from the repo root (add `--env-file .env` to the compose commands if you
# created one — compose only auto-loads a .env next to the compose file):
pnpm build --filter './nodejs/minecraft/*'
docker compose -f nodejs/minecraft/dev-bedrock-server/compose.yaml up -d --wait
docker compose -f nodejs/minecraft/dev-bedrock-server/compose.yaml logs -f
pnpm exec turbo run watch --filter './nodejs/minecraft/*'   # rebuild-on-save
# (ship-on-change + reconcile are dev.mjs internals — deploy.mjs)
```

Server config comes from `MINECRAFT_*` variables in the repo-root `.env`
(copy `.env.example`; without it the server still boots with a random world).
Compose never auto-loads a `.env` from the cwd — `dev.mjs` passes
`--env-file .env` automatically; add the flag yourself when running compose
by hand.

## Pack discovery and activation

A pack is any workspace package with a committed `pack/manifest.json`
(`discover-packs.mjs` asks pnpm for the member list — nothing is
hand-maintained, and validation catches duplicate names/uuids). The world's
`world_behavior_packs.json` is derived from the built manifests and installed
by the reconcile step whenever it differs; the server only reads it at boot,
so an install ends with a restart. Everything else deploys live via
`/reload`.

## Connect from your laptop

The server publishes `19132/udp` on the Docker host. In Minecraft Bedrock →
**Servers → Add Server**, use `<docker-host-ip>:19132`.

## Notes

- **World seed:** defaults to a random world. Pin it by setting
  `MINECRAFT_LEVEL_SEED` in the repo-root `.env` (see `.env.example`).
- **Pack version** is injected into the shipped manifest from each pack's
  `package.json` at build time — the committed `pack/manifest.json` template
  carries no version fields.
- **`/reload` scope:** scripts + functions + loot reload live. Manifest
  changes, a renamed pack, or new entity/item/block _definitions_ need a
  server restart (restart `dev.mjs`, which reconciles and restarts as needed,
  or `docker compose restart bedrock`).
- **See script errors:** `content-log-console-output-enabled` is turned on via
  compose env (`MINECRAFT_CONTENT_LOG_CONSOLE_OUTPUT_ENABLED`, default `true`), so
  it's reapplied automatically whenever the world/container is recreated. Without
  it, script errors go to an on-disk `ContentLog*` file, not stdout — and a broken
  script just looks silently dead.
- **Early execution:** native calls (`world.sendMessage`, `runCommand`, etc.)
  **cannot** run at a module's top level — defer them to `system.run(...)` or an
  event callback. Registering `subscribe`/`runInterval` at top level is fine.
  A top-level native call throws and takes the whole pack's script down.
- **`@minecraft/server` version:** the pack pins the module version in its
  `pack/manifest.json` `dependencies`. If a content-log error says the module
  version isn't supported, that's the one line to bump.
- **Laptop can't connect?** the allowlist is off on this dev world
  (`allowlist off`); on a fresh volume, run it again or set
  `MINECRAFT_ALLOW_LIST=false`.
- **Reset the world:** `docker compose down -v` (drops the `dev-data` volume).
