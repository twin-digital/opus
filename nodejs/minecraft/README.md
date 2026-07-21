# Minecraft Bedrock behavior packs

Authoring, dev-server iteration, and publishing for Bedrock behavior packs:

- **`mc-scripting-core`** — shared, npm-published helpers; packs bundle it in at build time.
- **`mc-pack-config`** — shared tsdown config for packs: bundles `src/main.ts` to `dist/scripts/main.js` and assembles the shippable manifest, so `dist/` is always a complete pack.
- **`hello-world`**, **`village-guard`** — the packs. `hello-world` is a minimal standalone example; `village-guard` shows consuming the shared lib.
- **`dev-bedrock-server`** — disposable dockerized Bedrock server plus the harness that hot-deploys built packs into it ([details](./dev-bedrock-server/README.md)).

A pack is any package with a committed `pack/manifest.json`; repo-kit's `bedrock-pack` feature wires up its build config and keeps the manifest identity in sync with `package.json`. Releases attach an installable `.mcpack` to the pack's GitHub release.

## Dev loop

One command, from the repo root (after `pnpm install` — [server config
knobs](./dev-bedrock-server/README.md)):

```bash
node nodejs/minecraft/dev-bedrock-server/dev.mjs
```

It builds every pack, starts the server as a daemon, reconciles the server's
pack state against the built packs (pool sync + prune, world activation), then
watches with interleaved `[server]` / `[deploy]` / `[build]` output — every
save rebuilds, ships, and `/reload`s. **Ctrl+C detaches the watchers; the
server keeps running** — re-run `dev.mjs` to reattach, and stop the server with
`node nodejs/minecraft/dev-bedrock-server/dev.mjs stop` (the world volume
persists). The pieces can also be run separately — see the
[dev server README](./dev-bedrock-server/README.md).

Edit a pack's `src/*.ts` (or `mc-scripting-core/src/*.ts`), save, and the change
is live in-game in about a second — no restart, nobody kicked.

Adding a pack? Create the package with a `pack/manifest.json`, run `pnpm sync`,
and restart `dev.mjs` — packs are discovered, not hand-listed.
