# @twin-digital/mc-dev-server

The dev loop for a workspace of Minecraft Bedrock addon packs: one command takes an author from a
clean checkout to a running server with every pack built, deployed, activated, and watched.

```
pnpm add -D @twin-digital/mc-dev-server
pnpm exec minecraft-server start --accept-eula
```

That builds every pack the workspace holds, brings up a `itzg/minecraft-bedrock-server` container,
copies the built packs onto it, activates them in the world, and then watches for changes. Build
output, deploy activity and the server's own log all arrive on one stream. Ctrl+C detaches and
leaves the server running.

## Requirements

- Node 24, on Linux or macOS. Windows is out of scope.
- Docker with Compose v2. The connection is whatever the environment already selects —
  `DOCKER_HOST`, or the active Docker context — and there is no setting of its own for it. A daemon
  on another host works: nothing is bind-mounted, and everything reaches the server by
  `docker compose cp`.

## The commands

```
minecraft-server start [--config <path>] [--profile <name>] [--level <name>] [--seed <n>]
                       [--spawn <x,y,z>] [--image <ref>] [--port <n>] [--accept-eula]
minecraft-server stop    [--config <path>]
minecraft-server destroy [--config <path>]
```

- `start` brings the server up and watches, or attaches to one already running. Ctrl+C — and
  `SIGTERM` and `SIGHUP` — stop the watchers and the log follow and leave the server running.
- `stop` takes the container down through the server's own console `stop`, so the world is written
  first, and leaves the volume standing. Every world on it survives to the next `start`.
- `destroy` removes the volume and every world on it. It names the worlds first and asks; where
  nothing can be asked, it does nothing.

`--help` and `--version` are answered on every subcommand, and an unrecognised flag fails the run.
Every line goes to stdout; nothing is written to stderr. The exit code is `0` when the loop is
closed by the author and when `stop` succeeds, and non-zero on every failure.

