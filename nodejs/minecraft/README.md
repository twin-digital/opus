# Minecraft Bedrock behavior packs

Authoring, dev-server iteration, and publishing for Bedrock behavior packs:

- **`mc-scripting-core`** — shared, npm-published helpers; packs bundle it in at build time.
- **`mc-pack-config`** — shared tsdown config for packs: bundles `src/main.ts` to `dist/scripts/main.js` and assembles the shippable manifest, so `dist/` is always a complete pack.
- **`hello-world`**, **`village-guard`** — the packs. `hello-world` is a minimal standalone example; `village-guard` shows consuming the shared lib.
- **`dev-bedrock-server`** — disposable dockerized Bedrock server plus the compose watch rules that hot-deploy built packs into it ([details](./dev-bedrock-server/README.md)).

A pack is any package with a committed `pack/manifest.json`; repo-kit's `bedrock-pack` feature wires up its build config and keeps the manifest identity in sync with `package.json`. Releases attach an installable `.mcpack` to the pack's GitHub release.

## Dev loop

One-time setup, from the repo root ([server config knobs](./dev-bedrock-server/README.md)):

```bash
pnpm install
pnpm build --filter './nodejs/minecraft/*'          # compose only watches paths that exist when it starts
node nodejs/minecraft/dev-bedrock-server/generate-dev-config.mjs   # per-pack watch rules + activation list
```

Then two terminals, both from the repo root:

```bash
# 1 — server + deployer: syncs each built pack into the container and issues
#     /reload; syncs activation-list changes and restarts.
docker compose -f nodejs/minecraft/dev-bedrock-server/compose.yaml \
  -f nodejs/minecraft/dev-bedrock-server/compose.watch.yaml up --watch

# 2 — builder: rebuilds every pack on save (shared-lib edits rebuild the packs
#     that bundle it).
pnpm exec turbo run watch --filter './nodejs/minecraft/*'
```

Edit a pack's `src/*.ts` (or `mc-scripting-core/src/*.ts`), save, and the change
is live in-game in about a second — no restart, nobody kicked.

Adding a pack? Create the package with a `pack/manifest.json`, run `pnpm sync`,
then re-run `generate-dev-config.mjs` — packs are discovered, not hand-listed.
