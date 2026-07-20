---
---

`dev.mjs` runs the whole Minecraft pack dev loop as one command: builds the packs, regenerates the dev config, then runs the server (`docker compose up --watch`) and the pack builders (`turbo run watch`) together with interleaved, prefixed output. No package code changes.