You must accept [the Minecraft EULA](https://www.minecraft.net/en-us/eula) yourself, with
`--accept-eula` or `eula: true` in the config. Given neither, `start` fails and brings nothing up.

## Configuration

`.minecraft.yaml` (or `.minecraft.yml`) in the current directory, or the file `--config` names. A
path given with `--config` and not found is an error; the default location simply not being there
is not, and reads the same as an empty file. Both default names at once is an error.

Every key is optional, and a workspace with no config file at all is a complete run: every pack the
kit discovers, the world `default`, the image tag the harness pins, port 19132, and a seed the
harness picks.

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

A key the harness does not define is an error, and so is a value of the wrong shape. The file's
shape is the `/mc-dev-kit/config@1` schema.

### Profiles select the packs

A run hosts every pack the kit discovers unless a profile narrows it: `--profile <name>` picks one,
`defaultProfile` applies where no `--profile` does, and with neither the run hosts everything. There
is no flag for naming packs one at a time — a selection worth making is worth writing down.

A profile carries the world to host its packs against as well. `--level`, `--seed` and `--spawn`
override what a profile says, as a profile's values override the config's top level.

A profile whose `packs` list is empty selects no packs, which is a valid run. A profile naming no
`packs` at all leaves the run hosting everything.

### Worlds, seeds and spawns

`level` names the world, `seed` sets what a generated world comes from, and `spawn` is where a
joining player arrives. Each is optional, and an unspecified one matches whatever is already
running rather than demanding anything.

The volume holds a world per level name the run has asked for, and the server serves the one
`level` names. Naming a new level is how you get a second world; naming an old one is how you go
back to it. Both keep across a `stop`, and only `destroy` empties the library.

Where a world has to be generated and no seed was named, the harness picks a uniformly random
signed 64-bit seed and records it on the volume against the world it generated — the server itself
cannot report a world's generation seed back, so this record is the only route to reproducing a
world.

## What `start` does about a server already running

Only what a deploy cannot fix is compared: the level name, the seed, the image and the port. Pack
selection is what the deploy is for, and the spawn point is set on a live world. An unspecified
setting matches anything.

| what it finds                                                       | what it does                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| nothing running                                                     | brings the project up on this world                                                        |
| everything specified matches                                        | attaches — no `up`, no recreate, no restart                                                |
| the level differs                                                   | recreates the container onto that world, generating it if the volume has none, and says so |
| only the image or port differs                                      | recreates the container, and says so                                                       |
| the level matches, a named seed is not the one that world came from | warns, names both seeds, and asks; regenerates only on agreement                           |

A recreate keeps every world on the volume but drops connected clients, so it is never silent. The
seed rung is the only one that destroys a world, and it is never taken without an answer — where
nothing can be asked, the run bails out.

One attached run per workspace: a second `start` against the same workspace refuses and names the
one already watching.

## The deploy

Deploying is one operation, run once the start builds have finished and again on every debounced
change to a selected pack's built output. It

1. re-runs discovery and resolves the selection,
2. reads the pool contents, activation lists, and pool file names off the running container,
3. compares them against the built output of the selected packs,
4. copies packs, removes pool directories, and writes activation lists,
5. brings the change live with a console `reload`, or with a restart.

Re-running with nothing changed changes nothing on the server. Pool content the selection does not
account for is removed, whoever put it there. Only presence, activation identity, and pool file
names are compared — no file's content is ever read back, so a pack whose output changed is
re-deployed whole.

A restart is priced only where a reload cannot carry the change: a pack added or removed, a version
change, an activation-list edit, or a pack whose built output gained a file its pool directory did
not already hold. A reload takes up edited and deleted files but not added ones.

The first run against a fresh volume pays a restart: the server creates the world with no activation
list in it, so the world loads with no packs, the deploy writes them, and the restart brings them up.

### Building and watching

The harness runs each selected package's own `build` and `watch` scripts — through `pnpm` where the
workspace root holds a `pnpm-workspace.yaml`, and `npm` otherwise — and watches only the built
output directories. What a package builds and how is the package's business; the harness deploys the
contents of `dist/<kind>_pack` and makes no assumption about how they got there.

A run fails before bringing anything up when a selected pack is one the kit reports invalid, when
there is no reachable Docker daemon, when a `--config` file will not parse, when the EULA has not
been accepted, or when the selection names a package the workspace does not hold.

Everything short of that is reported and carried:

- a pack whose build failed, or whose package declares no `build` script, is deployed with a stub
  script in place of its bundle, so the world still loads with every selected pack present and
  activated. The first build that succeeds replaces the stub through the ordinary deploy;
- a package declaring no `watch` script is built once and not watched;
- a watch process that exits is reported and not restarted;
- a deploy that throws changes nothing on the server, is reported, and is retried on the next save.

## The output stream

Every line carries a source tag: the emitting package for build output, `deploy` for the harness's
own activity, and `server` for the container log.

```
[deploy] no server is running for 'my-addons'; bringing one up on world 'dev'
[@scope/mc-pack-one] built @scope/mc-pack-one
[deploy] deploying @scope/mc-pack-one (behavior a1111111-…)
[deploy] world loaded: [2026-08-05 23:20:01:114 INFO] Pack Stack - [00] pack one (id: a1111111-…)
[server] [2026-08-05 23:20:04:915 INFO] Player connected: Steve
```

`Pack Stack - None` means the world loaded with nothing active, which is what an unlisted or
misrouted pack produces. The harness says so loudly rather than treating it as a healthy start.

A pack's own script output arrives as `server` lines and is never read as a signal: a reload that
took effect emits nothing the harness can match.

## What it writes on the server

Everything under the volume mounted at `/data`:

| path                                             | what                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `/data/development_behavior_packs/<uuid>/`       | a behavior pack, in a directory named for its header uuid    |
| `/data/development_resource_packs/<uuid>/`       | a resource pack                                              |
| `/data/worlds/<level>/world_behavior_packs.json` | the world's behavior activation list, in selection order     |
| `/data/worlds/<level>/world_resource_packs.json` | the world's resource activation list                         |
| `/data/.mc-dev-server/worlds.json`               | the harness's own record of which seed generated which world |

`worlds.json` is `{ "version": 1, "worlds": { "<level>": { "seed": "<decimal>" } } }`. Seeds are
decimal strings so a 64-bit value survives a JSON round trip in any reader. Anything unreadable
there is treated as no record at all — it is history, not state.

The server's posture is the harness's and is not configurable: offline mode, no allow list, the
content log enabled to the console (without it a pack's script output never reaches the stream), and
resource packs offered rather than required.

## Development

```
pnpm build      # tsc to dist
pnpm test       # vitest
pnpm typecheck
pnpm lint
```

The tests drive the whole loop through a fake server behind the compose seam — an in-memory volume
that answers the harness's own reads and emits the world-load line a real load emits. Nothing in
the test suite needs a daemon; the behaviour that only a real server can show is covered by manual
checks recorded with the increment.
