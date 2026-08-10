# @twin-digital/mc-dev-server

## 0.2.2

### Patch Changes

- d3fc1f7: chore(deps): update dependency execa to v10
  - @twin-digital/mc-dev-kit@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [289331b]
  - @twin-digital/mc-dev-kit@0.3.1

## 0.2.0

### Minor Changes

- 9499794: Add the Minecraft dev server harness. `minecraft-server start` takes a workspace from a clean
  checkout to a running Bedrock server with every pack built, deployed and watched: it runs each
  selected package's own `build` and `watch` scripts, brings up an
  `itzg/minecraft-bedrock-server` container under docker compose, copies the built packs into the
  server's pools, writes the world's activation lists, and redeploys on every debounced change to a
  pack's built output — applying the change with a console reload wherever the world need not load
  again. Build output, deploy activity and the server's own log share one tagged stream.

  Closing the foreground leaves the server running. `stop` takes the container down and keeps the
  volume, so the worlds survive; `destroy` names what it is about to remove, asks, and removes it.
  A run picks its world with `--level`, `--seed` and `--spawn`, and a `.minecraft.yaml` can name
  profiles that narrow what a run hosts.

  Everything reaches the server through `docker compose cp` and `exec`, with no bind mount anywhere,
  so a remote Docker daemon works as well as a local one.

### Patch Changes

- Updated dependencies [9499794]
  - @twin-digital/mc-dev-kit@0.3.0
