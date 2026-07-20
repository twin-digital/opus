# Behavior-pack dev loop

Local, disposable Bedrock server (Docker) + a hot-reload loop for iterating on
behavior packs. The Docker daemon here is remote (socket on another host), so we
**push files with `docker compose cp`** instead of bind-mounting.

Compose is run from the **repo root** so it picks up the repo-root `.env`
(`MINECRAFT_*` overrides). Copy `.env.example` → `.env` for the pinned dev seed;
without it the server still boots (random world).

## One-time

```bash
# from the repo root:
# optional: add the MINECRAFT_* keys from .env.example to your repo-root .env
# (pins the dev world seed); skip for a random world.
docker compose -f nodejs/minecraft/dev-bedrock-server/compose.yaml up -d
# wait a few seconds for the world to generate, then:
pnpm install                    # links village-guard → mc-scripting-core
pnpm --filter @twin-digital/village-guard build   # produces dist/main.js (mc-scripting-core inlined)
nodejs/minecraft/dev-bedrock-server/activate.sh    # activates every pack in the world
```

## The loop

```bash
cd nodejs/minecraft/village-guard   # or hello-world, or any pack
pnpm dev        # tsdown --watch: on save → cp built pack → send-command reload
```

Edit a pack's `src/*.ts` (or shared code in `mc-scripting-core/src/*.ts`), save,
and the change is live in ~1s — no restart, nobody kicked. That's `/reload`
re-running the script. tsdown bundles `mc-scripting-core`, so editing the shared
lib rebuilds every pack that uses it.

Each pack is independent: run `pnpm dev` in as many pack directories as you want
(one terminal each) against the same server — `hello-world` and `village-guard`
demonstrate the shape. `hello-world` is a minimal standalone pack (just
`@minecraft/server`); `village-guard` shows consuming the shared `mc-scripting-core`
lib.

## Connect from your laptop

The server publishes `19132/udp` on the Docker host. In Minecraft Bedrock →
**Servers → Add Server**, use `<docker-host-ip>:19132`.

## Notes

- **World seed:** defaults to a random world. Pin it by setting
  `MINECRAFT_LEVEL_SEED` in the repo-root `.env` (see `.env.example`).
- **Pack version** is injected from each pack's `package.json` at build time
  (see `village-guard/deploy.mjs`) into both the shipped manifest and the
  activation list — `package.json` is the single source of truth, so the committed
  `pack/manifest.json` version fields aren't hand-maintained.
- **`/reload` scope:** scripts + functions + loot reload live. New packs, manifest
  changes, a **renamed pack folder**, or new entity/item/block *definitions* need
  a restart (`docker compose restart bedrock`) so the server rescans the pool.
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
- **Adding a pack:** `activate.sh` regenerates `world_behavior_packs.json` from
  every package with a `pack/manifest.json` (via `build-activation.mjs`), so a new
  pack is picked up automatically — just re-run `activate.sh`. That file is
  generated, not committed (gitignored).
- **Reset the world:** `docker compose down -v` (drops the `dev-data` volume).
```
