---
'@twin-digital/dev-bedrock-server': minor
---

New package: the dockerized Bedrock dev-server harness. `dev.mjs` builds every behavior pack, runs the server as a compose daemon, reconciles the server's pack state against the built packs (pool sync + prune, world activation install), and hot-deploys changed packs with a `/reload` on every save; `dev.mjs stop` stops the server. Packs are discovered from the pnpm workspace — any package with a `pack/manifest.json`.
