# Behavior-pack dev server

Local, disposable Bedrock server (Docker) for iterating on behavior packs. The
Docker daemon here is remote (socket on another host), so instead of bind
mounts, **`docker compose watch` pushes files over the Docker API**: each
pack's built `dist/` syncs into the server's `development_behavior_packs` pool
followed by a `/reload`, and the generated activation list syncs into the world
followed by a restart.

For the day-to-day dev loop (build once, `up --watch`, `turbo run watch`), see
the [minecraft group README](../README.md). This file covers the server harness
itself.

Compose is run from the **repo root** so it picks up the repo-root `.env`
(`MINECRAFT_*` overrides). Copy `.env.example` → `.env` for the pinned dev seed;
without it the server still boots (random world).

## Generated per-pack config

`generate-dev-config.mjs` discovers every package with a `pack/manifest.json`
and emits two files (both gitignored — re-run it whenever you add a pack or a
pack's version bumps):

- **`compose.watch.yaml`** — a compose override with one `develop.watch` rule
  per pack (sync built `dist/` → `/reload`) plus the activation rule below.
  Generated because compose can't discover packs itself: glob watch paths and
  symlinked directories are silently ignored, so each pack needs a literal
  rule. Pass both files to compose: `-f compose.yaml -f compose.watch.yaml`.
- **`activation/world_behavior_packs.json`** — the world's activation list. A
  synced pack sits in the server's pool but isn't _applied_ until listed here;
  uuid comes from the pack manifest, version from `package.json` (the same
  source the build injects into the shipped manifest). Its watch rule ships it
  into the world and restarts the server.

## Connect from your laptop

The server publishes `19132/udp` on the Docker host. In Minecraft Bedrock →
**Servers → Add Server**, use `<docker-host-ip>:19132`.

## Notes

- **Watch only sees paths that exist at startup:** compose establishes watchers
  when it starts, so build the packs (and generate the activation list) before
  `up --watch`. A `dist/` created _after_ the watcher started is never synced —
  restart the watcher.
- **World seed:** defaults to a random world. Pin it by setting
  `MINECRAFT_LEVEL_SEED` in the repo-root `.env` (see `.env.example`).
- **Pack version** is injected from each pack's `package.json` at build time
  into both the shipped manifest and the activation list — `package.json` is the
  single source of truth; the committed `pack/manifest.json` template carries no
  version fields.
- **`/reload` scope:** scripts + functions + loot reload live. New packs,
  manifest changes, a **renamed pack folder**, or new entity/item/block
  _definitions_ need a restart (`docker compose restart bedrock`) so the server
  rescans the pool.
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
