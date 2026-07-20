# Behavior-pack dev loop

Local, disposable Bedrock server (Docker) + a hot-reload loop for iterating on
behavior packs. The Docker daemon here is remote (socket on another host), so we
**push files with `docker compose cp`** instead of bind-mounting.

## One-time

```bash
cd dev-bedrock-server
docker compose up -d            # boots Bedrock (downloads VERSION on first run)
# wait a few seconds for the world to generate, then:
pnpm install                    # from repo root: links village-guard → mc-pack-core
cd ../village-guard && pnpm build   # produces dist/pack (mc-pack-core inlined)
cd ../dev-bedrock-server && ./activate.sh   # lists the pack in world_behavior_packs.json
```

## The loop

```bash
cd village-guard
pnpm dev        # esbuild --watch: on save → cp built pack → send-command reload
```

Edit `village-guard/src/*.ts` (or shared code in `mc-pack-core/src/*.ts`), save,
and the change is live in ~1s — no restart, nobody kicked. That's `/reload`
re-running the script. esbuild inlines `mc-pack-core`, so editing the shared lib
rebuilds every pack that uses it.

## Connect from your laptop

The server publishes `19132/udp` on the Docker host. In Minecraft Bedrock →
**Servers → Add Server**, use `<docker-host-ip>:19132`.

## Notes

- **World seed** is pinned to `-4879002305207299781` (compose `LEVEL_SEED`).
- **`/reload` scope:** scripts + functions + loot reload live. New packs, manifest
  changes, a **renamed pack folder**, or new entity/item/block *definitions* need
  a restart (`docker compose restart bedrock`) so the server rescans the pool.
- **See script errors:** set `content-log-console-output-enabled=true` in
  server.properties (already set on this dev world). Without it, script errors go
  to an on-disk `ContentLog*` file, not stdout — and a broken script just looks
  silently dead.
- **Early execution:** native calls (`world.sendMessage`, `runCommand`, etc.)
  **cannot** run at a module's top level — defer them to `system.run(...)` or an
  event callback. Registering `subscribe`/`runInterval` at top level is fine.
  A top-level native call throws and takes the whole pack's script down.
- **`@minecraft/server` version:** the manifest pins `2.0.0` (works on 1.26.31).
  If a content-log error says the module version isn't supported, that's the one
  line to bump in `village-guard/pack/manifest.json`.
- **Laptop can't connect?** the allowlist is off on this dev world
  (`allowlist off`); on a fresh volume, run it again or set `allow-list=false`.
- **Reset the world:** `docker compose down -v` (drops the `dev-data` volume).
