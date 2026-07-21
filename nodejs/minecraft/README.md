# Minecraft Bedrock behavior packs

Authoring, dev-server iteration, and publishing for Bedrock behavior packs:

- **`mc-scripting-core`** — shared, npm-published helpers; packs bundle it in at build time.
- **`mc-pack-config`** — shared tsdown config for packs: bundles `src/main.ts` to `dist/scripts/main.js` and assembles the shippable manifest, so `dist/` is always a complete pack.
- **`hello-world`**, **`village-guard`** — the packs. `hello-world` is a minimal standalone example; `village-guard` shows consuming the shared lib.

A pack is any package with a committed `pack/manifest.json`; repo-kit's `bedrock-pack` feature wires up its build config and keeps the manifest identity in sync with `package.json`. Releases attach an installable `.mcpack` to the pack's GitHub release.
