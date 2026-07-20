---
---

`dev.mjs` runs the Minecraft pack dev loop as one command: builds the packs, regenerates the dev config, starts the server as a daemon (installing the world's pack-activation list when stale), and attaches the deploy/log/build watchers with interleaved, prefixed output. Ctrl+C detaches the watchers while the server keeps running; `dev.mjs stop` stops it. No package code changes.
