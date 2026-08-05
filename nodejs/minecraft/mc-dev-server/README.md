# @twin-digital/mc-dev-server

The dev loop for a workspace of Minecraft Bedrock addon packs: one command takes an author from a
clean checkout to a running server with every pack built, deployed, activated, and watched.

The package is in preparation — the public surface stands and its pure cores are implemented and
tested; the Docker orchestration lands in the implementation wave. See the fold of `mc-dev-kit` at
increment 9 for what it must do.

## The command

```
minecraft-server start [--config <path>] [--profile <name>] [--level <name>] [--seed <n>]
                       [--spawn <x,y,z>] [--image <ref>] [--port <n>] [--accept-eula]
minecraft-server stop    [--config <path>]
minecraft-server destroy [--config <path>]
```

- `start` brings the server up and watches, or attaches to one already running. Ctrl+C stops the
  watchers and the log follow and leaves the server running.
- `stop` takes the container down and leaves the volume, so the worlds keep.
- `destroy` removes the volume and every world on it, after asking.

## Configuration

`.minecraft.yaml` (or `.minecraft.yml`) beside the run, or the file `--config` names. Every key is
optional and a workspace with no config file at all is a complete run.

```yaml
version: '1'
level: dev
seed: 424242
spawn: [0, 64, 0]
image: itzg/minecraft-bedrock-server:latest
port: 19132
eula: true
defaultProfile: scripts
profiles:
  scripts:
    packs: ['@scope/mc-pack-one']
    level: scripting
```

The file's shape is the `/mc-dev-kit/config@1` schema.
