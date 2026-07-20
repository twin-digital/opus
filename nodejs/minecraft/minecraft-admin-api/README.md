# @twin-digital/minecraft-admin-api

A small local broker that owns **all serial access** to a Minecraft Bedrock
server — the screen console and the `save hold` snapshot protocol — behind a
Unix-socket HTTP API. Clients (the Flask web UI, the snapshot timer, the nightly
`create-backup`) become thin: they make one socket call instead of driving the
console themselves.

## Why this exists

Bedrock has no request/response channel. A command is typed into the server's
`screen` session; the reply appears on the server's stdout, which screen tees
into one shared log. Every actor that wanted to talk to the server recorded a
byte offset in that log, sent its command, then grepped forward for its own
marker. With **multiple** actors (web UI, 15-minute snapshot timer, nightly
backup — the last one as root) doing this against one console with no shared
lock, three failure modes appeared:

1. **Interleaved replies** — one actor's output landing in another's grep
   window, so a `save query` file list could be misread (corrupt/failed backup)
   or the UI could show a wrong "online" set.
2. **Dangling `save hold`** — the bash snapshot primitive released the hold from
   a shell `EXIT` trap, which a `SIGKILL` skips, leaving world saving suspended.
3. **Front-end starvation** — web requests blocking on the serialized, sometimes
   stalled console piled up on the dev server until it refused connections.

A shared `flock` would patch #1/#2 but keeps three copies of "how to talk to the
console" and keeps the hold's lifetime tied to a client's process. The real fix
is to make the console a **single-owner resource**: one process, one in-process
mutex, one reply-correlation implementation. That's this broker.

## Design

- **One owner.** `ConsoleBroker` serializes every console operation through a
  single promise-chain mutex, so only one command's reply is ever in flight —
  interleaving is impossible by construction.
- **Snapshots are atomic.** `createSnapshot` runs the whole `save hold` → poll
  `save query` → copy+truncate → `save resume` sequence inside one critical
  section, and **always** resumes in a `finally`. On startup the broker issues a
  best-effort `save resume` to clear a hold a prior crash could have left.
- **Unix socket, filesystem auth.** Listens on `/run/minecraft/api.sock`
  (`0660`, owned by the `minecraft` user/group). Root (`create-backup`) and the
  `minecraft` group (web UI, timer) connect with no secret and no network
  surface.
- **Runs as `minecraft`.** It only drives the console and reads/writes
  `minecraft`-owned files, so it needs no privilege. The one thing that needs
  root — `systemctl stop|start` — stays behind the existing narrow sudoers entry
  on whichever client still needs it.

## Scope (v1)

The races are all about the **console and save-hold** — the shared serial
resource. LevelDB _reads_ run on private, consistent copies and don't race, and
a Node Bedrock-LevelDB reader means a native module (ABI-matched build, like
grinbox's better-sqlite3). So v1 owns the console + snapshots; the Flask app
keeps its (safe) LevelDB player-record reads for now. Player reads can move into
the broker later behind a `players.*` route.

## API

| Method | Path               | Body                                                           | Returns                                                                                   |
| ------ | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET`  | `/health`          | —                                                              | `{ ok: true }`                                                                            |
| `GET`  | `/server/status`   | —                                                              | `{ service, active }`                                                                     |
| `POST` | `/console/command` | `{ args: string[], reply?: regex-source, flags?, timeoutMs? }` | `{ matched, full, groups }`, or `{ sent: true }` when no `reply`. `504` on reply timeout. |
| `POST` | `/snapshot`        | `{ destDir }`                                                  | `{ copied, destDir }` — world staged at `<destDir>/worlds/<level>/…`                      |

`/console/command` is the low-level escape hatch (still fully serialized). Typed
high-level operations (`players.online`, `time`, `weather`, `give`, `teleport`)
are the next increment — they avoid sending raw regexes across the
Python↔Node boundary.

## Migration

1. Deploy the broker (Ansible role, mirrors `apps/grinbox`: NodeSource runtime,
   sync tree, `pnpm install --prod` on target, systemd unit with
   `RuntimeDirectory=minecraft`, `Restart=on-failure`).
2. Point the Flask app's `console_command` and snapshot calls at the socket.
3. Point `create-backup` and the snapshot timer at the socket; then **delete**
   the bash `minecraft-snapshot` primitive and the ad-hoc console tailing. Until
   every caller is migrated, keep exactly one console owner — don't run the
   legacy primitive and the broker against the same server at once.

## Development

```bash
pnpm --filter @twin-digital/minecraft-admin-api dev     # tsx watch
pnpm --filter @twin-digital/minecraft-admin-api build   # → dist/
pnpm --filter @twin-digital/minecraft-admin-api start   # node dist/server/start.js
```
